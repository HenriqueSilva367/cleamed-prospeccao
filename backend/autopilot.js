const db = require('./db/database');
const { gerarMensagem, gerarFollowup } = require('./ia');
const { enviarMensagem, salvarMensagem, contarHistoricoWhatsApp } = require('./whatsapp');
const { applyLeadScore, onlyDigits, isBlacklistedLead } = require('./lead-scoring');
const { enriquecerLeadComReviews } = require('./review-scraper');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let autopilotStatus = {
    isOn: false,
    currentTask: 'Aguardando início...',
    logs: []
};

let loopTimeout = null;
let isLoopRunning = false;

let dailyStats = {
    date: new Date().toLocaleDateString(),
    sentCount: 0
};

function addLog(msg) {
    console.log(`[Autopilot] ${msg}`);
    autopilotStatus.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (autopilotStatus.logs.length > 50) {
        autopilotStatus.logs.shift(); // Mantém apenas os últimos 50 logs
    }
}

function getConfig(chave) {
    const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
    if (!row) return null;
    try { return JSON.parse(row.valor); } catch { return row.valor; }
}

function setConfig(chave, valor) {
    db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run(
        chave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
    );
}

/**
 * Verifica se o horário atual está dentro da janela inteligente de envio.
 * Faixas produtivas: 9h-11h30 e 14h-17h30, de segunda a sexta.
 * Finais de semana estão bloqueados.
 */
function dentroDoHorarioInteligente() {
    const ativo = getConfig('horario_inteligente_ativo');
    // Se o usuário desativou a trava de horário comercial, permite envios 24/7 sem restrição
    if (ativo === false || ativo === 'false') {
        return true;
    }

    const agora = new Date();
    const diaSemana = agora.getDay(); // 0=Dom, 6=Sab
    const hora = agora.getHours();
    const minuto = agora.getMinutes();
    const horaDecimal = hora + (minuto / 60);

    // Bloqueia finais de semana
    if (diaSemana === 0 || diaSemana === 6) return false;

    // Faixas produtivas: 9:00-11:30 e 14:00-17:30
    const faixaManha = horaDecimal >= 9 && horaDecimal < 11.5;
    const faixaTarde = horaDecimal >= 14 && horaDecimal < 17.5;

    return faixaManha || faixaTarde;
}

/**
 * Calcula quantos ms faltam até a próxima janela de envio.
 */
function msAteProximaJanela() {
    const agora = new Date();
    const diaSemana = agora.getDay();
    const hora = agora.getHours();
    const minuto = agora.getMinutes();
    const horaDecimal = hora + (minuto / 60);

    // Se for fim de semana, calcula até segunda 9h
    if (diaSemana === 0) { // Domingo
        const seg9h = new Date(agora);
        seg9h.setDate(agora.getDate() + 1);
        seg9h.setHours(9, 0, 0, 0);
        return seg9h - agora;
    }
    if (diaSemana === 6) { // Sábado
        const seg9h = new Date(agora);
        seg9h.setDate(agora.getDate() + 2);
        seg9h.setHours(9, 0, 0, 0);
        return seg9h - agora;
    }

    // Dia útil: verifica próxima faixa
    if (horaDecimal < 9) {
        const hoje9h = new Date(agora);
        hoje9h.setHours(9, 0, 0, 0);
        return hoje9h - agora;
    }
    if (horaDecimal >= 11.5 && horaDecimal < 14) {
        const hoje14h = new Date(agora);
        hoje14h.setHours(14, 0, 0, 0);
        return hoje14h - agora;
    }
    if (horaDecimal >= 17.5) {
        // Próximo dia útil às 9h
        const diasAteProximo = diaSemana === 5 ? 3 : 1; // Sexta -> Segunda
        const proximo9h = new Date(agora);
        proximo9h.setDate(agora.getDate() + diasAteProximo);
        proximo9h.setHours(9, 0, 0, 0);
        return proximo9h - agora;
    }

    return 0; // Já está dentro da janela
}

function atualizarScoreLead(lead) {
    const scored = applyLeadScore(lead);
    db.prepare('UPDATE clinicas SET fit_score = ?, lead_priority = ?, score_reason = ? WHERE id = ?')
        .run(scored.fit_score, scored.lead_priority, scored.score_reason, lead.id);
    return scored;
}

