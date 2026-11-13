const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/database');

test('mudanças reais de status são registradas uma vez e na ordem correta', () => {
  const result = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES ('Clínica Histórico Pipeline', '5585000000099', 'pending')").run();
  const id = result.lastInsertRowid;

  try {
    db.prepare("UPDATE clinicas SET status = 'sent' WHERE id = ?").run(id);
    db.prepare("UPDATE clinicas SET status = 'sent' WHERE id = ?").run(id);
    db.prepare("UPDATE clinicas SET status = 'interviewing' WHERE id = ?").run(id);

    const history = db.prepare(
      'SELECT old_status, new_status FROM status_history WHERE clinica_id = ? ORDER BY id ASC'
    ).all(id);

    assert.deepEqual(history, [
      { old_status: 'pending', new_status: 'sent' },
      { old_status: 'sent', new_status: 'interviewing' }
    ]);
  } finally {
    db.prepare('DELETE FROM status_history WHERE clinica_id = ?').run(id);
    db.prepare('DELETE FROM clinicas WHERE id = ?').run(id);
  }
});
