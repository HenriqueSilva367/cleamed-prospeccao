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

## Funcionalidades

- Cadastrar e editar clínicas manualmente
- Busca interna por nome, bairro, telefone, email
- Filtro por status e bairro
- Disparo de mensagem no WhatsApp com template personalizado
- Acompanhamento de progresso por status
- Exportar lista em CSV
