const HIGH_FIT_CATEGORIES = [
  'fisioterapia',
  'clinica medica',
  'clínica médica',
  'clinica odontologica',
  'clínica odontológica',
  'consultorio odontologico',
  'consultório odontológico',
  'dermatologia',
  'dermatologista'
];

// Super-blacklist de franquias, redes nacionais, órgãos públicos e serviços fora de perfil (sem agendamento recorrente)
const BLACKLIST_TERMS = [
  // Órgãos públicos, hospitais e urgência
  'sus', 'ubs', 'posto de saude', 'posto de saúde', 'hospital publico', 'hospital público',
  'prefeitura', 'municipal', 'estadual', 'upa', 'samu', 'pronto socorro', 'pronto-socorro',
  'emergencia', 'emergência', 'urgencia', 'urgência', '24 horas', '24h', 'santa casa',
  'maternidade', 'hospital ', 'caps ', 'apae', 'policlinica municipal',
  // Franquias odontológicas e grandes redes (usam ERP próprio da franqueadora e URA fechada)
  'odontocompany', 'odonto company', 'odontoclinic', 'odonto clinic', 'sorridents',
  'oral unic', 'oralunic', 'orthopride', 'ortho pride', 'coife odonto', 'odontotop',
  'odonto excellence', 'sorrifacil', 'sorrifácil', 'sorria mais', 'sorrix',
  'goup odonto', 'pop dents', 'dental uni', 'uniodonto', 'abo ',
  'associacao brasileira de odontologia', 'instituto de cuidados odontologicos',
  'todos sorrindo', 'dentista do povo', 'clic odonto', 'rede orto', 'ortobom odonto',
  // Clínicas populares de rede, planos de saúde e cartões de desconto
  'amorsaude', 'amor saude', 'amor saúde', 'cartao de todos', 'cartão de todos',
  'medprev', 'dr consulta', 'dr. consulta', 'solumedi', 'clinica sim', 'clínica sim',
  's imagens', 'hapvida', 'unimed', 'bradesco saude', 'sulamerica', 'amil ',
  'notredame', 'intermedica', 'clinica popular', 'clínica popular',
  'sesc', 'senac', 'sesi', 'sindicato',
  // Farmácias, laboratórios de exames/imagem, veterinária e Detran
  'drogasil', 'pague menos', 'droga raia', 'farmacia', 'farmácia',
  'laboratorio', 'laboratório', 'analises clinicas', 'análises clínicas',
  'diagnostico por imagem', 'diagnóstico por imagem', 'radiologia', 'tomografia',
  'ultrassom', 'ultrassonografia', 'veterinaria', 'veterinária', 'pet shop', 'clinica pet',
  'detran', 'exame cnh'
];

const BLACKLIST_SITE_DOMAINS = [
  'sorridents.com', 'oralunic.com', 'odontocompany.com', 'odontoclinic.com',
  'amorsaude.com', 'cartaosolidario', 'cartaodetodos.com', 'medprev.',
  'uniodonto', 'hapvida.com', 'unimed.', 'solumedi.com', 'drconsulta.com',
  'orthopride.com', 'coifeodonto.com', 'odontoexcellence.com', 'sorrifacil.com',
  'gov.br'
];

const LOW_FIT_TERMS = BLACKLIST_TERMS;


function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Verifica se o lead pertence a franquia, rede, órgão público ou fora do perfil */
function isBlacklistedLead(lead = {}) {
  const name = ' ' + normalizeText(lead.nome || '') + ' ';
  const site = normalizeText(lead.site || '');

  for (const term of BLACKLIST_TERMS) {
    const normTerm = normalizeText(term);
    if (!normTerm) continue;
    if (term.endsWith(' ')) {
      if (name.includes(normTerm + ' ')) return { blocked: true, reason: `termo bloqueado no nome (${term.trim()})` };
    } else if (name.includes(normTerm)) {
      return { blocked: true, reason: `termo bloqueado no nome (${term})` };
    }
  }

  if (site) {
    for (const dom of BLACKLIST_SITE_DOMAINS) {
      if (site.includes(dom)) {
        return { blocked: true, reason: `domínio de rede/franquia (${dom})` };
      }
    }
  }

  return { blocked: false, reason: null };
}

