const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const config = require('./ia-config.json');
const db = require('./db/database');

// Inicialização dinâmica da API da OpenAI
function getOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY não configurada!");
    }
    return new OpenAI({ apiKey });
}

async function callOpenAI(prompt, extraConfig = {}) {
    const openai = getOpenAI();
    
    const isJson = extraConfig.generationConfig?.responseMimeType === "application/json";
    
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: isJson ? { type: "json_object" } : { type: "text" }
        });
        
        return response.choices[0].message.content.trim();
    } catch (err) {
        console.error(`[IA] Falha na chamada OpenAI (${err.status || err.message}).`);
        throw err;
    }
}

// Feature flag to enable new conversational flow
const ENABLE_NEW_AI_FLOW = process.env.ENABLE_NEW_AI_FLOW === 'true';

// Conversational stages
const Stage = {
  DISCOVERY: 'DISCOVERY',
  DOR_IDENTIFICADA: 'DOR_IDENTIFICADA',
  SOLUCAO_APRESENTADA: 'SOLUCAO_APRESENTADA',
  INTERESSE: 'INTERESSE',
  DEMO: 'DEMO',
  HUMANO: 'HUMANO'
};

/** Detect if a client message contains a clear negative intent */
function detectNegativeIntent(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  const negativeList = config.negativeIntents || [
    "não tenho interesse", "não quero", "já temos sistema", "não precisamos",
    "pode parar de entrar em contato", "número errado", "empresa fechada", "não estou interessado",
    "já temos", "não preciso", "não precisamos", "não quero receber",
    "para de mandar", "pare de mandar", "não mande mais", "não me mande"
  ];
  return negativeList.some(intent => lower.includes(intent.toLowerCase()));
}

/**
 * Detecta "rejeição suave" (soft dismissal) — respostas curtas e educadas que indicam
 * que o lead NÃO tem interesse mas não é grosso. Exemplos:
 * - "Já sim, obrigada" (confirma que já tem + agradeceu = fechou)
 * - "Não preciso, obrigada" (dispensou com educação)
 * - "Ok obrigado" (dispensou educadamente)
 *
 * IMPORTANTE: "Já temos" ou "Já usamos" SOZINHO (sem "obrigado") NÃO é rejeição!
 * Nesses casos a IA deve perguntar QUAL sistema usam e se deixa a desejar.
 * Só é rejeição suave se combinar "já temos" + despedida ("obrigado", "valeu").
 */
function detectSoftDismissal(message, history) {
  if (!message) return false;
  const lower = message.trim().toLowerCase();
  const len = lower.length;

  // "Já temos" / "Já usamos" SOZINHO = NÃO é rejeição. A IA deve investigar qual sistema.
  // SÓ É REJEIÇÃO se vier acompanhado de "obrigado", "valeu", "boa sorte", etc.

  // Checagem forte de rejeição educada (independente do tamanho da mensagem)
  const explicitPoliteRejection = [
    /n[aã]o (vamos precisar|temos interesse|precisamos).*agrade[cç]/i,
    /(j[aá] temos|j[aá] encaminhei).*(n[aã]o vamos|n[aã]o temos interesse)/i,
    /(agradecemos|obrigado|sucesso).*n[aã]o (precisamos|temos interesse)/i
  ];
  if (explicitPoliteRejection.some(p => p.test(lower))) return true;

  // Respostas muito curtas (< 80 chars) que contêm padrões de encerramento educado
  if (len > 120) return false; // mensagens muito longas provavelmente têm contexto — deixa a IA lidar
  // "Já temos" / "Já usamos" SOZINHO = NÃO é rejeição. A IA deve investigar qual sistema.
  // SÓ É REJEIÇÃO se vier acompanhado de "obrigado", "valeu", "boa sorte", etc.
  const jaTemSemDespedida = [
    /^j[aá]\s+(sim|temos|tenho|fazemos|usamos|automatiz)[^o]*$/i,
    /^(temos|tenho|usamos)\s+(sim|já)[^o]*$/i,
  ];
  const temDespedida = /(obrigad|valeu|grat|tchau|até|adeus|boa sorte)/i.test(lower);
  
  // Se diz "já temos" SEM despedida → NÃO é rejeição, deixa a IA investigar
  if (jaTemSemDespedida.some(p => p.test(lower)) && !temDespedida) return false;

  // Padrões de "já temos" + agradecimento/despedida = dispensou educadamente → REJEIÇÃO
  const jaTemComDespedida = [
    /^(sim|temos|tenho),?\s*(obrigad|valeu|grat)/i,
    /^j[aá]\s*(sim)?,?\s*(obrigad|valeu|grat)/i,
  ];
  if (jaTemComDespedida.some(p => p.test(lower))) return true;

  // "Obrigado/a" sozinho = encerramento seco
  if (/^(muito\s+)?obrigad[ao]s?[.!]?$/i.test(lower)) return true;
  if (/^(ok|tá|ta|certo|beleza),?\s*(obrigad|valeu)/i.test(lower)) return true;
  if (/^(não|nao),?\s*(obrigad|valeu)/i.test(lower)) return true;

  // "Não, obrigado" ou "Não preciso, obrigado"
  if (/^n[aã]o\s+(preciso|precisamos|quero|queremos),?\s*(obrigad|valeu|grat)/i.test(lower)) return true;

  // "Tá bom, obrigado" / "Tudo bem, obrigada"
  if (/^(t[aá]\s+bom|tudo\s+bem|certo|entendi),?\s*(obrigad|valeu)/i.test(lower)) return true;

  return false;
}

/**
 * Detecta se o cliente na verdade é outro bot ou IA (ex: "já encaminhei seu contato para nossa equipe", respostas muito estruturadas corporativas)
 */
function detectClientBot(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  
  const botPatterns = [
    /j[aá] encaminhei seu contato para (nossa |a )?equipe/i,
    /nossa equipe (vai|irá) analisar sua proposta/i,
    /sou (a|o) assistente virtual/i,
    /sou uma inteligência artificial/i,
    /fui programad[oa] para/i,
    /para continuar, digite/i
  ];

  return botPatterns.some(p => p.test(lower));
}

/**
 * Detecta leads que NÃO se encaixam no produto CleanMed — clínicas que não fazem agendamento,
 * pronto-socorros, atendimento por ordem de chegada, etc.
 * Se detectado, o lead deve ser desativado pois o produto não se aplica.
 */
function detectNoFitLead(message) {
  if (!message) return false;
  const lower = message.toLowerCase();

  const noFitPatterns = [
    'não é necessário fazer agendamento',
    'nao e necessario fazer agendamento',
    'não fazemos agendamento',
    'nao fazemos agendamento',
    'não trabalhamos com agendamento',
    'nao trabalhamos com agendamento',
    'sem agendamento',
    'sem necessidade de agendamento',
    'atendimento por ordem de chegada',
    'ordem de chegada',
    'pronto socorro',
    'pronto-socorro',
    'não temos agenda',
    'nao temos agenda',
    'não agendamos',
    'nao agendamos',
    'atendimento imediato',
    'sem hora marcada',
    'sem horário marcado',
    'sem horario marcado'
  ];

  return noFitPatterns.some(pattern => lower.includes(pattern));
}

/** Detect if a message is an explicit human attendant presenting themselves */
function isHumanAttendantGreeting(message) {
  if (!message || typeof message !== 'string') return false;
  const clean = message.replace(/\*/g, '').trim();

  // Se tiver indicação de menu numérico formal, lista de convênios/saudação automática ou robô explícito sem nome pessoal, não é humano
  const hasNumberedMenu = /(?:^|\s)[1-9](?:\uFE0F\u20E3|\s*[\.\-\—\)])\s+[a-zA-Záàâãéèêíïóôõöúçñ]/i.test(clean);
  const isExplicitBot = /(?:assistente virtual|atendente virtual|mensagem autom[áa]tica|autoatendimento|bem[-\s]?vind[oa]\(?a?\)?|agradecemos o seu contato|agradecemos seu contato|obrigad[oa] pelo contato)/i.test(clean);
  if (hasNumberedMenu || isExplicitBot) return false;

  const humanPatterns = [
    /\b(?:me chamo|meu nome [ée]|aqui [ée] a|aqui [ée] o|aqui quem fala [ée])\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)/i,
    /\bsou\s+(?:o\s+|a\s+)?([A-Za-zÀ-ÖØ-öø-ÿ]+)(?:\s*,\s*|\s+)(?:recepcionista|secret[áa]ri[ao]|atendente)/i,
    /\bsou\s+(?:o\s+|a\s+)?(?:recepcionista|secret[áa]ri[ao]|atendente)\s+([A-Za-zÀ-ÖØ-öø-ÿ]+)?/i,
    /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]+)?\s*:\s*(?:ol[áa]|bom dia|boa tarde|boa noite|como posso|em que posso|posso ajudar)/i,
    /\b(?:como posso|em que posso)\s+(?:te\s+|lhe\s+)?ajudar\b/i
  ];

  return humanPatterns.some(p => p.test(clean));
}

