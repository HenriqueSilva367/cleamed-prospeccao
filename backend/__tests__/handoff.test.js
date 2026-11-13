const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/database');
const { registrarHandoff, marcarHandoffNotificado } = require('../handoff');

function deleteTestClinic(id) {
  db.prepare('DELETE FROM status_history WHERE clinica_id = ?').run(id);
  db.prepare('DELETE FROM clinicas WHERE id = ?').run(id);
}

test('handoff é registrado uma única vez e pausa a IA', () => {
  const result = db.prepare("INSERT INTO clinicas (nome, tel, status, ia_ativa) VALUES ('Clínica Handoff Teste', '5585000000001', 'interviewing', 1)").run();
  const id = result.lastInsertRowid;
  try {
    assert.equal(registrarHandoff(db, id, 'Solicitou demonstração.'), true);
    assert.equal(registrarHandoff(db, id, 'Solicitou preço.'), false);
    const lead = db.prepare('SELECT status, ia_ativa, handoff_at, handoff_reason, handoff_notified_at, sales_priority FROM clinicas WHERE id = ?').get(id);
    assert.equal(lead.status, 'reply');
    assert.equal(lead.ia_ativa, 0);
    assert.ok(lead.handoff_at);
    assert.equal(lead.handoff_reason, 'Solicitou demonstração.');
    assert.equal(lead.handoff_notified_at, null);
    assert.equal(lead.sales_priority, 'HIGH');
  } finally {
    deleteTestClinic(id);
  }
});

test('handoff permite marcar notificação enviada apenas uma vez', () => {
  const result = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES ('Clínica Handoff Notificação', '5585000000002', 'interviewing')").run();
  const id = result.lastInsertRowid;
  try {
    registrarHandoff(db, id, 'Pediu contato humano.');
    assert.equal(marcarHandoffNotificado(db, id), true);
    assert.equal(marcarHandoffNotificado(db, id), false);
    const lead = db.prepare('SELECT handoff_notified_at FROM clinicas WHERE id = ?').get(id);
    assert.ok(lead.handoff_notified_at);
  } finally {
    deleteTestClinic(id);
  }
});

test('handoff preserva prioridade comercial definida manualmente', () => {
  const result = db.prepare("INSERT INTO clinicas (nome, tel, status, ia_ativa, sales_priority, sales_priority_source) VALUES ('Clínica Handoff Manual', '5585000000003', 'interviewing', 1, 'LOW', 'manual')").run();
  const id = result.lastInsertRowid;
  try {
    assert.equal(registrarHandoff(db, id, 'Solicitou contato humano.'), true);
    const lead = db.prepare('SELECT sales_priority, sales_priority_source FROM clinicas WHERE id = ?').get(id);
    assert.equal(lead.sales_priority, 'LOW');
    assert.equal(lead.sales_priority_source, 'manual');
  } finally {
    deleteTestClinic(id);
  }
});
