const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

async function scrapeGoogleMaps(query, limit = 10) {
    console.log(`Buscando por: ${query} (Limite: ${limit})...`);
    const browser = await chromium.launch({ headless: true }); 
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`);
        
        await page.waitForTimeout(5000); 

        const scrollContainer = 'div[role="feed"]';
        
        // Rolagem inteligente até atingir o limite ou fim dos resultados
        let previousCount = 0;
        let leadsCount = 0;
        let attempts = 0;
        
        while (leadsCount < limit) {
            const elements = await page.$$('div[role="article"], .Nv2YX');
            leadsCount = elements.length;
            console.log(`Leads carregados: ${leadsCount} / ${limit}`);
            
            if (leadsCount >= limit) break;
            
            if (leadsCount === previousCount) {
                attempts++;
                if (attempts > 4) {
                    console.log("Nenhum lead novo carregado após várias tentativas. Fim da lista.");
                    break;
                }
            } else {
                attempts = 0;
            }
            
            previousCount = leadsCount;

            // Foca e rola o painel principal do Maps
            try {
                const feedElement = await page.$('div[role="feed"]');
                if (feedElement) {
                    await feedElement.hover();
                    await page.mouse.wheel(0, 5000);
                } else if (elements.length > 0) {
                    await elements[elements.length - 1].hover();
                    await page.mouse.wheel(0, 5000);
                }
            } catch(e) {}

            await page.waitForTimeout(2000);
            
            // Verifica se tem a mensagem de fim de lista
            const isEnd = await page.evaluate(() => {
                const html = document.body.innerHTML;
                return html.includes('Você chegou ao fim da lista') || html.includes("You've reached the end");
            });
            if (isEnd) break;
        }

        const leads = await page.evaluate((maxLeads) => {
            const results = [];
            const items = document.querySelectorAll('div[role="article"], .Nv2YX');
            
            for (let i = 0; i < Math.min(items.length, maxLeads); i++) {
                const item = items[i];
                const nameEl = item.querySelector('.fontHeadlineSmall, .qBF1Pd');
                let name = nameEl?.innerText;
                
                if (name && name.includes('|')) name = name.split('|')[0].trim();
                if (name && name.includes(' - ')) name = name.split(' - ')[0].trim();
                
                const link = item.querySelector('a')?.href;
                const textContent = item.innerText;
                
                const rating = item.querySelector('.MW4etd')?.innerText || '';
                const reviews = item.querySelector('.UY7F9')?.innerText?.replace(/[()]/g, '') || '0';
                const site = item.querySelector('a.lcr4fd, a[aria-label*="site"]')?.href || '';
                
                // Melhoria na extração de telefone
                const lines = textContent.split('\n');
                
                // Tenta encontrar por Regex de BR Mobile/Fixo
                // Formatos: (81) 98888-8888, 81 988888888, 98888-8888, etc.
                const phoneRegex = /(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}/;
                let phoneMatch = textContent.match(phoneRegex);
                let phone = phoneMatch ? phoneMatch[0] : '';
                
                // Se não achou na primeira passada, tenta procurar em linhas específicas que pareçam telefone
                if (!phone) {
                    phone = lines.find(t => phoneRegex.test(t)) || '';
                }

                phone = phone.replace(/\D/g, '');
                
                // Validação mínima para evitar números errados (como anos ou códigos postais)
                if (phone.length < 8 || phone.length > 13) phone = '';

                if (name) {
                    results.push({
                        nome: name,
                        tel: phone,
                        endereco: lines.find(t => t.includes('R. ') || t.includes('Av. ') || t.includes('Praça ') || t.includes('Rodovia ') || (t.includes(',') && t.length > 15)) || '',
                        site: site,
                        avaliacao: rating,
                        total_avaliacoes: parseInt(reviews) || 0,
                        google_place_id: link?.split('!1s')[1]?.split('!')[0] || name
                    });
                }
            }
            return results;
        }, limit);

        console.log(`Extração finalizada. Processados ${leads.length} de um limite de ${limit}.`);

        const outputPath = path.join(__dirname, '../leads_output.json');
        fs.writeFileSync(outputPath, JSON.stringify(leads, null, 2));
        
        return leads;

    } catch (error) {
        console.error('Erro no scraper:', error);
    } finally {
        await browser.close();
    }
}

const query = process.argv[2] || 'clinicas odontológicas em São Paulo';
const limit = parseInt(process.argv[3]) || 10;
scrapeGoogleMaps(query, limit);
