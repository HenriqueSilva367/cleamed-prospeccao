const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { localDayWindow, getDailyStats } = require('../daily-stats');

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL,
      source TEXT,
      timestamp TEXT NOT NULL
    );
  `);
  return db;
}

test('janela diária usa o dia local e limites UTC correspondentes', () => {
  const date = new Date(2026, 10, 13, 12, 0, 0);
  const window = localDayWindow(date);

  assert.equal(window.date, '2026-11-13');
  assert.equal(window.startUtc, new Date(2026, 10, 13).toISOString().slice(0, 19).replace('T', ' '));
  assert.equal(window.endUtc, new Date(2026, 10, 14).toISOString().slice(0, 19).replace('T', ' '));
});

test('conta somente envios do piloto e follow-ups no dia local atual', () => {
  const db = createDb();
  try {
    const window = localDayWindow(new Date(2026, 10, 13, 12, 0, 0));
    const insert = db.prepare('INSERT INTO messages (direction, source, timestamp) VALUES (?, ?, ?)');
    insert.run('outbound', 'autopilot', window.startUtc);
    insert.run('outbound', 'followup', '2026-11-13 15:00:00');
    insert.run('outbound', 'whatsapp_app', '2026-11-13 15:10:00');
    insert.run('inbound', 'autopilot', '2026-11-13 15:20:00');
    insert.run('outbound', 'autopilot', window.endUtc);

    assert.deepEqual(getDailyStats(db, new Date(2026, 10, 13, 12, 0, 0)), {
      date: '2026-11-13',
      sentCount: 2
    });
  } finally {
    db.close();
  }
});

test('não conta envios de dias anteriores', () => {
  const db = createDb();
  try {
    db.prepare('INSERT INTO messages (direction, source, timestamp) VALUES (?, ?, ?)').run(
      'outbound', 'autopilot', '2026-11-12 23:59:59'
    );
    assert.equal(getDailyStats(db, new Date(2026, 10, 13, 12, 0, 0)).sentCount, 0);
  } finally {
    db.close();
  }
});
