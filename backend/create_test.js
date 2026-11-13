const db = require('./db/database');
const http = require('http');

const nome = 'Clínica Teste Henrique';
const tel = '81997666157';

const stmt = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES (?, ?, 'sent')");
const result = stmt.run(nome, tel);
const id = result.lastInsertRowid;
console.log('Lead criado com ID:', id);

const texto = JSON.stringify({texto: "Olá, tudo bem? 😊\n\nSou Henrique, da CleanMed.\n\nNa verdade entrei em contato porque trabalho com soluções para gestão de clínicas e queria tirar uma dúvida rápida.\n\nVocê é a pessoa responsável pela parte administrativa da clínica ou poderia me indicar quem cuida dessa área?"});

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/clinicas/' + id + '/mensagem',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(texto)
  }
}, (res) => {
  console.log('Mensagem enviada:', res.statusCode);
  process.exit(0);
});

req.write(texto);
req.end();
