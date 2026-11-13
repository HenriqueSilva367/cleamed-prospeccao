/**
 * review-scraper.js
 * 
 * Módulo de enriquecimento de leads via scraping de avaliações do Google Maps.
 * Usa Playwright (mesmo engine do scraper principal) para entrar na ficha do Maps,
 * abrir a aba de reviews e extrair:
 *   - Até 15 reviews recentes (texto, nota, data, resposta do dono)
 *   - Especialidades / serviços mencionados
 *   - Nome do proprietário (das respostas às reviews)
 *
 * Depois usa o Gemini para gerar um resumo estruturado:
 *   - Pontos fortes (elogios recorrentes)
 *   - Pontos fracos (reclamações recorrentes)
 *   - Resumo geral para abordagem comercial
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { OpenAI } = require('openai');

chromium.use(stealth);

const MAX_REVIEWS = 15;
const PAGE_TIMEOUT = 8000;

/**
 * Busca a URL do Google Maps para uma clínica pelo nome + cidade.
 * Usado quando o google_place_id armazenado não é uma URL válida.
 */
async function buildMapsUrl(lead) {
  // Se o google_place_id já é um link válido do Maps
  if (lead.google_place_id && lead.google_place_id.startsWith('http')) {
    return lead.google_place_id;
  }

  // Se temos o place_id real do Google (formato ChIJ...)
  if (lead.google_place_id && lead.google_place_id.startsWith('ChIJ')) {
    return `https://www.google.com/maps/place/?q=place_id:${lead.google_place_id}`;
  }

  // Fallback: busca pelo nome + cidade
  const searchQuery = `${lead.nome} ${lead.cidade || ''} ${lead.bairro || ''}`.trim();
  return `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
}

/**
 * Abre a ficha do Google Maps e extrai reviews + dados extras.
 * Retorna um objeto com: reviews[], ownerName, specialties[], rawData
 */
async function scrapeReviews(lead) {
  const mapsUrl = await buildMapsUrl(lead);
  console.log(`[ReviewScraper] Abrindo: ${mapsUrl}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'pt-BR'
    });
    const page = await context.newPage();

    // Navega para o Maps
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Se caiu numa página de busca (múltiplos resultados), clica no primeiro
    const isSearchPage = await page.evaluate(() => {
      return !!document.querySelector('div[role="feed"]');
    });

    if (isSearchPage) {
      console.log('[ReviewScraper] Página de busca detectada, clicando no primeiro resultado...');
      const firstResult = await page.$('div[role="article"] a, .Nv2YX a');
      if (firstResult) {
        await firstResult.click();
        await page.waitForTimeout(4000);
      } else {
        console.log('[ReviewScraper] Nenhum resultado encontrado na busca.');
        return null;
      }
    }

    // Extrai dados básicos da ficha (especialidades, categoria)
    const fichaData = await page.evaluate(() => {
      const data = { specialties: [], category: '' };
      
      // Categoria principal (ex: "Clínica médica", "Dentista")
      const categoryEl = document.querySelector('button[jsaction*="category"]');
      if (categoryEl) data.category = categoryEl.textContent.trim();
      
      // Botões de subcategorias/serviços
      const serviceButtons = document.querySelectorAll('[data-item-id*="service"], .RcCsl button, .E0DTEd');
      serviceButtons.forEach(btn => {
        const text = btn.textContent.trim();
        if (text && text.length < 60) data.specialties.push(text);
      });

      // Tenta pegar da "Sobre" ou descrição
      const aboutSection = document.querySelector('.WeS02d, .PYvSYb, [data-attrid*="description"]');
      if (aboutSection) {
        const aboutText = aboutSection.textContent.trim();
        if (aboutText.length < 500) data.specialties.push('ABOUT: ' + aboutText);
      }

      return data;
    });

    // Clica na aba/botão de avaliações para abrir as reviews
    const reviewsOpened = await openReviewsTab(page);
    if (!reviewsOpened) {
      console.log('[ReviewScraper] Não conseguiu abrir aba de avaliações. Tentando extrair do que tem...');
    }

    // Rola a lista de reviews para carregar mais
    if (reviewsOpened) {
      await scrollReviews(page);
    }

    // Extrai as reviews
    const reviewsData = await page.evaluate((maxReviews) => {
      const reviews = [];
      // Seletores de review do Google Maps (podem mudar com atualizações do Google)
      const reviewEls = document.querySelectorAll('[data-review-id], .jftiEf, div.GHT2ce');
      
      for (let i = 0; i < Math.min(reviewEls.length, maxReviews); i++) {
        const el = reviewEls[i];
        
        // Tenta expandir o texto truncado ("Mais")
        const moreBtn = el.querySelector('button.w8nwRe, button[aria-label*="Mais"], .review-more-link');
        if (moreBtn) {
          try { moreBtn.click(); } catch(e) {}
        }

        // Nome do avaliador
        const authorEl = el.querySelector('.d4r55, .WNxzHc a, [data-review-id] .TSUbDb a');
        const author = authorEl ? authorEl.textContent.trim() : '';

        // Nota (estrelas)
        const ratingEl = el.querySelector('.kvMYJc, [aria-label*="estrela"], [role="img"]');
        let rating = 0;
        if (ratingEl) {
          const ariaLabel = ratingEl.getAttribute('aria-label') || '';
          const match = ariaLabel.match(/(\d)/);
          if (match) rating = parseInt(match[1]);
        }

        // Texto da review
        const textEl = el.querySelector('.wiI7pd, .MyEned span, .review-full-text');
        const text = textEl ? textEl.textContent.trim() : '';

        // Data relativa
        const dateEl = el.querySelector('.rsqaWe, .xRkPPb, .dehysf');
        const date = dateEl ? dateEl.textContent.trim() : '';

        // Resposta do proprietário
        const ownerResponseEl = el.querySelector('.CDe7pd, .d0IDue .wiI7pd, [data-owner-response]');
        const ownerResponse = ownerResponseEl ? ownerResponseEl.textContent.trim() : '';

        // Nome do proprietário que respondeu
        const ownerNameEl = el.querySelector('.CDe7pd .d4r55, .d0IDue .TSUbDb, [data-owner-response] .reviewer-name');
        const ownerName = ownerNameEl ? ownerNameEl.textContent.trim() : '';

        if (text || rating) {
          reviews.push({
            author,
            rating,
            text: text.substring(0, 500), // Limita tamanho
            date,
            ownerResponse: ownerResponse.substring(0, 300),
            ownerName
          });
        }
      }
      return reviews;
    }, MAX_REVIEWS);

    await browser.close();

    // Detecta nome do proprietário (de quem respondeu reviews)
    let ownerName = '';
    const ownerNames = reviewsData
      .map(r => r.ownerName)
      .filter(n => n && n.length > 1 && n.length < 50);
    if (ownerNames.length > 0) {
      // Pega o mais frequente
      const freq = {};
      ownerNames.forEach(n => { freq[n] = (freq[n] || 0) + 1; });
      ownerName = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    }

    console.log(`[ReviewScraper] Extraídas ${reviewsData.length} reviews. Dono: "${ownerName || 'não identificado'}"`);

    return {
      reviews: reviewsData,
      ownerName,
      specialties: fichaData.specialties.filter(s => !s.startsWith('ABOUT:')),
      about: fichaData.specialties.find(s => s.startsWith('ABOUT:'))?.replace('ABOUT: ', '') || '',
      category: fichaData.category,
      scrapedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error(`[ReviewScraper] Erro ao scraping de reviews para "${lead.nome}":`, error.message);
    if (browser) await browser.close();
    return null;
  }
}

