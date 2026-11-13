const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../cleanmed.db');
const db = new Database(dbPath);

console.log('Iniciando limpeza profunda de Nomes e Endereços:', dbPath);

const clinicas = db.prepare("SELECT id, nome, endereco FROM clinicas WHERE origem = 'google_maps_scraper'").all();
const update = db.prepare('UPDATE clinicas SET nome = ?, endereco = ? WHERE id = ?');

let cleanedCount = 0;
for (const c of clinicas) {
  let newNome = c.nome;
  let newEndereco = c.endereco;

  // Limpeza de Nome: Remove taglines após | ou - se for muito longa
  if (newNome.includes('|')) {
    newNome = newNome.split('|')[0].trim();
  }
  
  // Limpeza de Endereço: Remove prefixos como "Policlínica ·  · " ou "Centro médico ·  · "
  // O padrão comum é [Categoria] · [Estrela] · [Endereço]
  if (newEndereco.includes('·  ·')) {
    const parts = newEndereco.split('·  ·');
    newEndereco = parts[parts.length - 1].trim();
  } else if (newEndereco.includes('·')) {
     // Tenta pegar a última parte se houver múltiplos separadores
     const parts = newEndereco.split('·');
     if (parts.length > 1) {
        newEndereco = parts[parts.length - 1].trim();
     }
  }

  if (newNome !== c.nome || newEndereco !== c.endereco) {
    update.run(newNome, newEndereco, c.id);
    cleanedCount++;
  }
}

console.log(`${cleanedCount} registros foram sanitizados com sucesso.`);
db.close();
