const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../../backend/cleanmed.db'));

const clinicas = db.prepare('SELECT id, tel FROM clinicas').all();

const update = db.prepare('UPDATE clinicas SET tel = ? WHERE id = ?');

let cleanedCount = 0;
for (const c of clinicas) {
  if (c.tel) {
    const cleaned = c.tel.replace(/\D/g, '');
    if (cleaned !== c.tel) {
      update.run(cleaned, c.id);
      cleanedCount++;
    }
  }
}

console.log(`${cleanedCount} telefones foram limpos com sucesso.`);
db.close();
