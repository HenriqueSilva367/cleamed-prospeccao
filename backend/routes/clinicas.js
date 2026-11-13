const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { enviarMensagem, salvarMensagem, sincronizarHistoricoChat, cancelarDebounceLead, notificarVendedor } = require('../whatsapp');
const { marcarHandoffNotificado } = require('../handoff');
const { applyLeadScore } = require('../lead-scoring');

const STATUS_VALIDOS = ['pending', 'paused_site', 'sent', 'interviewing', 'indicou_responsavel', 'reply', 'reuniao_agendada', 'demo_realizada', 'negociando', 'diagnostico', 'proposta', 'converted', 'disabled'];

// Listar todas
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM clinicas ORDER BY criado_em DESC').all();
  res.json(rows);
});

// Estatísticas (Dashboard)
router.get('/stats', (req, res) => {
  try {
    const pendentes = db.prepare("SELECT count(*) as count FROM clinicas WHERE status IN ('pending', 'paused_site')").get().count;
    const pendentesComSite = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'paused_site'").get().count;
    const enviados = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'sent'").get().count;
    const desativados = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'disabled'").get().count;
    const responderam = db.prepare("SELECT count(*) as count FROM clinicas WHERE status IN ('reply', 'interviewing', 'reuniao_agendada', 'demo_realizada', 'negociando', 'diagnostico', 'proposta', 'converted')").get().count;
    const total = db.prepare("SELECT count(*) as count FROM clinicas").get().count;
    const high = db.prepare("SELECT count(*) as count FROM clinicas WHERE lead_priority = 'HIGH'").get().count;
    const medium = db.prepare("SELECT count(*) as count FROM clinicas WHERE lead_priority = 'MEDIUM'").get().count;
    const low = db.prepare("SELECT count(*) as count FROM clinicas WHERE lead_priority = 'LOW' OR lead_priority IS NULL").get().count;

    // Métricas de conversão
    const emEntrevista = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'interviewing'").get().count;
    const emReply = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'reply'").get().count;
    const reuniaoAgendada = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'reuniao_agendada'").get().count;
    const demoRealizada = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'demo_realizada'").get().count;
    const negociando = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'negociando'").get().count;
    const convertidos = db.prepare("SELECT count(*) as count FROM clinicas WHERE status = 'converted'").get().count;
    const taxaResposta = enviados > 0 ? Math.round((responderam / (enviados + responderam)) * 100) : 0;

    // Conversão por categoria
    const porCategoria = db.prepare(`
      SELECT categoria, 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('reply','interviewing','reuniao_agendada','demo_realizada','negociando','diagnostico','proposta','converted') THEN 1 ELSE 0 END) as responderam
      FROM clinicas WHERE status != 'disabled' AND status != 'pending' AND status != 'paused_site'
      GROUP BY categoria ORDER BY responderam DESC
    `).all();

    // Conversão por cidade
    const porCidade = db.prepare(`
      SELECT cidade,
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('reply','interviewing','reuniao_agendada','demo_realizada','negociando','diagnostico','proposta','converted') THEN 1 ELSE 0 END) as responderam
      FROM clinicas WHERE cidade IS NOT NULL AND cidade != '' AND status != 'disabled'
      GROUP BY cidade ORDER BY responderam DESC
    `).all();

    res.json({ 
      pendentes, pendentesComSite, enviados, desativados, responderam, total, high, medium, low,
      emEntrevista, emReply, reuniaoAgendada, demoRealizada, negociando, convertidos, taxaResposta,
      porCategoria, porCidade
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar estatísticas' });
  }
});

// Adicionar uma
router.post('/', (req, res) => {
  const { nome, tel, bairro, email, endereco, site, avaliacao, origem, categoria, cidade, lead_priority } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  const lead = applyLeadScore({ nome, tel, bairro, email, endereco, site, avaliacao, origem, categoria, cidade, lead_priority });
  const stmt = db.prepare(
    `INSERT INTO clinicas (nome, tel, bairro, email, endereco, site, avaliacao, origem, categoria, cidade, lead_priority, fit_score, score_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(lead.nome, lead.tel||'', lead.bairro||'', lead.email||'', lead.endereco||'', lead.site||'', lead.avaliacao||'', lead.origem||'manual', lead.categoria||'', lead.cidade||'', lead.lead_priority||'LOW', lead.fit_score||0, lead.score_reason||'');
  res.json({ id: result.lastInsertRowid, ...lead });
});

// Adicionar vários de uma vez
router.post('/bulk', (req, res) => {
  const { clinicas } = req.body;
  if (!Array.isArray(clinicas)) return res.status(400).json({ erro: 'Envie um array de clínicas' });
  const stmt = db.prepare(
    `INSERT INTO clinicas (nome, tel, bairro, email, endereco, site, avaliacao, origem, categoria, cidade, lead_priority, fit_score, score_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((items) => {
    for (const c of items) {
      const lead = applyLeadScore(c);
      stmt.run(lead.nome, lead.tel||'', lead.bairro||'', lead.email||'', lead.endereco||'', lead.site||'', lead.avaliacao||'', lead.origem||'manual', lead.categoria||'', lead.cidade||'', lead.lead_priority||'LOW', lead.fit_score||0, lead.score_reason||'');
    }
  });
  insertMany(clinicas);
  res.json({ inseridos: clinicas.length });
});

// Editar clínica
router.put('/:id', (req, res) => {
  const { nome, tel, bairro, email, endereco, site, avaliacao, categoria, cidade, lead_priority } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  const lead = applyLeadScore({ nome, tel, bairro, email, endereco, site, avaliacao, categoria, cidade, lead_priority });
  db.prepare(
    `UPDATE clinicas SET nome=?, tel=?, bairro=?, email=?, endereco=?, site=?, avaliacao=?, categoria=?, cidade=?, lead_priority=?, fit_score=?, score_reason=? WHERE id=?`
  ).run(lead.nome, lead.tel||'', lead.bairro||'', lead.email||'', lead.endereco||'', lead.site||'', lead.avaliacao||'', lead.categoria||'', lead.cidade||'', lead.lead_priority||'LOW', lead.fit_score||0, lead.score_reason||'', req.params.id);
  res.json({ ok: true });
});

// Atualizar status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
  const pausarIa = ['reply', 'reuniao_agendada', 'demo_realizada', 'negociando', 'diagnostico', 'proposta', 'converted'].includes(status);
  if (pausarIa) {
    db.prepare('UPDATE clinicas SET status = ?, ia_ativa = 0 WHERE id = ?').run(status, req.params.id);
    if (cancelarDebounceLead) {
      cancelarDebounceLead(parseInt(req.params.id, 10));
    }
  } else {
    db.prepare('UPDATE clinicas SET status = ? WHERE id = ?').run(status, req.params.id);
  }
  res.json({ ok: true, ia_pausada: pausarIa });
});

// Reenviar notificação de um handoff pendente, sem reativar a IA.
router.post('/:id/handoff/notificar', async (req, res) => {
  const lead = db.prepare('SELECT * FROM clinicas WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ erro: 'Clínica não encontrada' });
  if (!lead.handoff_at) return res.status(409).json({ erro: 'Este lead ainda não possui handoff registrado.' });
  if (lead.handoff_notified_at) return res.status(409).json({ erro: 'A notificação deste handoff já foi enviada.' });

  const resultado = await notificarVendedor(lead);
  if (!resultado.sent) {
    return res.status(503).json({ erro: resultado.reason || 'Não foi possível enviar a notificação.' });
  }

  marcarHandoffNotificado(db, lead.id);
  const atualizado = db.prepare('SELECT handoff_notified_at FROM clinicas WHERE id = ?').get(lead.id);
  res.json({ ok: true, handoff_notified_at: atualizado.handoff_notified_at });
});

// Ativar ou pausar interferência da IA para uma clínica específica
router.patch('/:id/ia', (req, res) => {
  const { ia_ativa } = req.body;
  const valor = (ia_ativa === false || ia_ativa === 0 || ia_ativa === '0') ? 0 : 1;
  
  db.prepare('UPDATE clinicas SET ia_ativa = ? WHERE id = ?').run(valor, req.params.id);
  
  if (valor === 0 && cancelarDebounceLead) {
    cancelarDebounceLead(parseInt(req.params.id, 10));
  }
  
  const lead = db.prepare('SELECT id, nome, status, IFNULL(ia_ativa, 1) as ia_ativa FROM clinicas WHERE id = ?').get(req.params.id);
  res.json({ ok: true, ia_ativa: valor, lead });
});

// Atualizar próxima ação e qualificação
router.patch('/:id/proxima-acao', (req, res) => {
  const { proxima_acao, proxima_acao_data, nome_dono, sistema_atual, dor_detectada, lead_priority } = req.body;
  const atual = db.prepare('SELECT nome_dono, sistema_atual, dor_detectada, lead_priority FROM clinicas WHERE id = ?').get(req.params.id);
  if (!atual) return res.status(404).json({ erro: 'Clínica não encontrada' });

  db.prepare(`
    UPDATE clinicas
    SET proxima_acao = ?,
        proxima_acao_data = ?,
        nome_dono = ?,
        sistema_atual = ?,
        dor_detectada = ?,
        lead_priority = ?
    WHERE id = ?
  `).run(
    proxima_acao || null,
    proxima_acao_data || null,
    nome_dono !== undefined ? (nome_dono || null) : atual.nome_dono,
    sistema_atual !== undefined ? (sistema_atual || null) : atual.sistema_atual,
    dor_detectada !== undefined ? (dor_detectada || null) : atual.dor_detectada,
    lead_priority || atual.lead_priority || 'MEDIUM',
    req.params.id
  );
  res.json({ ok: true });
});

// Deletar
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM clinicas WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM notas WHERE clinica_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Enviar mensagem manual
router.post('/:id/mensagem', async (req, res) => {
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ erro: 'Texto é obrigatório' });
  
  const lead = db.prepare('SELECT * FROM clinicas WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ erro: 'Clínica não encontrada' });
  
  try {
    const resultado = await enviarMensagem(lead.id, lead.tel, texto);
    
    // PERSISTÊNCIA: salva mensagem manual no banco
    salvarMensagem({
      clinicaId: lead.id,
      direction: 'outbound',
      content: texto,
      whatsappMessageId: resultado?.id || null,
      sender: 'human',
      source: 'manual'
    });
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao enviar mensagem manual:', error.message || error);
    const isNumeroInvalido = error.message && (
      error.message.includes('não possui WhatsApp ativo') ||
      error.message.includes('No LID for user')
    );
    if (isNumeroInvalido) {
      try {
        db.prepare("UPDATE clinicas SET status = 'disabled' WHERE id = ?").run(lead.id);
      } catch(e) {}
      return res.status(400).json({ erro: `O número (${lead.tel || 'informado'}) não possui WhatsApp ativo.` });
    }
    res.status(500).json({ erro: 'Falha ao enviar mensagem: ' + error.message });
  }
});

// Listar histórico de mensagens de uma clínica
router.get('/:id/messages', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const messages = db.prepare(
      'SELECT * FROM messages WHERE clinica_id = ? ORDER BY timestamp ASC LIMIT ?'
    ).all(req.params.id, limit);
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ erro: 'Erro ao buscar mensagens' });
  }
});