function atualizarScoresPendentes(limit = 200) {
    const rows = db.prepare(`
        SELECT * FROM clinicas
        WHERE status IN ('pending', 'paused_site')
          AND (fit_score IS NULL OR fit_score = 0 OR score_reason IS NULL OR score_reason = '')
        LIMIT ?
    `).all(limit);

    for (const lead of rows) {
        atualizarScoreLead(lead);
    }

    if (rows.length > 0) {
        addLog(`Score atualizado para ${rows.length} leads pendentes.`);
    }
}

// Leads cujo histórico não pôde ser lido: pulados temporariamente (id -> timestamp de liberação)
const leadsPulados = new Map();
function idsPulados() {
    const agora = Date.now();
    for (const [id, ate] of leadsPulados) if (ate <= agora) leadsPulados.delete(id);
    return [...leadsPulados.keys()];
}
function filtroPulados() {
    const ids = idsPulados();
    return ids.length ? ` AND id NOT IN (${ids.map(Number).join(',')})` : '';
}

function buscarProximoLeadPendente(pausedCategories) {
    let queryStr = `
        SELECT * FROM clinicas
        WHERE status IN ('pending', 'paused_site')
          AND IFNULL(tem_bot, 0) = 0
          AND IFNULL(ia_ativa, 1) = 1${filtroPulados()}
    `;

    if (pausedCategories.length > 0) {
        const placeholders = pausedCategories.map(() => '?').join(',');
        queryStr += ` AND IFNULL(categoria, '') NOT IN (${placeholders})`;
    }

    queryStr += `
        ORDER BY
          fit_score DESC,
          CASE sales_priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC,
          CASE
            WHEN IFNULL(total_avaliacoes, 0) BETWEEN 3 AND 65 THEN 3
            WHEN IFNULL(total_avaliacoes, 0) < 3 THEN 2
            WHEN IFNULL(total_avaliacoes, 0) BETWEEN 66 AND 150 THEN 1
            ELSE 0
          END DESC,
          id ASC
        LIMIT 1
    `;

    return db.prepare(queryStr).get(...pausedCategories);
}

function buscarLeadFollowup() {
    const ativo = getConfig('followup_auto_ativo');
    if (!(ativo === true || ativo === 'true')) return null;

    const dias1 = parseInt(getConfig('followup_dias_1'), 10) || 1;
    const dias2 = parseInt(getConfig('followup_dias_2'), 10) || 3;
    const dias3 = parseInt(getConfig('followup_dias_3'), 10) || 7;
    const dias4 = parseInt(getConfig('followup_dias_4'), 10) || 14;

    return db.prepare(`
        SELECT * FROM clinicas
        WHERE status = 'sent'${filtroPulados()}
          AND IFNULL(tem_bot, 0) = 0
          AND IFNULL(ia_ativa, 1) = 1
          AND IFNULL(followup_stage, 0) < 4
          AND (
            (IFNULL(followup_stage, 0) = 0 AND datetime(IFNULL(last_contact_at, criado_em), '+' || ? || ' days') <= datetime('now'))
            OR
            (IFNULL(followup_stage, 0) = 1 AND datetime(IFNULL(last_followup_at, last_contact_at), '+' || ? || ' days') <= datetime('now'))
            OR
            (IFNULL(followup_stage, 0) = 2 AND datetime(IFNULL(last_followup_at, last_contact_at), '+' || ? || ' days') <= datetime('now'))
            OR
            (IFNULL(followup_stage, 0) = 3 AND datetime(IFNULL(last_followup_at, last_contact_at), '+' || ? || ' days') <= datetime('now'))
          )
        ORDER BY
          CASE sales_priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC,
          fit_score DESC,
          id ASC
        LIMIT 1
    `).get(dias1, dias2, dias3, dias4);
}