/**
 * Tenta abrir a aba de avaliações no Google Maps.
 */
async function openReviewsTab(page) {
  try {
    // Tenta clicar no botão/tab de avaliações
    const reviewTabSelectors = [
      'button[aria-label*="Avaliações"]',
      'button[aria-label*="avaliações"]', 
      'button[aria-label*="Reviews"]',
      'button[data-tab-id="reviews"]',
      '[role="tab"][aria-label*="valiaç"]',
      // Fallback: botão com texto "Avaliações"
    ];

    for (const selector of reviewTabSelectors) {
      const tab = await page.$(selector);
      if (tab) {
        await tab.click();
        await page.waitForTimeout(2000);
        return true;
      }
    }

    // Fallback: tenta clicar em qualquer elemento que contenha "Avaliações" ou o total de reviews
    const clicked = await page.evaluate(() => {
      const allBtns = document.querySelectorAll('button, [role="tab"]');
      for (const btn of allBtns) {
        const text = btn.textContent || '';
        if (text.includes('Avaliações') || text.includes('avaliações') || text.match(/\d+\s*avaliações/i)) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      await page.waitForTimeout(2000);
      return true;
    }

    return false;
  } catch (e) {
    console.log('[ReviewScraper] Erro ao abrir aba de avaliações:', e.message);
    return false;
  }
}

/**
 * Rola a lista de reviews para carregar mais.
 */
async function scrollReviews(page) {
  try {
    for (let i = 0; i < 4; i++) {
      // Rola o painel de reviews
      await page.evaluate(() => {
        const scrollable = document.querySelector('.DxyBCb, .m6QErb.DxyBCb, [role="main"] .m6QErb');
        if (scrollable) {
          scrollable.scrollTop = scrollable.scrollHeight;
        }
      });
      await page.waitForTimeout(1500);
    }
  } catch (e) {
    // Silencioso — se não rolar, pega o que tiver
  }
}

/**
 * Usa o Gemini para analisar as reviews e gerar um resumo estruturado.
 * Retorna: { pontos_fortes, pontos_fracos, resumo, especialidades_detectadas }
 */
async function resumirReviewsComIA(lead, reviewsData) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[ReviewScraper] OPENAI_API_KEY não configurada.');
    return gerarResumoManual(lead, reviewsData);
  }

  if (!reviewsData || !reviewsData.reviews || reviewsData.reviews.length === 0) {
    console.log('[ReviewScraper] Sem reviews para resumir.');
    return {
      pontos_fortes: '',
      pontos_fracos: '',
      resumo: '',
      especialidades: reviewsData?.specialties?.join(', ') || '',
      nome_dono: reviewsData?.ownerName || ''
    };
  }

  // Monta o texto das reviews para o prompt
  const reviewsTexto = reviewsData.reviews
    .map((r, i) => {
      let txt = `Review ${i + 1} (${r.rating} estrelas${r.date ? ', ' + r.date : ''}): "${r.text}"`;
      if (r.ownerResponse) {
        txt += `\nResposta do proprietário: "${r.ownerResponse}"`;
      }
      return txt;
    })
    .join('\n\n');

  const prompt = `Você é um analista de inteligência comercial. Analise as avaliações do Google Maps da empresa "${lead.nome}" (${lead.categoria || 'clínica'} em ${lead.cidade || ''}) e gere um resumo OBJETIVO e CONCISO para uso em abordagem comercial.

AVALIAÇÕES:
${reviewsTexto}

${reviewsData.about ? `SOBRE A EMPRESA: ${reviewsData.about}` : ''}
${reviewsData.specialties?.length > 0 ? `SERVIÇOS LISTADOS: ${reviewsData.specialties.join(', ')}` : ''}

Responda EXATAMENTE no formato JSON abaixo (sem markdown, sem crase, apenas o JSON puro):
{
  "pontos_fortes": "Lista dos 2-4 pontos mais elogiados pelos pacientes, mencionando nomes de profissionais ou aspectos específicos quando houver. Separe por ponto e vírgula.",
  "pontos_fracos": "Lista dos 2-4 problemas/reclamações mais recorrentes. Separe por ponto e vírgula. Se não houver reclamações claras, escreva 'Sem reclamações significativas'.",
  "resumo": "1-2 frases resumindo a reputação geral da empresa e o que um vendedor deveria saber antes de abordar.",
  "especialidades": "Lista de especialidades ou serviços detectados, separados por vírgula.",
  "nome_dono": "Nome do proprietário ou responsável detectado nas respostas (se não encontrado, deixe vazio)"
}

REGRAS:
- Seja factual, nunca invente informações
- Gatilho Elogio: Use os nomes EXATOS de recepcionistas/atendentes mencionados (ex: "A Ana é ótima").
- Gatilho Dor Virtual: Identifique explicitamente problemas com "whatsapp", "demora para responder", "não atende", "telefone".
- Gatilho Dor Presencial: Identifique problemas com "desorganizado", "espera", "fila", "recepção caótica".
- Não use linguagem rebuscada
- Se houver poucas reviews ou informações, diga isso no resumo`;

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" }
    });
    const responseText = response.choices[0].message.content.trim();

    // Tenta parsear o JSON (remove possíveis crases de markdown)
    const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      pontos_fortes: parsed.pontos_fortes || '',
      pontos_fracos: parsed.pontos_fracos || '',
      resumo: parsed.resumo || '',
      especialidades: parsed.especialidades || reviewsData.specialties?.join(', ') || '',
      nome_dono: parsed.nome_dono || reviewsData.ownerName || ''
    };
  } catch (error) {
    console.error('[ReviewScraper] Erro ao resumir com OpenAI:', error.message);
    return gerarResumoManual(lead, reviewsData);
  }
}

