const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../cleanmed.db'));

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
    total_avaliacoes INTEGER DEFAULT 0,
    google_place_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    origem TEXT DEFAULT 'manual',
    whatsapp_id TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  );
`);

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN categoria TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN cidade TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN mensagem_ia TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN whatsapp_id TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN lead_priority TEXT DEFAULT 'LOW';");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN fit_score INTEGER DEFAULT 0;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN score_reason TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN first_contact_at TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN last_contact_at TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN followup_stage INTEGER DEFAULT 0;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN last_followup_at TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN dor_detectada TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN sistema_atual TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN proxima_acao TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN proxima_acao_data TEXT;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN whatsapp_valido INTEGER DEFAULT 0;");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN tel_origem TEXT DEFAULT 'google_maps';");
} catch (e) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN tem_bot INTEGER DEFAULT 0;");
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN tipo_atendimento TEXT DEFAULT 'humano';");
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN bot_confianca INTEGER DEFAULT 0;");
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN bot_detectado_em TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN progresso_lead TEXT DEFAULT 'PENDENTE';");
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN progresso_motivo TEXT;");
} catch (e) {}

// Campos de enriquecimento via reviews do Google Maps (Fase 1 - Prospecção Personalizada)
try {
  db.exec("ALTER TABLE clinicas ADD COLUMN reviews_raw TEXT;"); // JSON com até 10 reviews
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN reviews_resumo TEXT;"); // Resumo gerado pela IA
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN pontos_fortes TEXT;"); // Elogios recorrentes
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN pontos_fracos TEXT;"); // Reclamações recorrentes
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN especialidades TEXT;"); // Serviços/especialidades
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN nome_dono TEXT;"); // Nome do proprietário
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN enriquecido_em TEXT;"); // Timestamp do enriquecimento
} catch (e) {}

try {
  db.exec("ALTER TABLE clinicas ADD COLUMN ia_ativa INTEGER DEFAULT 1;"); // 1 = IA ativa, 0 = sem interferência da IA (manual)
} catch (e) {}

try { db.exec("ALTER TABLE clinicas ADD COLUMN handoff_at TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE clinicas ADD COLUMN handoff_reason TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE clinicas ADD COLUMN handoff_notified_at TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE clinicas ADD COLUMN sales_priority TEXT DEFAULT 'LOW';"); } catch (e) {}
try { db.exec("ALTER TABLE clinicas ADD COLUMN sales_priority_source TEXT DEFAULT 'auto';"); } catch (e) {}

// Backfill conservador: usa sinais reais de conversa/funil, não o antigo lead_priority,
// que misturava adequação do perfil com prioridade comercial.
db.exec(`
  UPDATE clinicas
  SET sales_priority = CASE
    WHEN handoff_at IS NOT NULL
      OR progresso_lead IN ('INTERESSE_ALTO', 'INDICOU_RESPONSAVEL')
      OR status IN ('reuniao_agendada', 'demo_realizada', 'negociando', 'diagnostico', 'proposta', 'converted')
      THEN 'HIGH'
    WHEN progresso_lead = 'QUALIFICADO_DOR'
      OR status IN ('reply', 'interviewing')
      THEN 'MEDIUM'
    ELSE 'LOW'
  END
  WHERE (sales_priority IS NULL OR sales_priority = '' OR sales_priority = 'LOW')
    AND IFNULL(sales_priority_source, 'auto') != 'manual';
`);


db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clinicas_google_place_id ON clinicas(google_place_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_clinicas_status_score ON clinicas(status, fit_score, lead_priority);`);

db.exec(`
  CREATE TABLE IF NOT EXISTS historico_buscas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cidade TEXT NOT NULL,
    tipo TEXT,
    quantidade INTEGER,
    criado_em TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS diagnosticos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinica_id INTEGER NOT NULL,
    respostas TEXT NOT NULL,
    overview TEXT,
    roi TEXT,
    proposal TEXT,
    competitor_analysis TEXT,
    strategy_html TEXT,
    plano_recomendado TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (clinica_id) REFERENCES clinicas(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinica_id INTEGER NOT NULL,
    texto TEXT NOT NULL,
    tipo TEXT DEFAULT 'nota',
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (clinica_id) REFERENCES clinicas(id)
  );
`);

// Histórico automático de mudanças de etapa do pipeline.
db.exec(`
  CREATE TABLE IF NOT EXISTS status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinica_id INTEGER NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (clinica_id) REFERENCES clinicas(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_status_history_clinica
  ON status_history(clinica_id, changed_at DESC, id DESC);
`);

db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_clinicas_status_history
  AFTER UPDATE OF status ON clinicas
  FOR EACH ROW
  WHEN OLD.status IS NOT NEW.status
  BEGIN
    INSERT INTO status_history (clinica_id, old_status, new_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END;
`);


// Tabela de mensagens — persiste TODO o histórico de conversas independente do WhatsApp
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
// Previne duplicatas: se o mesmo whatsapp_message_id já existir, INSERT OR IGNORE não insere de novo
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;`);

// Valores padrão da busca automática (só insere se não existirem)
const inserirConfigPadrao = db.prepare(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)`);
inserirConfigPadrao.run('busca_auto_ativa', 'false');
inserirConfigPadrao.run('busca_cidade', 'Fortaleza');
inserirConfigPadrao.run('busca_bairros', JSON.stringify(['Aldeota', 'Meireles', 'Messejana', 'Maraponga', 'Parangaba', 'Benfica', 'Fátima', 'Papicu']));
inserirConfigPadrao.run('busca_tipos', JSON.stringify(['Clínica Odontológica', 'Clínica de Estética', 'Clínica Médica', 'Fisioterapia', 'Dermatologista']));
inserirConfigPadrao.run('busca_quantidade', '30');
inserirConfigPadrao.run('busca_indice_atual', '0');
inserirConfigPadrao.run('followup_auto_ativo', 'false');
inserirConfigPadrao.run('followup_dias_1', '1');
inserirConfigPadrao.run('followup_dias_2', '3');
inserirConfigPadrao.run('whatsapp_vendedor', '');
inserirConfigPadrao.run('horario_inteligente_ativo', 'true');

module.exports = db;
