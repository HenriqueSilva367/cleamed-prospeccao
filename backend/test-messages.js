/**
 * Testes — Persistência de Mensagens + Follow-up
 * 
 * Roda com: node test-messages.js
 * 
 * Usa um banco de dados em memória (:memory:) para não afetar o banco real.
 * Testa as regras de negócio sem depender do WhatsApp.
 */

const Database = require('better-sqlite3');

// ============================================================
// SETUP: banco de teste em memória com o mesmo schema do real
// ============================================================

const db = new Database(':memory:');

// Cria as tabelas essenciais (cópia do database.js)
db.exec(`
  CREATE TABLE IF NOT EXISTS clinicas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tel TEXT,
    bairro TEXT,
    email TEXT,
    endereco TEXT,
    site TEXT,
    avaliacao TEXT,
    categoria TEXT,
    cidade TEXT,
    total_avaliacoes INTEGER DEFAULT 0,
    google_place_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    origem TEXT DEFAULT 'manual',
    whatsapp_id TEXT,
    mensagem_ia TEXT,
    lead_priority TEXT DEFAULT 'LOW',
    fit_score INTEGER DEFAULT 0,
    score_reason TEXT,
    first_contact_at TEXT,
    last_contact_at TEXT,
    followup_stage INTEGER DEFAULT 0,
    last_followup_at TEXT,
    dor_detectada TEXT,
    sistema_atual TEXT,
    proxima_acao TEXT,
    proxima_acao_data TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinica_id INTEGER NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
    content TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    whatsapp_message_id TEXT,
    sender TEXT DEFAULT 'system',
    source TEXT,
    processed INTEGER DEFAULT 0,
    metadata TEXT,
    FOREIGN KEY (clinica_id) REFERENCES clinicas(id)
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_clinica_id ON messages(clinica_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;`);

db.exec(`
  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

// Configurações padrão de follow-up
db.prepare(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)`).run('followup_auto_ativo', 'true');
db.prepare(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)`).run('followup_dias_1', '1');
db.prepare(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)`).run('followup_dias_2', '3');

// ============================================================
// HELPERS
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.log(`  ❌ ${name}`);
        failed++;
    }
}

