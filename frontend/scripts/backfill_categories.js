const Database = require('better-sqlite3');
const path = require('path');
try {
    const dbPath = path.resolve(__dirname, '../../backend/cleanmed.db');
    console.log('Connecting to:', dbPath);
    const db = new Database(dbPath);
    
    db.exec("UPDATE clinicas SET categoria = 'Clínica Odontológica' WHERE (nome LIKE '%Odonto%' OR nome LIKE '%Dentista%' OR nome LIKE '%Sorriso%') AND (categoria IS NULL OR categoria = '');");
    db.exec("UPDATE clinicas SET categoria = 'Clínica de Estética' WHERE (nome LIKE '%Estética%' OR nome LIKE '%Estetica%' OR nome LIKE '%Sobrancelha%' OR nome LIKE '%Cílios%') AND (categoria IS NULL OR categoria = '');");
    db.exec("UPDATE clinicas SET categoria = 'Dermatologista' WHERE (nome LIKE '%Dermat%') AND (categoria IS NULL OR categoria = '');");
    db.exec("UPDATE clinicas SET categoria = 'Clínica Médica' WHERE (nome LIKE '%Médic%' OR nome LIKE '%Medic%' OR nome LIKE '%Consultório%') AND (categoria IS NULL OR categoria = '');");
    db.exec("UPDATE clinicas SET categoria = 'Fisioterapia' WHERE (nome LIKE '%Fisio%') AND (categoria IS NULL OR categoria = '');");
    
    const stats = db.prepare('SELECT categoria, count(*) as total FROM clinicas GROUP BY categoria').all();
    console.log('Stats:', JSON.stringify(stats, null, 2));
    db.close();
} catch (e) {
    console.error('Error:', e.message);
}
