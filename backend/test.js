const db = require('./db/database');
const { enviarMensagem } = require('./whatsapp');

async function run() {
    try {
        const nome = 'Clínica Teste Henrique';
        const tel = '81997666157';
        
        const stmt = db.prepare('INSERT INTO clinicas (nome, tel, status) VALUES (?, ?, ?)');
        const result = stmt.run(nome, tel, 'sent');
        const id = result.lastInsertRowid;
        
        console.log('Lead criado com ID:', id);
        
        const texto = "Olá, tudo bem? 😊\n\nSou Henrique, da CleanMed.\n\nNa verdade entrei em contato porque trabalho com soluções para gestão de clínicas e queria tirar uma dúvida rápida.\n\nVocê é a pessoa responsável pela parte administrativa da clínica ou poderia me indicar quem cuida dessa área?";
        
        console.log('Enviando mensagem inicial...');
        // Aguarda 3 segundos para garantir que o client web.js está logado no backend
        await new Promise(r => setTimeout(r, 3000));
        
        await enviarMensagem(id, tel, texto);
        console.log('Mensagem inicial disparada! O lead já está com status sent.');
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
