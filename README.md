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
