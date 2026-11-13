require('dotenv').config({ path: __dirname + '/.env' });
const db = require('./db/database');
const { gerarResposta } = require('./ia');

async function test() {
    const msg = {
        from: '5585994465642@c.us',
        body: 'Em breve, um de nossos atendentes retornará sua mensagem.',
        isGroupMsg: false,
        isStatus: false,
        type: 'chat'
    };

    let fromNumber = msg.from.replace(/\D/g, '');
    const dddAndNumber = fromNumber.substring(fromNumber.startsWith('55') ? 2 : 0);

    let numberWith9 = dddAndNumber;
    let numberWithout9 = dddAndNumber;

    if (dddAndNumber.length === 11 && dddAndNumber.charAt(2) === '9') {
        numberWithout9 = dddAndNumber.substring(0, 2) + dddAndNumber.substring(3);
    } else if (dddAndNumber.length === 10) {
        numberWith9 = dddAndNumber.substring(0, 2) + '9' + dddAndNumber.substring(2);
    }

    if (dddAndNumber.length >= 10) {
        const lead = db.prepare(`
            SELECT * FROM clinicas 
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ? 
               OR REPLACE(REPLACE(REPLACE(REPLACE(tel, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ? 
            LIMIT 1
        `).get(`%${numberWith9}%`, `%${numberWithout9}%`);
        
        if (lead) {
            console.log(`[WhatsApp] Lead Encontrado no DB: ${lead.nome}. Status atual: ${lead.status}`);
            if (lead.status === 'sent') {
                console.log(`[WhatsApp-Inbox] Consultando IA (Groq) para resposta autônoma...`);
                const respostaIA = await gerarResposta(lead, msg.body);
                console.log(`[WhatsApp-Inbox] Retorno da IA: ${respostaIA}`);
            }
        }
    }
}
test();
