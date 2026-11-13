const { OpenAI } = require('openai');

const PLANOS = {
  DEMO: { nome: 'DEMO (Trial)', preco: 'R$ 0,00', duracao: '30 dias' },
  PRO: { nome: 'PRO', preco: 'R$ 149,90/mês', anual: 'R$ 1.798,80/ano' },
  BUSINESS: { nome: 'BUSINESS', preco: 'R$ 249,90/mês', anual: 'R$ 2.998,80/ano' },
  PLATINUM: { nome: 'PLATINUM', preco: 'R$ 399,90/mês', anual: 'R$ 4.798,80/ano' },
};

function recomendarPlano(respostas) {
  const b1 = respostas.bloco1 || {};
  const b3 = respostas.bloco3 || {};
  const medicos = parseInt(b1.qtd_medicos) || 1;
  const fazRepasse = (b3.faz_repasse || '').toLowerCase().includes('sim');
  const emiteNF = (b3.emite_nf || '').toLowerCase().includes('sim');
  const multiAgendas = medicos > 10;
  const querGoogle = (respostas.bloco6?.objetivos || '').toLowerCase().includes('google');

  if (multiAgendas || querGoogle) return 'PLATINUM';
  if (fazRepasse || emiteNF || medicos > 3) return 'BUSINESS';
  return 'PRO';
}

async function chamarIA(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
  });
  return response.choices[0].message.content.trim();
}

async function gerarOverview(respostas) {
  const r = JSON.stringify(respostas, null, 2);
  return chamarIA(`Você é um consultor especialista em gestão clínica. Com base nas respostas abaixo de uma entrevista consultiva, gere um DIAGNÓSTICO DA CLÍNICA em markdown com as seções:
1. **Situação Atual** — Resumo executivo (3-4 frases)
2. **Gargalos Encontrados** — Lista dos problemas identificados
3. **Impactos Operacionais** — Tempo perdido, retrabalho, processos manuais
4. **Impactos Financeiros** — Possíveis perdas de receita (calcule estimativas quando possível)
5. **Oportunidades de Automação** — Como a CleanMed pode ajudar

REGRA DE OURO: Nunca venda funcionalidades. Venda resultados (menos faltas, mais produtividade, mais controle).
Seja direto, use números quando possível.

Respostas da entrevista:
${r}`);
}

async function gerarROI(respostas) {
  const r = JSON.stringify(respostas, null, 2);
  return chamarIA(`Você é um consultor financeiro para clínicas. Com base nas respostas da entrevista abaixo, gere uma ESTIMATIVA DE RETORNO (ROI) em markdown com:
1. **Recepção** — Horas gastas atualmente vs horas com automação
2. **Redução de Faltas** — Se X% dos Y atendimentos/mês faltam, calcule consultas recuperadas × ticket médio estimado (use R$150 se não informado)
3. **Ganho Operacional** — Produtividade estimada com automação
4. **ROI Potencial** — Estimativa conservadora mensal e anual

IMPORTANTE: Deixe claro que são ESTIMATIVAS baseadas nos dados informados. Use números reais da entrevista.

Respostas:
${r}`);
}

async function gerarProposal(respostas, plano) {
  const r = JSON.stringify(respostas, null, 2);
  const p = PLANOS[plano];
  return chamarIA(`Você é um consultor comercial da CleanMed. Gere uma PROPOSTA COMERCIAL em markdown com:
1. **Resumo Executivo** — Situação atual da clínica (2-3 frases)
2. **Problemas Identificados** — Lista dos principais desafios
3. **Solução Recomendada** — Plano ${p.nome} (${p.preco})
4. **Recursos Incluídos** — Médicos ilimitados, usuários ilimitados, agendamentos ilimitados, WhatsApp integrado, lembretes automáticos, confirmações automáticas, relatórios${plano === 'BUSINESS' ? ', NFS-e, repasse médico automático, exportação financeira' : ''}${plano === 'PLATINUM' ? ', NFS-e, repasse médico, integração Google Agenda, treinamento VIP, suporte WhatsApp 24/7' : ''}
5. **Benefícios Esperados** — Menos trabalho manual, mais produtividade, menos faltas, melhor organização, mais controle financeiro
6. **Investimento** — ${p.preco}${p.anual ? ' (ou ' + p.anual + ')' : ''}
7. **Próximos Passos** — 1. Contratação 2. Implantação 3. Treinamento 4. Go-live

REGRA: Venda RESULTADOS, não funcionalidades.

Respostas da entrevista:
${r}`);
}

async function gerarCompetitorAnalysis(respostas) {
  const r = JSON.stringify(respostas, null, 2);
  const sistema = respostas.bloco5?.sistema_atual || 'Não informado';
  return chamarIA(`Você é um analista de mercado de sistemas para clínicas. O cliente usa "${sistema}". Gere um COMPARATIVO DE SOLUÇÕES em markdown com:
1. **Sistema Atual: ${sistema}**
   - Pontos Positivos (baseado no que o cliente disse que gosta)
   - Problemas Relatados (baseado no que incomoda)
2. **Como a CleanMed Resolve** — Para cada problema, mostre como a CleanMed trata
3. **Benefícios Esperados na Migração**
4. **Recomendação Final**

Seja justo e honesto. Não denigra o concorrente, apenas destaque onde a CleanMed pode agregar mais.

Respostas:
${r}`);
}

