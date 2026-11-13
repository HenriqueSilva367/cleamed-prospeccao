# CleanMed — Sistema de Prospecção

Cadastro manual de clínicas, busca interna e disparo de mensagens no WhatsApp.
Nenhuma API externa necessária.

## Como rodar

> Use Node.js 22.12.0. Se usar `fnm`, rode os comandos com `fnm exec --using v22.12.0 ...`.

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env
fnm exec --using v22.12.0 npm run dev
```
Roda em: http://localhost:3001

### 2. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```
Acesse: http://localhost:3000

## Segurança e uso local

Este projeto foi configurado para uso na própria máquina: o backend escuta somente em
`127.0.0.1` e o CORS aceita apenas origens HTTP locais (`localhost` e `127.0.0.1`).
A variável `CORS_ORIGINS` não permite liberar domínios externos.

**Não exponha o backend à rede local, VPS ou internet.** Antes de qualquer publicação,
é necessário implementar e revisar autenticação, autorização e outras proteções adequadas.
CORS não substitui autenticação e não impede, sozinho, chamadas diretas à API.

## Limite diário persistente do piloto

O contador diário de mensagens automáticas é calculado a partir da tabela `messages`, considerando apenas mensagens de saída com origem `autopilot` ou `followup` dentro do dia local atual. A contagem sobrevive a reinicializações do backend e é atualizada após o registro da mensagem enviada. Mensagens manuais do WhatsApp e mensagens recebidas não consomem esse limite.

O endpoint `GET /api/autopilot` expõe `dailyStats` e `dailyLimit`; o painel mostra o consumo atual. O recurso não ativa follow-ups: `followup_auto_ativo` continua desativado por padrão.

## Histórico do pipeline

As mudanças reais no campo `status` são registradas automaticamente em `status_history` pelo SQLite, sem depender de qual rota ou rotina alterou a etapa. O painel permite consultar as últimas 100 movimentações por clínica. O histórico começa a ser acumulado a partir da instalação desta versão; etapas anteriores não são reconstruídas retroativamente.

## Classificação de leads

O sistema mantém duas classificações independentes:

- `fit_score` e `lead_priority`: adequação da clínica ao perfil ideal da CleanMed, calculada com dados como categoria, telefone, presença de site, avaliações e localização.
- `sales_priority`: urgência comercial, baseada nos sinais da conversa e no estágio do lead. Dor operacional tende a MÉDIA; interesse explícito, indicação de responsável e handoff tendem a ALTA.
- `sales_priority_source`: identifica se a urgência está sendo calculada automaticamente (`auto`) ou foi ajustada manualmente (`manual`). Ajustes manuais são preservados.

Na prospecção inicial, o piloto ordena primeiro pela adequação (`fit_score`); nos follow-ups, considera primeiro a urgência comercial.

## Funcionalidades

- Cadastrar e editar clínicas manualmente
- Busca interna por nome, bairro, telefone, email
- Filtro por status e bairro
- Disparo de mensagem no WhatsApp com template personalizado
- Acompanhamento de progresso por status
- Exportar lista em CSV

O sistema mantém duas classificações independentes:

- `fit_score` e `lead_priority`: adequação da clínica ao perfil ideal da CleanMed, calculada com dados como categoria, telefone, presença de site, avaliações e localização.
- `sales_priority`: urgência comercial, baseada nos sinais da conversa e no estágio do lead. Dor operacional tende a MÉDIA; interesse explícito, indicação de responsável e handoff tendem a ALTA.
- `sales_priority_source`: identifica se a urgência está sendo calculada automaticamente (`auto`) ou foi ajustada manualmente (`manual`). Ajustes manuais são preservados.

Na prospecção inicial, o piloto ordena primeiro pela adequação (`fit_score`); nos follow-ups, considera primeiro a urgência comercial.

## Funcionalidades

- Cadastrar e editar clínicas manualmente
- Busca interna por nome, bairro, telefone, email
- Filtro por status e bairro
- Disparo de mensagem no WhatsApp com template personalizado
- Acompanhamento de progresso por status
- Exportar lista em CSV

As mudanças reais no campo `status` são registradas automaticamente em `status_history` pelo SQLite, sem depender de qual rota ou rotina alterou a etapa. O painel permite consultar as últimas 100 movimentações por clínica. O histórico começa a ser acumulado a partir da instalação desta versão; etapas anteriores não são reconstruídas retroativamente.

## Classificação de leads

O sistema mantém duas classificações independentes:

- `fit_score` e `lead_priority`: adequação da clínica ao perfil ideal da CleanMed, calculada com dados como categoria, telefone, presença de site, avaliações e localização.
- `sales_priority`: urgência comercial, baseada nos sinais da conversa e no estágio do lead. Dor operacional tende a MÉDIA; interesse explícito, indicação de responsável e handoff tendem a ALTA.
- `sales_priority_source`: identifica se a urgência está sendo calculada automaticamente (`auto`) ou foi ajustada manualmente (`manual`). Ajustes manuais são preservados.

Na prospecção inicial, o piloto ordena primeiro pela adequação (`fit_score`); nos follow-ups, considera primeiro a urgência comercial.

## Funcionalidades

- Cadastrar e editar clínicas manualmente
- Busca interna por nome, bairro, telefone, email
- Filtro por status e bairro
- Disparo de mensagem no WhatsApp com template personalizado
- Acompanhamento de progresso por status
- Exportar lista em CSV

O sistema mantém duas classificações independentes:

- `fit_score` e `lead_priority`: adequação da clínica ao perfil ideal da CleanMed, calculada com dados como categoria, telefone, presença de site, avaliações e localização.
- `sales_priority`: urgência comercial, baseada nos sinais da conversa e no estágio do lead. Dor operacional tende a MÉDIA; interesse explícito, indicação de responsável e handoff tendem a ALTA.
- `sales_priority_source`: identifica se a urgência está sendo calculada automaticamente (`auto`) ou foi ajustada manualmente (`manual`). Ajustes manuais são preservados.

Na prospecção inicial, o piloto ordena primeiro pela adequação (`fit_score`); nos follow-ups, considera primeiro a urgência comercial.

## Funcionalidades

- Cadastrar e editar clínicas manualmente
- Busca interna por nome, bairro, telefone, email
- Filtro por status e bairro
- Disparo de mensagem no WhatsApp com template personalizado
- Acompanhamento de progresso por status
- Exportar lista em CSV


## Consulta de follow-ups pendentes

O endpoint `GET /api/autopilot/followups` lista, sem enviar mensagens, os leads com status `sent` cujo prazo de follow-up já venceu conforme `followup_stage` e as configurações `followup_dias_1` a `followup_dias_4`. A resposta informa se o envio automático está habilitado, a cadência configurada, a quantidade total e os itens retornados (com prazo e indicação de vencido/no prazo).

A consulta respeita os filtros atuais do piloto: status `sent`, sem bot detectado e com IA ativa. A rota é somente de leitura; `followup_auto_ativo` continua desativado por padrão e nenhuma mensagem é disparada por ela.


## Histórico de follow-ups

Cada follow-up registrado manualmente ou enviado pelo piloto automático gera um evento em `followup_history`, associado à clínica e à etapa. O endpoint `GET /api/clinicas/:id/followup/historico` consulta os eventos mais recentes (até 200). A aba Follow-ups permite abrir o histórico de cada clínica. Os registros anteriores à implantação desta tabela não são reconstruídos retroativamente.