// Listar/buscar TODAS as mensagens com dados da clínica (por nome, número ou conteúdo)
router.get('/messages/search/all', (req, res) => {
  try {
    const query = req.query.q ? `%${req.query.q.trim()}%` : '%';
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    const rows = db.prepare(`
      SELECT 
        m.*,
        c.nome as clinica_nome,
        c.tel as clinica_tel,
        c.categoria as clinica_categoria,
        c.status as clinica_status,
        c.lead_priority as clinica_priority,
        IFNULL(c.ia_ativa, 1) as clinica_ia_ativa
      FROM messages m
      JOIN clinicas c ON c.id = m.clinica_id
      WHERE c.nome LIKE ? 
         OR c.tel LIKE ? 
         OR m.content LIKE ?
      ORDER BY m.timestamp DESC
      LIMIT ?
    `).all(query, query, query, limit);

    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar todas as mensagens:', error);
    res.status(500).json({ erro: 'Erro ao buscar mensagens' });
  }
});

// Sincronizar histórico retroativo do WhatsApp para um lead
router.post('/:id/sync-history', async (req, res) => {
  try {
    const resultado = await sincronizarHistoricoChat(req.params.id);
    res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error('Erro ao sincronizar histórico:', error);
    res.status(500).json({ erro: error.stack || error.message || String(error) });
  }
});