// GUARDA PRÉ-ENVIO: analisa TODO o histórico (inclusive de outros cadastros com o mesmo telefone/WhatsApp)
// e as datas antes de qualquer mensagem automática. Evita reabordar quem já conversou, já encerrou
// ou já indicou outro contato.
function analisarHistoricoAntesDeEnviar(lead, isFollowup) {
    const sufixo = onlyDigits(lead.tel || '').slice(-8);
    const irmaos = db.prepare(`
        SELECT id, nome, status FROM clinicas
        WHERE id = ?
           OR (? != '' AND whatsapp_id = ?)
           OR (LENGTH(?) = 8 AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(tel,''),' ',''),'-',''),'(',''),')',''),'+','') LIKE '%' || ?)
    `).all(lead.id, lead.whatsapp_id || '', lead.whatsapp_id || '', sufixo, sufixo);
    const ids = irmaos.map(r => r.id);
    const ph = ids.map(() => '?').join(',');
    const msgs = db.prepare(`SELECT clinica_id, direction, timestamp FROM messages WHERE clinica_id IN (${ph}) ORDER BY timestamp ASC, id ASC`).all(...ids);

    const outros = irmaos.filter(r => r.id !== lead.id);
    const statusAtivos = ['sent', 'reply', 'indicou_responsavel', 'disabled', 'diagnostico', 'interviewing'];
    const outroAtivo = outros.find(r => statusAtivos.includes(r.status));
    const inbound = msgs.filter(m => m.direction === 'inbound');
    const ultimaOutbound = [...msgs].reverse().find(m => m.direction === 'outbound');

    if (!isFollowup) {
        if (msgs.length > 0) return { permitir: false, motivo: `já existem ${msgs.length} mensagens com este número (última em ${msgs[msgs.length - 1].timestamp})` };
        if (outroAtivo) return { permitir: false, motivo: `número já abordado no cadastro "${outroAtivo.nome}" (status ${outroAtivo.status})` };
    } else {
        if (inbound.length > 0) return { permitir: false, motivo: `o lead já respondeu (última resposta em ${inbound[inbound.length - 1].timestamp})` };
        if (outros.some(r => r.status !== 'pending' && r.status !== 'sent')) return { permitir: false, motivo: 'número tem conversa em andamento/encerrada em outro cadastro' };
    }
    if (ultimaOutbound) {
        const horas = (Date.now() - new Date(String(ultimaOutbound.timestamp).replace(' ', 'T') + 'Z').getTime()) / 3600000;
        if (horas < 20) return { permitir: false, motivo: `já enviamos mensagem há ${horas.toFixed(1)}h` };
    }
    return { permitir: true };
}