/** Detect if a client message is an auto-responder, interactive URA menu, or URA error prompt */
function detectAutoResponder(message) {
  if (!message) return false;

  // Se for uma atendente humana se apresentando ou perguntando como ajudar, NÃO trate como auto-responder
  if (isHumanAttendantGreeting(message)) {
    return false;
  }

  const txt = message.toLowerCase();
  
  const autoPatterns = [
    // Menu & URA patterns
    'seja bem-vindo', 'seja bem-vinda', 'seja bem vindo', 'seja bem vinda',
    'bem-vindo(a)', 'bem-vinda(o)', 'bem vindo(a)', 'bem vinda(o)', 'bem vindo a ', 'bem-vindo a ',
    'agradecemos o seu contato', 'agradecemos seu contato', 'agradecemos o contato',
    'digite o número', 'digite o numero', 'escolha uma opção', 'escolha uma opcao',
    'opção válida', 'opcao valida', 'opção inválida', 'opcao invalida',
    'não entendi sua resposta', 'nao entendi sua resposta', 'vamos tentar novamente',
    'para darmos continuidade', 'informar, por gentileza', 'nome completo:', 'número (whatsapp):',
    'número do serviço', 'numero do servico', 'outros...', 'outros…',
    'uma de nossas atendentes', 'nossa equipe entrará em contato', 'nossa equipe entrarara em contato',
    // CPF & Document Request Patterns (AmorSaúde etc)
    'digite o cpf', 'informe o cpf', 'envie apenas os 11', '11 números', 'pontos ou traços',
    'cpf informado', 'cpf incorreto', 'digite seu cpf', 'número do cpf', 'numero do cpf',
    'carteirinha', 'matrícula', 'matricula', 'cartão de todos', 'cartao de todos',
    'opção desejada', 'opcao desejada', 'digite a opção', 'digite a opcao',
    'atendente virtual', 'assistente virtual', 'sou o assistente', 'sou a assistente',
    'atendimento por cpf', 'recebê-lo(a)', 'recebelo(a)',
    // Auto greeting & Away patterns
    'recebemos sua mensagem', 'em instantes', 'retornará o contato', 'retornara o contato',
    'horário de funcionamento', 'horario de funcionamento', 'atendimento automático', 'atendimento automatico',
    'mensagem automática', 'mensagem automatica', 'responderemos em breve', 'obrigado pelo contato',
    'ausente no momento', 'assim que possível', 'assim que possivel', 'autoatendimento',
    // Transfer & Queue patterns
    'te transferindo', 'transferindo para', 'transferir para', 'encaminhando para',
    'aguarde um instante', 'aguarde um momento', 'em breve uma', 'em breve um',
    'horário de atendimento', 'horario de atendimento', 'nosso horário', 'nosso horario',
    'fora do horário', 'fora do horario', 'estamos fechados',
    'será um prazer', 'sera um prazer',
    'iremos te atender', 'irá lhe atender', 'ira lhe atender', 'irá te atender', 'ira te atender',
    'nosso time', 'nossa equipe', 'equipe de atendimento', 'time de atendimento',
    'obrigada pelo seu contato', 'obrigado pelo seu contato',
    // Novos padrões baseados na Clínica Guri
    'antes de transferir', 'perguntinhas rápidas', 'perguntinhas rapidas',
    'este atendimento é para você', 'este atendimento e para voce',
    'nome completo do paciente', 'qual o nome completo',
    'não peguei direito', 'nao peguei direito', 'nome do paciente',
    'digitar o número', 'digitar o numero',
    // LGPD & Termos de Privacidade
    'lgpd', 'politica de privacidade', 'política de privacidade', 'proteção de dados', 'protecao de dados',
    'tratamento dos seus dados', 'tratamento de dados', 'conforme a lgpd', 'aceitar os termos',
    'digite somente', 'digite apenas', 'somente uma das opções', 'somente uma das opcoes',
    'sim ou não', 'sim ou nao',
    // Chatbot menu & navegação da URA
    'voltar ao menu', 'menu inicial', 'para voltar ao menu', 'não estou conseguindo entender', 'nao estou conseguindo entender',
    'escolha a opção correspondente', 'escolha a opcao correspondente', 'central de atendimento',
    // Padrões específicos recentes
    'estamos atendendo via whatsapp exclusivamente', 'estamos atendendo via whatsapp',
    'clique no link abaixo para abrir uma conversa', 'clique no link abaixo',
    'atendimento automatizado encerrado',
    'nossa missão é facilitar seu acesso a consultas', 'nossa missao e facilitar',
    'facilitar seu acesso a consultas'
  ];

  const hasPattern = autoPatterns.some(pattern => txt.includes(pattern));
  const hasNumberedMenu = /(?:^|\s)[1-9](?:\uFE0F\u20E3|\s*[\.\-\—\)])\s+[a-zA-Záàâãéèêíïóôõöúçñ]/i.test(txt);

  return hasPattern || hasNumberedMenu;
}

/** Detect if the client is repeating the exact same message/prompt consecutively */
function isClientRepeatingBotPrompts(history) {
  if (!Array.isArray(history) || history.length < 2) return false;
  const clientMsgs = history.filter(m => !m.fromMe && m.body && m.body.trim().length > 0);
  if (clientMsgs.length < 2) return false;

  const last1 = clientMsgs[clientMsgs.length - 1].body.trim().toLowerCase();
  const last2 = clientMsgs[clientMsgs.length - 2].body.trim().toLowerCase();

  // Respostas curtas humanas legítimas de resposta a perguntas (NÃO devem ser tratadas como robô repetindo)
  const humanShortAnswers = ['manual', 'manualmente', 'sim', 'nao', 'não', 'ok', 'certo', 'boa tarde', 'bom dia', 'boa noite', 'ola', 'olá'];
  if (humanShortAnswers.includes(last1)) {
    return false;
  }

  // Só considera robô em loop se a mensagem for longa/estruturada ou menus
  if (last1 === last2 && last1.length >= 15) return true;
  if (last1.length >= 20 && (last1.includes(last2) || last2.includes(last1))) return true;

  return false;
}

/** Check if candidate reply text was already sent outbound to this client */
function isDuplicateOutboundMessage(candidateText, history) {
  if (!candidateText || !Array.isArray(history)) return false;
  const cleanCandidate = candidateText.trim().toLowerCase();
  if (!cleanCandidate) return false;

  const outboundMsgs = history.filter(m => m.fromMe && m.body);
  for (const msg of outboundMsgs) {
    const cleanSent = msg.body.trim().toLowerCase();
    if (cleanSent === cleanCandidate) return true;
    if (cleanCandidate.length > 20 && cleanSent.length > 20) {
      if (cleanSent.includes(cleanCandidate) || cleanCandidate.includes(cleanSent)) return true;
    }
  }
  return false;
}

function finalizarRespostaOuDuplicata(respostaText, history) {
  if (!respostaText) return respostaText;
  if (respostaText.includes('[PASSAR_PARA_HUMANO]') || respostaText.includes('[DESATIVAR]')) {
    return respostaText;
  }
  if (isDuplicateOutboundMessage(respostaText, history)) {
    return '[PASSAR_PARA_HUMANO]';
  }
  return respostaText;
}

/** Count how many auto-responder replies CleanMed has already sent to this lead */
function countAutoResponsesSent(history) {
  if (!Array.isArray(history) || history.length === 0) return 0;

  let autoReplyCount = 0;
  let lastInboundWasAuto = false;

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (!msg.fromMe) {
      if (detectAutoResponder(msg.body)) {
        lastInboundWasAuto = true;
      } else {
        lastInboundWasAuto = false;
      }
    } else if (msg.fromMe && lastInboundWasAuto) {
      autoReplyCount++;
    }
  }

  const legacyCount = history.filter(m => m.fromMe && (m.body || '').includes('mensagem automática')).length;

  return Math.max(autoReplyCount, legacyCount);
}

/**
 * Analisa a mensagem recebida e o histórico para classificar o padrão do lead (Lead Fingerprint).
 * Se detectar URA, menu numérico, pedido de CPF ou robô repetitivo, salva no SQLite (tem_bot = 1, tipo_atendimento, bot_confianca).
 * Se o robô já respondeu 1x ao robô do lead ou for trava de CPF, desativa o lead de envios no autopiloto.
 */
