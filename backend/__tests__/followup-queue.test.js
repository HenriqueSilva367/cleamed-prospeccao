const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { listDueFollowups, registerManualFollowup, listFollowupHistory } = require('../followup-queue');

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE configuracoes (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE followup_history (id INTEGER PRIMARY KEY AUTOINCREMENT, clinica_id INTEGER NOT NULL, stage INTEGER NOT NULL, source TEXT NOT NULL, message_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE clinicas (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      tel TEXT,
      categoria TEXT,
      cidade TEXT,
      status TEXT,
      sales_priority TEXT,
      fit_score INTEGER DEFAULT 0,
      tem_bot INTEGER DEFAULT 0,
      ia_ativa INTEGER DEFAULT 1,
      followup_stage INTEGER DEFAULT 0,
      first_contact_at TEXT,
      last_contact_at TEXT,
      last_followup_at TEXT,
      criado_em TEXT
    );
  `);
  return db;
}

function insertLead(db, lead) {
  db.prepare(`
    INSERT INTO clinicas (
      id, nome, tel, status, sales_priority, fit_score, tem_bot, ia_ativa,
      followup_stage, last_contact_at, last_followup_at, criado_em
    ) VALUES (
      @id, @nome, @tel, @status, @sales_priority, @fit_score, @tem_bot, @ia_ativa,
      @followup_stage, @last_contact_at, @last_followup_at, @criado_em
    )
  `).run({
    id: lead.id,
    nome: lead.nome || `Clínica ${lead.id}`,
    tel: '85999999999',
    status: lead.status ?? 'sent',
    sales_priority: lead.sales_priority ?? 'LOW',
    fit_score: lead.fit_score ?? 0,
    tem_bot: lead.tem_bot ?? 0,
    ia_ativa: lead.ia_ativa ?? 1,
    followup_stage: lead.followup_stage ?? 0,
    last_contact_at: lead.last_contact_at ?? '2026-11-10 09:00:00',
    last_followup_at: lead.last_followup_at ?? null,
    criado_em: lead.criado_em ?? '2026-11-10 09:00:00'
  });
}

test('lista follow-ups vencidos e calcula o próximo prazo conforme o estágio', () => {
  const db = createDb();
  try {
    db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)').run('followup_dias_1', '1');
    db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)').run('followup_dias_2', '3');
    insertLead(db, { id: 1, last_contact_at: '2026-11-10 09:00:00' });
    insertLead(db, { id: 2, followup_stage: 1, last_contact_at: '2026-11-08 09:00:00', last_followup_at: '2026-11-10 09:00:00', sales_priority: 'HIGH' });
    insertLead(db, { id: 3, last_contact_at: '2026-11-13 08:00:00' });

    const result = listDueFollowups(db, { now: '2026-11-13 10:00:00' });
    assert.equal(result.total, 2);
    assert.equal(result.items[0].id, 2);
    assert.equal(result.items[0].due_at, '2026-11-13 09:00:00');
    assert.equal(result.items[0].due_status, 'overdue');
    assert.equal(result.items[1].id, 1);
  } finally {
    db.close();
  }
});

test('não inclui leads respondidos, pausados, com bot ou com IA desativada', () => {
  const db = createDb();
  try {
    insertLead(db, { id: 1, status: 'reply' });
    insertLead(db, { id: 2, tem_bot: 1 });
    insertLead(db, { id: 3, ia_ativa: 0 });
    insertLead(db, { id: 4, status: 'sent', last_contact_at: '2026-11-13 09:30:00' });

    const result = listDueFollowups(db, { now: '2026-11-13 10:00:00' });
    assert.equal(result.total, 0);
    assert.deepEqual(result.items, []);
  } finally {
    db.close();
  }
});

test('limita a resposta e informa se o follow-up automático está desligado', () => {
  const db = createDb();
  try {
    db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)').run('followup_auto_ativo', 'false');
    for (let id = 1; id <= 3; id++) insertLead(db, { id });
    const result = listDueFollowups(db, { now: '2026-11-13 10:00:00', limit: 2 });
    assert.equal(result.enabled, false);
    assert.equal(result.total, 3);
    assert.equal(result.returned, 2);
    assert.equal(result.limit, 2);
  } finally {
    db.close();
  }
});


test('registra follow-up manual explicitamente e avança o estágio', () => {
  const db = createDb();
  try {
    insertLead(db, { id: 10, followup_stage: 0 });
    const result = registerManualFollowup(db, 10, { now: '2026-11-13 15:30:00' });
    const lead = db.prepare('SELECT followup_stage, last_followup_at FROM clinicas WHERE id = 10').get();
    assert.deepEqual(result, { ok: true, followup_stage: 1, last_followup_at: '2026-11-13 15:30:00' });
    assert.deepEqual(lead, { followup_stage: 1, last_followup_at: '2026-11-13 15:30:00' });
  } finally {
    db.close();
  }
});

test('não registra follow-up para clínica inexistente, respondida ou com etapas concluídas', () => {
  const db = createDb();
  try {
    insertLead(db, { id: 11, status: 'reply' });
    insertLead(db, { id: 12, followup_stage: 4 });
    assert.equal(registerManualFollowup(db, 999).reason, 'not_found');
    assert.equal(registerManualFollowup(db, 11).reason, 'invalid_status');
    assert.equal(registerManualFollowup(db, 12).reason, 'completed');
  } finally {
    db.close();
  }
});


test('mantém histórico de cada follow-up manual e retorna em ordem decrescente', () => {
  const db = createDb();
  try {
    insertLead(db, { id: 20 });
    registerManualFollowup(db, 20, { now: '2026-11-11 10:00:00' });
    registerManualFollowup(db, 20, { now: '2026-11-12 11:00:00' });
    const history = listFollowupHistory(db, 20);
    assert.equal(history.length, 2);
    assert.deepEqual(history.map(item => item.stage), [2, 1]);
    assert.deepEqual(history.map(item => item.source), ['manual', 'manual']);
    assert.deepEqual(history.map(item => item.created_at), ['2026-11-12 11:00:00', '2026-11-11 10:00:00']);
  } finally {
    db.close();
  }
});