/**
 * Fallback: gera um resumo simples SEM usar a API do Gemini.
 * Analisa as reviews localmente para extrair padrões básicos.
 * Isso serve para quando a API falha ou para economizar tokens.
 */
function gerarResumoManual(lead, reviewsData) {
  if (!reviewsData || !reviewsData.reviews || reviewsData.reviews.length === 0) {
    return {
      pontos_fortes: '',
      pontos_fracos: '',
      resumo: `Poucas informações disponíveis sobre ${lead.nome}.`,
      especialidades: reviewsData?.specialties?.join(', ') || '',
      nome_dono: reviewsData?.ownerName || ''
    };
  }

  const reviews = reviewsData.reviews;
  const positivas = reviews.filter(r => r.rating >= 4 && r.text);
  const negativas = reviews.filter(r => r.rating <= 3 && r.text);

  // Extrai keywords de reclamações comuns
  const reclamacaoKeywords = [
    { pattern: /demora|demorado|demor/i, label: 'demora no atendimento' },
    { pattern: /whatsapp|zap|mensagem|resposta|respond/i, label: 'dificuldade de contato/WhatsApp' },
    { pattern: /fila|espera|esper/i, label: 'tempo de espera' },
    { pattern: /atendimento|atendente|recepção|recepcionista/i, label: 'atendimento na recepção' },
    { pattern: /preço|caro|valor|cobr/i, label: 'preço/cobrança' },
    { pattern: /agenda|agendar|agendamento|marcar/i, label: 'dificuldade de agendamento' },
    { pattern: /falt|cancelou|desmarc/i, label: 'cancelamentos/faltas' },
  ];

  const reclamacoesEncontradas = [];
  const elogiosEncontrados = [];

  negativas.forEach(r => {
    reclamacaoKeywords.forEach(kw => {
      if (kw.pattern.test(r.text) && !reclamacoesEncontradas.includes(kw.label)) {
        reclamacoesEncontradas.push(kw.label);
      }
    });
  });

  // Extrai nomes de profissionais elogiados
  const nomesElogiados = new Set();
  positivas.forEach(r => {
    const nomes = r.text.match(/\b(Dr\.?\s*\w+|Dra\.?\s*\w+|(?:atendente|enfermeira|recepcionista)\s+\w+)/gi);
    if (nomes) nomes.forEach(n => nomesElogiados.add(n.trim()));
  });

  if (nomesElogiados.size > 0) {
    elogiosEncontrados.push(`Profissionais elogiados: ${[...nomesElogiados].slice(0, 3).join(', ')}`);
  }
  if (positivas.length > negativas.length * 2) {
    elogiosEncontrados.push('Maioria das avaliações são positivas');
  }

  const pontos_fortes = elogiosEncontrados.join('; ') || 'Avaliações geralmente positivas';
  const pontos_fracos = reclamacoesEncontradas.join('; ') || 'Sem reclamações significativas';
  
  const notaMedia = reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length;
  const resumo = `${lead.nome} tem nota média de ${notaMedia.toFixed(1)} com ${reviews.length} avaliações analisadas. ${negativas.length > 0 ? `Principais reclamações: ${reclamacoesEncontradas.slice(0, 2).join(' e ')}.` : 'Sem reclamações recorrentes.'}`;

  return {
    pontos_fortes,
    pontos_fracos,
    resumo,
    especialidades: reviewsData.specialties?.join(', ') || '',
    nome_dono: reviewsData.ownerName || ''
  };
}