function parseRating(value) {
  const parsed = parseFloat(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function priorityFromScore(score) {
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

function scoreLead(lead = {}) {
  let score = 0;
  const reasons = [];

  const name = normalizeText(lead.nome);
  const category = normalizeText(lead.categoria);
  const phone = onlyDigits(lead.tel);
  const rating = parseRating(lead.avaliacao);
  const reviews = parseInt(lead.total_avaliacoes, 10) || 0;
  const siteStr = normalizeText(lead.site || '');
  const hasDedicatedSite = Boolean(siteStr) && !siteStr.includes('instagram.com') && !siteStr.includes('facebook.com') && !siteStr.includes('wa.me') && !siteStr.includes('linktr.ee');
  const hasCity = Boolean(String(lead.cidade || '').trim());
  const hasAddress = Boolean(String(lead.endereco || '').trim());

  if (phone.length >= 10 && phone.length <= 13) {
    score += 30;
    reasons.push('telefone valido');
  } else {
    score -= 35;
    reasons.push('telefone ausente ou fraco');
  }

  if (lead.whatsapp_valido) {
    score += 15;
    reasons.push('whatsapp confirmado');
  }

  if (lead.tel_origem === 'site_wame' || lead.tel_origem === 'site_texto') {
    score += 10;
    reasons.push('whatsapp resgatado do site');
  }

  // Prioriza Fisioterapia e Clínica Médica/Odonto independentes (onde a dor de confirmação manual é mais forte)
  if (category.includes('fisio')) {
    score += 25;
    reasons.push('fisioterapia (alta recorrencia e dor manual)');
  } else if (HIGH_FIT_CATEGORIES.some(term => category.includes(normalizeText(term)))) {
    score += 20;
    reasons.push('categoria com bom fit');
  } else if (category.includes('clinica') || category.includes('clínica')) {
    score += 12;
    reasons.push('categoria clínica genérica');
  }

  // Clínicas sem site próprio (ou só Instagram/WhatsApp) têm 42% mais chance de operar no manual e valorizam o site CleanMed
  if (!hasDedicatedSite) {
    score += 12;
    reasons.push('sem site proprio (maior chance de gestao manual + valoriza site CleanMed)');
  } else {
    score += 6;
    reasons.push('tem site');
  }

  if (rating >= 3.5 && rating <= 4.7) {
    score += 15;
    reasons.push('avaliacao aponta gargalos operacionais (fit ideal)');
  } else if (rating > 4.7) {
    score += 10;
    reasons.push('boa avaliacao');
  } else if (rating > 0 && rating < 3.5) {
    score += 5;
    reasons.push('avaliacao baixa (oportunidade de organizacao)');
  }

  // Porte ideal: 3 a 65 avaliações (clínica independente / pequeno e médio porte, sem URA corporativa)
  if (reviews >= 3 && reviews <= 65) {
    score += 15;
    reasons.push('porte ideal independente (3-65 avaliacoes)');
  } else if (reviews === 0 || (reviews > 0 && reviews < 3)) {
    score += 10;
    reasons.push('consultorio pequeno/novo (alta chance de processo manual)');
  } else if (reviews > 65 && reviews <= 180) {
    score += 6;
    reasons.push('porte medio');
  } else if (reviews > 180) {
    score -= 10;
    reasons.push('porte muito grande (alta chance de ja ter ERP/URA)');
  }

  if (hasCity) {
    score += 5;
    reasons.push('cidade preenchida');
  }

  if (hasAddress) {
    score += 5;
    reasons.push('endereco preenchido');
  }

  const blCheck = isBlacklistedLead(lead);
  if (blCheck.blocked) {
    score = 0;
    reasons.push(`bloqueado: ${blCheck.reason}`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    fit_score: score,
    lead_priority: priorityFromScore(score),
    score_reason: reasons.join(', ')
  };
}

function applyLeadScore(lead = {}) {
  const scored = scoreLead(lead);
  return {
    ...lead,
    fit_score: scored.fit_score,
    lead_priority: scored.lead_priority,
    score_reason: scored.score_reason
  };
}

module.exports = {
  BLACKLIST_TERMS,
  BLACKLIST_SITE_DOMAINS,
  isBlacklistedLead,
  onlyDigits,
  normalizeText,
  priorityFromScore,
  scoreLead,
  applyLeadScore
};