function classificarEAtualizarLead(clinicaId, message, history = []) {
  if (!clinicaId || !message) return null;
  const txt = String(message).toLowerCase();
  
  let temBot = 0;
  let tipoAtendimento = 'humano';
  let botConfianca = 0;

  const isMenu = /\b[1-9]\.\s+[a-zA-Záàâãéèêíïóôõöúçñ]/i.test(message) || txt.includes('digite o número') || txt.includes('escolha uma opção') || txt.includes('número do serviço');
  const isCpf = txt.includes('digite o cpf') || txt.includes('informe o cpf') || txt.includes('11 números') || txt.includes('pontos ou traços') || txt.includes('cartão de todos');
  const isAusencia = txt.includes('recebemos sua mensagem') || txt.includes('horário de funcionamento') || txt.includes('ausente no momento');
  const isAutoResponderGeneric = detectAutoResponder(message) || isClientRepeatingBotPrompts(history);

  if (isCpf) {
    temBot = 1;
    tipoAtendimento = 'ura_cpf';
    botConfianca = 98;
  } else if (isMenu) {
    temBot = 1;
    tipoAtendimento = 'ura_menu';
    botConfianca = 95;
  } else if (isAusencia) {
    temBot = 1;
    tipoAtendimento = 'ausencia_auto';
    botConfianca = 85;
  } else if (isAutoResponderGeneric) {
    temBot = 1;
    tipoAtendimento = 'bot_generico';
    botConfianca = 90;
  }

  if (temBot === 1) {
    const autoSentCount = countAutoResponsesSent(history);
    const now = new Date().toISOString();
    
    try {
      db.prepare(`
        UPDATE clinicas
        SET tem_bot = 1,
            tipo_atendimento = ?,
            bot_confianca = ?,
            bot_detectado_em = COALESCE(bot_detectado_em, ?)
        WHERE id = ?
      `).run(tipoAtendimento, botConfianca, now, clinicaId);

      // Se já respondeu 1x ao auto-responder ou se for trava de CPF, bloqueia disparos no autopiloto
      if (autoSentCount >= 1 || isCpf) {
        db.prepare(`
          UPDATE clinicas
          SET status = 'disabled',
              score_reason = 'Robô/URA detectado - disparos desativados'
          WHERE id = ?
        `).run(clinicaId);
      }
    } catch (err) {
      console.error('Erro ao atualizar fingerprint de bot da clínica:', err.message);
    }
  }

  return { temBot, tipoAtendimento, botConfianca };
}

/**
 * Analisa a conversa e atualiza automaticamente a progressão do lead (estágio, motivo, prioridade e próxima ação) no SQLite.
 */
function analisarEAtualizarProgressoLead(clinicaId, historicoConversa) {
  if (!clinicaId || !Array.isArray(historicoConversa) || historicoConversa.length === 0) {
    return null;
  }

  const clientMsgs = historicoConversa.filter(m => !m.fromMe && m.body && m.body.trim().length > 0);
  if (clientMsgs.length === 0) return null;

  const todasMsgCliente = clientMsgs.map(m => m.body.toLowerCase()).join(' ');
  const ultimaMsgCliente = clientMsgs[clientMsgs.length - 1].body || '';
  const ultimaMsgLower = ultimaMsgCliente.toLowerCase();

  let progresso = 'EM_QUALIFICACAO';
  let motivo = 'Conversa iniciada e em andamento com a recepção';
  let prioridade = 'MEDIUM';
  let proximaAcao = 'Acompanhar respostas e qualificar necessidades';

  // 1. Verificar se é Robô/URA
  if (detectAutoResponder(ultimaMsgCliente) || isClientRepeatingBotPrompts(historicoConversa)) {
    progresso = 'ROBO_URA';
    motivo = 'Atendimento automático/URA detectado no WhatsApp da clínica';
    prioridade = 'LOW';
    proximaAcao = 'Disparos automáticos pausados devido à URA';
  }
  // 2. Verificar se indicou responsável (telefone/nome)
  else if (extrairContatoIndicacao(ultimaMsgCliente)) {
    const indicacao = extrairContatoIndicacao(ultimaMsgCliente);
    progresso = 'INDICOU_RESPONSAVEL';
    motivo = `Recepção indicou contato do responsável: ${indicacao.nomeResponsavel || 'Decisor'} (${indicacao.phone})`;
    prioridade = 'HIGH';
    proximaAcao = `Abordar responsável indicado: ${indicacao.phone}`;
  }
  // 3. Verificar recusa / Sem Interesse
  else if (detectNegativeIntent(todasMsgCliente)) {
    progresso = 'SEM_INTERESSE';
    motivo = 'Cliente informou não ter interesse ou já possuir solução resolvida';
    prioridade = 'LOW';
    proximaAcao = 'Nenhuma ação adicional necessária';
  }
  // 4. Verificar Alto Interesse (Pediu valor, demo, reunião, como funciona)
  else if (
    ultimaMsgLower.includes('quanto') || ultimaMsgLower.includes('custa') || 
    ultimaMsgLower.includes('preço') || ultimaMsgLower.includes('preco') ||
    ultimaMsgLower.includes('valor') || ultimaMsgLower.includes('reunião') ||
    ultimaMsgLower.includes('reuniao') || ultimaMsgLower.includes('demonstração') ||
    ultimaMsgLower.includes('demonstracao') || ultimaMsgLower.includes('agendar') ||
    ultimaMsgLower.includes('marcar') || ultimaMsgLower.includes('funciona') ||
    ultimaMsgLower.includes('tenho interesse') || ultimaMsgLower.includes('me manda')
  ) {
    progresso = 'INTERESSE_ALTO';
    motivo = 'Lead demonstrou alto interesse, solicitou reunião, preço ou demonstração';
    prioridade = 'HIGH';
    proximaAcao = 'Entrar em contato imediatamente para agendar demonstração';
  }
  // 5. Verificar se relatou dor ou sistema atual
  else if (
    todasMsgCliente.includes('sistema') || todasMsgCliente.includes('manual') ||
    todasMsgCliente.includes('faltas') || todasMsgCliente.includes('incomoda') ||
    todasMsgCliente.includes('dificuldade') || todasMsgCliente.includes('perda')
  ) {
    progresso = 'QUALIFICADO_DOR';
    motivo = 'Lead compartilhou informações sobre o processo atual e dores na recepção';
    prioridade = 'HIGH';
    proximaAcao = 'Apresentar como a CleanMed resolve essas dores específicas';
  }

  // Atualiza no SQLite
  try {
    db.prepare(`
      UPDATE clinicas
      SET progresso_lead = ?,
          progresso_motivo = ?,
          lead_priority = ?,
          proxima_acao = ?
      WHERE id = ?
    `).run(progresso, motivo, prioridade, proximaAcao, clinicaId);
  } catch (e) {
    console.error('Erro ao atualizar progresso do lead:', e.message);
  }

  return { progresso, motivo, prioridade, proximaAcao };
}

