const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

const query = process.argv[2];
let limit = parseInt(process.argv[3], 10);
if (isNaN(limit) || limit < 1) limit = 20;

// Regex para capturar números de WhatsApp
const waRegex = /(?:wa\.me\/|api\.whatsapp\.com\/send[?&]phone=)[+]?(?:55)?(\d{10,11})/gi;
// Regex para números de celular brasileiros (com 9 dígito)
const celRegex = /(?:\+?55\s?)?(?:\(?\s?(\d{2})\s?\)?\s?)(9\d{4})\s?[-]?\s?(\d{4})/g;

function extractWaNumbers(text) {
  const found = new Set();
  const re = new RegExp(waRegex.source, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    let num = m[1].replace(/\D/g, '');
    if (num.length === 10 || num.length === 11) num = '55' + num;
    if (num.length >= 12) found.add(num);
  }
  return [...found];
}

function extractCelNumbers(text) {
  const found = new Set();
  const re = new RegExp(celRegex.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const ddd = m[1];
    const parte1 = m[2];
    const parte2 = m[3];
    const num = `55${ddd}${parte1}${parte2}`;
    if (num.length === 13) found.add(num);
  }
  return [...found];
}

function cleanTitle(title) {
  return title
    .replace(/\s*[-–|•·]\s*.*/g, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s*@\w+/g, '')
    .replace(/Instagram.*/gi, '')
    .trim();
}

async function run() {
  console.log(`[IG Scraper] Iniciando busca por WhatsApp para: "${query}"`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  const leads = [];
  const seen = new Set();

  // Estratégia: buscar no Google por perfis de Instagram da categoria+cidade
  // e acessar cada perfil para capturar o número de WhatsApp da bio
  const searchUrl = `https://www.google.com/search?q=site:instagram.com+${encodeURIComponent(query)}&num=30&hl=pt-BR`;
  
  console.log(`[IG Scraper] Buscando perfis no Google...`);
  
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('[IG Scraper] Timeout na busca, tentando continuar...');
  }

  // Pega todos os links do Instagram nos resultados
  const igLinks = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href*="instagram.com"]');
    const links = [];
    anchors.forEach(a => {
      const href = a.href;
      // Pega apenas links de perfil (não posts, reels, etc.)
      if (href.match(/instagram\.com\/[a-zA-Z0-9_.]+\/?$/) && !href.includes('/p/') && !href.includes('/reel/')) {
        // Pega o título do resultado
        const card = a.closest('.g, [data-hveid]');
        const titleEl = card ? card.querySelector('h3') : null;
        const title = titleEl ? titleEl.innerText : '';
        links.push({ url: href, title });
      }
    });
    return [...new Map(links.map(l => [l.url, l])).values()];
  });

  console.log(`[IG Scraper] ${igLinks.length} perfis encontrados no Google.`);

  // Visita cada perfil para pegar o número da bio
  for (const item of igLinks) {
    if (leads.length >= limit) break;

    const profileUrl = item.url.split('?')[0];
    const title = item.title;
    
    console.log(`[IG Scraper] Visitando: ${profileUrl}`);
    
    try {
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      // Pega o texto visível da página (bio do Instagram)
      const bioText = await page.evaluate(() => {
        // A bio fica normalmente na meta description ou no texto da página
        const meta = document.querySelector('meta[name="description"]');
        if (meta) return meta.content;
        
        // Alternativa: pegar texto da seção de bio
        const body = document.body ? document.body.innerText.substring(0, 1000) : '';
        return body;
      });

      const numbersWa = extractWaNumbers(bioText + ' ' + profileUrl);
      const numbersCel = extractCelNumbers(bioText);
      const allNumbers = [...new Set([...numbersWa, ...numbersCel])];

      if (allNumbers.length > 0) {
        const tel = allNumbers[0];
        if (!seen.has(tel)) {
          seen.add(tel);
          
          const nome = cleanTitle(title) || `Perfil Instagram`;
          leads.push({
            nome,
            tel,
            endereco: 'Via Instagram',
            site: '',
            avaliacao: '5.0',
            total_avaliacoes: 0,
            google_place_id: 'ig_' + profileUrl.split('/').filter(Boolean).pop(),
            origem: 'instagram_scraper'
          });

          console.log(`[IG Scraper] ✅ Lead: ${nome} | ${tel}`);
        }
      } else {
        console.log(`[IG Scraper] ⏭️ Sem WhatsApp encontrado na bio: ${profileUrl}`);
      }
    } catch (e) {
      console.log(`[IG Scraper] Erro ao acessar ${profileUrl}: ${e.message}`);
    }
  }

  await browser.close();

  console.log(`[IG Scraper] Total: ${leads.length} leads com WhatsApp encontrados.`);

  const outputPath = path.join(__dirname, '../leads_output.json');
  fs.writeFileSync(outputPath, JSON.stringify(leads, null, 2), 'utf-8');
  console.log(`[IG Scraper] Dados salvos.`);
}

run().catch(console.error);
