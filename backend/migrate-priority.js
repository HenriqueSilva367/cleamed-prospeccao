const db = require('./db/database');
const { OpenAI } = require('openai');

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
    console.error("ERRO: OPENAI_API_KEY não configurada no ambiente!");
    process.exit(1);
}
const openai = new OpenAI({ apiKey: openaiApiKey });

// Certifica que a coluna existe
try {
    db.exec("ALTER TABLE clinicas ADD COLUMN lead_priority TEXT DEFAULT 'LOW';");
    console.log("Coluna lead_priority adicionada/verificada com sucesso.");
} catch (e) {
    // Ignora se a coluna já existe
}

async function classificarPorRespostas(respostas) {
    const prompt = `
Você é um qualificador de leads comerciais.
Sua tarefa é analisar as respostas do diagnóstico de uma clínica e classificá-la como prioridade HIGH, MEDIUM ou LOW.

Respostas do diagnóstico:
${JSON.stringify(respostas, null, 2)}

Diretrizes:
- **HIGH**: Menção a preço/demonstração/teste/interesse ativo em conhecer o CleanMed ou marcar reunião.
- **MEDIUM**: Relato de dores operacionais claras (como confirmação manual, perda de tempo, insatisfações com o sistema atual, falta de pacientes).
- **LOW**: Sem dores informadas, satisfeito com o sistema atual, ou apenas informações neutras.

Retorne APENAS um JSON:
{
  "priority": "HIGH" | "MEDIUM" | "LOW"
}
`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        });
        const json = JSON.parse(response.choices[0].message.content.trim());
        return json.priority || 'LOW';
    } catch (e) {
        console.error("Erro na chamada OpenAI:", e.message);
        return 'LOW';
    }
}

async function run() {
    console.log("Iniciando migração de prioridades dos leads...");
    
    // Busca todas as clínicas do banco
    const clinicas = db.prepare("SELECT * FROM clinicas").all();
    console.log(`Total de clínicas encontradas: ${clinicas.length}`);
    
    let atualizados = 0;
    for (const c of clinicas) {
        const diag = db.prepare("SELECT respostas FROM diagnosticos WHERE clinica_id = ?").get(c.id);
        
        let priority = 'LOW';
        if (diag && diag.respostas) {
            try {
                const respostas = JSON.parse(diag.respostas);
                const oQueIncomoda = respostas.bloco5?.o_que_incomoda || "";
                const objetivos = respostas.bloco6?.objetivos || "";
                
                if (oQueIncomoda.trim() || objetivos.trim()) {
                    console.log(`Classificando clínica ${c.nome}...`);
                    priority = await classificarPorRespostas(respostas);
                    console.log(`-> Resultado: ${priority}`);
                }
            } catch (err) {
                console.error(`Erro ao processar respostas da clínica ${c.nome}:`, err.message);
            }
        }
        
        // Se a prioridade for diferente de LOW, atualiza no banco
        if (priority !== 'LOW') {
            db.prepare("UPDATE clinicas SET sales_priority = ?, sales_priority_source = 'auto' WHERE id = ? AND IFNULL(sales_priority_source, 'auto') != 'manual'").run(priority, c.id);
            atualizados++;
        }
    }
    
    console.log(`Migração concluída! ${atualizados} leads foram atualizados com prioridades mais altas.`);
}

run().catch(console.error);
