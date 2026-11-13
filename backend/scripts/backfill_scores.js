const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const db = require('../db/database');
const { applyLeadScore } = require('../lead-scoring');

const rows = db.prepare('SELECT * FROM clinicas').all();
const update = db.prepare(`
  UPDATE clinicas
  SET fit_score = ?,
      lead_priority = ?,
      score_reason = ?
  WHERE id = ?
`);

let updated = 0;

const transaction = db.transaction((items) => {
  for (const lead of items) {
    const scored = applyLeadScore(lead);
    update.run(scored.fit_score, scored.lead_priority, scored.score_reason, lead.id);
    updated++;
  }
});

transaction(rows);

console.log(`Scores recalculados para ${updated} leads.`);