/** Extract referral contact (name, phone, attendant name, email) from a client message */
function extrairContatoIndicacao(message, clinicaTel = "") {
  if (!message || typeof message !== 'string') return null;

  // Nunca extrair indicação de mensagens de boas-vindas, lista de convênios ou telefone fixo da própria clínica
  if (/(?:bem[-\s]?vind[oa]|agradecemos o seu contato|agradecemos seu contato|telefone fixo|conv[êe]nio|particular e conv[êe]nio|hor[áa]rio de atendimento)/i.test(message) &&
      !/(?:respons[áa]vel|gerente|gestor|propriet[áa]ri|diretor|administrativ|falar com\s+(?:o|a|dr))/i.test(message)) {
    return null;
  }

  const phoneRegex = /(?:\+?55\s*)?(?:\(?([1-9]{2})\)?\s*)?(?:9\s*\d{4}[-\s]*\d{4}|\d{4}[-\s]*\d{4})/g;
  const matches = [...message.matchAll(phoneRegex)];
  
  const emailRegex = /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = message.match(emailRegex);
  const isEmailRequest = /(?:enviar|mande|envie|manda).*?(?:email|e-mail|proposta)/i.test(message);

  if (matches.length === 0 && !emailMatch && !isEmailRequest) return null;

  let finalPhone = "";
  let rawPhone = "";
  let digits = "";

  if (matches.length > 0) {
    rawPhone = matches[0][0];
    digits = rawPhone.replace(/\D/g, '');

    let parentDDD = "";
    if (clinicaTel) {
      const parentDigits = clinicaTel.replace(/\D/g, '');
      if (parentDigits.startsWith('55') && parentDigits.length >= 12) {
        parentDDD = parentDigits.substring(2, 4);
      } else if (parentDigits.length >= 10) {
        parentDDD = parentDigits.substring(0, 2);
      }
    }

    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      finalPhone = digits;
    } else if (digits.length === 10 || digits.length === 11) {
      finalPhone = '55' + digits;
    } else if (digits.length === 8 || digits.length === 9) {
      if (parentDDD) {
        finalPhone = '55' + parentDDD + digits;
      }
    }
  }

  // Se não encontrou telefone válido, mas tem email, continua para extrair nomes
  if (!finalPhone || finalPhone.length < 12) {
      if (!emailMatch && !isEmailRequest) return null;
      finalPhone = "";
  }

  // Helper to clean a name candidate string
  const cleanName = (str) => {
    if (!str) return "";
    let cleaned = str.replace(phoneRegex, '').replace(/(?:nome|contato|setor|responsável|responsavel|dra?|sr[a]?|falar com|número|numero|telefone|celular|zap|wa|whatsapp|:|-)/gi, '').trim();
    cleaned = cleaned.replace(/[^\w\sà-ú]/gi, '').trim();
    
    // Rejeita strings que parecem lixo de vcard, links ou artefatos técnicos
    if (/type|cell|voice|id|vcard|http|www|\.com|fnsofia|teltype/i.test(cleaned)) {
        return "";
    }
    
    const ignoreList = ['atendente', 'recepção', 'recepcao', 'secretária', 'secretaria', 'do', 'da', 'de', 'um', 'uma', 'seu', 'sua', 'bom dia', 'boa tarde', 'boa noite', 'olá', 'ola', 'gerente', 'diretor', 'diretora', 'administração', 'administracao', 'nossos atendentes'];
    if (cleaned.length >= 2 && cleaned.length <= 35 && !ignoreList.includes(cleaned.toLowerCase())) {
      return cleaned.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    return "";
  };

  // Extract attendant name if mentioned (e.g., "Me chamo Danielly", "Sou a Danielly", "atendente Danielly")
  let nomeAtendente = "";
  const atendenteMatch = message.match(/(?:me chamo|sou a|sou o|atendente|falar com|aqui é a|aqui é o)\s+([A-Z[a-zà-ú]+)/i);
  if (atendenteMatch && atendenteMatch[1]) {
    const candidate = atendenteMatch[1].trim();
    const ignoreList = ['atendente', 'recepção', 'recepcao', 'secretária', 'secretaria', 'do', 'da', 'de', 'um', 'uma', 'seu', 'sua'];
    if (!ignoreList.includes(candidate.toLowerCase())) {
      nomeAtendente = candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
    }
  }

  // Extract decision-maker name
  let nomeResponsavel = "";
  const lines = message.split('\n').map(l => l.trim()).filter(Boolean);
  let phoneLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const hasPhone = rawPhone && lines[i].includes(rawPhone);
    const hasDigits = digits && lines[i].replace(/\D/g, '').includes(digits);
    const hasEmail = emailMatch && lines[i].includes(emailMatch[0]);
    
    if (hasPhone || hasDigits || hasEmail) {
      phoneLineIndex = i;
      break;
    }
  }

  if (phoneLineIndex !== -1) {
    // 1. Try name on the same line as phone/email
    nomeResponsavel = cleanName(lines[phoneLineIndex]);

    // 2. If empty, try line immediately above
    if (!nomeResponsavel && phoneLineIndex > 0) {
      nomeResponsavel = cleanName(lines[phoneLineIndex - 1]);
    }

    // 3. If empty, try line immediately below
    if (!nomeResponsavel && phoneLineIndex < lines.length - 1) {
      nomeResponsavel = cleanName(lines[phoneLineIndex + 1]);
    }
  }

  // Fallback regex search if still not found
  if (!nomeResponsavel) {
    const respMatch = message.match(/(?:responsável|responsavel|gerente|diretor|doutor|doutora|dra?|sr[a]?|contato da|falar com)\s+([A-Z[a-zà-ú]+\s*[A-Z[a-zà-ú]*)/i);
    if (respMatch && respMatch[1]) {
      nomeResponsavel = cleanName(respMatch[1]);
    }
  }

  return {
    phone: finalPhone,
    email: emailMatch ? emailMatch[0] : "",
    isEmailRequest: isEmailRequest,
    nomeResponsavel: nomeResponsavel || "Responsável",
    nomeAtendente: nomeAtendente || ""
  };
}



/** Check if AI replies reached maximum count without progress */
function shouldStopWithoutProgress(history, currentStage) {
  if (!Array.isArray(history) || history.length === 0) return null;
  
  const maxReplies = config.maxAiRepliesWithoutProgress || 4;
  let countAiReplies = 0;
  
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].fromMe) {
      countAiReplies++;
    }
  }

  if (countAiReplies >= maxReplies) {
    const clientMsgs = history.filter(m => !m.fromMe).map(m => (m.body || '').toLowerCase()).join(' ');
    const painKeywords = ['manual', 'dificuldade', 'problema', 'custo', 'perda', 'falta', 'desafio', 'sistema'];
    const hasPain = painKeywords.some(k => clientMsgs.includes(k));
    return hasPain ? 'HUMANO' : 'DESATIVAR';
  }

  return null;
}

/** Detect stage transition based on conversation history */
function detectStageTransition(history, currentStage) {
  if (!Array.isArray(history) || history.length === 0) return Stage.DISCOVERY;
  const lastClientMsg = history.filter(m => !m.fromMe).pop();
  if (!lastClientMsg) return Stage.DISCOVERY;
  const txt = (lastClientMsg.body || '').toLowerCase();
  
  if (detectNegativeIntent(txt)) return Stage.HUMANO;
  
  const triggers = config.highPriorityTriggers || ['preço', 'custo', 'valor', 'quanto custa', 'demonstração', 'reunião', 'agendar', 'interesse'];
  if (triggers.some(k => txt.includes(k))) {
    if (txt.includes('demonstração') || txt.includes('reunião') || txt.includes('agendar')) {
      return Stage.DEMO;
    }
    return Stage.INTERESSE;
  }
  
  const painKeywords = ['manual', 'dificuldade', 'problema', 'custo', 'perda', 'falta', 'desafio'];
  if (painKeywords.some(k => txt.includes(k))) return Stage.DOR_IDENTIFICADA;
  
  if (currentStage === Stage.DOR_IDENTIFICADA) return Stage.SOLUCAO_APRESENTADA;
  
  return currentStage || Stage.DISCOVERY;
}

// Templates de abordagem — PROSPECÇÃO FRIA
// Estilo: Mensagem CURTA (máx 2 frases), tom humano, SEM pitch, com pergunta consultiva.
// {{categoriaLabel}} = nome legível da categoria (ex: "clínicas odontológicas")
// {{nomeClinica}} = " na NomeDaClinica" ou ""

// Mapeamento de categoria interna para label legível e termo de sessão/consulta
const CATEGORIA_LABELS = {
  'odontologia':  { label: 'clínicas odontológicas', sessao: 'consultas' },
  'fisioterapia': { label: 'clínicas de fisioterapia', sessao: 'sessões' },
  'psicologia':   { label: 'consultórios de psicologia', sessao: 'sessões' },
  'dermatologia': { label: 'clínicas de dermatologia', sessao: 'consultas' },
  'estetica':     { label: 'clínicas de estética', sessao: 'agendamentos' },
  'default':      { label: 'clínicas', sessao: 'consultas' }
};

// Templates universais — a categoria é injetada dinamicamente via {{categoriaLabel}}
const TEMPLATES_PRIMEIRO_CONTATO = [
  "Oi! Tudo bem? Sou o assistente virtual da equipe CleanMed. Em {{categoriaLabel}}, a falta de pacientes sem aviso costuma ser um problema recorrente.\n\nComo vocês lidam com isso hoje{{nomeClinica}}? Usam algum sistema ou fazem manualmente?",
  "Oi! Tudo bem? Aqui é o assistente virtual da equipe CleanMed. Vi a{{nomeClinica}} e fiquei curioso: como vocês lidam quando o paciente marca e não aparece?\n\nPergunto porque ajudamos {{categoriaLabel}} a automatizar confirmações pelo WhatsApp.",
  "Oi! Tudo bem? Sou o assistente virtual da equipe CleanMed. Como vocês fazem a confirmação de {{sessaoLabel}} hoje{{nomeClinica}}?\n\nÉ tudo manual ou já usam algum sistema?"
];

function detectarCategoriaTemplate(categoria) {
  if (!categoria) return 'default';
  const cat = categoria.toLowerCase();
  if (cat.includes('odonto') || cat.includes('dentist')) return 'odontologia';
  if (cat.includes('fisio')) return 'fisioterapia';
  if (cat.includes('psico') || cat.includes('psicol')) return 'psicologia';
  if (cat.includes('dermat')) return 'dermatologia';
  if (cat.includes('estéti') || cat.includes('esteti') || cat.includes('beleza')) return 'estetica';
  return 'default';
}

async function gerarMensagemPersonalizadaComIA(clinica) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY não configurada!");
    }

    const nomeClinica = clinica.nome || 'Clínica';
    const cidade = clinica.cidade || '';
    const dono = clinica.nome_dono || '';
    const pontosFortes = clinica.pontos_fortes || '';
    const pontosFracos = clinica.pontos_fracos || '';
    const resumo = clinica.reviews_resumo || '';
    const especialidades = clinica.especialidades || '';

    const prompt = `Você é o assistente virtual da equipe CleanMed. Seja transparente sobre sua identidade e nunca finja ser Henrique.
Sua missão é criar UMA ÚNICA mensagem de primeira abordagem no WhatsApp extremamente personalizada para a empresa "${nomeClinica}"${cidade ? ` em ${cidade}` : ''}.

INFORMAÇÕES REAIS EXTRAÍDAS DAS AVALIAÇÕES DO GOOGLE MAPS DA CLÍNICA:
- Nome do Proprietário/Responsável (se detectado): ${dono || 'Não especificado'}
- Pontos Fortes Elogiados: ${pontosFortes || 'Atendimento presencial elogiado'}
- Reclamações/Pontos Fracos: ${pontosFracos || 'Demora no retorno por WhatsApp / organização da recepção'}
- Especialidades/Serviços: ${especialidades || 'Consultas e atendimento'}
- Resumo Geral: ${resumo || 'Ficha ativa no Google Maps'}

DIRETRIZES DA MENSAGEM:
1. Comece cumprimentando educadamente (ex: "Olá, responsável pela ${nomeClinica}." ou "Olá, equipe da ${nomeClinica}.").
2. Mencione que estava analisando a presença da clínica no Google Maps e cite UM ELOGIO REAL (ponto forte) que os pacientes fazem (ex: elogios ao atendimento presencial ou a profissionais específicos).
3. Em seguida, com respeito e tato consultivo, conecte com um PONTO DE ATENÇÃO / RECLAMAÇÃO REAL encontrado nas avaliações (ex: reclamações sobre tempo de resposta no WhatsApp, espera ou confirmação manual).
4. Termine com uma pergunta consultiva suave perguntando como gerenciam essa parte hoje e se usam algum sistema para automação.
5. Estilo: Mensagem curta (2 a 3 parágrafos curtos), tom humano, natural e profissional de WhatsApp. SEM tom agressivo de vendas, PROIBIDO USAR EMOJIS (NUNCA inclua nenhum emoji), SEM formatação exagerada.

Gere APENAS a mensagem pronta para envio, nada mais:`;

    return await callOpenAI(prompt);
}