// --- NOTAS ---

// Listar notas de uma clínica
router.get('/:id/notas', (req, res) => {
  try {
    const notas = db.prepare('SELECT * FROM notas WHERE clinica_id = ? ORDER BY criado_em DESC').all(req.params.id);
    res.json(notas);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar notas' });
  }
});

// Adicionar nota
router.post('/:id/notas', (req, res) => {
  const { texto, tipo } = req.body;
  if (!texto) return res.status(400).json({ erro: 'Texto é obrigatório' });
  try {
    const result = db.prepare('INSERT INTO notas (clinica_id, texto, tipo) VALUES (?, ?, ?)').run(req.params.id, texto, tipo || 'nota');
    res.json({ id: result.lastInsertRowid, ok: true });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao salvar nota' });
  }
});

// Deletar nota
router.delete('/:id/notas/:notaId', (req, res) => {
  db.prepare('DELETE FROM notas WHERE id = ? AND clinica_id = ?').run(req.params.notaId, req.params.id);
  res.json({ ok: true });
});

// Exportar CSV
router.get('/export/csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM clinicas').all();
  const header = 'ID,Nome,Telefone,Bairro,Cidade,Email,Endereco,Site,Avaliacao,Status,Criado em\n';
  const body = rows.map(r =>
    `${r.id},"${r.nome}","${r.tel}","${r.bairro}","${r.cidade||''}","${r.email}","${r.endereco}","${r.site||''}","${r.avaliacao}","${r.status}","${r.criado_em}"`
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=clinicas.csv');
  res.send(header + body);
});

