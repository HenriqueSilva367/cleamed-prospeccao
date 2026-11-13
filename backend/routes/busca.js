const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const db = require('../db/database');
const { applyLeadScore, onlyDigits, isBlacklistedLead } = require('../lead-scoring');
const { enriquecerEValidarLead } = require('../whatsapp');

// Busca clínicas reais via Outscraper (Google Maps)
// Docs: https://app.outscraper.com/api-docs
router.post('/', async (req, res) => {
  const { cidade, bairro, tipo, quantidade = 20 } = req.body;
  if (!cidade || !tipo) return res.status(400).json({ erro: 'cidade e tipo são obrigatórios' });

  const apiKey = process.env.OUTSCRAPER_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      erro: 'OUTSCRAPER_API_KEY não configurada.',
      instrucoes: 'Crie conta gratuita em https://app.outscraper.com, vá em API Keys e adicione ao backend/.env'
    });
  }

  try {
    const fetch = (await import('node-fetch')).default;

    const query = `${tipo} ${bairro ? bairro + ' ' : ''}${cidade} Brasil`;
    const params = new URLSearchParams({
      query,
      language: 'pt',
      region: 'BR',
      limit: String(quantidade),
      async: 'false'
    });

    const url = `https://api.app.outscraper.com/maps/search-v3?${params}`;
    const response = await fetch(url, {
      headers: { 'X-API-KEY': apiKey }
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(400).json({ erro: `Outscraper erro ${response.status}: ${err}` });
    }

    const data = await response.json();
    const places = data.data?.[0] || [];

    const rawResultados = places.map(p => ({
      nome: p.name || '',
      tel: p.phone || p.phone_international || '',
      bairro: p.district || p.neighborhood || bairro || cidade,
      endereco: p.full_address || p.address || '',
      email: Array.isArray(p.emails_and_contacts?.emails)
        ? p.emails_and_contacts.emails[0] || ''
        : '',
      site: p.site || p.website || '',
      avaliacao: p.rating ? String(p.rating) : '',
      total_avaliacoes: p.reviews || 0,
      google_place_id: p.place_id || ''
    }));

    // Enriquecimento e validação de WhatsApp em paralelo
    const resultados = await Promise.all(rawResultados.map(lead => enriquecerEValidarLead(lead)));

    res.json({ resultados, total: resultados.length });

  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao conectar com Outscraper: ' + e.message });
  }
});