async function gerarMensagem(clinica) {
    if (clinica && (clinica.reviews_resumo || clinica.pontos_fortes || clinica.pontos_fracos)) {
        try {
            console.log(`[IA] Gerando abordagem ultra-personalizada via Gemini para: ${clinica.nome}`);
            const msgPersonalizada = await gerarMensagemPersonalizadaComIA(clinica);
            if (msgPersonalizada && msgPersonalizada.length > 20) {
                return msgPersonalizada;
            }
        } catch (err) {
            console.error('[IA] Erro ao gerar mensagem personalizada com Gemini, usando template fallback:', err.message);
        }
    }

    const catKey = detectarCategoriaTemplate(clinica?.categoria);
    const catInfo = CATEGORIA_LABELS[catKey] || CATEGORIA_LABELS['default'];
    const idx = Math.floor(Math.random() * TEMPLATES_PRIMEIRO_CONTATO.length);
    const nomeClinica = clinica && clinica.nome ? ` ${clinica.nome}` : '';
    return TEMPLATES_PRIMEIRO_CONTATO[idx]
        .replace(/\{\{categoriaLabel\}\}/g, catInfo.label)
        .replace(/\{\{sessaoLabel\}\}/g, catInfo.sessao)
        .replace(/\{\{nomeClinica\}\}/g, nomeClinica);
}

/**
 * Gera um follow-up ultra-personalizado utilizando o Gemini com base nas avaliações do Google Maps do prospect.
 */
async function gerarFollowupPersonalizadoComIA(clinica, stage) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY não configurada!");
    }

    const nomeClinica = clinica.nome || 'Clínica';
    const dono = clinica.nome_dono || '';
    const pontosFracos = clinica.pontos_fracos || '';
    const pontosFortes = clinica.pontos_fortes || '';

    const prompt = `Você é o assistente virtual da equipe CleanMed. Seja transparente sobre sua identidade e nunca finja ser Henrique.
Sua missão é gerar UMA mensagem de follow-up (retomada de contato) no WhatsApp para a empresa "${nomeClinica}".
Estágio do Follow-up: ${stage} (1 = Retomada amigável de 1º dia, 2 = Prova social/gancho de dor do 3º dia, 3 = Pergunta ao responsável do 7º dia, 4 = Encerramento educado do 14º dia).

DADOS DE REVIEWS DA CLÍNICA:
- Nome do Responsável (se souber): ${dono || 'não informado'}
- Pontos Fortes Elogiados: ${pontosFortes || 'atendimento presencial'}
- Reclamações/Pontos Fracos: ${pontosFracos || 'retorno no WhatsApp / organização da agenda'}

DIRETRIZES POR ESTÁGIO:
Estágio 1: Curto (1 frase). Diga algo na linha de: "Olá. Conseguiu ver a mensagem que mandei ontem sobre organizar o fluxo de atendimento do WhatsApp da clínica?"
Estágio 2: Empatia com a recepcionista. Diga algo como: "Sei que a rotina com os pacientes na clínica deve estar bem corrida. Quando tiver um tempo, me avisa se faz sentido conversarmos sobre a automação da recepção."
Estágio 3: Foco em dor acumulada. Diga algo como: "Vocês ainda estão lidando com aquele acúmulo de mensagens não respondidas no WhatsApp? Se quiserem ver como o CleanMed resolve isso na prática, é só me dar um alô."
Estágio 4: Encerramento amigável. Diga que é a última mensagem para não incomodar, desejando sucesso e deixando a porta aberta.

REGRAS RÍGIDAS:
- MENSAGEM CURTA: Máximo 2 a 3 linhas.
- Tom natural de WhatsApp falado por um humano (Henrique). PROIBIDO USAR EMOJIS (NUNCA inclua nenhum emoji na mensagem).
- Responda APENAS com o texto da mensagem pronta para envio.`;

    return await callOpenAI(prompt);
}

/**
 * Gera mensagem de follow-up adaptativa (usando Gemini se houver reviews, ou templates estáticos).
 */
async function gerarFollowup(clinica, stageOverride = null) {
    const stage = stageOverride !== null ? Number(stageOverride) : Number(clinica?.followup_stage || 0) + 1;
    
    // Tenta gerar personalizado via IA se houver dados enriquecidos
    if (clinica && (clinica.reviews_resumo || clinica.pontos_fortes || clinica.pontos_fracos)) {
        try {
            console.log(`[IA] Gerando follow-up personalizado (Estágio ${stage}) para: ${clinica.nome}`);
            const msgCustom = await gerarFollowupPersonalizadoComIA(clinica, stage);
            if (msgCustom && msgCustom.length > 15) {
                return msgCustom;
            }
        } catch (e) {
            console.error('[IA] Erro ao gerar follow-up personalizado:', e.message);
        }
    }

    // Fallbacks padrão de template por estágio
    const nomeClinica = clinica && clinica.nome ? ` da ${clinica.nome}` : '';
    if (stage === 1) {
        return `Oi! Só passando para saber se você conseguiu ver a minha mensagem anterior sobre automação de confirmações pelo WhatsApp${nomeClinica}?`;
    }
    if (stage === 2) {
        return `Oi! Desculpa a insistência. Uma clínica parceira reduziu as faltas de 30% para 8% em dois meses só automatizando lembretes pelo WhatsApp. Se tiver 2 minutos, posso te explicar como funciona.`;
    }
    if (stage === 3) {
        return `Oi! Caso você não seja a pessoa responsável pela gestão de agendamentos${nomeClinica}, saberia me informar com quem posso falar sobre isso? Prometo ser breve!`;
    }
    return `Oi! Vou parar de enviar mensagens para não atrapalhar a rotina de vocês. Se em algum momento quiserem conhecer como automatizamos confirmações pelo WhatsApp, fico à disposição. Sucesso!`;
}

// Fallback inteligente: usa template se for primeiro contato ou se a IA falhar no meio da conversa.
function obterTemplateFallback(clinica, historicoConversa) {
    if (Array.isArray(historicoConversa) && historicoConversa.some(m => m.fromMe)) {
        const clientMsgs = historicoConversa.filter(m => !m.fromMe);
        const lastClientText = clientMsgs.length > 0 ? (clientMsgs[clientMsgs.length - 1].body || '').toLowerCase() : '';
        
        // Se o lead se identificou como responsável (ex: 'sou eu', 'sou o dono')
        const isSelfResponsible = /\b(sou eu|sou a|sou o|dona|dono|dra|dr|medica|medico|proprietari[ao])\b/i.test(lastClientText) || 
                                  /\b(eu sou)\b.*\b(responsavel|responsável)\b/i.test(lastClientText);
        
        // Se o lead identificou OUTRA pessoa como responsável (ex: 'a responsável é a Rafaela')
        const isOtherResponsible = /\b(a|o|é a|é o)\b.*\b(responsavel|responsável)\b/i.test(lastClientText);

        if (isSelfResponsible && !isOtherResponsible) {
            return `Perfeito! Que bom falar direto com você. Nós da CleanMed ajudamos clínicas a automatizar agendamentos e confirmações de consultas pelo WhatsApp, reduzindo o trabalho manual da recepção.\n\nHoje vocês já usam algum sistema para isso ou fazem manualmente?`;
        }

        if (isOtherResponsible) {
            return `Entendi! Você poderia me passar o contato (telefone ou WhatsApp) dessa pessoa para que eu possa falar com ela?`;
        }
        
        // Se o lead disse que faz manual (ex: 'fazemos manualmente', 'manual msm', 'no papel')
        if (/\b(manual|manualmente|papel|caderno|whatsapp|planilha|excel)\b/i.test(lastClientText)) {
            return `Entendi! Fazer as confirmações e agendamentos manualmente consome muito tempo da recepção e ainda costuma gerar faltas de pacientes.\n\nA CleanMed automatiza todo esse fluxo pelo WhatsApp. Faria sentido eu te mostrar em 5 minutos como funciona na prática?`;
        }

        // Se o lead mencionou sistema
        if (/\b(sistema|software|feegow|simples|hiper|programa|vedius|codental|doctoralia|shosp|totvs)\b/i.test(lastClientText)) {
            return `Legal! Esse sistema que vocês usam hoje já faz a confirmação automática com reagendamento inteligente via WhatsApp, ou essa parte ainda exige tempo da recepção?`;
        }

        // Se perguntou o que é / como funciona / ajuda / proposta
        if (/\b(funciona|trata|ajudar|ajuda|informaç|duvida|dúvida|proposta|melhoria)\b/i.test(lastClientText)) {
            return `A CleanMed é uma solução que automatiza o agendamento e a confirmação de consultas pelo WhatsApp da própria clínica, reduzindo as faltas de pacientes em até 70%.\n\nComo vocês lidam com confirmações de consultas hoje? Usam algum sistema ou fazem manualmente?`;
        }

        console.log('[IA] Fallback inteligente acionado para mensagem em andamento.');
        return `Entendi! O objetivo da CleanMed é tirar a sobrecarga de mensagens da recepção e evitar horários vagos na agenda.\n\nComo vocês organizam a agenda e confirmações hoje?`;
    }
    const catKey = detectarCategoriaTemplate(clinica?.categoria);
    const catInfo = CATEGORIA_LABELS[catKey] || CATEGORIA_LABELS['default'];
    const idx = Math.floor(Math.random() * TEMPLATES_PRIMEIRO_CONTATO.length);
    const nomeClinica = clinica && clinica.nome ? ` ${clinica.nome}` : '';
    return TEMPLATES_PRIMEIRO_CONTATO[idx]
        .replace(/\{\{categoriaLabel\}\}/g, catInfo.label)
        .replace(/\{\{sessaoLabel\}\}/g, catInfo.sessao)
        .replace(/\{\{nomeClinica\}\}/g, nomeClinica);
}