async function executarBuscaAutomatica() {
    const cidadeCfg = getConfig('busca_cidade');
    const cidade = (cidadeCfg && cidadeCfg.trim()) ? cidadeCfg.trim() : 'Fortaleza';
    const bairrosConfig = getConfig('busca_bairros');
    const tiposConfig = getConfig('busca_tipos');
    const quantidade = parseInt(getConfig('busca_quantidade')) || 30;
    let indice = parseInt(getConfig('busca_indice_atual')) || 0;

    // Se o usuário não colocar bairro, a busca deve rodar apenas na cidade
    const bairros = (Array.isArray(bairrosConfig) && bairrosConfig.length > 0) ? bairrosConfig : ['Aldeota', 'Meireles', 'Messejana', 'Papicu', 'Fátima', 'Centro'];
    const tipos = (Array.isArray(tiposConfig) && tiposConfig.length > 0) ? tiposConfig : ['Clínica Odontológica', 'Clínica de Estética', 'Clínica Médica', 'Dermatologista'];

    // Combinações: bairros × tipos (ex: 8 bairros × 5 tipos = 40 combinações únicas)
    const combinacoes = [];
    for (const bairro of bairros) {
        for (const tipo of tipos) {
            combinacoes.push({ bairro, tipo });
        }
    }

    if (combinacoes.length === 0) {
        addLog('Busca automática: nenhuma combinação configurada.');
        return;
    }

    // Avança o índice (rotação circular)
    if (indice >= combinacoes.length) indice = 0;
    const { bairro, tipo } = combinacoes[indice];
    setConfig('busca_indice_atual', (indice + 1) % combinacoes.length);

    // Se tiver bairro, busca com bairro, senão busca só na cidade
    const query = bairro ? `${tipo} em ${bairro}, ${cidade}` : `${tipo} em ${cidade}`;
    addLog(`🔍 Busca automática iniciada: "${query}" (${quantidade} leads)`);
    autopilotStatus.currentTask = `Buscando leads: ${query}...`;

    const scriptPath = path.join(__dirname, '../frontend/scripts/scraper.js');

    return new Promise((resolve) => {
        const scraper = spawn('node', [scriptPath, query, quantidade]);
        scraper.stdout.on('data', d => console.log(`[AutoBusca]: ${d.toString().trim()}`));
        scraper.stderr.on('data', d => console.error(`[AutoBusca ERR]: ${d.toString().trim()}`));
        scraper.on('close', (code) => {
            if (code !== 0) {
                addLog(`⚠️ Busca automática falhou (código ${code}). Tentando de novo mais tarde.`);
                return resolve(0);
            }

            // Processa os leads encontrados (igual ao que a rota /busca/local faz)
            const outputPath = path.join(__dirname, '../frontend/leads_output.json');
            try {
                if (fs.existsSync(outputPath)) {
                    const leads = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
                    const blacklist = ['sus', 'ubs', 'posto de saúde', 'posto de saude', 'hospital público', 'odontocompany', 'odontoclinic', 'prefeitura', 'amorsaude', 'amor saude', 'amor saúde'];

                    const checkExists = db.prepare(`SELECT id, status FROM clinicas WHERE google_place_id = ? OR (tel = ? AND tel != '') OR (nome = ? AND cidade = ?)`);
                    const insert = db.prepare(`
                        INSERT INTO clinicas (nome, tel, endereco, site, avaliacao, total_avaliacoes, google_place_id, origem, categoria, cidade, bairro, lead_priority, fit_score, score_reason)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'auto_scraper', ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(google_place_id) DO NOTHING
                    `);
                    let novos = 0;
                    for (const lead of leads) {
                        const blCheck = isBlacklistedLead(lead);
                        if (blCheck.blocked) {
                            console.log(`[AutoBusca] Ignorado pela Blacklist (${blCheck.reason}): ${lead.nome}`);
                            continue;
                        }
                        const telNumerico = onlyDigits(lead.tel || '');
                        const existing = checkExists.get(lead.google_place_id, telNumerico, lead.nome, cidade);
                        if (existing) continue;
                        const scoredLead = applyLeadScore({ ...lead, categoria: tipo, cidade, bairro });
                        insert.run(scoredLead.nome, scoredLead.tel, scoredLead.endereco, scoredLead.site, scoredLead.avaliacao, scoredLead.total_avaliacoes, scoredLead.google_place_id, tipo, cidade, bairro, scoredLead.lead_priority, scoredLead.fit_score, scoredLead.score_reason);
                        novos++;
                    }
                    fs.unlinkSync(outputPath);
                    addLog(`✅ Busca automática concluída! ${novos} novos leads adicionados (${tipo} - ${bairro}).`);
                } else {
                    addLog('⚠️ Busca automática não encontrou resultados.');
                }
            } catch (e) {
                addLog(`⚠️ Erro ao processar dados da busca automática: ${e.message}`);
            }
            resolve(novos);
        });
    });
}

