const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { recomendarPlano, gerarOverview, gerarROI, gerarProposal, gerarCompetitorAnalysis, gerarStrategyHTML } = require('../gerador-diagnostico');

// Criar diagnóstico e gerar documentos
router.post('/:clinicaId', async (req, res) => {
  const { respostas } = req.body;
  if (!respostas) return res.status(400).json({ erro: 'Respostas são obrigatórias' });

  const clinica = db.prepare('SELECT * FROM clinicas WHERE id = ?').get(req.params.clinicaId);
  if (!clinica) return res.status(404).json({ erro: 'Clínica não encontrada' });

  try {
    const plano = recomendarPlano(respostas);
    const usaSistema = respostas.bloco5?.usa_sistema === 'sim';

    // Gera documentos em paralelo
    const [overview, roi, proposal] = await Promise.all([
      gerarOverview(respostas),
      gerarROI(respostas),
      gerarProposal(respostas, plano),
    ]);

    // Competitor analysis só se usa sistema
    let competitor = null;
    if (usaSistema) {
      competitor = await gerarCompetitorAnalysis(respostas);
    }

    const strategyHtml = gerarStrategyHTML(clinica.nome, overview, roi, plano, respostas);

    // Salva no banco
    const stmt = db.prepare(`
      INSERT INTO diagnosticos (clinica_id, respostas, overview, roi, proposal, competitor_analysis, strategy_html, plano_recomendado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      clinica.id,
      JSON.stringify(respostas),
      overview,
      roi,
      proposal,
      competitor,
      strategyHtml,
      plano
    );

    // Atualiza status da clínica
    db.prepare("UPDATE clinicas SET status = 'diagnostico' WHERE id = ?").run(clinica.id);

    res.json({
      id: result.lastInsertRowid,
      plano_recomendado: plano,
      overview, roi, proposal, competitor_analysis: competitor, strategy_html: strategyHtml
    });
  } catch (error) {
    console.error('Erro ao gerar diagnóstico:', error);
    res.status(500).json({ erro: 'Falha ao gerar diagnóstico: ' + error.message });
  }
});

// Buscar diagnóstico de uma clínica
router.get('/:clinicaId', (req, res) => {
  const diag = db.prepare('SELECT * FROM diagnosticos WHERE clinica_id = ? ORDER BY criado_em DESC LIMIT 1').get(req.params.clinicaId);
  if (!diag) return res.status(404).json({ erro: 'Diagnóstico não encontrado' });
  res.json(diag);
});

// Servir o HTML da apresentação
router.get('/:clinicaId/html', (req, res) => {
  const diag = db.prepare('SELECT strategy_html FROM diagnosticos WHERE clinica_id = ? ORDER BY criado_em DESC LIMIT 1').get(req.params.clinicaId);
  if (!diag || !diag.strategy_html) return res.status(404).send('Apresentação não encontrada');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(diag.strategy_html);
});

module.exports = router;