// --- ENRIQUECIMENTO DE REVIEWS (Fase 1 - Prospecção Personalizada) ---

// Enriquecer um lead específico com reviews do Google Maps
router.post('/:id/enriquecer', async (req, res) => {
  const lead = db.prepare('SELECT * FROM clinicas WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ erro: 'Clínica não encontrada' });

  try {
    const { enriquecerLeadComReviews } = require('../review-scraper');
    const dados = await enriquecerLeadComReviews(lead);

    db.prepare(`
      UPDATE clinicas SET
        reviews_raw = ?,
        reviews_resumo = ?,
        pontos_fortes = ?,
        pontos_fracos = ?,
        especialidades = ?,
        nome_dono = COALESCE(?, nome_dono),
        enriquecido_em = ?
      WHERE id = ?
    `).run(
      dados.reviews_raw,
      dados.reviews_resumo,
      dados.pontos_fortes,
      dados.pontos_fracos,
      dados.especialidades,
      dados.nome_dono || null,
      dados.enriquecido_em,
      lead.id
    );

    res.json({ ok: true, dados });
  } catch (error) {
    console.error('Erro ao enriquecer lead:', error);
    res.status(500).json({ erro: 'Erro ao enriquecer: ' + error.message });
  }
});

// Ver dados enriquecidos de um lead
router.get('/:id/enriquecimento', (req, res) => {
  const lead = db.prepare(`
    SELECT id, nome, categoria, cidade, avaliacao, total_avaliacoes,
           reviews_resumo, pontos_fortes, pontos_fracos, especialidades,
           nome_dono, enriquecido_em
    FROM clinicas WHERE id = ?
  `).get(req.params.id);
  if (!lead) return res.status(404).json({ erro: 'Clínica não encontrada' });
  
  let reviews_raw = [];
  try {
    reviews_raw = lead.reviews_raw ? JSON.parse(lead.reviews_raw) : [];
  } catch(e) {}

  res.json({ ...lead, reviews_raw });
});

module.exports = router;