async function runLoop() {
    if (!autopilotStatus.isOn) {
        addLog('Piloto automático desligado. Parando loop.');
        isLoopRunning = false;
        return;
    }

    if (isLoopRunning) {
        console.log('[Autopilot] Loop já está em execução. Ignorando chamada concorrente.');
        return;
    }
    isLoopRunning = true;

    let lead = null;
    try {
        // Verifica janela de horário inteligente
        if (!dentroDoHorarioInteligente()) {
            const espera = msAteProximaJanela();
            const horasEspera = (espera / 3600000).toFixed(1);
            autopilotStatus.currentTask = `Fora do horário comercial. Próximo envio em ${horasEspera}h...`;
            addLog(`Fora da janela de envio. Aguardando ${horasEspera} horas até a próxima janela.`);
            isLoopRunning = false;
            loopTimeout = setTimeout(runLoop, espera);
            return;
        }

        // Verifica limite diário
        const today = new Date().toLocaleDateString();
        if (dailyStats.date !== today) {
            dailyStats.date = today;
            dailyStats.sentCount = 0;
            addLog('Novo dia! Contador de envios resetado.');
        }

        const maxDaily = parseInt(getConfig('limite_diario_envios')) || 40;
        if (dailyStats.sentCount >= maxDaily) {
            autopilotStatus.currentTask = `Limite diário de ${maxDaily} envios atingido. Aguardando até amanhã...`;
            addLog(`Limite diário de segurança (${maxDaily} envios) atingido. Dormindo por 4 horas...`);
            isLoopRunning = false;
            loopTimeout = setTimeout(runLoop, 4 * 60 * 60 * 1000); // Tenta de novo daqui 4 horas
            return;
        }

        autopilotStatus.currentTask = 'Procurando próximo lead pendente...';
        
        // 1. Busca próxima clínica pendente, ignorando categorias pausadas
        const pausedCategories = getConfig('categorias_pausadas') || [];
        atualizarScoresPendentes();
        lead = buscarProximoLeadPendente(pausedCategories);

        let isFollowup = false;
        if (!lead) {
            lead = buscarLeadFollowup();
            isFollowup = Boolean(lead);
        }

        if (!lead) {
            // Verifica se a busca automática está ativada
            const cfgAtiva = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'busca_auto_ativa'").get();
            const autoAtiva = cfgAtiva && cfgAtiva.valor === 'true';

            if (autoAtiva) {
                const novosAdicionados = await executarBuscaAutomatica();
                if (novosAdicionados > 0) {
                    addLog(`${novosAdicionados} novos leads encontrados! Retomando disparos em 10 segundos.`);
                    isLoopRunning = false;
                    loopTimeout = setTimeout(runLoop, 10000);
                } else {
                    autopilotStatus.currentTask = 'Sem novos leads na busca. Próxima varredura em 15 min...';
                    addLog('ℹ️ Nenhum novo lead adicionado nesta rodada. Aguardando 15 minutos antes da próxima busca para evitar repetições desnecessárias.');
                    isLoopRunning = false;
                    loopTimeout = setTimeout(runLoop, 15 * 60 * 1000);
                }
            } else {
                autopilotStatus.currentTask = 'Sem leads pendentes. Aguardando 10 minutos...';
                addLog('Sem leads pendentes. Sistema ficará ocioso por 10 minutos.');
                isLoopRunning = false;
                loopTimeout = setTimeout(runLoop, 10 * 60 * 1000);
            }
            return;
        }

        // Se o lead está na Super-Blacklist (franquia, rede, hospital, laboratório, etc.), desativa antes de gastar envio
        const blCheck = isBlacklistedLead(lead);
        if (blCheck.blocked) {
            addLog(`⛔ Desativando lead fora do perfil: ${lead.nome} (${blCheck.reason}).`);
            db.prepare("UPDATE clinicas SET status = 'disabled', fit_score = 0, lead_priority = 'LOW', sales_priority = CASE WHEN sales_priority_source = 'manual' THEN sales_priority ELSE 'LOW' END, score_reason = ? WHERE id = ?")
                .run(`bloqueado: ${blCheck.reason}`, lead.id);
            isLoopRunning = false;
            loopTimeout = setTimeout(runLoop, 1000);
            return;
        }

        // Se o lead não tem telefone válido
        if (!lead.tel || onlyDigits(lead.tel).length < 10) {
            addLog(`Ignorando lead ${lead.nome} (Sem telefone válido).`);
            db.prepare("UPDATE clinicas SET status = 'disabled' WHERE id = ?").run(lead.id);
            isLoopRunning = false;
            loopTimeout = setTimeout(runLoop, 2000);
            return;
        }

        // Removido filtro de site para permitir prospecção de clínicas com site próprio


        addLog(`Iniciando processo para: ${lead.nome} (Score ${lead.fit_score || 0}, envio ${dailyStats.sentCount + 1}/${maxDaily} hoje)`);
        
        const isPrimeiroContato = !isFollowup && ['pending', 'paused_site'].includes(lead.status);

        // 1.5. Enriquecimento Inteligente via Google Maps (Fase 1 - Prospecção Personalizada)
        if (isPrimeiroContato && (!lead.reviews_resumo && !lead.pontos_fortes)) {
            autopilotStatus.currentTask = `Enriquecendo dados com avaliações do Google Maps... (${lead.nome})`;
            addLog(`🔍 Extraindo avaliações do Google Maps para personalizar abordagem de ${lead.nome}...`);
            try {
                const enriched = await enriquecerLeadComReviews(lead);
                if (enriched && (enriched.reviews_resumo || enriched.pontos_fortes || enriched.pontos_fracos)) {
                    db.prepare(`
                        UPDATE clinicas
                        SET reviews_raw = ?,
                            reviews_resumo = ?,
                            pontos_fortes = ?,
                            pontos_fracos = ?,
                            especialidades = ?,
                            nome_dono = ?,
                            enriquecido_em = ?
                        WHERE id = ?
                    `).run(
                        enriched.reviews_raw,
                        enriched.reviews_resumo,
                        enriched.pontos_fortes,
                        enriched.pontos_fracos,
                        enriched.especialidades,
                        enriched.nome_dono,
                        enriched.enriquecido_em,
                        lead.id
                    );
                    // Atualiza o objeto em memória
                    Object.assign(lead, enriched);
                    addLog(`✨ ${lead.nome} enriquecido! Dono: "${lead.nome_dono || 'não identificado'}".`);
                } else {
                    addLog(`ℹ️ Poucas avaliações encontradas para ${lead.nome}. Usando template adaptativo.`);
                }
            } catch (e) {
                addLog(`⚠️ Falha no enriquecimento de ${lead.nome}: ${e.message}. Prosseguindo com template.`);
            }
        }

        // 1.9 GUARDA DE HISTÓRICO: nunca envia sem analisar a conversa inteira e as datas
        const analise = analisarHistoricoAntesDeEnviar(lead, isFollowup);
        if (!analise.permitir) {
            addLog(`⛔ Envio bloqueado para ${lead.nome}: ${analise.motivo}.`);
            const novoStatus = isFollowup ? 'reply' : 'disabled';
            db.prepare("UPDATE clinicas SET status = ?, proxima_acao = ? WHERE id = ?").run(novoStatus, `Envio automático bloqueado: ${analise.motivo}`, lead.id);
            isLoopRunning = false;
            loopTimeout = setTimeout(runLoop, 2000);
            return;
        }

        // 1.95 Confere o histórico do WhatsApp se disponível (NÃO bloqueia o envio se não conseguir ler)
        try {
            const histWa = await contarHistoricoWhatsApp(lead.id, lead.tel);
            if (histWa && ((!isFollowup && histWa.total > 0) || (isFollowup && histWa.inbound > 0))) {
                const motivoWa = `já existe conversa no WhatsApp com este número (${histWa.total} msgs, ${histWa.inbound} do lead, última em ${histWa.ultima ? histWa.ultima.toLocaleString('pt-BR') : '?'})`;
                addLog(`⛔ Envio bloqueado para ${lead.nome}: ${motivoWa}.`);
                db.prepare("UPDATE clinicas SET status = ?, proxima_acao = ? WHERE id = ?").run(isFollowup ? 'reply' : 'disabled', `Envio automático bloqueado: ${motivoWa}`, lead.id);
                isLoopRunning = false;
                loopTimeout = setTimeout(runLoop, 2000);
                return;
            }
        } catch (eHist) {
            console.log(`[Autopilot] Aviso ao checar histórico externo de ${lead.nome}: ${eHist.message}`);
        }

        // 2. Gerar Mensagem com IA (ou usar se já existir)
        let textoFinal = isFollowup ? await gerarFollowup(lead) : lead.mensagem_ia;
        if (isPrimeiroContato || (!textoFinal && !isFollowup)) {
            autopilotStatus.currentTask = 'Gerando mensagem personalizada com Google Gemini...';
            addLog('Criando texto de abordagem personalizada...');
            textoFinal = await gerarMensagem(lead);
            // Salva no banco
            db.prepare('UPDATE clinicas SET mensagem_ia = ? WHERE id = ?').run(textoFinal, lead.id);
        }

        // 2.5 ANTI-DUPLICATA E TRAVA DE COINCIDÊNCIA DE TELEFONE
        // Garante que o mesmo número de telefone não receba mensagens simultâneas de leads duplicados
        const recentDupe = db.prepare(`
            SELECT m.id FROM messages m
            JOIN clinicas c ON c.id = m.clinica_id
            WHERE (m.clinica_id = ? OR (c.tel IS NOT NULL AND c.tel != '' AND c.tel = ?))
              AND m.direction = 'outbound'
              AND (m.content = ? OR m.timestamp > datetime('now', '-5 minutes'))
            LIMIT 1
        `).get(lead.id, lead.tel || '', textoFinal);

        if (recentDupe) {
            addLog(`⚠️ Envio recente ou telefone em atendimento detectado para ${lead.nome} (${lead.tel}). Pulando envio.`);
            if (isPrimeiroContato) {
                db.prepare("UPDATE clinicas SET status = 'sent', first_contact_at = COALESCE(first_contact_at, datetime('now')), last_contact_at = datetime('now') WHERE id = ?")
                    .run(lead.id);
            }
            isLoopRunning = false;
            loopTimeout = setTimeout(runLoop, 2000);
            return;
        }

        // 3. Enviar via WhatsApp
        autopilotStatus.currentTask = 'Enviando WhatsApp...';
        addLog('Enviando mensagem...');
        const resultado = await enviarMensagem(lead.id, lead.tel, textoFinal);

        // PERSISTÊNCIA: salva mensagem enviada no banco
        salvarMensagem({
            clinicaId: lead.id,
            direction: 'outbound',
            content: textoFinal,
            whatsappMessageId: resultado?.id || null,
            sender: 'bot',
            source: isFollowup ? 'followup' : 'autopilot'
        });

        // 4. Marcar como enviado ou atualizar follow-up
        if (isFollowup) {
            db.prepare(`
                UPDATE clinicas
                SET followup_stage = IFNULL(followup_stage, 0) + 1,
                    last_followup_at = datetime('now'),
                    last_contact_at = datetime('now')
                WHERE id = ?
            `).run(lead.id);
        } else {
            db.prepare(`
                UPDATE clinicas
                SET status = 'sent',
                    first_contact_at = COALESCE(first_contact_at, datetime('now')),
                    last_contact_at = datetime('now'),
                    followup_stage = COALESCE(followup_stage, 0)
                WHERE id = ?
            `).run(lead.id);
        }
        dailyStats.sentCount += 1;
        addLog(`Sucesso! Lead ${lead.nome} processado. Total hoje: ${dailyStats.sentCount}/${maxDaily}`);

        // Ajustado: 5 a 10 minutos (300.000 ms a 600.000 ms)
        const sleepTime = Math.floor(Math.random() * (600000 - 300000 + 1) + 300000);
        const sleepMinutes = (sleepTime / 60000).toFixed(1);
        
        autopilotStatus.currentTask = `Dormindo por ${sleepMinutes} minutos (Anti-Ban)...`;
        addLog(`Pausa de segurança ativada. Aguardando ${sleepMinutes} minutos.`);
        
        isLoopRunning = false;
        loopTimeout = setTimeout(runLoop, sleepTime);

    } catch (error) {
        addLog(`ERRO: ${error.message}`);
        isLoopRunning = false;
        
        const erroNumeroInvalido = error.message && (
            error.message.includes('não possui WhatsApp ativo') || 
            error.message.includes('No LID for user')
        );
        
        const erroConexao = error.message && (
            error.message.includes('detached Frame') ||
            error.message.includes('Session closed') ||
            error.message.includes('Target closed') ||
            error.message.includes('Protocol error') ||
            error.message.includes('not connected')
        );

        if (erroNumeroInvalido) {
            // Número fixo ou sem WhatsApp: desativa e pula
            if (lead) {
                addLog(`Desativando lead ${lead.nome} por não ter WhatsApp.`);
                db.prepare("UPDATE clinicas SET status = 'disabled' WHERE id = ?").run(lead.id);
            }
            autopilotStatus.currentTask = 'Pulando para o próximo lead...';
            loopTimeout = setTimeout(runLoop, 2000);
        } else if (erroConexao) {
            // Sessão do WhatsApp caiu: aguarda 30s para reconectar e tenta o mesmo lead de novo
            addLog('Conexão do WhatsApp instavel. Aguardando 30 segundos para tentar de novo...');
            autopilotStatus.currentTask = 'Reconectando WhatsApp...';
            loopTimeout = setTimeout(runLoop, 30 * 1000);
        } else {
            // Erro genérico (API, internet, etc.): tenta de novo em 2 minutos
            autopilotStatus.currentTask = 'Erro no processo. Tentando novamente em 2 minutos...';
            loopTimeout = setTimeout(runLoop, 2 * 60 * 1000);
        }
    }
}

function toggleAutopilot() {
    autopilotStatus.isOn = !autopilotStatus.isOn;
    if (autopilotStatus.isOn) {
        leadsPulados.clear();
        addLog('🚀 Piloto Automático ATIVADO.');
        runLoop(); // Inicia o loop
    } else {
        addLog('🛑 Piloto Automático DESATIVADO.');
        if (loopTimeout) clearTimeout(loopTimeout);
        autopilotStatus.currentTask = 'Desligado';
    }
    return autopilotStatus;
}

function getStatus() {
    return autopilotStatus;
}

module.exports = {
    toggleAutopilot,
    getStatus
};
