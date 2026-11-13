const VALID_SALES_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];

function deriveSalesPriority(lead = {}) {
  if (['SEM_INTERESSE', 'ROBO_URA'].includes(lead.progresso_lead)) return 'LOW';
  if (lead.handoff_at || ['INTERESSE_ALTO', 'INDICOU_RESPONSAVEL'].includes(lead.progresso_lead) ||
      ['reuniao_agendada', 'demo_realizada', 'negociando', 'diagnostico', 'proposta', 'converted'].includes(lead.status)) {
    return 'HIGH';
  }
  if (lead.progresso_lead === 'QUALIFICADO_DOR' || lead.progresso_lead === 'EM_QUALIFICACAO' ||
      ['reply', 'interviewing'].includes(lead.status)) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function resolveSalesPriority(lead = {}) {
  if (lead.sales_priority_source === 'manual' && VALID_SALES_PRIORITIES.includes(lead.sales_priority)) {
    return lead.sales_priority;
  }
  return deriveSalesPriority(lead);
}

module.exports = { VALID_SALES_PRIORITIES, deriveSalesPriority, resolveSalesPriority };
