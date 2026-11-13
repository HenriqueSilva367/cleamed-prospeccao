const { classificarPrioridadeDaConversa } = require('./ia');

// Load env variables
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const testCases = [
    {
        name: "Alta Prioridade (Interesse Comercial)",
        dialogue: [
            { fromMe: true, body: "Olá! Vi a sua clínica. Você é o responsável?" },
            { fromMe: false, body: "Olá, sou eu sim. Quem gostaria?" },
            { fromMe: true, body: "Sou o Henrique da CleanMed. Hoje vocês usam algum sistema de gestão ou fazem tudo manualmente?" },
            { fromMe: false, body: "Usamos agenda de papel ainda. Quanto custa o sistema de vocês? Tem demonstração para testar?" }
        ]
    },
    {
        name: "Média Prioridade (Dor Operacional)",
        dialogue: [
            { fromMe: true, body: "Olá! Vi a sua clínica. Você é o responsável?" },
            { fromMe: false, body: "Oi, sou a administradora." },
            { fromMe: true, body: "Henrique da CleanMed aqui. Vocês já usam sistema para gerenciar a clínica?" },
            { fromMe: false, body: "Olha, usamos um sistema aqui mas é muito lento e o controle financeiro a gente tem que fazer todo em planilha separada porque ele não tem módulo de fluxo de caixa." }
        ]
    },
    {
        name: "Baixa Prioridade (Satisfeito/Neutro)",
        dialogue: [
            { fromMe: true, body: "Olá! Vi a sua clínica. Você é o responsável?" },
            { fromMe: false, body: "Sim, sou o Dr. Marcos." },
            { fromMe: true, body: "Sou Henrique da CleanMed. Vocês usam algum software ou fazem os processos manualmente?" },
            { fromMe: false, body: "Nós usamos o Simples Dental há 3 anos e nos atende super bem. Estamos bem satisfeitos." }
        ]
    }
];

async function runTests() {
    console.log("🚀 Iniciando testes de classificação de prioridade de leads...\n");
    
    for (const tc of testCases) {
        console.log(`=== Testando caso: ${tc.name} ===`);
        try {
            const result = await classificarPrioridadeDaConversa(tc.dialogue);
            console.log("Resultado da classificação:", JSON.stringify(result, null, 2));
            console.log("---------------------------------------------------\n");
        } catch (e) {
            console.error(`Erro ao testar caso ${tc.name}:`, e.message);
        }
    }
}

runTests();
