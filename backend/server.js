require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const db = require('./db/database');
const { HOST, corsOptions } = require('./security');

const clinicasRouter = require('./routes/clinicas');
const buscaRouter = require('./routes/busca');
const diagnosticoRouter = require('./routes/diagnostico');
const autopilot = require('./autopilot');
const { listDueFollowups } = require('./followup-queue');
const whatsapp = require('./whatsapp');

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/clinicas', clinicasRouter);
app.use('/api/busca', buscaRouter);
app.use('/api/diagnostico', diagnosticoRouter);

// Rotas do Piloto Automático
app.get('/api/autopilot/followups', (req, res) => {
    try {
        res.json(listDueFollowups(db, { limit: req.query.limit }));
    } catch (e) {
        console.error('[Autopilot] Erro ao listar follow-ups:', e);
        res.status(500).json({ error: 'Não foi possível listar os follow-ups.' });
    }
});

app.get('/api/autopilot', (req, res) => res.json(autopilot.getStatus()));
app.post('/api/autopilot/toggle', (req, res) => res.json(autopilot.toggleAutopilot()));
app.get('/api/autopilot/qr', async (req, res) => {
    try {
        const status = await whatsapp.getQrCode();
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/autopilot/restart-qr', (req, res) => {
    whatsapp.reiniciarCliente();
    res.json({ ok: true, message: 'Reiniciando WhatsApp...' });
});

// Rota de configuração da busca automática
app.get('/api/autopilot/config', (req, res) => {
    try {
        const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
        const config = {};
        rows.forEach(r => {
            try { config[r.chave] = JSON.parse(r.valor); }
            catch { config[r.chave] = r.valor; }
        });
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/autopilot/config', (req, res) => {
    try {
        const upsert = db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)');
        Object.entries(req.body).forEach(([chave, valor]) => {
            upsert.run(chave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
        });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Diagnóstico: mostra o histórico que o robô lê antes de enviar para um lead
app.get('/api/historico-whatsapp/:id', async (req, res) => {
  const lead = require('./db/database').prepare('SELECT id, tel FROM clinicas WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ erro: 'Lead não encontrado' });
  const hist = await require('./whatsapp').contarHistoricoWhatsApp(lead.id, lead.tel);
  res.json(hist);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, HOST, () => console.log(`Servidor rodando em http://${HOST}:${PORT}`));
