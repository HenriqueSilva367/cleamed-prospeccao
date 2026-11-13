const test = require('node:test');
const assert = require('node:assert/strict');
function deleteTestClinic(db, id) {
  db.prepare('DELETE FROM status_history WHERE clinica_id = ?').run(id);
  db.prepare('DELETE FROM clinicas WHERE id = ?').run(id);
}

const { 
  Stage, 
  detectNegativeIntent, 
  shouldStopWithoutProgress, 
  detectStageTransition, 
  obterTemplateFallback 
} = require('../ia');

test('1. detectNegativeIntent identifica frases de rejeição', () => {
  assert.equal(detectNegativeIntent('Não tenho interesse, obrigado'), true);
  assert.equal(detectNegativeIntent('não quero no momento'), true);
  assert.equal(detectNegativeIntent('não temos interesse por aqui'), true);
  assert.equal(detectNegativeIntent('Poderia me explicar mais?'), false);
});

test('2. detectStageTransition detecta gatilhos de interesse e preço', () => {
  const historyPrice = [{ fromMe: false, body: 'Quanto custa o sistema de vocês?' }];
  const stagePrice = detectStageTransition(historyPrice, Stage.DISCOVERY);
  assert.equal(stagePrice, Stage.INTERESSE);

  const historyDemo = [{ fromMe: false, body: 'Quero agendar uma demonstração' }];
  const stageDemo = detectStageTransition(historyDemo, Stage.DISCOVERY);
  assert.equal(stageDemo, Stage.DEMO);
});

test('3. detectStageTransition detecta relados de dor', () => {
  const historyPain = [{ fromMe: false, body: 'Hoje nosso atendimento é todo manual e dá muito trabalho' }];
  const stagePain = detectStageTransition(historyPain, Stage.DISCOVERY);
  assert.equal(stagePain, Stage.DOR_IDENTIFICADA);
});

test('4. detectStageTransition identifica intenção negativa como HUMANO', () => {
  const historyNeg = [{ fromMe: false, body: 'Não estou interessado' }];
  const stageNeg = detectStageTransition(historyNeg, Stage.DISCOVERY);
  assert.equal(stageNeg, Stage.HUMANO);
});

test('5. shouldStopWithoutProgress interrompe após atingir o limite maxAiRepliesWithoutProgress', () => {
  const history = [
    { fromMe: true, body: 'R1' },
    { fromMe: true, body: 'R2' },
    { fromMe: true, body: 'R3' },
    { fromMe: true, body: 'R4' }
  ];
  const decision = shouldStopWithoutProgress(history, Stage.DISCOVERY);
  assert.notEqual(decision, null);
});

test('6. obterTemplateFallback substitui o nome da clínica corretamente', () => {
  const clinica = { nome: 'Clínica Odonto' };
  const res = obterTemplateFallback(clinica);
  assert.match(res, /Clínica Odonto/);
});

test('7. detectAutoResponder identifica menus de URA e mensagens automáticas', () => {
  const { detectAutoResponder } = require('../ia');
  
  // URA Menu com números
  assert.equal(detectAutoResponder('Olá! Seja bem-vindo(a) à Clínica Gerlane Cristina.\n1. Consulta\n2. Sessão\n3. Outros...'), true);
  // Erro de navegação da URA
  assert.equal(detectAutoResponder('Desculpe! Não entendi sua resposta. Vamos tentar novamente! Escolha uma opção válida.'), true);
  // Mensagem automática simples
  assert.equal(detectAutoResponder('Olá, recebemos sua mensagem e em instantes responderemos.'), true);
  // Mensagem humana normal
  assert.equal(detectAutoResponder('Olá Henrique, eu sou o Dr. Carlos, administrador da clínica.'), false);
});

test('8. gerarResposta limita resposta de auto-responder a 1 tentativa para evitar loop', async () => {
  const { gerarResposta } = require('../ia');
  const clinica = { nome: 'Clínica Gerlane' };

  // 1ª mensagem da URA do cliente (0 respostas do robô prévias)
  const history1 = [
    { fromMe: false, body: 'Olá! Seja bem-vindo(a)! Digite 1 para agendar' }
  ];
  const resp1 = await gerarResposta(clinica, history1);
  assert.match(resp1, /mensagem automática/i);

  // 2ª mensagem da URA do cliente (CleanMed já enviou 1 mensagem de tentativa)
  const history2 = [
    { fromMe: false, body: 'Olá! Seja bem-vindo(a)! Digite 1 para agendar' },
    { fromMe: true, body: 'Olá! Tudo bem?\n\nVi que essa foi uma mensagem automática...' },
    { fromMe: false, body: 'Desculpe! Não entendi sua resposta. Escolha uma opção válida.' }
  ];
  const resp2 = await gerarResposta(clinica, history2);
  assert.equal(resp2, '[DESATIVAR]');
});