async function gerarResposta(clinica, historicoConversa, stageAtual) {
    let lastClientMsgText = "";
    if (Array.isArray(historicoConversa) && historicoConversa.length > 0) {
        const clientMsgs = historicoConversa.filter(msg => !msg.fromMe);
        if (clientMsgs.length > 0) {
            lastClientMsgText = clientMsgs[clientMsgs.length - 1].body || "";
        }
    } else if (typeof historicoConversa === 'string') {
        lastClientMsgText = historicoConversa;
    }

    // Executa classificação e aprendizado de perfil (Lead Fingerprint)
    if (clinica && clinica.id) {
        classificarEAtualizarLead(clinica.id, lastClientMsgText, historicoConversa);
    }

    // 1. Check if the client is repeating bot prompts (e.g. asking CPF or menu options repeatedly)
    if (isClientRepeatingBotPrompts(historicoConversa)) {
        console.log(`[IA] Robô do cliente repetindo mensagens/prompts: "${lastClientMsgText}". Desativando para evitar loop.`);
        return `[DESATIVAR]`;
    }

    // 2. Centralized Auto-Responder / URA check (applies to both Legacy & New AI flows)
    if (detectAutoResponder(lastClientMsgText)) {
        const countSent = countAutoResponsesSent(historicoConversa);
        if (countSent === 0 && !lastClientMsgText.toLowerCase().includes('cpf')) {
            const candidateMsg = `Olá! Tudo bem?\n\nVi que essa foi uma mensagem automática.\n\nQuando tiver um tempinho, poderia me informar quem é o responsável pela parte administrativa da clínica?\n\nAgradeço desde já.`;
            return finalizarRespostaOuDuplicata(candidateMsg, historicoConversa);
        } else {
            // Já respondeu 1x ao auto-responder do cliente ou pedido de CPF: DESATIVA o lead para parar o loop
            console.log(`[IA] Auto-responder/URA já respondido 1x. Desativando lead para evitar loop.`);
            return `[DESATIVAR]`;
        }
    }

    // 3. Soft dismissal check — lead dispensou educadamente ("já sim, obrigada", "temos sim", "obrigado")
    if (detectSoftDismissal(lastClientMsgText, historicoConversa)) {
        console.log(`[IA] Rejeição suave detectada: "${lastClientMsgText}". Encerrando conversa.`);
        return `[DESATIVAR]`;
    }

    // 4. No-fit check — clínica não faz agendamento (pronto-socorro, ordem de chegada, etc.)
    // Verifica tanto a última mensagem quanto o histórico completo (a info pode estar em msg anterior)
    const allClientMessages = Array.isArray(historicoConversa)
        ? historicoConversa.filter(m => !m.fromMe).map(m => m.body || '').join(' ')
        : lastClientMsgText;
    if (detectNoFitLead(lastClientMsgText) || detectNoFitLead(allClientMessages)) {
        console.log(`[IA] Lead sem fit detectado (não faz agendamento). Desativando.`);
        return `[DESATIVAR]`;
    }

    // 5. Bot/AI collision check
    if (detectClientBot(lastClientMsgText)) {
        console.log(`[IA] Possível bot do cliente detectado ("já encaminhei"). Desativando.`);
        return `[DESATIVAR]`;
    }



    const isNewFlowEnabled = process.env.ENABLE_NEW_AI_FLOW === 'true';

    // Legacy flow retained when new flow is disabled
    if (!isNewFlowEnabled) {
        if (!process.env.OPENAI_API_KEY) {
            console.error("OPENAI_API_KEY não configurada no .env!");
            return null;
        }

        let historicoTexto = "";
        if (Array.isArray(historicoConversa)) {
            historicoTexto = historicoConversa.map(msg => `${msg.fromMe ? 'Você' : 'Cliente'}: ${msg.body}`).join('\n');
        } else if (typeof historicoConversa === 'string') {
            historicoTexto = `Cliente: ${historicoConversa}`;
        }

        const prompt = `
Você é o assistente virtual da equipe CleanMed. Seja transparente sobre sua identidade e nunca finja ser Henrique. Está qualificando um lead pelo WhatsApp.
Objetivo: descobrir se usa sistema ou faz manual, identificar a dor, e sinalizar via [PASSAR_PARA_HUMANO].

REGRAS FUNDAMENTAIS (LEIA COM ATENÇÃO MÁXIMA):
- **ANALISE TODO O HISTÓRICO**: Antes de responder, leia toda a conversa! NÃO IGNORE o que o cliente acabou de dizer.
- **USE O NOME DA PESSOA**: Se o cliente disser o próprio nome (ex: "Me chamo Sara", "Sou a Maria"), você DEVE chamá-la pelo nome na sua resposta (ex: "Olá, Sara!").
- **NÃO REPITA PERGUNTAS JÁ RESPONDIDAS**: Se o cliente já disse que usa sistema (ou que não usa), NÃO pergunte de novo se usam sistema. Siga o fluxo natural da conversa e responda diretamente ao que ele disse.
- Se o cliente fizer uma pergunta (ex: "Você tem alguma proposta de melhorias?"), responda primeiro a pergunta dele, depois conduza a conversa.
- NUNCA diga que é IA, robô ou assistente virtual. Você é o assistente virtual da equipe CleanMed.
- Respostas CURTAS: máximo 2-4 linhas. PROIBIDO USAR EMOJIS (100% sem emojis).
- NUNCA diga "vou passar para um atendente". VOCÊ JÁ É o consultor.
- Se não souber responder, diga "Vou verificar com a equipe e já te retorno" + [PASSAR_PARA_HUMANO].

TOM DE VOZ:
- Cordial, consultivo, sem pressão de venda. Interesse sincero na rotina deles.
- Se está ocupado: "Sem problemas! Nos falamos em outro momento".

ROTEIRO (siga na ordem):

ETAPA 1 — IDENTIFICAR DECISOR:
Se é um bot, URA, menu ou msg automática: pergunte quem é o responsável pela administração.
Se uma ATENDENTE HUMANA se apresenta ("Me chamo Sara", "Sou a Deise", "Aqui é a Ana"): É OBRIGATÓRIO CHAMÁ-LA PELO NOME. Agradeça, e responda à pergunta dela ou pergunte se ela cuida da parte de agendamentos.
PRIORIDADE ABSOLUTA: Se o lead INFORMAR O NOME DE OUTRA PESSOA COMO RESPONSÁVEL (ex: "a responsável é a Rafaela", "pode falar com o João", "a gerente é a fulana"): PARE DE VENDER IMEDIATAMENTE. Agradeça a quem está falando e PEÇA O CONTATO (telefone ou WhatsApp direto) da pessoa responsável. NUNCA faça perguntas sobre sistema se ela te deu o nome da gestora.

ETAPA 2 — DESCOBRIR CENÁRIO:
Pergunte se já usam sistema ou fazem manual APENAS se essa informação ainda não estiver clara na conversa.
ATENÇÃO MÁXIMA: Se a mensagem anterior já perguntou sobre sistema ou o cliente respondeu "Boa tarde", NÃO repita a pergunta de sistema! Responda à saudação e faça uma pergunta direta de avanço (ex: "Boa tarde! Como funciona a rotina de confirmação de consultas de vocês hoje?").

ETAPA 3 — INVESTIGAR E APRESENTAR VALOR (CRÍTICO):
- Se responder que É MANUAL (ex: "Manual", "manualmente", "no papel"): NUNCA pergunte de novo se usa sistema. Mostre empatia imediata com o trabalho que dá fazer na mão e apresente a CleanMed: "Entendi! Fazer isso manualmente consome bastante tempo da recepção e pacientes ainda acabam faltando. A CleanMed automatiza essas confirmações pelo WhatsApp e ajudando a reduzir faltas com lembretes e confirmações, sem prometer percentuais. Faria sentido você conhecer como funciona em 5 minutinhos?"
- Se responder que USA SISTEMA: pergunte QUAL sistema usam e se esse sistema já faz confirmações automáticas com reagendamento via WhatsApp.
- APRENDIZADO DE DOR OPERACIONAL: Se o lead reclamar de demanda alta, demora para responder, correria, desorganização ou pedir desculpas pela demora (ex: "nossa demanda no WhatsApp está muito grande"), USE ISSO A SEU FAVOR! Mostre empatia e diga que é exatamente por isso que entrou em contato: a CleanMed automatiza o WhatsApp e tira toda essa sobrecarga da equipe.
- RESPEITO AO ATENDIMENTO HUMANIZADO: Se o lead operar manualmente para manter o "contato humano", ou perguntar "qual sua proposta?", responda que acha muito válido priorizarem o atendimento humanizado. Diga que a proposta não é substituir esse contato, mas ajudar a equipe a ganhar tempo nas tarefas repetitivas (como envio de mensagens) para terem mais atenção ao paciente.
- Se disser "já temos sistema" ou "estamos satisfeitos" SEM DIZER "NÃO TENHO INTERESSE": faça UMA pergunta a mais perguntando qual sistema usam. Não desista na primeira resposta.
- Se, APÓS essa pergunta extra, o lead continuar sem interesse ou disser explicitamente que não quer mais falar: aí sim responda APENAS com [DESATIVAR].

GATILHOS DE TRANSIÇÃO:
1. Se o lead expôs QUALQUER dor, insatisfação, interesse em saber mais, pediu preço ou demonstração → [PASSAR_PARA_HUMANO]
2. Se o lead disse EXPLICITAMENTE "não tenho interesse", "pode parar", "não quero" → [DESATIVAR]
3. Se o lead respondeu "já temos sistema" + "obrigado/tchau" (dispensou educadamente com despedida) → [DESATIVAR]
4. Após 3-4 trocas de mensagem → [PASSAR_PARA_HUMANO]
5. Se o cliente não é o responsável: "Entendi! Você poderia me passar o contato de quem cuida dessa parte?"

Dados da clínica:
Nome: ${clinica ? clinica.nome : 'Clínica'}
Elogios/Nomes Citados: ${clinica?.pontos_fortes || 'Nenhum'}
Reclamações Recorrentes: ${clinica?.pontos_fracos || 'Nenhuma'}
Nome do Dono: ${clinica?.nome_dono || 'Desconhecido'}

Histórico da conversa:
${historicoTexto}

Sua resposta (apenas o texto ou a tag):`;

        try {
            return await callOpenAI(prompt);
        } catch (error) {
            console.error('Erro ao gerar resposta autônoma com Gemini (Legacy):', error);
            return obterTemplateFallback(clinica, historicoConversa);
        }
    }

    // NEW AI FLOW
    try {
        let lastClientMsgText = "";
        if (Array.isArray(historicoConversa) && historicoConversa.length > 0) {
            const clientMsgs = historicoConversa.filter(msg => !msg.fromMe);
            if (clientMsgs.length > 0) {
                lastClientMsgText = clientMsgs[clientMsgs.length - 1].body || "";
            }
        } else if (typeof historicoConversa === 'string') {
            lastClientMsgText = historicoConversa;
        }

        // 1. Check negative intent
        if (detectNegativeIntent(lastClientMsgText)) {
            return "[DESATIVAR]";
        }

        // 2. Check stop without progress limit
        const stopDecision = shouldStopWithoutProgress(historicoConversa, stageAtual);
        if (stopDecision === 'HUMANO') {
            return "[PASSAR_PARA_HUMANO]";
        } else if (stopDecision === 'DESATIVAR') {
            return "[DESATIVAR]";
        }

        // 3. Stage transition
        const nextStage = detectStageTransition(historicoConversa, stageAtual);
        if (nextStage === Stage.HUMANO) {
            return "[PASSAR_PARA_HUMANO]";
        }

        // Check OPENAI_API_KEY before building prompt
        if (!process.env.OPENAI_API_KEY) {
            console.error("OPENAI_API_KEY não configurada no .env!");
            return obterTemplateFallback(clinica, historicoConversa);
        }

        let historicoTexto = "";
        if (Array.isArray(historicoConversa)) {
            historicoTexto = historicoConversa.map(msg => `${msg.fromMe ? 'Você' : 'Cliente'}: ${msg.body}`).join('\n');
        } else if (typeof historicoConversa === 'string') {
            historicoTexto = `Cliente: ${historicoConversa}`;
        }

        const plans = config.plans || { Pro: "R$149,90/mês", Business: "R$249,90/mês", Platinum: "R$499,90/mês" };
        const plansText = Object.entries(plans).map(([p, v]) => `${p}: ${v}`).join(', ');

        const prompt = `
Você é o assistente virtual da equipe CleanMed. Seja transparente sobre sua identidade e nunca finja ser Henrique. Conversando com ${clinica ? clinica.nome : 'uma clínica'} pelo WhatsApp.
Objetivo: qualificar o lead de forma empática com respostas CURTAS (máx 2-4 linhas). PROIBIDO USAR EMOJIS (100% sem emojis).

REGRAS FUNDAMENTAIS (LEIA COM ATENÇÃO MÁXIMA):
- **ANALISE TODO O HISTÓRICO**: Leia e interprete toda a conversa antes de gerar sua resposta. A sua resposta deve fazer total sentido com a ÚLTIMA mensagem enviada pelo cliente.
- **USE O NOME DA PESSOA**: Se o atendente informar o nome ("Me chamo Sara", "Sou o João"), VOCÊ É OBRIGADO a cumprimentá-lo pelo nome na sua resposta (ex: "Olá, Sara! Muito prazer.").
- **NÃO REPITA PERGUNTAS JÁ RESPONDIDAS**: Se o cliente já respondeu sobre o sistema (ex: "já usamos sistema" ou "fazemos manual"), NUNCA pergunte isso novamente. Avance no assunto.
- Se o cliente perguntar algo para você (ex: "Você tem alguma proposta?"), responda a ele e mostre que leu! NUNCA IGNORE.
- NUNCA diga que é IA/robô. Você é o assistente virtual da equipe CleanMed.
- NUNCA diga "vou transferir". VOCÊ JÁ É o consultor.
- Se não souber: "Vou verificar com a equipe e já te retorno" + [PASSAR_PARA_HUMANO].

Estágio: ${nextStage} | Planos: ${plansText}

DADOS EXTRAÍDOS DA CLÍNICA:
Elogios/Nomes (use se possível): ${clinica?.pontos_fortes || 'Nenhum'}
Reclamações/Dores (use como alavanca): ${clinica?.pontos_fracos || 'Nenhuma'}
Dono: ${clinica?.nome_dono || 'Desconhecido'}

COMPORTAMENTO POR ESTÁGIO:
- DISCOVERY: Pergunte se usam sistema ou é manual APENAS SE AINDA NÃO SOUBER. Se o cliente já respondeu, siga com o assunto e não repita a pergunta. UMA pergunta por mensagem.
- DOR_IDENTIFICADA: Se o lead disse que faz tudo manual, NUNCA mais pergunte sobre sistema. Mostre empatia (1 frase sobre a sobrecarga da recepção) e convide para ver uma demonstração de 5 minutos ou testar gratuitamente por 15 dias.
- SOLUCAO_APRESENTADA: Apresente a automação via WhatsApp da CleanMed em 1-2 linhas. Convide para demonstração ou teste sem compromisso.
- INTERESSE/DEMO: Se pedir preço, informe (${plansText}). Se pedir demo/reunião ou demonstrar interesse, ofereça agendar um horário rápido ou criar um acesso de testes gratuito para ele e inclua [PASSAR_PARA_HUMANO]. NUNCA mande links frios para o lead se cadastrar sozinho.

REGRAS ESPECIAIS (SOBRESCREVEM QUALQUER ESTÁGIO):
- REGRA DE ONBOARDING E CADASTRO: NUNCA mande link solto de site pedindo para o cliente se cadastrar por conta própria. Médicos e recepcionistas não preenchem cadastro sozinhos. Sempre ofereça criar o acesso para ele ou fazer uma chamada de 5 minutos para demonstrar.
- PRIORIDADE ABSOLUTA (INDICAÇÃO DE RESPONSÁVEL): Se o lead INFORMAR O NOME DE OUTRA PESSOA COMO RESPONSÁVEL (ex: "a adm é a Rafaela", "Pode falar com o João"): PARE DE VENDER/OFERECER IMEDIATAMENTE. Apenas agradeça a quem está falando e PEÇA O CONTATO (telefone ou WhatsApp direto) da pessoa responsável. NÃO faça perguntas de Discovery para a recepcionista se ela já indicou o gerente.
- PRIORIDADE MÁXIMA (DOR OPERACIONAL): Se o lead reclamar de demanda alta, correria ou pedir desculpas por demora (ex: "nossa demanda no WhatsApp está muito grande"), USE ISSO! Diga: "Imagina, entendo perfeitamente [nome da atendente se houver]! É exatamente por isso que a CleanMed é ideal: automatizamos o WhatsApp e organizamos a agenda para tirar toda essa sobrecarga de vocês."
- RESPEITO AO ATENDIMENTO HUMANIZADO: Se o lead disser que a equipe deles opera manualmente porque valorizam o "contato humano" ou perguntar "qual sua proposta de melhoria?", VALIDE essa escolha. Diga: "Acho muito válido vocês priorizarem o atendimento humanizado! A nossa proposta não é substituir o contato com os pacientes, mas sim ajudar a equipe a ganhar tempo nas tarefas repetitivas (como envio de mensagens) para que vocês possam dedicar ainda mais atenção ao atendimento. Hoje vocês precisam enviar as confirmações manualmente?"
- Se ATENDENTE HUMANA se apresenta ("Me chamo Sara", "Sou a Maria"): USE O NOME DELA IMEDIATAMENTE. Mostre que leu a mensagem dela, responda eventuais perguntas e conduza o assunto.
- Se lead diz "já temos sistema" SEM dizer "não tenho interesse": pergunte QUAL sistema usam e se esse sistema já faz confirmações automáticas com reagendamento via WhatsApp. Não desista na primeira resposta.
- Se, APÓS investigar, o lead continuar desinteressado ou disser "não quero" → [DESATIVAR].
- Se lead pediu preço/demo/reunião ou expôs qualquer dor → [PASSAR_PARA_HUMANO].
- Se lead disse EXPLICITAMENTE "não tenho interesse", "pode parar" → [DESATIVAR].

Histórico:
${historicoTexto}

Resposta (texto ou tag):`;

        const text = await callOpenAI(prompt);
        return text || obterTemplateFallback(clinica, historicoConversa);
    } catch (error) {
        console.error('Erro no novo fluxo de IA com Gemini:', error);
        return obterTemplateFallback(clinica, historicoConversa);
    }
}