router.post('/local', async (req, res) => {
  const { cidade, bairro, tipo, quantidade = 10, flags = '' } = req.body;
  if (!cidade || !tipo) return res.status(400).json({ erro: 'cidade e tipo são obrigatórios' });

  const query = `${tipo} em ${bairro ? bairro + ', ' : ''}${cidade} ${flags}`.trim();
  const scriptPath = path.join(__dirname, '../../frontend/scripts/scraper.js');
  
  console.log(`[Busca Local] Iniciando para: ${query} (Limite: ${quantidade})`);
  console.log(`[Busca Local] Script: ${scriptPath}`);
  
  try {
    db.prepare('INSERT INTO historico_buscas (cidade, tipo, quantidade) VALUES (?, ?, ?)').run(cidade, tipo, quantidade);
  } catch (err) {
    console.error('[Busca Local] Erro ao salvar histórico:', err);
  }
  
  const scraper = spawn('node', [scriptPath, query, quantidade]);

  scraper.stdout.on('data', (data) => console.log(`[Scraper STDOUT]: ${data}`));
  scraper.stderr.on('data', (data) => console.error(`[Scraper STDERR]: ${data}`));

  const waitForFinish = new Promise((resolve) => {
    scraper.on('close', (code) => {
      console.log(`[Busca Local] Scraper fechou com código: ${code}`);
      resolve(code);
    });
  });

  const exitCode = await waitForFinish;

  if (exitCode !== 0) {
    return res.status(500).json({ erro: 'O robô de busca falhou ao executar.', code: exitCode });
  }

  const outputPath = path.join(__dirname, '../../frontend/leads_output.json');
  console.log(`[Busca Local] Lendo resultados de: ${outputPath}`);
  
  const fs = require('fs');
  let processedLeads = [];
  let novosCount = 0;
  let atualizadosCount = 0;
  let rejeitadosCount = 0;

  const blacklist = ['sus', 'ubs', 'posto de saúde', 'posto de saude', 'hospital público', 'odontocompany', 'odontoclinic', 'prefeitura', 'amorsaude', 'amor saude', 'amor saúde'];

  
  try {
    if (fs.existsSync(outputPath)) {
      const raw = fs.readFileSync(outputPath, 'utf8');
      const leads = JSON.parse(raw);
      
      console.log(`[Busca Local] Processando e validando WhatsApp de ${leads.length} leads...`);
      
      const checkExists = db.prepare(`SELECT id, status FROM clinicas WHERE google_place_id = ? OR (tel = ? AND tel != '') OR (nome = ? AND cidade = ?)`);
      const insert = db.prepare(`
        INSERT INTO clinicas (nome, tel, endereco, site, avaliacao, total_avaliacoes, google_place_id, origem, categoria, cidade, lead_priority, fit_score, score_reason, whatsapp_valido, tel_origem, whatsapp_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'google_maps_scraper', ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(google_place_id) DO UPDATE SET
            tel=excluded.tel,
            endereco=excluded.endereco,
            site=excluded.site,
            avaliacao=excluded.avaliacao,
            total_avaliacoes=excluded.total_avaliacoes,
            categoria=excluded.categoria,
            cidade=excluded.cidade,
            fit_score=excluded.fit_score,
            score_reason=excluded.score_reason,
            whatsapp_valido=excluded.whatsapp_valido,
            tel_origem=excluded.tel_origem,
            whatsapp_id=COALESCE(excluded.whatsapp_id, clinicas.whatsapp_id)
      `);

      for (const lead of leads) {
        // FILTRO DE LIXO E FRANQUIAS (SUPER-BLACKLIST)
        const blCheck = isBlacklistedLead(lead);
        if (blCheck.blocked) {
          console.log(`[Busca Local] Rejeitado pela Blacklist (${blCheck.reason}): ${lead.nome}`);
          rejeitadosCount++;
          continue;
        }

        const telNumerico = onlyDigits(lead.tel || '');
        const existing = checkExists.get(lead.google_place_id, telNumerico, lead.nome, cidade);
        if (existing && existing.status === 'disabled') {
          console.log(`[Busca Local] Pulando lead desativado: ${lead.nome}`);
          continue;
        }

        if (existing) {
          atualizadosCount++;
        } else {
          novosCount++;
        }

        // 1. Enriquecimento e validação de WhatsApp em tempo real
        const leadEnriquecido = await enriquecerEValidarLead({ ...lead, categoria: tipo, cidade });

        // 2. Pontuação de Fit com os dados atualizados
        const scoredLead = applyLeadScore(leadEnriquecido);

        // 3. Salvar no banco
        insert.run(
          scoredLead.nome,
          scoredLead.tel,
          scoredLead.endereco,
          scoredLead.site,
          scoredLead.avaliacao,
          scoredLead.total_avaliacoes,
          scoredLead.google_place_id,
          tipo,
          cidade,
          scoredLead.lead_priority,
          scoredLead.fit_score,
          scoredLead.score_reason,
          scoredLead.whatsapp_valido || 0,
          scoredLead.tel_origem || 'google_maps',
          scoredLead.whatsapp_id || null
        );

        processedLeads.push({ ...scoredLead, isNovo: !existing });
      }
      
      // Limpa o arquivo para a próxima busca
      fs.unlinkSync(outputPath);
    } else {
      console.warn(`[Busca Local] Arquivo de saída não encontrado: ${outputPath}`);
    }
  } catch (e) {
    console.error('[Busca Local] Erro ao processar dados:', e);
    return res.status(500).json({ erro: 'Erro ao processar dados do robô.', detalhe: e.message });
  }

  res.json({ 
    mensagem: 'Busca finalizada com sucesso!',
    resultados: processedLeads,
    total: processedLeads.length,
    novos: novosCount,
    atualizados: atualizadosCount,
    rejeitados: rejeitadosCount
  });
});

router.get('/historico', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT cidade, tipo, quantidade, MAX(criado_em) as ultimo_uso 
      FROM historico_buscas 
      GROUP BY cidade 
      ORDER BY ultimo_uso DESC 
      LIMIT 10
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('[Busca Local] Erro ao buscar histórico:', err);
    res.status(500).json({ erro: 'Erro ao buscar histórico' });
  }
});

module.exports = router;