test('9. extrairContatoIndicacao extrai telefone, responsável e atendente corretamente', () => {
  const { extrairContatoIndicacao } = require('../ia');
  
  const msgUser = "Bom dia, Sr. Henrique! Me chamo Danielly, sou atendente do Cento Vitta\n\nVou lhe enviar o Nome e contato do setor responsável.\n\nAna Paula\n8498773-0665";
  const res = extrairContatoIndicacao(msgUser, "558432111234");

  assert.notEqual(res, null);
  assert.equal(res.phone, "5584987730665");
  assert.equal(res.nomeAtendente, "Danielly");
  assert.equal(res.nomeResponsavel, "Ana Paula");
});

test('10. detectAutoResponder identifica solicitações de CPF e documento', () => {
  const { detectAutoResponder } = require('../ia');
  assert.equal(detectAutoResponder('Por favor, digite o CPF que deseja atendimento.'), true);
  assert.equal(detectAutoResponder('O CPF informado está incorreto. Por favor, envie apenas os 11 números do seu CPF, sem pontos ou traços.'), true);
});

test('11. isClientRepeatingBotPrompts identifica quando o robô da clínica repete a mesma mensagem', () => {
  const { isClientRepeatingBotPrompts } = require('../ia');
  const history = [
    { fromMe: false, body: 'O CPF informado está incorreto. Por favor, envie apenas os 11 números do seu CPF' },
    { fromMe: true, body: 'Oi! Vi a clínica aqui e fiquei curioso...' },
    { fromMe: false, body: 'O CPF informado está incorreto. Por favor, envie apenas os 11 números do seu CPF' }
  ];
  assert.equal(isClientRepeatingBotPrompts(history), true);
});

test('12. isDuplicateOutboundMessage impede o envio de mensagens idênticas para a mesma clínica', () => {
  const { isDuplicateOutboundMessage } = require('../ia');
  const history = [
    { fromMe: true, body: 'Oi! Vi a AmorSaúde Natal aqui e fiquei curioso. Como vocês lidam quando o paciente marca e some no dia da consulta?' }
  ];
  const msgDuplicada = 'Oi! Vi a AmorSaúde Natal aqui e fiquei curioso. Como vocês lidam quando o paciente marca e some no dia da consulta?';
  assert.equal(isDuplicateOutboundMessage(msgDuplicada, history), true);
});

test('13. classificarEAtualizarLead classifica URA de CPF e salva tem_bot no SQLite', () => {
  const { classificarEAtualizarLead } = require('../ia');
  const db = require('../db/database');
  
  // Insere clínica de teste
  const res = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES ('Clínica Teste URA', '5585999999999', 'pending')").run();
  const clinicaId = res.lastInsertRowid;

  const msgCpf = "Por favor, digite o CPF que deseja atendimento. Envie apenas os 11 números.";
  const classified = classificarEAtualizarLead(clinicaId, msgCpf, []);

  assert.equal(classified.temBot, 1);
  assert.equal(classified.tipoAtendimento, 'ura_cpf');

  // Verifica no SQLite
  const leadDB = db.prepare("SELECT * FROM clinicas WHERE id = ?").get(clinicaId);
  assert.equal(leadDB.tem_bot, 1);
  assert.equal(leadDB.tipo_atendimento, 'ura_cpf');
  assert.equal(leadDB.status, 'disabled'); // Desativado para impedir autopiloto

  // Limpa banco
  deleteTestClinic(db, clinicaId);
});

test('14. classificarEAtualizarLead classifica URA de Menu numérico', () => {
  const { classificarEAtualizarLead } = require('../ia');
  const db = require('../db/database');

  const res = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES ('Clínica Menu Teste', '5585888888888', 'pending')").run();
  const clinicaId = res.lastInsertRowid;

  const msgMenu = "Digite o número do serviço:\n1. Consulta\n2. Fisioterapia\n3. Outros...";
  const classified = classificarEAtualizarLead(clinicaId, msgMenu, []);

  assert.equal(classified.temBot, 1);
  assert.equal(classified.tipoAtendimento, 'ura_menu');

  const leadDB = db.prepare("SELECT * FROM clinicas WHERE id = ?").get(clinicaId);
  assert.equal(leadDB.tem_bot, 1);
  assert.equal(leadDB.tipo_atendimento, 'ura_menu');

  deleteTestClinic(db, clinicaId);
});

test('15. analisarEAtualizarProgressoLead identifica Alto Interesse quando lead pede reunião ou valor', () => {
  const { analisarEAtualizarProgressoLead } = require('../ia');
  const db = require('../db/database');

  const res = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES ('Clínica Interesse Teste', '5585777777777', 'interviewing')").run();
  const clinicaId = res.lastInsertRowid;

  const history = [
    { fromMe: true, body: 'Olá! Ajudamos clínicas a automatizar confirmações...' },
    { fromMe: false, body: 'Quanto custa para agendar uma demonstração do sistema de vocês?' }
  ];

  const result = analisarEAtualizarProgressoLead(clinicaId, history);

  assert.equal(result.progresso, 'INTERESSE_ALTO');
  assert.equal(result.prioridade, 'HIGH');

  const leadDB = db.prepare("SELECT * FROM clinicas WHERE id = ?").get(clinicaId);
  assert.equal(leadDB.progresso_lead, 'INTERESSE_ALTO');
  assert.equal(leadDB.sales_priority, 'HIGH');

  deleteTestClinic(db, clinicaId);
});

