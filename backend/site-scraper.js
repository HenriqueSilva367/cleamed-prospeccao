const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/**
 * Tenta acessar o site da clínica e resgatar links de WhatsApp ou telefones celulares.
 * Exemplo de links buscados: wa.me/5581988887777, api.whatsapp.com/send?phone=5581988887777
 */
async function extrairWhatsAppDoSite(siteUrl) {
    if (!siteUrl || typeof siteUrl !== 'string') return null;

    let url = siteUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500); // Max 4.5 segundos por site

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            redirect: 'follow'
        });

        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const html = await response.text();

        // 1. Procurar por links diretos de WhatsApp no HTML (wa.me, api.whatsapp.com, etc.)
        const waLinkRegex = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp:\/\/send\?phone=|\?phone=)(?:55)?(\d{10,11})/gi;
        let match;
        const numerosEncontrados = [];

        while ((match = waLinkRegex.exec(html)) !== null) {
            if (match[1]) {
                let num = match[1].replace(/\D/g, '');
                if (num.length === 10 || num.length === 11) {
                    num = '55' + num;
                }
                if (num.length === 12 || num.length === 13) {
                    numerosEncontrados.push(num);
                }
            }
        }

        if (numerosEncontrados.length > 0) {
            console.log(`[Site Scraper] WhatsApp resgatado do site (${url}): ${numerosEncontrados[0]}`);
            return {
                tel: numerosEncontrados[0],
                origem: 'site_wame'
            };
        }

        // 2. Fallback: Procurar números de celuar com nono dígito no texto do HTML
        // Formatos: (81) 98888-8888, 81 98888-8888
        const celRegex = /(?:\(?([1-9]{2})\)?\s?)?(9[0-9]{4}[-\s]?[0-9]{4})/g;
        let celMatch;
        while ((celMatch = celRegex.exec(html)) !== null) {
            const ddd = celMatch[1] || '';
            const numero = celMatch[2].replace(/\D/g, '');
            if (ddd && numero.length === 9) {
                const numCompleto = '55' + ddd + numero;
                console.log(`[Site Scraper] Celular resgatado do texto do site (${url}): ${numCompleto}`);
                return {
                    tel: numCompleto,
                    origem: 'site_texto'
                };
            }
        }

        return null;

    } catch (e) {
        clearTimeout(timeoutId);
        // Falha silenciosa para não travar a busca principal de leads
        return null;
    }
}

module.exports = {
    extrairWhatsAppDoSite
};
