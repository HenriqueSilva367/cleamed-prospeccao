const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const db = require('./db/database');
const { registrarHandoff, marcarHandoffNotificado } = require('./handoff');
const { gerarResposta, extrairRespostasDaConversa, classificarPrioridadeDaConversa, extrairContatoIndicacao, analisarEAtualizarProgressoLead, detectAutoResponder } = require('./ia');
const { recomendarPlano, gerarOverview, gerarROI, gerarProposal, gerarCompetitorAnalysis, gerarStrategyHTML } = require('./gerador-diagnostico');
const fs = require('fs');
const path = require('path');

function logDebug(msg) {
    const time = new Date().toISOString();
    try {
        fs.appendFileSync(path.join(__dirname, 'debug.log'), `[${time}] ${msg}\n`);
    } catch(e) {}
    console.log(msg);
}

// Helper: salva mensagem no banco de forma segura (nunca impede o fluxo principal)
function salvarMensagem({ clinicaId, direction, content, whatsappMessageId, sender, source, metadata }) {
    try {
        let cleanContent = content || '';
        // Remove cabeçalhos de pushname do WhatsApp (ex: "*Rute Marques*\n") de mensagens recebidas
        if (direction === 'inbound' && typeof cleanContent === 'string') {
            cleanContent = cleanContent.replace(/^\*[^*]+\*\n?/, '').trim();
        }

        // Deduplicação de mensagens outbound inseridas nos últimos 60 segundos
        if (direction === 'outbound') {
            const recent = db.prepare(`
                SELECT id, whatsapp_message_id, sender, source FROM messages 
                WHERE clinica_id = ? AND direction = 'outbound' AND content = ?
                AND timestamp > datetime('now', '-60 seconds')
                ORDER BY id DESC LIMIT 1
            `).get(clinicaId, cleanContent);

            if (recent) {
                // Atualiza o whatsapp_message_id e preserva a origem mais detalhada
                const newWaId = whatsappMessageId || recent.whatsapp_message_id;
                const newSource = (source && source !== 'whatsapp_app') ? source : recent.source;
                const newSender = (sender && sender !== 'human') ? sender : recent.sender;
                db.prepare(`UPDATE messages SET whatsapp_message_id = ?, source = ?, sender = ? WHERE id = ?`).run(newWaId, newSource, newSender, recent.id);
                return;
            }
        }

        db.prepare(`
            INSERT OR IGNORE INTO messages (clinica_id, direction, content, whatsapp_message_id, sender, source, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            clinicaId,
            direction,
            cleanContent,
            whatsappMessageId || null,
            sender || 'system',
            source || null,
            metadata ? JSON.stringify(metadata) : null
        );
    } catch (err) {
        logDebug(`[Messages] Erro ao salvar mensagem no banco: ${err.message}`);
    }
}

let client;
let isReady = false;
let currentQrCodeData = null;
let isRestarting = false;
const messageDebouncers = new Map();

function cancelarDebounceLead(leadId) {
    const id = parseInt(leadId, 10);
    if (messageDebouncers.has(id)) {
        clearTimeout(messageDebouncers.get(id));
        messageDebouncers.delete(id);
        logDebug(`[WhatsApp-Inbox] Temporizador de IA cancelado manualmente para lead ${id}.`);
    }
}
let catchUpInterval = null;
let catchUpRunning = false;
const activeProcessingLeads = new Set();

process.on('SIGINT', async () => {
    if (client) {
        try { await client.destroy(); } catch (e) {}
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (client) {
        try { await client.destroy(); } catch (e) {}
    }
    process.exit(0);
});

// Notifica o responsável somente quando há um handoff humano registrado.
async function notificarVendedor(lead, context = {}) {
    try {
        const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'whatsapp_vendedor'").get();
        const numVendedor = row?.valor?.replace(/\D/g, '');
        if (!numVendedor || numVendedor.length < 10) return { sent: false, reason: 'Número do responsável não configurado.' };
        if (!isReady || !client) return { sent: false, reason: 'WhatsApp da CleanMed não está conectado.' };

        let numero = numVendedor;
        if (numero.length === 10 || numero.length === 11) numero = '55' + numero;
        const chatIdVendedor = numero + '@c.us';
        const tel = lead.tel ? lead.tel.replace(/\D/g, '') : 'N/A';
        const resumo = String(context.lastMessage || '').replace(/\s+/g, ' ').trim().slice(0, 220);
        const motivo = lead.handoff_reason || 'A IA solicitou atendimento humano.';
        const msg = [
            '🔔 *ATENDIMENTO HUMANO SOLICITADO*',
            '',
            '*' + lead.nome + '*',
            'Telefone: ' + tel,
            'Motivo: ' + motivo,
            resumo ? 'Última mensagem: ' + resumo : '',
            'Categoria: ' + (lead.categoria || 'N/A'),
            'Fit score: ' + (lead.fit_score || 0) + '/100',
            '',
            'A IA foi pausada para este lead. Abra o painel e assuma a conversa.'
        ].filter(Boolean).join('\n');

        await client.sendMessage(chatIdVendedor, msg);
        logDebug('[WhatsApp] Handoff notificado para o responsável: ' + lead.nome + '.');
        return { sent: true };
    } catch (err) {
        logDebug('[WhatsApp] Erro ao notificar handoff: ' + err.message);
        return { sent: false, reason: err.message || 'Falha ao enviar notificação.' };
    }
}

function initWhatsApp() {
    // Limpar arquivos de trava de sessão antes de inicializar o navegador
    try {
        const sessionDir = path.join(__dirname, '.wwebjs_auth', 'session-cleanmed-session');
        const lockPath = path.join(sessionDir, 'SingletonLock');
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        const lockCookie = path.join(sessionDir, 'SingletonCookie');
        if (fs.existsSync(lockCookie)) fs.unlinkSync(lockCookie);
    } catch (e) {}

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'cleanmed-session',
            dataPath: path.join(__dirname, '.wwebjs_auth')
        }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014755106-alpha.html'
        },
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', async (qr) => {
        console.log('[WhatsApp] QR Code recebido. Por favor, escaneie.');
        try {
            currentQrCodeData = await qrcode.toDataURL(qr);
        } catch (err) {
            console.error('[WhatsApp] Erro ao gerar imagem do QR Code:', err);
        }
    });

    client.on('ready', () => {
        console.log('[WhatsApp] Cliente está PRONTO!');
        isReady = true;
        currentQrCodeData = null; // Já conectou
        // Recupera mensagens recebidas enquanto o cliente estava offline/dormindo
        setTimeout(() => varrerMensagensPerdidas(), 15000);
        if (catchUpInterval) clearInterval(catchUpInterval);
        catchUpInterval = setInterval(() => varrerMensagensPerdidas(), 3 * 60 * 1000);
    });

    client.on('authenticated', () => {
        console.log('[WhatsApp] Autenticado com sucesso!');
    });

    client.on('auth_failure', msg => {
        console.error('[WhatsApp] Falha na autenticação:', msg);
        isReady = false;
        currentQrCodeData = null;
    });

    client.on('disconnected', (reason) => {
        console.log('[WhatsApp] Cliente desconectado:', reason);
        isReady = false;
        currentQrCodeData = null;
        // Reconecta automaticamente após 5 segundos
        setTimeout(() => reiniciarCliente(), 5000);
    });

    client.on('message_create', (msg) => handleMessageCreate(msg));

    // Varredura de segurança: o whatsapp-web.js NÃO reemite eventos de mensagens que chegaram
    // enquanto o Mac/Chromium estava dormindo ou a sessão caiu. Aqui buscamos chats com mensagens
    // não lidas e processamos as inbound que ainda não estão no banco.
    async function varrerMensagensPerdidas() {
        if (!isReady || catchUpRunning) return;
        catchUpRunning = true;
        try {
            const chats = await client.getChats();
            const candidatos = chats.filter(c => !c.isGroup && c.unreadCount > 0);
            for (const chat of candidatos) {
                try {
                    const msgs = await chat.fetchMessages({ limit: Math.min(chat.unreadCount + 2, 15) });
                    for (const m of msgs) {
                        if (m.fromMe || !m.body || m.type === 'e2e_notification' || m.type === 'protocol') continue;
                        const waId = m.id?._serialized || m.id?.id;
                        if (!waId) continue;
                        const existe = db.prepare('SELECT 1 FROM messages WHERE whatsapp_message_id = ?').get(waId);
                        if (existe) continue;
                        logDebug(`[WhatsApp-CatchUp] Mensagem perdida recuperada de ${m.from}: ${m.body}`);
                        await handleMessageCreate(m);
                    }
                } catch (errChat) {
                    logDebug(`[WhatsApp-CatchUp] Erro no chat ${chat.id?._serialized}: ${errChat.message}`);
                }
            }
        } catch (err) {
            logDebug(`[WhatsApp-CatchUp] Erro na varredura: ${err.message}`);
        } finally {
            catchUpRunning = false;
        }
    }

    async function handleMessageCreate(msg) {
        logDebug(`[WhatsApp] Evento message_create. fromMe: ${msg.fromMe}, from: ${msg.from}, to: ${msg.to}, body: ${msg.body}, type: ${msg.type}`);
        // Ignora mensagens de grupos ou broadcast
        if (msg.isGroupMsg || msg.isStatus) return;
        if (msg.type === 'e2e_notification' || msg.type === 'protocol' || !msg.body) return;

        // Identifica o endereço do contato (se fromMe=true o contato é 'to', se fromMe=false o contato é 'from')
        const targetAddress = msg.fromMe ? msg.to : msg.from;
        if (!targetAddress) return;
        
        let fromNumber = '';
        try {
            if (msg.fromMe) {
                const targetContact = await client.getContactById(msg.to);
                fromNumber = targetContact?.number || '';
            } else {
                const contact = await msg.getContact();
                fromNumber = contact?.number || '';
            }
        } catch(e) {}
        
        if (!fromNumber && !targetAddress.includes('@lid')) {
            fromNumber = targetAddress.replace(/\D/g, '');
        }

        const dddAndNumber = fromNumber.substring(fromNumber.startsWith('55') ? 2 : 0);
        logDebug(`[WhatsApp] Processando número. fromMe: ${msg.fromMe}, targetAddress: ${targetAddress}, fromNumber: ${fromNumber}, dddAndNumber: ${dddAndNumber}`);

        let numberWith9 = dddAndNumber;
        let numberWithout9 = dddAndNumber;

        if (dddAndNumber.length === 11 && dddAndNumber.charAt(2) === '9') {
            numberWithout9 = dddAndNumber.substring(0, 2) + dddAndNumber.substring(3);
        } else if (dddAndNumber.length === 10) {
            numberWith9 = dddAndNumber.substring(0, 2) + '9' + dddAndNumber.substring(2);
        }

        if (dddAndNumber.length >= 10 || targetAddress.includes('@lid')) {
            try {
            let lead = null;
            
            // 1. Tenta buscar por whatsapp_id exato
            if (targetAddress) {
                lead = db.prepare('SELECT * FROM clinicas WHERE whatsapp_id = ? LIMIT 1').get(targetAddress);
            }

            // 2. Busca por número de telefone se disponível
            if (!lead && dddAndNumber.length >= 10 && dddAndNumber.length <= 13) {
                lead = db.prepare(`
                    SELECT * FROM clinicas 
                    WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ? 
                       OR REPLACE(REPLACE(REPLACE(REPLACE(tel, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ? 
                    LIMIT 1
                `).get(`%${numberWith9}%`, `%${numberWithout9}%`);
            }

            // 3. Se ainda não achou e for @lid, tenta associar pelo nome do contato do WhatsApp
            if (!lead && targetAddress.includes('@lid')) {
                try {
                    const contact = msg.fromMe ? await client.getContactById(msg.to) : await msg.getContact();
                    const contactName = (contact?.name || contact?.pushname || '').trim();
                    if (contactName.length >= 3) {
                        lead = db.prepare(`
                            SELECT * FROM clinicas 
                            WHERE LOWER(nome) LIKE LOWER(?) OR LOWER(?) LIKE LOWER(nome)
                            LIMIT 1
                        `).get(`%${contactName}%`, `%${contactName}%`);
                    }
                } catch(e) {}
            }

            // 4. FALLBACK AVANÇADO PARA @LID (outbound): Tenta casar pelo histórico recente de mensagens ou nome da clínica na mensagem
            if (!lead && msg.fromMe && msg.body) {
                try {
                    const msgRow = db.prepare('SELECT clinica_id FROM messages WHERE content = ? ORDER BY id DESC LIMIT 1').get(msg.body);
                    if (msgRow && msgRow.clinica_id) {
                        lead = db.prepare('SELECT * FROM clinicas WHERE id = ?').get(msgRow.clinica_id);
                    }
                    if (!lead) {
                        lead = db.prepare(`
                            SELECT * FROM clinicas 
                            WHERE ? LIKE '%' || nome || '%' AND (status = 'sent' OR status = 'pending' OR status = 'interviewing')
                            ORDER BY id DESC LIMIT 1
                        `).get(msg.body);
                    }
                } catch(e) {}
            }

            // 5. FALLBACK AVANÇADO PARA @LID (inbound): Busca histórico do chat no WhatsApp para reencontrar a mensagem inicial de prospeção
            if (!lead && !msg.fromMe && targetAddress.includes('@lid')) {
                try {
                    const chat = await msg.getChat();
                    if (chat) {
                        const previousMsgs = await chat.fetchMessages({ limit: 10 });
                        const outboundMsg = previousMsgs.find(m => m.fromMe && m.body);
                        if (outboundMsg) {
                            const msgRow = db.prepare('SELECT clinica_id FROM messages WHERE content = ? ORDER BY id DESC LIMIT 1').get(outboundMsg.body);
                            if (msgRow && msgRow.clinica_id) {
                                lead = db.prepare('SELECT * FROM clinicas WHERE id = ?').get(msgRow.clinica_id);
                            }
                            if (!lead) {
                                lead = db.prepare(`
                                    SELECT * FROM clinicas 
                                    WHERE ? LIKE '%' || nome || '%' AND (status = 'sent' OR status = 'interviewing')
                                    ORDER BY id DESC LIMIT 1
                                `).get(outboundMsg.body);
                            }
                        }
                    }
                } catch(errChat) {
                    logDebug(`[WhatsApp] Erro ao buscar histórico do chat para resolução de @lid: ${errChat.message}`);
                }
            }

            if (lead) {
                logDebug(`[WhatsApp] Lead Encontrado no DB: ${lead.nome} (ID: ${lead.id}). Status: ${lead.status}`);

                // Vincula permanentemente o whatsapp_id (mesmo se for @lid) para buscas instantâneas futuras
                if (!lead.whatsapp_id || lead.whatsapp_id !== targetAddress) {
                    db.prepare('UPDATE clinicas SET whatsapp_id = ? WHERE id = ?').run(targetAddress, lead.id);
                    logDebug(`[WhatsApp] Vinculado whatsapp_id ${targetAddress} ao lead ID ${lead.id} (${lead.nome}).`);
                }

                    // PERSISTÊNCIA: Salva a mensagem no banco
                    salvarMensagem({
                        clinicaId: lead.id,
                        direction: msg.fromMe ? 'outbound' : 'inbound',
                        content: msg.body,
                        whatsappMessageId: msg.id?._serialized || msg.id?.id || null,
                        sender: msg.fromMe ? 'human' : 'lead',
                        source: msg.fromMe ? 'whatsapp_app' : 'whatsapp'
                    });

                    // Se a mensagem foi enviada pelo próprio usuário / vendedor / sistema (outbound),
                    // interrompe qualquer timer de IA pendente para este lead e não dispara IA.
                    if (msg.fromMe) {
                        if (messageDebouncers.has(lead.id)) {
                            logDebug(`[WhatsApp-Inbox] Mensagem outbound enviada para ${lead.nome}. Cancelando timer de IA pendente.`);
                            clearTimeout(messageDebouncers.get(lead.id));
                            messageDebouncers.delete(lead.id);
                        }
                        return;
                    }

                    // Se a IA estiver desativada para este lead, nenhuma interferência automática da IA deve ocorrer
                    const leadAtualizado = db.prepare("SELECT id, nome, status, IFNULL(ia_ativa, 1) as ia_ativa FROM clinicas WHERE id = ?").get(lead.id);
                    if (leadAtualizado && Number(leadAtualizado.ia_ativa) === 0) {
                        if (messageDebouncers.has(lead.id)) {
                            clearTimeout(messageDebouncers.get(lead.id));
                            messageDebouncers.delete(lead.id);
                        }
                        if (['sent', 'pending', 'paused_site', 'interviewing'].includes(leadAtualizado.status)) {
                            db.prepare("UPDATE clinicas SET status = 'reply', last_contact_at = datetime('now'), sales_priority = CASE WHEN sales_priority_source = 'manual' THEN sales_priority ELSE 'MEDIUM' END WHERE id = ?").run(lead.id);
                            logDebug(`[WhatsApp-Inbox] Mensagem recebida de ${lead.nome}, mas IA está desativada para este cliente. Status definido como 'reply' para atendimento humano.`);
                        } else {
                            logDebug(`[WhatsApp-Inbox] Mensagem recebida de ${lead.nome}, mas IA está desativada para este cliente. Nenhuma interferência automática.`);
                        }
                        return;
                    }

                    // Lógica do Robô Entrevistador
                    if (lead.status === 'sent' || lead.status === 'interviewing' || lead.status === 'pending' || lead.status === 'paused_site') {
                        // Se estava sent ou pending, entra em entrevista imediatamente
                        if (lead.status !== 'interviewing') {
                            db.prepare("UPDATE clinicas SET status = 'interviewing', last_contact_at = datetime('now') WHERE id = ?").run(lead.id);
                            logDebug(`[WhatsApp-Inbox] Status atualizado para 'interviewing' para ${lead.nome}.`);
                            lead.status = 'interviewing';
                        }

                        const chatId = msg.from;
                        // Delay de agrupamento/debounce inteligente: 8 a 12 segundos para dar tempo do cliente mandar pensamentos em várias mensagens
                        const delayRandomico = Math.floor(Math.random() * (12000 - 8000 + 1) + 8000);
                        logDebug(`[WhatsApp-Inbox] Nova mensagem de ${lead.nome}. Agendando IA para daqui a ${(delayRandomico / 1000).toFixed(1)} segundos.`);

                        // Cancela o temporizador anterior se houver para agrupar mensagens consecutivas do lead
                        if (messageDebouncers.has(lead.id)) {
                            logDebug(`[WhatsApp-Inbox] Agrupando mensagens consecutivas de ${lead.nome}. Cancelando temporizador anterior.`);
                            clearTimeout(messageDebouncers.get(lead.id));
                        }

                        // Cria um novo temporizador
                        const timeoutId = setTimeout(async () => {
                            messageDebouncers.delete(lead.id);

                            // Trava de execução concorrente por lead
                            if (activeProcessingLeads.has(lead.id)) {
                                logDebug(`[WhatsApp-Inbox] Processamento ignorado: Lead ${lead.nome} já está sendo processado por outra thread.`);
                                return;
                            }

                            activeProcessingLeads.add(lead.id);

                            try {
                                // 1. Re-verifica o status atual no banco
                                const currentLead = db.prepare("SELECT * FROM clinicas WHERE id = ?").get(lead.id);
                                if (!currentLead || Number(currentLead.ia_ativa) === 0 || (currentLead.status !== 'sent' && currentLead.status !== 'interviewing')) {
                                    logDebug(`[WhatsApp-Inbox] Processamento cancelado: IA desativada ou status de ${lead.nome} mudou para ${currentLead?.status}.`);
                                    return;
                                }

                                // 2. VERIFICAÇÃO DE SEGURANÇA: Checa a última mensagem no banco.
                                // Se a última mensagem for OUTBOUND, significa que já respondemos ou que o humano enviou mensagem.
                                const ultimaMensagem = db.prepare(`
                                    SELECT direction, content 
                                    FROM messages 
                                    WHERE clinica_id = ? 
                                    ORDER BY id DESC 
                                    LIMIT 1
                                `).get(currentLead.id);

                                if (ultimaMensagem && ultimaMensagem.direction === 'outbound') {
                                    logDebug(`[WhatsApp-Inbox] Processamento cancelado para ${currentLead.nome}: a última mensagem gravada no banco já é OUTBOUND. O robô deve aguardar uma nova mensagem do cliente.`);
                                    return;
                                }

                                logDebug(`[WhatsApp-Inbox] Processando resposta da IA para ${currentLead.nome}...`);
                                try { client.sendPresenceAvailable(); } catch(e) {}
                                
                                // Tenta sinalizar digitação no chat (silencioso em caso de falha)
                                try {
                                    const chat = await client.getChatById(chatId);
                                    if (chat && chat.sendStateTyping) await chat.sendStateTyping();
                                } catch(chatErr) {}

                                await new Promise(r => setTimeout(r, Math.floor(Math.random() * (3000 - 2000 + 1) + 2000)));

                                // Pega o histórico direto do banco SQLite (100% resiliente e imune a erros do Puppeteer/@lid)
                                const msgRows = db.prepare(`
                                    SELECT direction, content 
                                    FROM messages 
                                    WHERE clinica_id = ? 
                                    ORDER BY id ASC 
                                    LIMIT 30
                                `).all(currentLead.id);

                                const ultimasMensagens = msgRows.length > 0 
                                    ? msgRows.map(m => ({ fromMe: m.direction === 'outbound', body: m.content || '' }))
                                    : (msg.body ? [{ fromMe: false, body: msg.body }] : []);

                                // 0. Verificar se a mensagem da recepção contém indicação de responsável com telefone
                                // IMPORTANTE: Pular extração de indicação se a mensagem for auto-responder
                                // (auto-responders listam telefones de contato que NÃO são indicações)
                                const ultimaClienteObj = ultimasMensagens.filter(m => !m.fromMe).pop();
                                const ultimaClienteTexto = ultimaClienteObj ? (ultimaClienteObj.body || '') : '';
                                const isAutoResp = detectAutoResponder(ultimaClienteTexto);
                                const indicacao = isAutoResp ? null : extrairContatoIndicacao(ultimaClienteTexto, currentLead.tel);

                                if (isAutoResp) {
                                    logDebug(`[WhatsApp-Inbox] Mensagem de ${currentLead.nome} é auto-responder. Pulando extração de indicação.`);
                                    // Cai direto para gerarResposta() abaixo, que vai tratar o auto-responder
                                } else if (indicacao && (indicacao.phone || indicacao.email || indicacao.isEmailRequest)) {
                                    const tipoContato = indicacao.phone ? `telefone (${indicacao.phone})` : (indicacao.email ? `e-mail (${indicacao.email})` : 'e-mail');
                                    logDebug(`[WhatsApp-Inbox] Indicação de responsável detectada para ${currentLead.nome}: ${indicacao.nomeResponsavel} via ${tipoContato}.`);
                                    
                                    // Agradece à atendente na conversa atual
                                    const msgAgradecimento = indicacao.nomeAtendente 
                                        ? `Muito obrigado pela ajuda, ${indicacao.nomeAtendente}! Vou encaminhar por lá. Agradeço bastante a sua atenção.`
                                        : `Muito obrigado pela ajuda! Vou encaminhar por lá. Agradeço bastante a sua atenção.`;

                                    db.prepare("UPDATE clinicas SET mensagem_ia = ?, status = 'indicou_responsavel', proxima_acao = ? WHERE id = ?").run(
                                        msgAgradecimento, 
                                        `Indicação de responsável: ${indicacao.nomeResponsavel} - ${tipoContato}`,
                                        currentLead.id
                                    );
                                    await enviarMensagem(currentLead.id, currentLead.tel, msgAgradecimento);

                                    if (indicacao.phone) {
                                        // Cadastra o novo lead no SQLite se não existir
                                        let novoLead = db.prepare('SELECT * FROM clinicas WHERE tel = ? OR whatsapp_id = ? LIMIT 1').get(indicacao.phone, indicacao.phone + '@c.us');
                                    if (!novoLead) {
                                        const nomeNovoLead = `${currentLead.nome} - ${indicacao.nomeResponsavel}`;
                                        const res = db.prepare(`
                                            INSERT INTO clinicas (nome, tel, cidade, categoria, bairro, status, origem, fit_score, lead_priority, score_reason)
                                            VALUES (?, ?, ?, ?, ?, 'pending', 'indicacao_recepcao', 95, 'HIGH', ?)
                                        `).run(
                                            nomeNovoLead,
                                            indicacao.phone,
                                            currentLead.cidade || '',
                                            currentLead.categoria || '',
                                            currentLead.bairro || '',
                                            `Indicação direta da recepção da clínica ${currentLead.nome}`
                                        );
                                        novoLead = db.prepare('SELECT * FROM clinicas WHERE id = ?').get(res.lastInsertRowid);
                                    }

                                    // Dispara mensagem de abordagem inicial personalizada para o responsável
                                    if (novoLead) {
                                        (async () => {
                                            try {
                                                await new Promise(r => setTimeout(r, 10000)); // Delay natural de 10s
                                                let msgAbordagem = "";
                                                const clinicaNome = currentLead.nome || 'clínica';
                                                if (indicacao.nomeResponsavel && indicacao.nomeResponsavel !== 'Responsável') {
                                                    if (indicacao.nomeAtendente) {
                                                        msgAbordagem = `Olá, ${indicacao.nomeResponsavel}, tudo bem?\n\nAqui é o Henrique, da CleanMed. A ${indicacao.nomeAtendente} da recepção da ${clinicaNome} me passou seu contato.\n\nAjudamos clínicas a automatizar agendamentos e confirmações de consultas pelo WhatsApp, reduzindo o trabalho manual da recepção.\n\nVocês usam algum sistema para isso hoje na ${clinicaNome} ou fazem manualmente?`;
                                                    } else {
                                                        msgAbordagem = `Olá, ${indicacao.nomeResponsavel}, tudo bem?\n\nAqui é o Henrique, da CleanMed. A recepção da ${clinicaNome} me passou seu contato.\n\nAjudamos clínicas a automatizar agendamentos e confirmações de consultas pelo WhatsApp, reduzindo o trabalho manual da recepção.\n\nVocês usam algum sistema para isso hoje na ${clinicaNome} ou fazem manualmente?`;
                                                    }
                                                } else {
                                                    msgAbordagem = `Olá, tudo bem?\n\nAqui é o Henrique, da CleanMed. A recepção da ${clinicaNome} me passou este contato como responsável pela clínica.\n\nAjudamos clínicas a automatizar agendamentos e confirmações de consultas pelo WhatsApp, reduzindo o trabalho manual da recepção.\n\nVocês usam algum sistema para isso hoje na ${clinicaNome} ou fazem manualmente?`;
                                                }

                                                db.prepare("UPDATE clinicas SET status = 'sent', first_contact_at = datetime('now'), last_contact_at = datetime('now'), mensagem_ia = ? WHERE id = ?")
                                                    .run(msgAbordagem, novoLead.id);

                                                await enviarMensagem(novoLead.id, novoLead.tel, msgAbordagem);
                                                logDebug(`[WhatsApp-Inbox] Mensagem de abordagem inicial enviada automaticamente para o responsável ${indicacao.nomeResponsavel} (${indicacao.phone}).`);
                                            } catch (errNovo) {
                                                logDebug(`[WhatsApp-Inbox] Erro ao abordar responsável indicado (${indicacao.phone}): ${errNovo.message}`);
                                            }
                                        })();
                                    }
                                    } // Fim if (indicacao.phone)

                                    return; // Encerra processamento para o chat da atendente
                                }

                                // Atualiza a qualificação; notificação ao vendedor ocorre somente no handoff explícito.
                                analisarEAtualizarProgressoLead(currentLead.id, ultimasMensagens);


                                const respostaIA = await gerarResposta(currentLead, ultimasMensagens);
                                
                                // CHECAGEM DE SEGURANÇA PRÉ-ENVIO: Garante que nenhuma mensagem outbound foi gravada enquanto a IA gerava a resposta
                                const recheckLast = db.prepare(`
                                    SELECT direction FROM messages WHERE clinica_id = ? ORDER BY id DESC LIMIT 1
                                `).get(currentLead.id);

                                if (recheckLast && recheckLast.direction === 'outbound') {
                                    logDebug(`[WhatsApp-Inbox] Abortando envio da resposta da IA para ${currentLead.nome}: Uma nova mensagem outbound foi gravada durante a geração.`);
                                    return;
                                }

                                if (respostaIA) {
                                    if (respostaIA.includes('[PASSAR_PARA_HUMANO]')) {
                                        const ultimaMsgLead = [...ultimasMensagens].reverse().find(m => !m.fromMe)?.body || '';
                                        const textoHandoff = ultimaMsgLead.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                        let motivoHandoff = 'A IA identificou necessidade de atendimento humano.';
                                        if (/quanto custa|preco|valor/.test(textoHandoff)) motivoHandoff = 'Pergunta sobre preço ou valores.';
                                        else if (/demonstracao|demo|reuniao|teste gratis|quero testar/.test(textoHandoff)) motivoHandoff = 'Solicitação de demonstração, reunião ou teste.';
                                        else if (/tenho interesse|quero conhecer|quero contratar|quero saber mais/.test(textoHandoff)) motivoHandoff = 'Interesse comercial explícito.';
                                        const novoHandoff = registrarHandoff(db, currentLead.id, motivoHandoff);

                                        if (novoHandoff) {
                                            logDebug('[WhatsApp-Inbox] Handoff registrado para ' + currentLead.nome + '; IA pausada.');
                                            const notificacao = await notificarVendedor(
                                                { ...currentLead, handoff_reason: motivoHandoff },
                                                { lastMessage: ultimaMsgLead }
                                            );
                                            if (notificacao.sent) {
                                                marcarHandoffNotificado(db, currentLead.id);
                                            } else {
                                                logDebug('[WhatsApp-Inbox] Handoff salvo, mas notificação pendente: ' + notificacao.reason);
                                            }
                                        } else {
                                            logDebug('[WhatsApp-Inbox] Handoff já registrado para ' + currentLead.nome + '; evitando duplicação.');
                                        }
                                        
                                        // Processamento pós-handoff assíncrono para extração de respostas e priorização
                                        (async () => {
                                            try {
                                                const respostas = await extrairRespostasDaConversa(ultimasMensagens);
                                                if (respostas) {
                                                    const diagExistente = db.prepare('SELECT id FROM diagnosticos WHERE clinica_id = ?').get(currentLead.id);
                                                    if (diagExistente) {
                                                        db.prepare('UPDATE diagnosticos SET respostas = ? WHERE id = ?').run(JSON.stringify(respostas), diagExistente.id);
                                                    } else {
                                                        db.prepare('INSERT INTO diagnosticos (clinica_id, respostas) VALUES (?, ?)').run(currentLead.id, JSON.stringify(respostas));
                                                    }

                                                    const sistemaAtual = respostas.bloco5?.sistema_atual || respostas.bloco5?.usa_sistema || '';
                                                    const dorDetectada = respostas.bloco5?.o_que_incomoda || respostas.bloco6?.objetivos || '';
                                                    const proximaAcao = dorDetectada ? 'Atendimento humano: explorar dor e oferecer demonstração' : 'Atendimento humano: qualificar decisor e cenário';
                                                    db.prepare(`
                                                        UPDATE clinicas
                                                        SET sistema_atual = ?,
                                                            dor_detectada = ?,
                                                            proxima_acao = ?
                                                        WHERE id = ?
                                                    `).run(sistemaAtual, dorDetectada, proximaAcao, currentLead.id);
                                                }

                                                const classif = await classificarPrioridadeDaConversa(ultimasMensagens);
                                                if (classif && classif.priority) {
                                                    db.prepare("UPDATE clinicas SET lead_priority = ? WHERE id = ?").run(classif.priority, currentLead.id);
                                                    logDebug(`[WhatsApp-Inbox] Lead ${currentLead.nome} classificado como prioridade ${classif.priority}. Motivo: ${classif.reason}`);
                                                }

                                                // Atualiza a progressão automática do lead
                                                analisarEAtualizarProgressoLead(currentLead.id, ultimasMensagens);
                                            } catch (errPost) {
                                                logDebug(`[WhatsApp-Inbox] Erro no processamento pós-handoff para lead ${currentLead.nome}: ${errPost.message}`);
                                            }
                                        })();

                                        const cleanMsg = respostaIA.replace('[PASSAR_PARA_HUMANO]', '').trim();
                                        if (cleanMsg) {
                                            db.prepare("UPDATE clinicas SET mensagem_ia = ? WHERE id = ?").run(cleanMsg, currentLead.id);
                                            await enviarMensagem(currentLead.id, currentLead.tel, cleanMsg);
                                        }
                                    } else if (respostaIA.includes('[DESATIVAR]')) {
                                        logDebug(`[WhatsApp-Inbox] IA solicitou desativar. Status mudando para 'disabled'.`);
                                        db.prepare("UPDATE clinicas SET status = 'disabled' WHERE id = ?").run(currentLead.id);
                                    } else if (respostaIA.includes('[DIAGNOSTICO_CONCLUIDO]')) {
                                        logDebug(`[WhatsApp-Inbox] IA concluiu entrevista. Iniciando extração e geração...`);
                                        
                                        const cleanDiagMsg = respostaIA.replace('[DIAGNOSTICO_CONCLUIDO]', '').trim();
                                        if (cleanDiagMsg) {
                                            await enviarMensagem(currentLead.id, currentLead.tel, cleanDiagMsg);
                                        }
                                        
                                        await new Promise(r => setTimeout(r, 5000));
                                        const respostas = await extrairRespostasDaConversa(ultimasMensagens);
                                        
                                        if (respostas) {
                                            const plano = recomendarPlano(respostas);
                                            const usaSistema = respostas.bloco5?.usa_sistema?.toLowerCase().includes('sim');
                                            
                                            const overview = await gerarOverview(respostas);
                                            const roi = await gerarROI(respostas);
                                            const proposal = await gerarProposal(respostas, plano);
                                            let competitor = null;
                                            if (usaSistema) competitor = await gerarCompetitorAnalysis(respostas);
                                            const strategyHtml = gerarStrategyHTML(currentLead.nome, overview, roi, plano, respostas);
                                            
                                            const stmt = db.prepare(`
                                              INSERT INTO diagnosticos (clinica_id, respostas, overview, roi, proposal, competitor_analysis, strategy_html, plano_recomendado)
                                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                            `);
                                            stmt.run(currentLead.id, JSON.stringify(respostas), overview, roi, proposal, competitor, strategyHtml, plano);
                                            
                                            db.prepare("UPDATE clinicas SET status = 'diagnostico' WHERE id = ?").run(currentLead.id);
                                            logDebug(`[WhatsApp-Inbox] Diagnóstico gerado com sucesso para ${currentLead.nome}! Status mudou para diagnostico.`);
                                            
                                            const diagReadyMsg = "Seu diagnóstico está pronto! Um de nossos especialistas vai te enviar a apresentação por aqui mesmo para vocês analisarem juntos.";
                                            await enviarMensagem(currentLead.id, currentLead.tel, diagReadyMsg);
                                        } else {
                                            logDebug(`[WhatsApp-Inbox] Erro ao extrair respostas da conversa.`);
                                            db.prepare("UPDATE clinicas SET status = 'reply' WHERE id = ?").run(currentLead.id);
                                        }
                                    } else {
                                        logDebug(`[WhatsApp-Inbox] Resposta do robô: ${respostaIA}`);
                                        db.prepare("UPDATE clinicas SET mensagem_ia = ? WHERE id = ?").run(respostaIA, currentLead.id);
                                        await enviarMensagem(currentLead.id, currentLead.tel, respostaIA);
                                    }
                                } else {
                                    logDebug(`[WhatsApp-Inbox] IA falhou ao gerar resposta (possível erro de cota). Passando para humano.`);
                                    db.prepare("UPDATE clinicas SET status = 'reply' WHERE id = ?").run(currentLead.id);
                                }
                            } catch (err) {
                                logDebug(`[WhatsApp-Inbox] Erro ao processar mensagem no debounce: ${err.stack || err.message || err}`);
                            } finally {
                                activeProcessingLeads.delete(lead.id);
                                try {
                                    const chat = await msg.getChat();
                                    await chat.clearState();
                                } catch (e) {}
                            }
                        }, delayRandomico); // 4 segundos de janela de agrupamento/debounce

                        messageDebouncers.set(lead.id, timeoutId);
                    } else if (lead.status === 'reply') {
                        logDebug(`[WhatsApp-Inbox] Ignorado: Lead ${lead.nome} já está sob atendimento de vendedor humano.`);
                    }
                } else {
                    logDebug(`[WhatsApp] Lead não encontrado no DB para os números: ${numberWith9} ou ${numberWithout9}`);
                }
            } catch (error) {
                logDebug(`[WhatsApp-Inbox] Erro fatal no catch: ${error.message}`);
            }
        }
    }

    client.initialize().catch(err => {
        console.error('[WhatsApp] Erro ao inicializar cliente WhatsApp:', err.message);
        isReady = false;
        currentQrCodeData = null;
        setTimeout(() => reiniciarCliente(), 5000);
    });
}

async function getQrCode() {
    return {
        ready: isReady,
        qr: currentQrCodeData
    };
}

// Verifica no PRÓPRIO WhatsApp se já existe conversa com o número (cobre conversas antigas fora do banco).
// Checa TODAS as identidades do contato (@c.us com/sem 9º dígito e @lid), pois o WhatsApp pode ter
// guardado a conversa antiga em uma identidade diferente da atual.
// Retorna { total, inbound, ultima, transcript } ou null se não foi possível verificar.
async function contarHistoricoWhatsApp(leadId, numeroBruto) {
    if (!isReady) return null;
    try {
        const ids = new Set();
        const row = leadId ? db.prepare('SELECT whatsapp_id FROM clinicas WHERE id = ?').get(leadId) : null;
        if (row && row.whatsapp_id) ids.add(row.whatsapp_id);

        let numStr = (numeroBruto || '').replace(/\D/g, '');
        if (numStr.startsWith('0')) numStr = numStr.substring(1);
        if (numStr.length === 10 || numStr.length === 11) numStr = '55' + numStr;
        const variantes = [numStr];
        if (numStr.length === 13) variantes.push(numStr.substring(0, 4) + numStr.substring(5));
        if (numStr.length === 12) variantes.push(numStr.substring(0, 4) + '9' + numStr.substring(4));
        for (const v of variantes) {
            ids.add(`${v}@c.us`);
            try { const nid = await client.getNumberId(v); if (nid) ids.add(nid._serialized); } catch (e) {}
        }
        try {
            const mapa = await client.getContactLidAndPhone([...ids]);
            for (const m of mapa || []) { if (m.lid) ids.add(m.lid); if (m.pn) ids.add(m.pn); }
        } catch (e) {}

        let todas = [];
        const vistos = new Set();
        const brutas = await client.pupPage.evaluate(async (idList) => {
            const { Chat } = window.require('WAWebCollections');
            const out = [];
            for (const id of idList) {
                const chat = Chat.get(id);
                if (!chat) continue;
                try {
                    const loader = window.require('WAWebChatLoadMessages');
                    for (let i = 0; i < 5 && chat.msgs.length < 100; i++) {
                        const r = await loader.loadEarlierMsgs({ chat });
                        if (!r || !r.length) break;
                    }
                } catch (e) {}
                for (const m of chat.msgs.getModelsArray()) {
                    out.push({ key: m.id?._serialized, fromMe: !!m.id?.fromMe, body: m.body || '', type: m.type, timestamp: m.t });
                }
            }
            return out;
        }, [...ids]);
        for (const m of [{ msgs: brutas }]) {
            const msgs = m.msgs;
            for (const m of msgs) {
                const key = m.key || m.id?._serialized;
                if (vistos.has(key)) continue;
                vistos.add(key);
                if (m.type === 'e2e_notification' || m.type === 'protocol' || m.type === 'notification_template') continue;
                if (!m.body && m.type !== 'vcard') continue;
                todas.push(m);
            }
        }
        todas.sort((a, b) => a.timestamp - b.timestamp);
        const ultima = todas.length ? new Date(todas[todas.length - 1].timestamp * 1000) : null;
        const transcript = todas.map(m => `[${new Date(m.timestamp * 1000).toLocaleString('pt-BR')}] ${m.fromMe ? 'CleanMed' : 'Lead'}: ${m.body}`).join('\n');
        logDebug(`[WhatsApp-Historico] ${numeroBruto}: ids verificados=${[...ids].join(', ')} | mensagens encontradas=${todas.length}`);
        return { total: todas.length, inbound: todas.filter(m => !m.fromMe).length, ultima, transcript };
    } catch (e) {
        logDebug(`[WhatsApp] Falha ao verificar histórico do chat (${numeroBruto}): ${e.message}`);
        if (/detached Frame|Session closed|Target closed/i.test(e.message || '') && !isRestarting) {
            logDebug('[WhatsApp] Página do WhatsApp Web travada (detached). Reiniciando cliente automaticamente...');
            isReady = false;
            reiniciarCliente().catch(() => {});
        }
        return null;
    }
}


async function enviarMensagem(leadId, numeroBruto, texto) {
    if (!isReady) {
        // Se o WhatsApp estiver terminando de autenticar, aguarda até 8 segundos antes de falhar
        let waitAttempts = 0;
        while (!isReady && waitAttempts < 16) {
            await new Promise(r => setTimeout(r, 500));
            waitAttempts++;
        }
        if (!isReady) {
            throw new Error('WhatsApp não está conectado. Acesse o Piloto Automático para escanear o QR Code.');
        }
    }

    let numStr = numeroBruto ? numeroBruto.replace(/\D/g, '') : '';
    if (!numStr) {
        throw new Error('Número de telefone não informado.');
    }
    if (numStr.startsWith('0') && !numStr.startsWith('00')) {
        numStr = numStr.substring(1);
    }
    if (numStr.length === 10 || numStr.length === 11) {
        numStr = '55' + numStr;
    }

    let attempt = 0;
    let lastError = null;

    while (attempt < 3) {
        try {
            attempt++;
            let chatId = null;

            // 1. OTIMIZAÇÃO: Se a clínica já tem o whatsapp_id (ou @lid) salvo no banco, usa diretamente
            if (leadId) {
                const leadRow = db.prepare('SELECT whatsapp_id FROM clinicas WHERE id = ?').get(leadId);
                if (leadRow && leadRow.whatsapp_id) {
                    chatId = leadRow.whatsapp_id;
                }
            }

            // 2. Se não tem whatsapp_id salvo, descobre o JID real via client.getNumberId
            if (!chatId) {
                try {
                    let numberId = await client.getNumberId(numStr);
                    if (!numberId) {
                        // Tenta variações do 9º dígito (Brasil)
                        if (numStr.length === 13 && numStr.charAt(4) === '9') {
                            const numSem9 = numStr.substring(0, 4) + numStr.substring(5);
                            numberId = await client.getNumberId(numSem9);
                        } else if (numStr.length === 12) {
                            const numCom9 = numStr.substring(0, 4) + '9' + numStr.substring(4);
                            numberId = await client.getNumberId(numCom9);
                        }
                    }

                    if (numberId && numberId._serialized) {
                        chatId = numberId._serialized;
                    } else {
                        console.log(`[WhatsApp] Número ${numStr} verificado via getNumberId: Não possui WhatsApp ativo.`);
                        throw new Error(`O número ${numeroBruto || numStr} não possui WhatsApp ativo.`);
                    }
                } catch (numErr) {
                    if (numErr.message && numErr.message.includes('não possui WhatsApp ativo')) {
                        throw numErr;
                    }
                    console.log(`[WhatsApp] getNumberId falhou/instável: ${numErr.message}. Usando formato fallback JID.`);
                    chatId = numStr.includes('@') ? numStr : (numStr + '@c.us');
                }
            }

            console.log(`[WhatsApp] Enviando mensagem para ${chatId}... (Tentativa ${attempt})`);
            
            let response;
            try {
                response = await client.sendMessage(chatId, texto);
            } catch (sendErr) {
                const isNoLid = sendErr.message && (
                    sendErr.message.includes('No LID for user') ||
                    sendErr.message.includes('user not found') ||
                    sendErr.message.includes('not-authorized')
                );

                if (isNoLid) {
                    if (leadId) {
                        try { db.prepare("UPDATE clinicas SET whatsapp_id = NULL WHERE id = ?").run(leadId); } catch(e) {}
                    }
                    throw new Error(`O número ${numeroBruto || numStr} não possui WhatsApp ativo.`);
                }

                // Fallback para nono dígito do Brasil caso o JID com 9 falhe por formatação
                if (numStr.length === 13 && numStr.charAt(4) === '9') {
                    const chatIdSem9 = numStr.substring(0, 4) + numStr.substring(5) + '@c.us';
                    console.log(`[WhatsApp] Fallback: tentando sem o 9 (${chatIdSem9})...`);
                    try {
                        response = await client.sendMessage(chatIdSem9, texto);
                        chatId = chatIdSem9;
                    } catch (fbErr) {
                        if (fbErr.message && (fbErr.message.includes('No LID for user') || fbErr.message.includes('user not found'))) {
                            if (leadId) {
                                try { db.prepare("UPDATE clinicas SET whatsapp_id = NULL WHERE id = ?").run(leadId); } catch(e) {}
                            }
                            throw new Error(`O número ${numeroBruto || numStr} não possui WhatsApp ativo.`);
                        }
                        throw fbErr;
                    }
                } else if (numStr.length === 12) {
                    const chatIdCom9 = numStr.substring(0, 4) + '9' + numStr.substring(4) + '@c.us';
                    console.log(`[WhatsApp] Fallback: tentando com o 9 (${chatIdCom9})...`);
                    try {
                        response = await client.sendMessage(chatIdCom9, texto);
                        chatId = chatIdCom9;
                    } catch (fbErr) {
                        if (fbErr.message && (fbErr.message.includes('No LID for user') || fbErr.message.includes('user not found'))) {
                            if (leadId) {
                                try { db.prepare("UPDATE clinicas SET whatsapp_id = NULL WHERE id = ?").run(leadId); } catch(e) {}
                            }
                            throw new Error(`O número ${numeroBruto || numStr} não possui WhatsApp ativo.`);
                        }
                        throw fbErr;
                    }
                } else {
                    throw sendErr;
                }
            }

            if (leadId) {
                const finalJid = response?.to || response?.id?.remote || chatId;
                db.prepare("UPDATE clinicas SET whatsapp_id = ?, last_contact_at = datetime('now'), first_contact_at = COALESCE(first_contact_at, datetime('now')) WHERE id = ?").run(finalJid, leadId);
            }

            const msgId = response?.id?._serialized || response?.id?.id || null;
            console.log(`[WhatsApp] Mensagem enviada com sucesso para ${chatId}. ID: ${msgId}`);
            return { success: true, id: msgId, chatId };
        } catch (err) {
            lastError = err;
            if (err.message && err.message.includes('não possui WhatsApp ativo')) {
                throw err;
            }

            const isFrameError = err.message && (
                err.message.includes('detached Frame') ||
                err.message.includes('Session closed') ||
                err.message.includes('Target closed') ||
                err.message.includes('Execution context was destroyed') ||
                err.message.includes('Protocol error')
            );

            if (isFrameError && attempt < 3) {
                console.log(`[WhatsApp] Frame instável na tentativa ${attempt}/3. Re-tentando em 1.5s...`);
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }

            if (isFrameError && !isRestarting) {
                console.log('[WhatsApp] Frame da sessão corrompido pós-tentativas. Reiniciando cliente...');
                reiniciarCliente();
            }

            console.error(`[WhatsApp] Erro ao enviar para ${numStr}:`, err.message || err);
            throw err;
        }
    }

    throw lastError || new Error('Falha ao enviar mensagem após 3 tentativas.');
}

// Iniciar o cliente ao carregar o módulo
initWhatsApp();

async function reiniciarCliente() {
    if (isRestarting) return;
    isRestarting = true;
    isReady = false;
    console.log('[WhatsApp] Reiniciando cliente com limpeza de processo...');
    
    try {
        if (client && client.pupBrowser) {
            try {
                const proc = client.pupBrowser.process();
                if (proc) proc.kill('SIGKILL');
            } catch(e) {}
        }
        if (client) {
            await client.destroy();
        }
    } catch(e) {
        console.error('[WhatsApp] Aviso ao encerrar cliente:', e.message);
    }

    // Remove lockfiles da sessão do Chromium para evitar "The browser is already running"
    try {
        const sessionDir = path.join(__dirname, '.wwebjs_auth', 'session-cleanmed-session');
        const lockPath = path.join(sessionDir, 'SingletonLock');
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        const lockCookie = path.join(sessionDir, 'SingletonCookie');
        if (fs.existsSync(lockCookie)) fs.unlinkSync(lockCookie);
        const lockSocket = path.join(sessionDir, 'SingletonSocket');
        if (fs.existsSync(lockSocket)) fs.unlinkSync(lockSocket);
    } catch(e) {}

    setTimeout(() => {
        isRestarting = false;
        initWhatsApp();
        console.log('[WhatsApp] Cliente reiniciado.');
    }, 2000);
}

async function sincronizarHistoricoChat(leadId) {
    if (!isReady) throw new Error('WhatsApp não está conectado.');
    
    const lead = db.prepare('SELECT * FROM clinicas WHERE id = ?').get(leadId);
    if (!lead) throw new Error('Clínica não encontrada.');

    let chatId = lead.whatsapp_id;

    if (!chatId && lead.tel) {
        let numStr = lead.tel.replace(/\D/g, '');
        if (numStr.startsWith('0') && !numStr.startsWith('00')) numStr = numStr.substring(1);
        if (numStr.length === 10 || numStr.length === 11) numStr = '55' + numStr;

        let numberId = await client.getNumberId(numStr);
        if (!numberId && numStr.length === 13 && numStr.charAt(4) === '9') {
            numberId = await client.getNumberId(numStr.substring(0, 4) + numStr.substring(5));
        }
        if (numberId) {
            chatId = numberId._serialized;
        }
    }

    if (!chatId) throw new Error('Número não possui WhatsApp ativo ou cadastrado.');

    db.prepare('UPDATE clinicas SET whatsapp_id = ? WHERE id = ?').run(chatId, lead.id);

    const chat = await client.getChatById(chatId);
    const msgs = await chat.fetchMessages({ limit: 50 });
    let importadas = 0;

    for (const m of msgs) {
        if (!m.body || m.isGroupMsg || m.isStatus || m.type === 'e2e_notification' || m.type === 'protocol') continue;
        salvarMensagem({
            clinicaId: lead.id,
            direction: m.fromMe ? 'outbound' : 'inbound',
            content: m.body,
            whatsappMessageId: m.id?._serialized || m.id?.id || null,
            sender: m.fromMe ? 'human' : 'lead',
            source: m.fromMe ? 'whatsapp_app' : 'whatsapp'
        });
        importadas++;
    }

    return { total: msgs.length, importadas };
}

const { extrairWhatsAppDoSite } = require('./site-scraper');

async function verificarWhatsAppNumero(numeroBruto) {
    if (!isReady || !client) {
        return { temWhatsApp: false, motivo: 'WhatsApp desconectado' };
    }
    let numStr = numeroBruto ? String(numeroBruto).replace(/\D/g, '') : '';
    if (!numStr) return { temWhatsApp: false, motivo: 'Número vazio' };

    if (numStr.startsWith('0') && !numStr.startsWith('00')) numStr = numStr.substring(1);
    if (numStr.length === 10 || numStr.length === 11) numStr = '55' + numStr;

    try {
        let numberId = await client.getNumberId(numStr);
        if (!numberId) {
            if (numStr.length === 13 && numStr.charAt(4) === '9') {
                const numSem9 = numStr.substring(0, 4) + numStr.substring(5);
                numberId = await client.getNumberId(numSem9);
            } else if (numStr.length === 12) {
                const numCom9 = numStr.substring(0, 4) + '9' + numStr.substring(4);
                numberId = await client.getNumberId(numCom9);
            }
        }

        if (numberId && numberId._serialized) {
            return {
                temWhatsApp: true,
                whatsappId: numberId._serialized,
                numeroFormatado: numberId.user || numStr
            };
        }
    } catch(e) {}

    return { temWhatsApp: false, motivo: 'Não registrado no WhatsApp' };
}

async function enriquecerEValidarLead(lead) {
    let resultLead = { ...lead };
    let whatsappValido = 0;
    let telOrigem = resultLead.tel_origem || 'google_maps';
    let whatsappId = resultLead.whatsapp_id || null;

    // 1. Verificar o telefone atual via WhatsApp API
    if (resultLead.tel && isReady) {
        const check = await verificarWhatsAppNumero(resultLead.tel);
        if (check.temWhatsApp) {
            whatsappValido = 1;
            whatsappId = check.whatsappId;
        }
    }

    // 2. Se o telefone atual NÃO tem WhatsApp E o lead possui um site:
    // Tentar resgatar link wa.me do site!
    if (!whatsappValido && resultLead.site) {
        try {
            const siteRes = await extrairWhatsAppDoSite(resultLead.site);
            if (siteRes && siteRes.tel) {
                let checkSite = { temWhatsApp: true };
                if (isReady) {
                    checkSite = await verificarWhatsAppNumero(siteRes.tel);
                }
                if (checkSite.temWhatsApp) {
                    resultLead.tel = siteRes.tel;
                    telOrigem = siteRes.origem || 'site_wame';
                    whatsappValido = 1;
                    if (checkSite.whatsappId) whatsappId = checkSite.whatsappId;
                    console.log(`[Lead Enriquecido] ${resultLead.nome}: Telefone resgatado do site (${siteRes.tel})`);
                }
            }
        } catch(e) {}
    }

    resultLead.whatsapp_valido = whatsappValido;
    resultLead.tel_origem = telOrigem;
    if (whatsappId) resultLead.whatsapp_id = whatsappId;

    return resultLead;
}

module.exports = {
    cancelarDebounceLead,
    getQrCode,
    enviarMensagem,
    contarHistoricoWhatsApp,
    reiniciarCliente,
    notificarVendedor,
    salvarMensagem,
    sincronizarHistoricoChat,
    verificarWhatsAppNumero,
    enriquecerEValidarLead
};
