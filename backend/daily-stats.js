function localDayWindow(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const dateKey = [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, '0'),
    String(start.getDate()).padStart(2, '0')
  ].join('-');

  const toSqlUtc = (value) => value.toISOString().slice(0, 19).replace('T', ' ');
  return {
    date: dateKey,
    startUtc: toSqlUtc(start),
    endUtc: toSqlUtc(end)
  };
}

function getDailyStats(db, now = new Date()) {
  const window = localDayWindow(now);
  const row = db.prepare(`
    SELECT COUNT(*) AS sentCount
    FROM messages
    WHERE direction = 'outbound'
      AND source IN ('autopilot', 'followup')
      AND timestamp >= ?
      AND timestamp < ?
  `).get(window.startUtc, window.endUtc);

  return {
    date: window.date,
    sentCount: Number(row?.sentCount || 0)
  };
}

module.exports = { localDayWindow, getDailyStats };
