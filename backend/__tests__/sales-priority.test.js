const test = require('node:test');
const assert = require('node:assert/strict');
const { applyLeadScore } = require('../lead-scoring');
const { deriveSalesPriority, resolveSalesPriority } = require('../sales-priority');

test('fit score e prioridade comercial representam dimensões diferentes', () => {
  const lead = applyLeadScore({
    nome: 'Clínica Exemplo',
    tel: '85999999999',
    categoria: 'clínica médica',
    cidade: 'Fortaleza',
    total_avaliacoes: 20,
    sales_priority: 'LOW',
    sales_priority_source: 'auto'
  });
  assert.equal(lead.lead_priority, 'HIGH');
  assert.equal(lead.sales_priority, 'LOW');
});

test('dor operacional gera prioridade comercial média', () => {
  assert.equal(deriveSalesPriority({ progresso_lead: 'QUALIFICADO_DOR' }), 'MEDIUM');
});

test('interesse explícito, indicação e handoff geram prioridade comercial alta', () => {
  assert.equal(deriveSalesPriority({ progresso_lead: 'INTERESSE_ALTO' }), 'HIGH');
  assert.equal(deriveSalesPriority({ progresso_lead: 'INDICOU_RESPONSAVEL' }), 'HIGH');
  assert.equal(deriveSalesPriority({ handoff_at: '2026-11-13 10:00:00' }), 'HIGH');
});

test('recusa e robô/URA permanecem em prioridade comercial baixa', () => {
  assert.equal(deriveSalesPriority({ progresso_lead: 'SEM_INTERESSE' }), 'LOW');
  assert.equal(deriveSalesPriority({ progresso_lead: 'ROBO_URA' }), 'LOW');
});

test('prioridade definida manualmente prevalece sobre classificação automática', () => {
  assert.equal(resolveSalesPriority({ sales_priority: 'LOW', sales_priority_source: 'manual', progresso_lead: 'INTERESSE_ALTO' }), 'LOW');
  assert.equal(resolveSalesPriority({ sales_priority: 'LOW', sales_priority_source: 'auto', progresso_lead: 'INTERESSE_ALTO' }), 'HIGH');
});