async function extrairRespostasDaConversa(historicoConversa) {
    if (!process.env.OPENAI_API_KEY) {
        console.error("OPENAI_API_KEY não configurada no .env!");
        return null;
    }

    let historicoTexto = "";
    if (Array.isArray(historicoConversa)) {
        historicoTexto = historicoConversa.map(msg => `${msg.fromMe ? 'Você' : 'Cliente'}: ${msg.body}`).join('\n');
    } else if (typeof historicoConversa === 'string') {
        historicoTexto = `Cliente: ${historicoConversa}`;
    }

    const prompt = `
Leia a transcrição desta entrevista de WhatsApp entre um consultor e uma clínica.
Extraia as respostas do cliente e preencha o seguinte objeto JSON. Se uma informação não foi dita, deixe como uma string vazia "".
Mantenha exatamente todas as chaves do formato abaixo para compatibilidade, mesmo que a maioria fique com valores vazios.

Formato de saída (apenas JSON válido, sem markdown, sem chaves extras):
{
  "bloco1": { "nome_clinica": "", "cidade": "", "especialidades": "", "qtd_medicos": "", "qtd_funcionarios": "", "atendimentos_mes": "" },
  "bloco2": { "como_agenda": "", "agenda_online": "", "usa_whatsapp_agenda": "", "qtd_recepcionistas": "", "horas_mensagens": "", "como_confirma": "", "processo_automatico": "", "faltas_mes": "" },
  "bloco3": { "controle_receitas": "", "controle_despesas": "", "sistema_financeiro": "", "faz_repasse": "", "emite_nf": "", "acompanha_lucro": "" },
  "bloco4": { "acompanha_resultados": "", "tem_relatorios": "", "controle_estoque": "", "acompanha_produtividade": "" },
  "bloco5": { 
     "usa_sistema": "", 
     "sistema_atual": "", 
     "o_que_gosta": "", 
     "o_que_incomoda": "" 
  },
  "bloco6": { 
     "objetivo_principal": "", 
     "objetivos": "" 
  }
}

Regras para extração:
- bloco5.usa_sistema: Preencha "Sim" se usam sistema, "Não" se for manual.
- bloco5.sistema_atual: Nome do sistema que usam (ou "Manual" se for manual).
- bloco5.o_que_incomoda: A principal reclamação ou dor citada pelo cliente em relação ao sistema ou processo.
- bloco6.objetivos: Um breve resumo da dor principal e oportunidade comercial identificada.

Transcrição da conversa:
${historicoTexto}
`;

    try {
        const jsonText = await callOpenAI(prompt, { generationConfig: { responseMimeType: "application/json" } });
        return JSON.parse(jsonText);
    } catch (error) {
        console.error('Erro ao extrair respostas com OpenAI:', error);
        return null;
    }
}