/**
 * Função principal: enriquece um lead com dados de reviews.
 * 1. Faz scraping das reviews no Google Maps
 * 2. Usa Gemini (ou fallback manual) para gerar resumo
 * 3. Retorna os dados enriquecidos para salvar no banco
 */
async function enriquecerLeadComReviews(lead) {
  console.log(`[ReviewScraper] Iniciando enriquecimento para: ${lead.nome}`);

  // 1. Scraping
  const reviewsData = await scrapeReviews(lead);

  if (!reviewsData) {
    console.log(`[ReviewScraper] Scraping falhou para ${lead.nome}. Usando fallback.`);
    return {
      reviews_raw: JSON.stringify([]),
      reviews_resumo: '',
      pontos_fortes: '',
      pontos_fracos: '',
      especialidades: '',
      nome_dono: '',
      enriquecido_em: new Date().toISOString()
    };
  }

  // 2. Resumo com IA (ou fallback manual)
  const resumo = await resumirReviewsComIA(lead, reviewsData);

  // 3. Retorna dados prontos para salvar no banco
  return {
    reviews_raw: JSON.stringify(reviewsData.reviews.slice(0, 10)),
    reviews_resumo: resumo.resumo,
    pontos_fortes: resumo.pontos_fortes,
    pontos_fracos: resumo.pontos_fracos,
    especialidades: resumo.especialidades,
    nome_dono: resumo.nome_dono || reviewsData.ownerName || '',
    enriquecido_em: new Date().toISOString()
  };
}

module.exports = {
  scrapeReviews,
  resumirReviewsComIA,
  gerarResumoManual,
  enriquecerLeadComReviews
};