function salvarMensagem({ clinicaId, direction, content, whatsappMessageId, sender, source, metadata }) {
    try {
        db.prepare(`
            INSERT OR IGNORE INTO messages (clinica_id, direction, content, whatsapp_message_id, sender, source, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            clinicaId,
            direction,
            content || '',
            whatsappMessageId || null,
            sender || 'system',
            source || null,
            metadata ? JSON.stringify(metadata) : null
        );
    } catch (err) {
        console.error(`[Test] Erro ao salvar mensagem: ${err.message}`);
    }
}

function criarLead(nome, status = 'pending', extra = {}) {
    const result = db.prepare(`
        INSERT INTO clinicas (nome, tel, status, categoria, cidade, criado_em, last_contact_at, first_contact_at, followup_stage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        nome,
        extra.tel || '85999999999',
        status,
        extra.categoria || 'Clínica Odontológica',
        extra.cidade || 'Fortaleza',
        extra.criado_em || new Date().toISOString().replace('T', ' ').substring(0, 19),
        extra.last_contact_at || null,
        extra.first_contact_at || null,
        extra.followup_stage ?? 0
    );
    return result.lastInsertRowid;
}

function getConfig(chave) {
    const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
    if (!row) return null;
    try { return JSON.parse(row.valor); } catch { return row.valor; }
}

function buscarLeadFollowup() {
    const ativo = getConfig('followup_auto_ativo');
    if (!(ativo === true || ativo === 'true')) return null;

    const dias1 = parseInt(getConfig('followup_dias_1'), 10) || 1;
    const dias2 = parseInt(getConfig('followup_dias_2'), 10) || 3;

    return db.prepare(`
        SELECT * FROM clinicas
        WHERE status = 'sent'
          AND IFNULL(followup_stage, 0) < 2
          AND (
            (IFNULL(followup_stage, 0) = 0 AND datetime(IFNULL(last_contact_at, criado_em), '+' || ? || ' days') <= datetime('now'))
            OR
            (IFNULL(followup_stage, 0) = 1 AND datetime(IFNULL(last_followup_at, last_contact_at), '+' || ? || ' days') <= datetime('now'))
          )
        ORDER BY id ASC
        LIMIT 1
    `).get(dias1, dias2);
}

// ============================================================
// TESTES
// ============================================================

console.log('\n🧪 TESTES — Persistência de Mensagens\n');

// Test 1: Mensagem recebida é salva
console.log('--- Mensagens Inbound ---');
{
    const leadId = criarLead('Clínica Teste Inbound');
    salvarMensagem({
        clinicaId: leadId,
        direction: 'inbound',
        content: 'Olá, tudo bem?',
        whatsappMessageId: 'msg_in_001',
        sender: 'lead',
        source: 'whatsapp'
    });

    const msgs = db.prepare('SELECT * FROM messages WHERE clinica_id = ?').all(leadId);
    assert(msgs.length === 1, 'Mensagem inbound é salva no banco');
    assert(msgs[0].direction === 'inbound', 'Direction é inbound');
    assert(msgs[0].content === 'Olá, tudo bem?', 'Conteúdo é preservado');
    assert(msgs[0].sender === 'lead', 'Sender é lead');
    assert(msgs[0].whatsapp_message_id === 'msg_in_001', 'WhatsApp message ID é salvo');
}

// Test 2: Mensagem enviada é salva
console.log('\n--- Mensagens Outbound ---');
{
    const leadId = criarLead('Clínica Teste Outbound');
    salvarMensagem({
        clinicaId: leadId,
        direction: 'outbound',
        content: 'Olá, sou o Henrique!',
        whatsappMessageId: 'msg_out_001',
        sender: 'bot',
        source: 'autopilot'
    });

    const msgs = db.prepare('SELECT * FROM messages WHERE clinica_id = ?').all(leadId);
    assert(msgs.length === 1, 'Mensagem outbound é salva no banco');
    assert(msgs[0].direction === 'outbound', 'Direction é outbound');
    assert(msgs[0].sender === 'bot', 'Sender é bot');
    assert(msgs[0].source === 'autopilot', 'Source é autopilot');
}

// Test 3: Mensagem NÃO é salva duas vezes (duplicata)
console.log('\n--- Anti-duplicação ---');
{
    const leadId = criarLead('Clínica Teste Duplicata');
    salvarMensagem({
        clinicaId: leadId,
        direction: 'inbound',
        content: 'Mensagem 1',
        whatsappMessageId: 'msg_dup_001',
        sender: 'lead',
        source: 'whatsapp'
    });

    // Tenta inserir de novo com o mesmo whatsapp_message_id
    salvarMensagem({
        clinicaId: leadId,
        direction: 'inbound',
        content: 'Mensagem 1 duplicada',
        whatsappMessageId: 'msg_dup_001',
        sender: 'lead',
        source: 'whatsapp'
    });

    const msgs = db.prepare('SELECT * FROM messages WHERE clinica_id = ?').all(leadId);
    assert(msgs.length === 1, 'Mensagem duplicada NÃO é salva (INSERT OR IGNORE)');
    assert(msgs[0].content === 'Mensagem 1', 'Conteúdo original é mantido');
}

// Test 4: Mensagens sem whatsapp_message_id podem ser salvas múltiplas vezes
console.log('\n--- Mensagens sem ID do WhatsApp ---');
{
    const leadId = criarLead('Clínica Teste Sem ID');
    salvarMensagem({
        clinicaId: leadId,
        direction: 'outbound',
        content: 'Mensagem A',
        whatsappMessageId: null,
        sender: 'bot',
        source: 'autopilot'
    });

    salvarMensagem({
        clinicaId: leadId,
        direction: 'outbound',
        content: 'Mensagem B',
        whatsappMessageId: null,
        sender: 'bot',
        source: 'followup'
    });

    const msgs = db.prepare('SELECT * FROM messages WHERE clinica_id = ?').all(leadId);
    assert(msgs.length === 2, 'Mensagens sem ID do WhatsApp são salvas independentemente');
}

// Test 5: Lead continua relacionado à mensagem
console.log('\n--- Relacionamento Lead ↔ Mensagem ---');
{
    const leadId1 = criarLead('Clínica A');
    const leadId2 = criarLead('Clínica B');

    salvarMensagem({ clinicaId: leadId1, direction: 'inbound', content: 'Msg Lead 1', whatsappMessageId: 'rel_001', sender: 'lead', source: 'whatsapp' });
    salvarMensagem({ clinicaId: leadId2, direction: 'inbound', content: 'Msg Lead 2', whatsappMessageId: 'rel_002', sender: 'lead', source: 'whatsapp' });
    salvarMensagem({ clinicaId: leadId1, direction: 'outbound', content: 'Resposta Lead 1', whatsappMessageId: 'rel_003', sender: 'bot', source: 'ia_interview' });

    const msgsLead1 = db.prepare('SELECT * FROM messages WHERE clinica_id = ?').all(leadId1);
    const msgsLead2 = db.prepare('SELECT * FROM messages WHERE clinica_id = ?').all(leadId2);
    assert(msgsLead1.length === 2, 'Lead 1 tem 2 mensagens');
    assert(msgsLead2.length === 1, 'Lead 2 tem 1 mensagem');
    assert(msgsLead1.every(m => m.clinica_id === Number(leadId1)), 'Todas as mensagens do Lead 1 têm clinica_id correto');
}

// Test 6: Diferentes sources são preservados
console.log('\n--- Sources ---');
{
    const leadId = criarLead('Clínica Teste Sources');
    const sources = ['autopilot', 'manual', 'ia_interview', 'followup', 'ia_handoff'];
    sources.forEach((src, i) => {
        salvarMensagem({
            clinicaId: leadId,
            direction: 'outbound',
            content: `Mensagem ${src}`,
            whatsappMessageId: `src_${i}`,
            sender: 'bot',
            source: src
        });
    });

    const msgs = db.prepare('SELECT source FROM messages WHERE clinica_id = ? ORDER BY id').all(leadId);
    assert(msgs.length === sources.length, `Todas as ${sources.length} sources foram salvas`);
    sources.forEach((src, i) => {
        assert(msgs[i].source === src, `Source '${src}' preservada`);
    });
}

// ============================================================
// TESTES — Follow-up
// ============================================================

console.log('\n\n🧪 TESTES — Follow-up\n');

// Test 7: Follow-up NÃO é enviado se o lead já respondeu
console.log('--- Follow-up vs Lead que respondeu ---');
{
    const pastDate = '2026-01-01 10:00:00';
    const leadReply = criarLead('Clínica Respondeu', 'reply', { last_contact_at: pastDate, followup_stage: 0 });

    const result = buscarLeadFollowup();
    const encontrouReply = result && result.id === Number(leadReply);
    assert(!encontrouReply, 'Lead com status "reply" NÃO aparece no follow-up');
}

// Test 8: Follow-up NÃO é enviado se o lead está interviewing
console.log('\n--- Follow-up vs Lead em entrevista ---');
{
    const pastDate = '2026-01-01 10:00:00';
    const leadInt = criarLead('Clínica Interviewing', 'interviewing', { last_contact_at: pastDate, followup_stage: 0 });

    const result = buscarLeadFollowup();
    const encontrouInt = result && result.id === Number(leadInt);
    assert(!encontrouInt, 'Lead com status "interviewing" NÃO aparece no follow-up');
}

// Test 9: Follow-up elegível para lead 'sent' com data antiga
console.log('\n--- Follow-up para lead elegível ---');
{
    const pastDate = '2025-01-01 10:00:00';
    const leadSent = criarLead('Clínica Elegível', 'sent', { last_contact_at: pastDate, criado_em: pastDate, followup_stage: 0 });

    const result = buscarLeadFollowup();
    assert(result !== null && result !== undefined, 'Follow-up encontra lead elegível');
    if (result) {
        assert(Number(result.id) === Number(leadSent), 'Lead encontrado é o correto');
    }
}

// Test 10: Follow-up NÃO dispara se follow_up_stage >= 2
console.log('\n--- Follow-up limite de tentativas ---');
{
    const pastDate = '2025-01-01 10:00:00';
    const leadMaxFollowup = criarLead('Clínica Max Follow-up', 'sent', { last_contact_at: pastDate, criado_em: pastDate, followup_stage: 2 });

    // Limpa o lead anterior elegível para não interferir
    db.prepare("UPDATE clinicas SET status = 'disabled' WHERE nome = 'Clínica Elegível'").run();

    const result = buscarLeadFollowup();
    const encontrouMax = result && result.id === Number(leadMaxFollowup);
    assert(!encontrouMax, 'Lead com followup_stage=2 NÃO recebe mais follow-ups');
}

// Test 11: Follow-up NÃO dispara se config está desativada
console.log('\n--- Follow-up desativado ---');
{
    db.prepare("UPDATE configuracoes SET valor = 'false' WHERE chave = 'followup_auto_ativo'").run();
    const pastDate = '2025-01-01 10:00:00';
    criarLead('Clínica Follow-up Off', 'sent', { last_contact_at: pastDate, criado_em: pastDate, followup_stage: 0 });

    const result = buscarLeadFollowup();
    assert(result === null || result === undefined, 'Follow-up retorna null quando desativado');

    // Reativa para os próximos testes
    db.prepare("UPDATE configuracoes SET valor = 'true' WHERE chave = 'followup_auto_ativo'").run();
}

// Test 12: Follow-up não gera duplicidade de mensagens
console.log('\n--- Follow-up sem duplicidade ---');
{
    const pastDate = '2025-01-01 10:00:00';
    const leadId = criarLead('Clínica Follow-up Dup', 'sent', { last_contact_at: pastDate, criado_em: pastDate, followup_stage: 0 });

    // Simula envio de follow-up
    salvarMensagem({
        clinicaId: leadId,
        direction: 'outbound',
        content: 'Follow-up 1',
        whatsappMessageId: 'followup_dup_001',
        sender: 'bot',
        source: 'followup'
    });

    // Tenta salvar de novo com o mesmo ID
    salvarMensagem({
        clinicaId: leadId,
        direction: 'outbound',
        content: 'Follow-up 1 duplicado',
        whatsappMessageId: 'followup_dup_001',
        sender: 'bot',
        source: 'followup'
    });

    const msgs = db.prepare("SELECT * FROM messages WHERE clinica_id = ? AND source = 'followup'").all(leadId);
    assert(msgs.length === 1, 'Follow-up não gera duplicidade de mensagens');
}

// ============================================================
// RESULTADO
// ============================================================

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Resultado: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
    console.log('❌ ALGUNS TESTES FALHARAM!\n');
    process.exit(1);
} else {
    console.log('✅ TODOS OS TESTES PASSARAM!\n');
    process.exit(0);
}