async function classificarPrioridadeDaConversa(historicoConversa) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return { priority: 'LOW', reason: 'API key não configurada' };
    }

    let historicoTexto = "";
    if (Array.isArray(historicoConversa)) {
        historicoTexto = historicoConversa.map(msg => `${msg.fromMe ? 'Você' : 'Cliente'}: ${msg.body}`).join('\n');
    } else if (typeof historicoConversa === 'string') {
        historicoTexto = `Cliente: ${historicoConversa}`;
    } else {
        return { priority: 'LOW', reason: 'Histórico de conversa inválido ou vazio' };
    }

    const triggers = config.highPriorityTriggers || [];
    const lowerHistory = historicoTexto.toLowerCase();
    const hasTrigger = triggers.some(t => lowerHistory.includes(t.toLowerCase()));

    const prompt = `
Você é um especialista em qualificação de leads comerciais para um sistema de gestão clínica (CleanMed).
Sua tarefa é analisar o histórico da conversa de prospecção pelo WhatsApp e classificar a PRIORIDADE comercial do lead em HIGH, MEDIUM ou LOW.

Diretrizes de Classificação:
1. **HIGH**: O cliente demonstrou interesse ativo em prosseguir com uma demonstração ou obter informações imediatas sobre preço/funcionamento, ou solicitou contato/reunião.
   - Exemplos de sinais/comportamentos:
     * Perguntar preço ou quanto custa.
     * Perguntar como funciona o sistema.
     * Pedir demonstração ou teste de acesso.
     * Pedir mais informações ou detalhes.
     * Solicitar reunião, agendamento de chamada ou contato comercial.
2. **MEDIUM**: O cliente descreveu uma dor real, gargalo operacional, tarefas manuais ineficientes, ou insatisfação com o software atual, mas ainda não pediu preços ou demonstração explicitamente.
   - Exemplos de sinais/comportamentos:
     * Dizer que a confirmação de consultas ou envio de lembretes é feito de forma manual e dá trabalho.
     * Relatar alto índice de faltas de pacientes.
     * Relatar perda de tempo na recepção.
     * Citar que o sistema atual é bom, mas carece de certas funcionalidades (ex: não tem financeiro, é muito lento).
     * Uso de planilhas paralelas para contornar limitações do sistema atual.
3. **LOW**: O cliente forneceu apenas informações neutras sobre qual sistema utiliza, respondeu de forma seca/direta sem expor dores ou insatisfações, ou declarou estar totalmente satisfeito com o sistema atual.
   - Exemplos de sinais/comportamentos:
     * "Usamos o Simples Dental." (Sem acrescentar nenhuma dor).
     * "Estamos satisfeitos." ou "Funciona muito bem para nós."
     * "No momento não temos interesse, já está tudo sob controle."

Importante: Não realize uma busca cega apenas por palavras-chave isoladas. Analise o contexto total, o tom e a intensidade do relato do cliente. Se houver qualquer menção clara a processos manuais exaustivos ou reclamações sobre o software atual, classifique como MEDIUM. Se houver manifestação de curiosidade ativa sobre o CleanMed, preços ou agendamentos, classifique como HIGH. ${hasTrigger ? '(Nota: Foi detectado gatilho de alta prioridade na conversa).' : ''}

Retorne APENAS um objeto JSON válido no seguinte formato:
{
  "priority": "HIGH" | "MEDIUM" | "LOW",
  "reason": "Explicação resumida em português de 1 frase justificando a classificação"
}
`;

    try {
        const fullPrompt = `${prompt}\n\nTranscrição da conversa:\n${historicoTexto}`;
        const jsonText = await callOpenAI(fullPrompt, { generationConfig: { responseMimeType: "application/json" } });
        return JSON.parse(jsonText);
    } catch (error) {
        console.error('Erro ao classificar prioridade com OpenAI:', error);
        return { priority: 'LOW', reason: 'Erro na chamada com a IA: ' + error.message };
    }
}

module.exports = { 
  Stage,
  detectNegativeIntent,
  detectAutoResponder,
  countAutoResponsesSent,
  classificarEAtualizarLead,
  analisarEAtualizarProgressoLead,
  extrairContatoIndicacao,
  isClientRepeatingBotPrompts,
  isDuplicateOutboundMessage,
  shouldStopWithoutProgress,
  detectStageTransition,
  obterTemplateFallback,
  gerarMensagem, 
  gerarFollowup,
  gerarResposta, 
  extrairRespostasDaConversa, 
  classificarPrioridadeDaConversa 
};