test('16. analisarEAtualizarProgressoLead identifica Sem Interesse quando lead recusa', () => {
  const { analisarEAtualizarProgressoLead } = require('../ia');
  const db = require('../db/database');

  const res = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES ('Clínica Recusa Teste', '5585666666666', 'interviewing')").run();
  const clinicaId = res.lastInsertRowid;

  const history = [
    { fromMe: true, body: 'Olá! Ajudamos clínicas...' },
    { fromMe: false, body: 'Não tenho interesse, já temos um sistema completo por aqui' }
  ];

  const result = analisarEAtualizarProgressoLead(clinicaId, history);

  assert.equal(result.progresso, 'SEM_INTERESSE');
  assert.equal(result.prioridade, 'LOW');

  const leadDB = db.prepare("SELECT * FROM clinicas WHERE id = ?").get(clinicaId);
  assert.equal(leadDB.progresso_lead, 'SEM_INTERESSE');
  assert.equal(leadDB.sales_priority, 'LOW');

  deleteTestClinic(db, clinicaId);
});

test('17. detectAutoResponder identifica LGPD, aceitar termos e erros de navegação de robôs', () => {
  const { detectAutoResponder } = require('../ia');

  assert.equal(detectAutoResponder('você concorda com a nossa Política de Privacidade conforme a LGPD (Lei Geral de Proteção de Dados Pessoais)?'), true);
  assert.equal(detectAutoResponder('Por favor, digite somente uma das opções solicitadas, Sim ou Não'), true);
  assert.equal(detectAutoResponder('Sou a assistente virtual e vou te ajudar neste atendimento. Escolha a OPÇÃO correspondente'), true);
  assert.equal(detectAutoResponder('Eu não estou conseguindo entender sobre o quê você gostaria de conversar. Para voltar ao menu inicial digite a palavra menu.'), true);
});

test('18. detectAutoResponder identifica links de direcionamento e auto-responders de whatsapp exclusivo', () => {
  const { detectAutoResponder } = require('../ia');

  assert.equal(detectAutoResponder('Estamos atendendo via WhatsApp exclusivamente através do número 84 98147-5601. Clique no link abaixo para abrir uma conversa'), true);
  assert.equal(detectAutoResponder('Atendimento automatizado encerrado.'), true);
});







test('19. detectNegativeIntent não confunde ausência de sistema com rejeição', () => {
  assert.equal(detectNegativeIntent('Não temos sistema, fazemos tudo manualmente.'), false);
  assert.equal(detectNegativeIntent('Não é comigo, a responsável é a Ana.'), false);
  assert.equal(detectNegativeIntent('Já temos um sistema.'), false);
  assert.equal(detectNegativeIntent('Não tenho interesse, obrigado.'), true);
  assert.equal(detectNegativeIntent('Por favor, não mande mais mensagens.'), true);
});

test('20. detectStageTransition só avança para interesse com intenção comercial explícita', () => {
  assert.equal(detectStageTransition([{ fromMe: false, body: 'Como funciona a confirmação?' }], Stage.DISCOVERY), Stage.DISCOVERY);
  assert.equal(detectStageTransition([{ fromMe: false, body: 'Quanto custa o sistema?' }], Stage.DISCOVERY), Stage.INTERESSE);
  assert.equal(detectStageTransition([{ fromMe: false, body: 'Quero agendar uma demonstração.' }], Stage.DISCOVERY), Stage.DEMO);
});

test('21. analisarEAtualizarProgressoLead não classifica menção neutra a sistema como dor', () => {
  const { analisarEAtualizarProgressoLead } = require('../ia');
  const db = require('../db/database');
  const res = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES ('Clínica Sistema Neutro', '5585111111111', 'interviewing')").run();
  try {
    const result = analisarEAtualizarProgressoLead(res.lastInsertRowid, [
      { fromMe: true, body: 'Vocês usam algum sistema?' },
      { fromMe: false, body: 'Sim, temos um sistema.' }
    ]);
    assert.equal(result.progresso, 'EM_QUALIFICACAO');
  } finally {
    deleteTestClinic(db, res.lastInsertRowid);
  }
});

test('22. analisarEAtualizarProgressoLead identifica processo manual como dor', () => {
  const { analisarEAtualizarProgressoLead } = require('../ia');
  const db = require('../db/database');
  const res = db.prepare("INSERT INTO clinicas (nome, tel, status) VALUES ('Clínica Manual Teste', '5585222222222', 'interviewing')").run();
  try {
    const result = analisarEAtualizarProgressoLead(res.lastInsertRowid, [
      { fromMe: false, body: 'Fazemos as confirmações manualmente e dá muito trabalho.' }
    ]);
    assert.equal(result.progresso, 'QUALIFICADO_DOR');
  } finally {
    deleteTestClinic(db, res.lastInsertRowid);
  }
});