function gerarStrategyHTML(clinicaNome, overview, roi, plano, respostas) {
  const p = PLANOS[plano];
  const b1 = respostas.bloco1 || {};
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Estratégia — ${clinicaNome}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#F9FAFB;color:#111827;line-height:1.6}
.container{max-width:900px;margin:0 auto;padding:48px 24px}
.header{margin-bottom:48px;border-bottom:1px solid #E5E7EB;padding-bottom:32px}
.agency{font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em}
.client{font-size:32px;font-weight:700;color:#111827;margin-top:4px}
.subtitle{font-size:16px;color:#6B7280;margin-top:8px}
.section{margin-bottom:48px}
.section-title{font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.card{background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #E5E7EB}
.card+.card{margin-top:12px}
.card h3{font-size:16px;font-weight:600;margin-bottom:8px}
.card p,.card li{font-size:14px;color:#374151}
.card ul{padding-left:20px;margin-top:8px}
.card li{margin-bottom:4px}
.highlight{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:24px;margin-bottom:16px}
.highlight h3{color:#1E40AF}
.highlight .value{font-size:36px;font-weight:800;color:#1E40AF;margin:8px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:12px}
.metric{background:white;border-radius:10px;padding:16px;text-align:center;border:1px solid #E5E7EB}
.metric .label{font-size:12px;color:#6B7280;text-transform:uppercase;font-weight:600}
.metric .num{font-size:28px;font-weight:800;color:#111827;margin-top:4px}
.plan-card{background:linear-gradient(135deg,#1E40AF,#3B82F6);color:white;border-radius:16px;padding:32px;text-align:center}
.plan-card .plan-name{font-size:24px;font-weight:700}
.plan-card .plan-price{font-size:40px;font-weight:800;margin:12px 0}
.plan-card .plan-period{font-size:14px;opacity:.8}
.plan-card ul{list-style:none;margin-top:20px;text-align:left;padding:0}
.plan-card li{padding:8px 0;border-top:1px solid rgba(255,255,255,.15);font-size:14px}
.plan-card li::before{content:"✓ ";font-weight:700}
.steps{display:flex;gap:0;margin-top:16px;flex-wrap:wrap}
.step{flex:1;min-width:120px;position:relative;text-align:center;padding:16px 8px}
.step-num{width:36px;height:36px;border-radius:50%;background:#3B82F6;color:white;display:flex;align-items:center;justify-content:center;font-weight:700;margin:0 auto 8px}
.step-label{font-size:13px;font-weight:600;color:#111827}
.step-desc{font-size:11px;color:#6B7280;margin-top:4px}
.footer{margin-top:64px;padding-top:24px;border-top:1px solid #E5E7EB;font-size:13px;color:#9CA3AF;text-align:center}
@media print{body{background:white}.container{padding:24px}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="agency">CleanMed — Gestão Clínica Inteligente</div>
    <div class="client">Estratégia para ${clinicaNome}</div>
    <div class="subtitle">Diagnóstico consultivo e plano de ação personalizado</div>
  </div>

  <div class="section">
    <div class="section-title">📊 Perfil da Clínica</div>
    <div class="grid">
      <div class="metric"><div class="label">Especialidades</div><div class="num" style="font-size:16px">${b1.especialidades || '—'}</div></div>
      <div class="metric"><div class="label">Médicos</div><div class="num">${b1.qtd_medicos || '—'}</div></div>
      <div class="metric"><div class="label">Funcionários</div><div class="num">${b1.qtd_funcionarios || '—'}</div></div>
      <div class="metric"><div class="label">Atendimentos/Mês</div><div class="num">${b1.atendimentos_mes || '—'}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🔍 Diagnóstico</div>
    <div class="card"><div style="white-space:pre-wrap;font-size:14px">${overview.replace(/[#*]/g, '').trim()}</div></div>
  </div>

  <div class="section">
    <div class="section-title">💰 Estimativa de Retorno (ROI)</div>
    <div class="card"><div style="white-space:pre-wrap;font-size:14px">${roi.replace(/[#*]/g, '').trim()}</div></div>
  </div>

  <div class="section">
    <div class="section-title">🎯 Plano Recomendado</div>
    <div class="plan-card">
      <div class="plan-name">${p.nome}</div>
      <div class="plan-price">${p.preco}</div>
      <div class="plan-period">${p.anual ? 'ou ' + p.anual : p.duracao}</div>
      <ul>
        <li>Médicos ilimitados</li>
        <li>Usuários ilimitados</li>
        <li>Agendamentos ilimitados</li>
        <li>WhatsApp integrado</li>
        <li>Lembretes e confirmações automáticas</li>
        <li>Relatórios gerenciais</li>
        ${plano === 'BUSINESS' || plano === 'PLATINUM' ? '<li>NFS-e automática</li><li>Repasse médico automático</li>' : ''}
        ${plano === 'PLATINUM' ? '<li>Integração Google Agenda</li><li>Treinamento VIP</li><li>Suporte WhatsApp 24/7</li>' : ''}
      </ul>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🚀 Próximos Passos</div>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div class="step-label">Contratação</div><div class="step-desc">Ativação do plano</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-label">Implantação</div><div class="step-desc">Configuração completa</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-label">Treinamento</div><div class="step-desc">Equipe capacitada</div></div>
      <div class="step"><div class="step-num">4</div><div class="step-label">Go-live</div><div class="step-desc">Sistema no ar</div></div>
    </div>
  </div>

  <div class="footer">Desenvolvido por CleanMed · Gestão Clínica Inteligente</div>
</div>
</body>
</html>`;
}

module.exports = { recomendarPlano, gerarOverview, gerarROI, gerarProposal, gerarCompetitorAnalysis, gerarStrategyHTML, PLANOS };
