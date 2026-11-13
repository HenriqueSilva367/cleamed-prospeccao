require('dotenv').config();
const { 
  Stage, 
  detectNegativeIntent, 
  shouldStopWithoutProgress, 
  detectStageTransition, 
  obterTemplateFallback, 
  gerarResposta 
} = require('../ia');

async function runManualTest() {
  console.log("=================================================");
  console.log("   TESTE MANUAL DO FLUXO IA CONVERSACIONAL      ");
  console.log("=================================================\n");

  // Garante que o novo fluxo está ativado durante o teste
  process.env.ENABLE_NEW_AI_FLOW = 'true';

  const clinicaTeste = { nome: "Clínica Vida & Saúde" };

  console.log("1. Teste de Detecção de Intenção Negativa:");
  const msgNegativa = "não tenho interesse, obrigado";
  console.log(`   Mensagem: "${msgNegativa}"`);
  console.log(`   Detectou negativa? ${detectNegativeIntent(msgNegativa)} (Esperado: true)`);

  console.log("\n2. Teste de Transição de Estágio:");
  const histDor = [
    { fromMe: true, body: "Olá, como funcionam as confirmações por aí?" },
    { fromMe: false, body: "Temos muita falta de paciente e fazemos tudo no manual" }
  ];
  const proximoEstagio = detectStageTransition(histDor, Stage.DISCOVERY);
  console.log(`   Entrada: "muita falta e manual" -> Próximo Estágio: ${proximoEstagio} (Esperado: DOR_IDENTIFICADA)`);

  console.log("\n3. Teste de Limite de Mensagens sem Progresso:");
  const histLimite = [
    { fromMe: true, body: "Pergunta 1" },
    { fromMe: true, body: "Pergunta 2" },
    { fromMe: true, body: "Pergunta 3" },
    { fromMe: true, body: "Pergunta 4" }
  ];
  const decisaoParada = shouldStopWithoutProgress(histLimite, Stage.DISCOVERY);
  console.log(`   Decisão após 4 respostas de IA: ${decisaoParada}`);

  console.log("\n4. Teste de Fallback Template:");
  const fallback = obterTemplateFallback(clinicaTeste);
  console.log(`   Template gerado: "${fallback}"`);

  console.log("\n5. Teste de Geração de Resposta Completa via IA (Simulação):");
  try {
    const resp = await gerarResposta(clinicaTeste, histDor, Stage.DISCOVERY);
    console.log("   Resposta gerada pela IA:");
    console.log(`   >>> ${resp}`);
  } catch (err) {
    console.error("   Erro no teste de geração:", err.message);
  }

  console.log("\n=================================================");
  console.log("   FIM DOS TESTES MANUAIS                       ");
  console.log("=================================================");
}

runManualTest();
