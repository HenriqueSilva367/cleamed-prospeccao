'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const STATUS = {
  pending: 'Não contatado',
  paused_site: 'Pendente (site)',
  sent: 'Enviado',
  interviewing: 'Em Entrevista',
  indicou_responsavel: 'Indicou Decisor',
  reply: 'Contato Humano',
  reuniao_agendada: 'Demo Agendada',
  demo_realizada: 'Teste Assistido (30 dias)',
  negociando: 'Em Fechamento',
  diagnostico: 'Diagnóstico',
  proposta: 'Proposta',
  converted: 'Cliente Assinante',
  disabled: 'Desativado'
};
const STATUS_COLOR = {
  pending: 'bg-amber-50 text-amber-800',
  paused_site: 'bg-sky-50 text-sky-800',
  sent: 'bg-emerald-50 text-emerald-800',
  interviewing: 'bg-indigo-50 text-indigo-800',
  indicou_responsavel: 'bg-amber-100 text-amber-900',
  reply: 'bg-blue-50 text-blue-800',
  reuniao_agendada: 'bg-violet-50 text-violet-800',
  demo_realizada: 'bg-fuchsia-50 text-fuchsia-800',
  negociando: 'bg-cyan-50 text-cyan-800',
  diagnostico: 'bg-purple-50 text-purple-800',
  proposta: 'bg-pink-50 text-pink-800',
  converted: 'bg-green-100 text-green-800',
  disabled: 'bg-gray-100 text-gray-500'
};

const isQualificadoPipeline = (c) => {
  if (!c || c.status === 'disabled') return false;
  if (['indicou_responsavel', 'reply', 'reuniao_agendada', 'demo_realizada', 'negociando', 'diagnostico', 'proposta', 'converted'].includes(c.status)) {
    return true;
  }
  if (c.status === 'interviewing' && (
    ['QUALIFICADO_DOR', 'INTERESSE_ALTO', 'INDICOU_RESPONSAVEL'].includes(c.progresso_lead) ||
    Boolean(c.dor_detectada && c.dor_detectada.trim())
  )) {
    return true;
  }
  return false;
};

const gerarScriptsPlaybook = (clinica) => {
  const nomeClinica = clinica?.nome ? clinica.nome.split(' - ')[0].trim() : 'clínica';
  const nomeDecisor = clinica?.nome_dono && !/não identificado|desconhecido/i.test(clinica.nome_dono)
    ? clinica.nome_dono.split(' ')[0]
    : '';
  const saudacao = nomeDecisor ? `Oi, ${nomeDecisor}! Tudo bem?` : `Oi! Tudo bem?`;

  return [
    {
      id: 'dor_manual',
      label: '🎯 1. Dor Manual → Demo 5 min',
      badge: 'Qualificado Manual',
      color: 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100',
      texto: `${saudacao} Vi aqui que hoje vocês ainda fazem o controle e a confirmação de consultas manualmente na ${nomeClinica}.\n\nNa CleanMed o próprio sistema envia os lembretes no WhatsApp dos pacientes e já atualiza a agenda sozinho, ajudando a reduzir faltas com lembretes e confirmações sem a recepção precisar cobrar um por um.\n\nConsigo te mostrar a tela em 5 minutinhos hoje às 14h ou às 16h, ou prefere que eu já deixe um acesso de teste configurado para vocês verem?`
    },
    {
      id: 'decisor_indicado',
      label: '📌 2. Abordar Decisor Indicado',
      badge: 'Indicação Recepção',
      color: 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100',
      texto: `${saudacao} Sou o Henrique, da CleanMed. A recepção da ${nomeClinica} me passou seu contato como responsável.\n\nNós ajudamos clínicas a automatizar agendamentos e confirmações de sessões pelo WhatsApp, tirando o trabalho manual da recepção e reduzindo faltas de pacientes.\n\nTopa ver em 5 minutos como funciona na prática ou prefere que eu crie um painel de teste gratuito para a ${nomeClinica}?`
    },
    {
      id: 'cadastro_assistido',
      label: '🚀 3. Criar Teste Assistido (Sem link cru!)',
      badge: 'Zero Fricção',
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
      texto: `Perfeito! Para você não perder tempo configurando nada do zero, eu mesmo já crio e deixo o painel de 30 dias grátis da ${nomeClinica} configurado com a agenda de vocês.\n\nSó me confirma aqui rapidinho:\n1) Qual o melhor e-mail para ser o seu login?\n2) Quais os nomes dos profissionais que atendem hoje?\n\nEm 5 minutos já te mando o acesso prontinho para usar!`
    },
    {
      id: 'entregar_login',
      label: '🔑 4. Entregar Login Pronto',
      badge: 'Onboarding',
      color: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100',
      texto: `Prontinho! Já criei e deixei configurado o ambiente da ${nomeClinica} para os seus 30 dias de teste grátis:\n\n🌐 Painel: https://app.cleanmed.com.br\n📧 Login: ${clinica?.email || '[SEU_EMAIL]'}\n🔑 Senha provisória: mudarsenha123\n\nConsegue abrir aí rapidinho no computador ou celular só para fazermos o primeiro agendamento de teste juntos em 2 minutos?`
    },
    {
      id: 'followup_teste',
      label: '📈 5. Acompanhar Teste (Dia 2)',
      badge: 'Ativação',
      color: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200 hover:bg-fuchsia-100',
      texto: `${saudacao} Passando para saber se você e a equipe conseguiram testar o painel da ${nomeClinica} que deixei liberado.\n\nQuer que eu entre 5 minutinhos com a sua recepcionista para ajudar a conectar o WhatsApp de confirmações automáticas hoje?`
    },
    {
      id: 'fechamento_pro',
      label: '💰 6. Fechamento (Plano Pro R$149,90)',
      badge: 'Fechar Venda',
      color: 'bg-green-50 text-green-800 border-green-300 hover:bg-green-100',
      texto: `${saudacao} Que ótimo ver a ${nomeClinica} organizando os agendamentos com a CleanMed!\n\nPara manter a agenda, o financeiro e as confirmações automáticas no WhatsApp rodando sem interrupção, o plano ideal para vocês é o Plano Pro (R$ 149,90/mês, sem fidelidade).\n\nPrefere que eu gere a ativação via PIX ou cartão?`
    }
  ];
};

const maskPhone = (v) => {
  if (!v) return '';
  const n = v.replace(/\D/g, '');
  if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
};

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState('clinicas');
  const [clinicas, setClinicas] = useState([]);
  const [modalResposta, setModalResposta] = useState(null);
  const [textoResposta, setTextoResposta] = useState('');
  const [modalMensagens, setModalMensagens] = useState(null);
  const [historicoMensagens, setHistoricoMensagens] = useState([]);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [novaMensagemTexto, setNovaMensagemTexto] = useState('');
  const [enviandoChatMessage, setEnviandoChatMessage] = useState(false);
  const [buscaMensagemGlobal, setBuscaMensagemGlobal] = useState('');
  const [todasMensagens, setTodasMensagens] = useState([]);
  const [carregandoMensagensGlobal, setCarregandoMensagensGlobal] = useState(false);
  const [stats, setStats] = useState({ pendentes: 0, enviados: 0, desativados: 0, responderam: 0, total: 0 });
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroPrioridade, setFiltroPrioridade] = useState('');
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const [filtroBairro, setFiltroBairro] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroIa, setFiltroIa] = useState('todos');
  const [form, setForm] = useState({ nome: '', tel: '', bairro: '', email: '', endereco: '', site: '', avaliacao: '', categoria: '', sales_priority: null });
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [atualizandoIaId, setAtualizandoIaId] = useState(null);
  
  const [autopilotStatus, setAutopilotStatus] = useState({ isOn: false, currentTask: 'Aguardando...', logs: [] });
  const [autopilotQr, setAutopilotQr] = useState(null);
  const [pipelineNotas, setPipelineNotas] = useState({});
  const [modalNotas, setModalNotas] = useState(null);
  const [pipelineHistorico, setPipelineHistorico] = useState({});
  const [modalHistorico, setModalHistorico] = useState(null);
  const [modalReviews, setModalReviews] = useState(null);
  const [enriquecendoId, setEnriquecendoId] = useState(null);
  const [novaNota, setNovaNota] = useState('');
  const [filtroPipeline, setFiltroPipeline] = useState('todos');
  const [modalFollowup, setModalFollowup] = useState(null);
  const [followupForm, setFollowupForm] = useState({
    proxima_acao: '',
    proxima_acao_data: '',
    nome_dono: '',
    sistema_atual: '',
    dor_detectada: '',
    sales_priority: 'HIGH'
  });
  const [salvandoFollowup, setSalvandoFollowup] = useState(false);
  const [followupQueue, setFollowupQueue] = useState({ enabled: false, scheduleDays: [], total: 0, returned: 0, items: [] });
  const [loadingFollowupQueue, setLoadingFollowupQueue] = useState(false);
  const [followupHistory, setFollowupHistory] = useState({});
  const [loadingFollowupHistory, setLoadingFollowupHistory] = useState({});

  const [followupQueueError, setFollowupQueueError] = useState('');


  const abrirModalFollowup = (c) => {
    const dataFormatada = c.proxima_acao_data
      ? new Date(c.proxima_acao_data).toISOString().slice(0, 10)
      : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    setModalFollowup(c);
    setFollowupForm({
      proxima_acao: c.proxima_acao || 'Enviar áudio curto + convidar para Demo de 5 min',
      proxima_acao_data: dataFormatada,
      nome_dono: c.nome_dono || '',
      sistema_atual: c.sistema_atual || '',
      dor_detectada: c.dor_detectada || '',
      sales_priority: c.sales_priority || 'HIGH'
    });
  };

  const salvarFollowup = async () => {
    if (!modalFollowup) return;
    setSalvandoFollowup(true);
    try {
      const res = await fetch(`${API}/clinicas/${modalFollowup.id}/proxima-acao`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(followupForm)
      });
      if (!res.ok) throw new Error('Falha ao salvar próximo passo');
      await fetchClinicas();
      setModalMensagens(prev => (prev && prev.id === modalFollowup.id ? { ...prev, ...followupForm } : prev));
      setModalFollowup(null);
    } catch (e) {
      alert('Erro ao salvar follow-up: ' + e.message);
    }
    setSalvandoFollowup(false);
  };
  const [autoConfig, setAutoConfig] = useState({
    busca_auto_ativa: 'false',
    busca_cidade: 'Fortaleza',
    busca_bairros: ['Aldeota', 'Meireles', 'Messejana', 'Maraponga', 'Parangaba', 'Benfica', 'Fátima', 'Papicu'],
    busca_tipos: ['Clínica Odontológica', 'Clínica de Estética', 'Clínica Médica', 'Fisioterapia', 'Dermatologista'],
    busca_quantidade: '30',
    followup_auto_ativo: 'false',
    followup_dias_1: '1',
    followup_dias_2: '3',
    whatsapp_vendedor: '',
    horario_inteligente_ativo: 'true',
  });
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [tmplW, setTmplW] = useState(`Olá, tudo bem? Sou o Henrique, da CleanMed.

Estou entrando em contato porque a CleanMed ajuda clínicas a reduzir o trabalho manual da recepção — automatizando confirmações de consultas, lembretes e agendamentos pelo WhatsApp.

Queria entender rapidamente como vocês fazem isso hoje. Você teria alguns minutos para conversarmos por aqui?`);

  const fetchClinicas = useCallback(async () => {
    try {
      const r = await fetch(`${API}/clinicas`);
      setClinicas(await r.json());
      const s = await fetch(`${API}/clinicas/stats`);
      if (s.ok) setStats(await s.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchAutopilot = useCallback(async () => {
    try {
      const r = await fetch(`${API}/autopilot`);
      if (r.ok) setAutopilotStatus(await r.json());
      
      const rQr = await fetch(`${API}/autopilot/qr`);
      if (rQr.ok) {
        const qrData = await rQr.json();
        if (qrData.ready) setAutopilotQr('ready');
        else if (qrData.qr) setAutopilotQr(qrData.qr);
        else setAutopilotQr(null);
      }
    } catch (e) { console.error('Erro autopilot status/qr:', e); }
  }, []);

  const fetchFollowupQueue = useCallback(async () => {
    setLoadingFollowupQueue(true);
    setFollowupQueueError('');
    try {
      const response = await fetch(`${API}/autopilot/followups?limit=200`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a fila.');
      setFollowupQueue(data);
    } catch (error) {
      setFollowupQueueError(error.message);
    } finally {
      setLoadingFollowupQueue(false);
    }
  }, []);

  const carregarHistoricoFollowup = async (item) => {
    setLoadingFollowupHistory(prev => ({ ...prev, [item.id]: true }));
    try {
      const response = await fetch(`${API}/clinicas/${item.id}/followup/historico`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || 'Não foi possível carregar o histórico.');
      setFollowupHistory(prev => ({ ...prev, [item.id]: data.items || [] }));
    } catch (error) {
      alert(error.message);
    } finally {
      setLoadingFollowupHistory(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const registrarFollowupManual = async (item) => {
    const etapa = Number(item.followup_stage || 0) + 1;
    if (!window.confirm(`Confirma que você já realizou o follow-up da clínica ${item.nome}? Isso avançará para a etapa ${etapa + 1} e recalculará o próximo prazo. Nenhuma mensagem será enviada.`)) return;
    try {
      const response = await fetch(`${API}/clinicas/${item.id}/followup/registrar`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || 'Não foi possível registrar o follow-up.');
      await Promise.all([fetchFollowupQueue(), fetchClinicas()]);
    } catch (error) {
      alert(error.message);
    }
  };

  const fetchAutopilotConfig = useCallback(async () => {
    try {
      const rCfg = await fetch(`${API}/autopilot/config`);
      if (rCfg.ok) {
        const cfg = await rCfg.json();
        setAutoConfig(prev => ({ ...prev, ...cfg }));
      }
    } catch (e) { console.error('Erro autopilot config:', e); }
  }, []);

  const fetchMensagens = useCallback(async (clinicaId) => {
    setCarregandoMensagens(true);
    try {
      const r = await fetch(`${API}/clinicas/${clinicaId}/messages`);
      if (r.ok) setHistoricoMensagens(await r.json());
    } catch (e) { console.error('Erro ao buscar histórico de mensagens:', e); }
    setCarregandoMensagens(false);
  }, []);

  const fetchTodasMensagensGlobal = useCallback(async (queryStr = '') => {
    setCarregandoMensagensGlobal(true);
    try {
      const r = await fetch(`${API}/clinicas/messages/search/all?q=${encodeURIComponent(queryStr)}`);
      if (r.ok) setTodasMensagens(await r.json());
    } catch (e) { console.error('Erro ao buscar todas mensagens:', e); }
    setCarregandoMensagensGlobal(false);
  }, []);

  const syncHistoricoChat = async (clinicaId) => {
    setCarregandoMensagens(true);
    try {
      const res = await fetch(`${API}/clinicas/${clinicaId}/sync-history`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao sincronizar');
      alert(`✅ Sincronizado! ${data.importadas || 0} mensagens passadas foram encontradas e salvas no banco.`);
      await fetchMensagens(clinicaId);
    } catch (e) {
      alert('Aviso: ' + e.message);
    }
    setCarregandoMensagens(false);
  };

  const toggleIaClinica = async (clinicaId, statusAtual) => {
    const novoValor = Number(statusAtual) === 0 ? 1 : 0;
    setAtualizandoIaId(clinicaId);
    try {
      const res = await fetch(`${API}/clinicas/${clinicaId}/ia`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ia_ativa: novoValor })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao alterar status da IA');

      // Atualiza clinicas localmente
      setClinicas(prev => prev.map(c => c.id === clinicaId ? { ...c, ia_ativa: novoValor } : c));

      // Atualiza modal se estiver aberto
      setModalMensagens(prev => (prev && prev.id === clinicaId ? { ...prev, ia_ativa: novoValor } : prev));

      // Atualiza lista global de mensagens se presente
      setTodasMensagens(prev => prev.map(m => m.clinica_id === clinicaId ? { ...m, clinica_ia_ativa: novoValor } : m));
    } catch (e) {
      alert('Erro ao alterar interferência da IA: ' + e.message);
    }
    setAtualizandoIaId(null);
  };

  const abrirChatModal = (c) => {
    const clinicaCompleta = clinicas.find(item => item.id === c.id) || c;
    setModalMensagens({ ...c, ...clinicaCompleta });
    setNovaMensagemTexto('');
    fetchMensagens(c.id);
  };

  const enviarChatMessage = async () => {
    if (!novaMensagemTexto.trim() || !modalMensagens) return;
    setEnviandoChatMessage(true);
    try {
      const res = await fetch(`${API}/clinicas/${modalMensagens.id}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: novaMensagemTexto })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao enviar');
      setNovaMensagemTexto('');
      await fetchMensagens(modalMensagens.id);
      await fetchClinicas();
    } catch (e) {
      alert('Erro ao enviar mensagem: ' + e.message);
    }
    setEnviandoChatMessage(false);
  };

  const enriquecerClinicaManual = async (clinicaId) => {
    setEnriquecendoId(clinicaId);
    try {
      const res = await fetch(`${API}/clinicas/${clinicaId}/enriquecer`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao enriquecer');
      await fetchClinicas();
      setModalReviews(data.clinica || data);
      alert(`✨ Clínica enriquecida com sucesso!`);
    } catch (e) {
      alert('Aviso: ' + e.message);
    }
    setEnriquecendoId(null);
  };

  useEffect(() => { 
    fetchClinicas(); 
    fetchAutopilot();
    fetchAutopilotConfig();
    fetchTodasMensagensGlobal();
    const interval = setInterval(() => {
      fetchAutopilot();
      fetchClinicas();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchClinicas, fetchAutopilot, fetchAutopilotConfig, fetchTodasMensagensGlobal]);

  async function toggleAutopilot() {
    try {
      const r = await fetch(`${API}/autopilot/toggle`, { method: 'POST' });
      if (r.ok) setAutopilotStatus(await r.json());
    } catch (e) { console.error(e); }
  }

  const bairros = [...new Set(clinicas.map(c => c.bairro).filter(Boolean))].sort();
  const CATEGORIAS_PADRAO = ['Clínica Odontológica', 'Clínica de Estética', 'Dermatologista', 'Clínica Médica', 'Fisioterapia'];
  const categoriasDoBanco = [...new Set(clinicas.map(c => c.categoria).filter(Boolean))];
  const categoriasArr = [...new Set([...CATEGORIAS_PADRAO, ...categoriasDoBanco])].sort();

  const filtradas = clinicas.filter(c => {
    const q = busca.toLowerCase();
    const cat = (c.categoria || '').toLowerCase();
    const matchBusca = !q || c.nome?.toLowerCase().includes(q) || c.bairro?.toLowerCase().includes(q)
      || c.tel?.includes(q) || c.email?.toLowerCase().includes(q) || c.endereco?.toLowerCase().includes(q)
      || cat.includes(q);
    const matchStatus = filtroStatus === 'todos' ? (mostrarDesativados ? true : c.status !== 'disabled') : c.status === filtroStatus;
    const matchPrioridade = !filtroPrioridade || (c.sales_priority || 'LOW') === filtroPrioridade;
    const matchBairro = !filtroBairro || c.bairro === filtroBairro;
    const matchCategoria = !filtroCategoria || (c.categoria || '') === filtroCategoria;
    const matchIa = filtroIa === 'todos' ? true : (filtroIa === 'pausada' ? c.ia_ativa === 0 : (c.ia_ativa !== 0));
    return matchBusca && matchStatus && matchPrioridade && matchBairro && matchCategoria && matchIa;
  });

  const filtradasOrdenadas = [...filtradas].sort((a, b) => {
    const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };
    const pA = priorityOrder[a.sales_priority] || 3;
    const pB = priorityOrder[b.sales_priority] || 3;
    if (pA !== pB) return pA - pB;
    const scoreDiff = Number(b.fit_score || 0) - Number(a.fit_score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return a.id - b.id;
  });

  function novoForm() {
    setForm({ nome: '', tel: '', bairro: '', email: '', endereco: '', site: '', avaliacao: '', categoria: '', sales_priority: null });
    setEditandoId(null);
    setMostrarForm(true);
  }

  function editarClinica(c) {
    setForm({ 
      nome: c.nome||'', 
      tel: c.tel||'', 
      bairro: c.bairro||'', 
      email: c.email||'', 
      endereco: c.endereco||'', 
      site: c.site||'', 
      avaliacao: c.avaliacao||'',
      categoria: c.categoria||'',
      sales_priority: c.sales_priority||'LOW'
    });
    setEditandoId(c.id);
    setMostrarForm(true);
    setTab('clinicas');
  }

  async function salvar() {
    if (!form.nome.trim()) { alert('Informe o nome da clínica.'); return; }
    setSalvando(true);
    try {
      if (editandoId) {
        await fetch(`${API}/clinicas/${editandoId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
      } else {
        await fetch(`${API}/clinicas`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
      }
      await fetchClinicas();
      setMostrarForm(false);
      setEditandoId(null);
      setForm({ nome: '', tel: '', bairro: '', email: '', endereco: '', site: '', avaliacao: '', categoria: '', sales_priority: null });
    } catch(e) { alert('Erro ao salvar.'); }
    setSalvando(false);
  }

  async function enviarRespostaManual() {
    if (!textoResposta.trim() || !modalResposta) return;
    setSalvando(true);
    try {
      const res = await fetch(`${API}/clinicas/${modalResposta.id}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: textoResposta })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');
      
      alert('Mensagem enviada com sucesso pelo WhatsApp!');
      setModalResposta(null);
      setTextoResposta('');
    } catch(e) {
      alert('Erro ao enviar mensagem: ' + e.message);
    }
    setSalvando(false);
  }

  async function fetchHistoricoStatus(clinicaId) {
    try {
      const response = await fetch(`${API}/clinicas/${clinicaId}/historico-status`);
      if (!response.ok) throw new Error('Não foi possível carregar o histórico');
      const historico = await response.json();
      setPipelineHistorico(prev => ({ ...prev, [clinicaId]: historico }));
    } catch (error) {
      console.error('Erro ao carregar histórico do pipeline:', error);
      setPipelineHistorico(prev => ({ ...prev, [clinicaId]: [] }));
    }
  }

  async function updStatus(id, status) {
    await fetch(`${API}/clinicas/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    await fetchClinicas();
  }

  async function remover(id) {
    if (!confirm('Tem certeza que deseja excluir esta clínica?')) return;
    try {
      await fetch(`${API}/clinicas/${id}`, { method: 'DELETE' });
      await fetchClinicas();
    } catch (e) {
      alert('Erro ao excluir clínica.');
    }
  }

  const total = clinicas.length;
  const pendentes = clinicas.filter(c => c.status === 'pending' || c.status === 'paused_site');
  const enviados = clinicas.filter(c => ['sent', 'interviewing', 'reply', 'reuniao_agendada', 'demo_realizada', 'negociando', 'diagnostico', 'proposta', 'converted'].includes(c.status)).length;
  const responderam = clinicas.filter(c => ['reply', 'interviewing', 'reuniao_agendada', 'demo_realizada', 'negociando', 'diagnostico', 'proposta', 'converted'].includes(c.status)).length;
  const convertidos = clinicas.filter(c => c.status === 'converted').length;
  const telefonesValidos = clinicas.filter(c => (c.tel || '').replace(/\D/g, '').length >= 10).length;
  const comSite = clinicas.filter(c => c.site).length;
  const pendentesComSite = clinicas.filter(c => c.status === 'paused_site').length;
  const followupsEnviados = clinicas.filter(c => Number(c.followup_stage || 0) > 0).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">CleanMed — Prospecção</h1>
          <p className="text-xs text-gray-500">Gestão de contatos e disparo de mensagens</p>
        </div>
        <div className="flex gap-2">
          <Link href="/busca"
            className="border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
            🔍 Buscar Leads (Google Maps)
          </Link>
          <button onClick={novoForm}
            className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
            + Nova clínica
          </button>
        </div>
      </header>

      <div className="max-w-[98%] mx-auto px-2 py-6">

        {/* Métricas rápidas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            ['Pendentes', pendentes.length, 'pending', 'text-amber-600', 'bg-amber-50', 'border-amber-200'],
            ['Enviados', enviados, 'sent', 'text-emerald-600', 'bg-emerald-50', 'border-emerald-200'],
            ['🤖 Em Entrevista', clinicas.filter(c => c.status === 'interviewing').length, 'interviewing', 'text-indigo-600', 'bg-indigo-50', 'border-indigo-200'],
            ['🔥 Responderam', responderam, 'reply', 'text-orange-600', 'bg-orange-50', 'border-orange-200']
          ].map(([l, v, status, textColor, bgColor, borderColor]) => (
            <div 
              key={l} 
              onClick={() => {
                setTab('clinicas');
                setFiltroStatus(status);
              }}
              className={`${bgColor} rounded-xl border ${borderColor} p-4 cursor-pointer hover:shadow-md transition-all group`}
            >
              <div className={`text-xs font-bold mb-1 ${textColor}`}>{l}</div>
              <div className={`text-3xl font-black ${textColor}`}>{v}</div>
            </div>
          ))}
        </div>

        {/* Painel de Prioridades */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Distribuição de Prioridades */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Distribuição por Prioridade</h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-red-50/50 border border-red-100 rounded-lg p-3 text-center cursor-pointer hover:bg-red-50 hover:shadow-sm transition-all"
                   onClick={() => { setTab('clinicas'); setFiltroStatus('todos'); setFiltroPrioridade('HIGH'); setBusca(''); }}>
                <span className="text-[10px] font-bold text-red-600 block">🔥 ALTA</span>
                <span className="text-2xl font-black text-red-700">{clinicas.filter(c => c.sales_priority === 'HIGH').length}</span>
              </div>
              <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-3 text-center cursor-pointer hover:bg-orange-50 hover:shadow-sm transition-all"
                   onClick={() => { setTab('clinicas'); setFiltroStatus('todos'); setFiltroPrioridade('MEDIUM'); setBusca(''); }}>
                <span className="text-[10px] font-bold text-orange-600 block">⚡ MÉDIA</span>
                <span className="text-2xl font-black text-orange-700">{clinicas.filter(c => c.sales_priority === 'MEDIUM').length}</span>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-100 hover:shadow-sm transition-all"
                   onClick={() => { setTab('clinicas'); setFiltroStatus('todos'); setFiltroPrioridade('LOW'); setBusca(''); }}>
                <span className="text-[10px] font-bold text-gray-500 block">💤 BAIXA</span>
                <span className="text-2xl font-black text-gray-700">{clinicas.filter(c => c.sales_priority === 'LOW' || !c.sales_priority).length}</span>
              </div>
            </div>
          </div>

          {/* Funil de Conversão de Leads HIGH */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Funil de Leads ALTA (HIGH)</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-blue-50/30 border border-blue-100 rounded-lg p-2.5">
                <span className="text-[9px] font-semibold text-blue-600 block leading-tight">1. Humanizado</span>
                <span className="text-xl font-bold text-blue-700">{clinicas.filter(c => c.sales_priority === 'HIGH' && ['reply', 'diagnostico', 'proposta', 'converted'].includes(c.status)).length}</span>
              </div>
              <div className="bg-purple-50/30 border border-purple-100 rounded-lg p-2.5">
                <span className="text-[9px] font-semibold text-purple-600 block leading-tight">2. Demonstração</span>
                <span className="text-xl font-bold text-purple-700">{clinicas.filter(c => c.sales_priority === 'HIGH' && ['diagnostico', 'proposta', 'converted'].includes(c.status)).length}</span>
              </div>
              <div className="bg-pink-50/30 border border-pink-100 rounded-lg p-2.5">
                <span className="text-[9px] font-semibold text-pink-600 block leading-tight">3. Proposta</span>
                <span className="text-xl font-bold text-pink-700">{clinicas.filter(c => c.sales_priority === 'HIGH' && ['proposta', 'converted'].includes(c.status)).length}</span>
              </div>
              <div className="bg-green-50/30 border border-green-100 rounded-lg p-2.5">
                <span className="text-[9px] font-semibold text-green-600 block leading-tight">4. Venda</span>
                <span className="text-xl font-bold text-green-700">{clinicas.filter(c => c.sales_priority === 'HIGH' && c.status === 'converted').length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Qualidade da Base</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
              <span className="text-[10px] font-bold text-gray-500 block">TELEFONE VÁLIDO</span>
              <span className="text-2xl font-black text-gray-900">{telefonesValidos}</span>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
              <span className="text-[10px] font-bold text-gray-500 block">COM SITE</span>
              <span className="text-2xl font-black text-gray-900">{comSite}</span>
            </div>
            <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 cursor-pointer" onClick={() => { setTab('clinicas'); setFiltroStatus('paused_site'); }}>
              <span className="text-[10px] font-bold text-sky-600 block">PENDENTE COM SITE</span>
              <span className="text-2xl font-black text-sky-700">{pendentesComSite}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <span className="text-[10px] font-bold text-emerald-600 block">FOLLOW-UPS</span>
              <span className="text-2xl font-black text-emerald-700">{followupsEnviados}</span>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 cursor-pointer" onClick={() => { setTab('clinicas'); }}>
              <span className="text-[10px] font-bold text-purple-600 block">INSIGHTS MAPS IA ✨</span>
              <span className="text-2xl font-black text-purple-700">{clinicas.filter(c => c.enriquecido_em).length}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto whitespace-nowrap">
          {[['clinicas', 'Clínicas'], ['conversas', '💬 Central de Mensagens'], ['pipeline', '📊 Pipeline'], ['followups', '⏰ Follow-ups'], ['autopilot', '🤖 Piloto Automático'], ['disparar', 'Disparar mensagens'], ['mensagem', 'Editar template'], ['acompanhar', 'Acompanhar'], ['desativados', 'Desativados']].map(([id, label]) => (
            <button key={id} onClick={() => {
              setTab(id);
              if (id === 'conversas') fetchTodasMensagensGlobal(buscaMensagemGlobal);
              if (id === 'followups') fetchFollowupQueue();
            }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-gray-900 text-gray-900 font-bold' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
              {label}
              {id === 'clinicas' && <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{clinicas.filter(c => c.status !== 'disabled').length}</span>}
              {id === 'desativados' && <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{clinicas.filter(c => c.status === 'disabled').length}</span>}
              {id === 'disparar' && pendentes.length > 0 && <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{pendentes.length}</span>}
              {id === 'pipeline' && clinicas.filter(c => isQualificadoPipeline(c) && c.status !== 'converted').length > 0 && <span className="ml-1.5 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full animate-pulse">{clinicas.filter(c => isQualificadoPipeline(c) && c.status !== 'converted').length}</span>}
              {id === 'followups' && followupQueue.total > 0 && <span className="ml-1.5 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{followupQueue.total}</span>}
            </button>
          ))}
        </div>

        {/* PIPELINE KANBAN */}
        {tab === 'pipeline' && (() => {
          const PIPELINE_COLS = [
            { status: 'qualificados', label: 'Qualificados / Dor', color: 'amber', emoji: '🔥', match: (c) => c.status === 'indicou_responsavel' || (c.status === 'interviewing' && isQualificadoPipeline(c)) },
            { status: 'reply', label: 'Contato Humano', color: 'blue', emoji: '📞', match: (c) => c.status === 'reply' },
            { status: 'reuniao_agendada', label: 'Demo Agendada', color: 'violet', emoji: '📅', match: (c) => c.status === 'reuniao_agendada' },
            { status: 'demo_realizada', label: 'Teste Assistido (30 dias)', color: 'fuchsia', emoji: '🧪', match: (c) => c.status === 'demo_realizada' },
            { status: 'negociando', label: 'Em Fechamento', color: 'cyan', emoji: '🤝', match: (c) => c.status === 'negociando' || c.status === 'diagnostico' || c.status === 'proposta' },
            { status: 'converted', label: 'Assinante', color: 'green', emoji: '✅', match: (c) => c.status === 'converted' },
          ];
          const nextStatus = (current) => {
            if (current === 'qualificados') return 'reply';
            const idx = PIPELINE_COLS.findIndex(c => c.status === current);
            return idx >= 0 && idx < PIPELINE_COLS.length - 1 ? PIPELINE_COLS[idx + 1].status : null;
          };
          const prevStatus = (current) => {
            if (current === 'qualificados') return null;
            if (current === 'reply') return 'interviewing';
            const idx = PIPELINE_COLS.findIndex(c => c.status === current);
            return idx > 0 ? PIPELINE_COLS[idx - 1].status : null;
          };
          const fetchNotas = async (clinicaId) => {
            try {
              const r = await fetch(`${API}/clinicas/${clinicaId}/notas`);
              if (r.ok) {
                const notas = await r.json();
                setPipelineNotas(prev => ({ ...prev, [clinicaId]: notas }));
              }
            } catch (e) { console.error(e); }
          };
          const addNota = async (clinicaId, texto, tipo) => {
            if (!texto.trim()) return;
            try {
              await fetch(`${API}/clinicas/${clinicaId}/notas`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto, tipo: tipo || 'nota' })
              });
              await fetchNotas(clinicaId);
            } catch (e) { console.error(e); }
          };
          const deleteNota = async (clinicaId, notaId) => {
            try {
              await fetch(`${API}/clinicas/${clinicaId}/notas/${notaId}`, { method: 'DELETE' });
              await fetchNotas(clinicaId);
            } catch (e) { console.error(e); }
          };

          // Taxa de resposta e contagens do Pipeline
          const totalEnviados = clinicas.filter(c => ['sent','interviewing','indicou_responsavel','reply','reuniao_agendada','demo_realizada','negociando','diagnostico','proposta','converted'].includes(c.status)).length;
          const totalResponderam = clinicas.filter(c => ['reply','interviewing','indicou_responsavel','reuniao_agendada','demo_realizada','negociando','diagnostico','proposta','converted'].includes(c.status)).length;
          const taxaResp = totalEnviados > 0 ? Math.round((totalResponderam / totalEnviados) * 100) : 0;
          const totalNoPipeline = clinicas.filter(c => isQualificadoPipeline(c) && c.status !== 'converted').length;
          const totalAtrasados = clinicas.filter(c => isQualificadoPipeline(c) && c.status !== 'converted' && c.proxima_acao_data && new Date(c.proxima_acao_data) <= new Date()).length;

          const aplicaFiltroPipeline = (c) => {
            if (filtroPipeline === 'atrasados') return c.proxima_acao_data && new Date(c.proxima_acao_data) <= new Date();
            if (filtroPipeline === 'high') return c.sales_priority === 'HIGH';
            if (filtroPipeline === 'manual') return c.progresso_lead === 'QUALIFICADO_DOR' || Boolean(c.dor_detectada && c.dor_detectada.trim());
            if (filtroPipeline === 'indicacao') return c.status === 'indicou_responsavel' || c.progresso_lead === 'INDICOU_RESPONSAVEL';
            return true;
          };

          return (
            <div>
              {/* Métricas do Pipeline */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Taxa de Resposta</div>
                  <div className="text-3xl font-black text-gray-900">{taxaResp}%</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Ativos no Funil</div>
                  <div className="text-3xl font-black text-blue-600">{totalNoPipeline}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Em Teste (7d)</div>
                  <div className="text-3xl font-black text-fuchsia-600">{clinicas.filter(c => c.status === 'demo_realizada').length}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Follow-ups Hoje/Atras.</div>
                  <div className={`text-3xl font-black ${totalAtrasados > 0 ? 'text-red-600' : 'text-gray-400'}`}>{totalAtrasados}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Assinantes</div>
                  <div className="text-3xl font-black text-green-600">{clinicas.filter(c => c.status === 'converted').length}</div>
                </div>
              </div>

              {/* Filtros Rápidos do Pipeline */}
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4 bg-white p-3 rounded-xl border border-gray-200">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    ['todos', '🌐 Todos no Funil'],
                    ['atrasados', `⏰ Vencendo / Atrasados (${totalAtrasados})`],
                    ['high', '🔥 Prioridade Alta'],
                    ['manual', '💡 Dor Manual'],
                    ['indicacao', '📌 Indicou Decisor'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setFiltroPipeline(id)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                        filtroPipeline === id
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!autoConfig.whatsapp_vendedor && (
                  <button
                    onClick={() => setTab('autopilot')}
                    className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100"
                  >
                    ⚠️ Configurar seu WhatsApp de alerta no Piloto Automático
                  </button>
                )}
              </div>

              {/* Kanban Board */}
              <div className="flex gap-4 overflow-x-auto pb-4">
                {PIPELINE_COLS.map(col => {
                  const colLeads = clinicas.filter(c => col.match(c) && aplicaFiltroPipeline(c))
                    .sort((a, b) => {
                      const pOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };
                      const diffP = (pOrder[a.sales_priority] || 3) - (pOrder[b.sales_priority] || 3);
                      if (diffP !== 0) return diffP;
                      return (b.fit_score || 0) - (a.fit_score || 0);
                    });
                  return (
                    <div key={col.status} className="flex-shrink-0 w-72 bg-gray-50 rounded-xl border border-gray-200 flex flex-col max-h-[70vh]">
                      {/* Column Header */}
                      <div className={`px-4 py-3 border-b border-gray-200 bg-${col.color}-50 rounded-t-xl`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{col.emoji}</span>
                            <span className="text-sm font-bold text-gray-900">{col.label}</span>
                          </div>
                          <span className={`text-xs font-bold bg-${col.color}-100 text-${col.color}-700 px-2 py-0.5 rounded-full`}>{colLeads.length}</span>
                        </div>
                      </div>
                      {/* Column Cards */}
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {colLeads.length === 0 && (
                          <div className="text-center text-gray-400 text-xs py-8">Nenhum lead</div>
                        )}
                        {colLeads.map(c => (
                          <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow">
                            {/* Lead Info */}
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-[13px] text-gray-900 truncate" title={c.nome}>{c.nome}</div>
                                <div className="text-[11px] text-gray-500">{maskPhone(c.tel) || '—'}</div>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ml-1 ${
                                c.sales_priority === 'HIGH' ? 'bg-red-50 text-red-700' :
                                c.sales_priority === 'MEDIUM' ? 'bg-orange-50 text-orange-700' :
                                'bg-gray-50 text-gray-500'
                              }`}>
                                {c.sales_priority === 'HIGH' ? '🔥' : c.sales_priority === 'MEDIUM' ? '⚡' : '💤'}
                              </span>
                            </div>
                            {/* Category & Score & Toggle IA */}
                            <div className="flex items-center gap-2 mb-2 flex-wrap justify-between">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {c.categoria && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c.categoria.length > 18 ? c.categoria.slice(0, 18) + '..' : c.categoria}</span>}
                                <span className="text-[10px] text-gray-400 font-medium">Fit {c.fit_score || 0}/100 · {c.sales_priority === 'HIGH' ? 'Urgência alta' : c.sales_priority === 'MEDIUM' ? 'Urgência média' : 'Urgência baixa'}</span>
                                <span className="text-[9px] text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">Adequação {c.lead_priority === 'HIGH' ? 'alta' : c.lead_priority === 'MEDIUM' ? 'média' : 'baixa'}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleIaClinica(c.id, c.ia_ativa !== 0 ? 1 : 0);
                                }}
                                disabled={atualizandoIaId === c.id}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all flex items-center gap-1 border ${
                                  c.ia_ativa === 0
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 shadow-sm'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                }`}
                                title={c.ia_ativa === 0 ? "IA Pausada para este lead (Sem interferência da IA). Clique para ativar." : "IA Ativa (Clique para pausar interferência da IA neste cliente)"}
                              >
                                {atualizandoIaId === c.id ? '⏳' : c.ia_ativa === 0 ? '🛑 Sem IA' : '🤖 IA Ativa'}
                              </button>
                            </div>
                            {/* Badge de Progresso Automático */}
                            {c.progresso_lead && c.progresso_lead !== 'PENDENTE' && (
                              <div className={`text-[10px] font-bold px-2 py-0.5 rounded inline-block mb-2 border ${
                                c.progresso_lead === 'INTERESSE_ALTO' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                c.progresso_lead === 'INDICOU_RESPONSAVEL' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                c.progresso_lead === 'QUALIFICADO_DOR' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                                c.progresso_lead === 'ROBO_URA' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                                c.progresso_lead === 'SEM_INTERESSE' ? 'bg-red-50 text-red-800 border-red-200' :
                                'bg-sky-50 text-sky-700 border-sky-200'
                              }`} title={c.progresso_motivo || ''}>
                                {c.progresso_lead === 'INTERESSE_ALTO' ? '🔥 Alto Interesse' :
                                 c.progresso_lead === 'INDICOU_RESPONSAVEL' ? '📌 Indicou Responsável' :
                                 c.progresso_lead === 'QUALIFICADO_DOR' ? '💡 Qualificado' :
                                 c.progresso_lead === 'ROBO_URA' ? '🤖 Robô / URA' :
                                 c.progresso_lead === 'SEM_INTERESSE' ? '🛑 Sem Interesse' :
                                 '💬 Em Qualificação'}
                              </div>
                            )}
                            {/* Dor detectada */}
                            {c.dor_detectada && (
                              <div className="text-[11px] text-rose-600 bg-rose-50 rounded px-2 py-1 mb-2 leading-tight" title={c.dor_detectada}>
                                {c.dor_detectada.length > 60 ? c.dor_detectada.slice(0, 60) + '...' : c.dor_detectada}
                              </div>
                            )}
                            {/* Próxima ação */}
                            {c.proxima_acao && (
                              <div className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-2 leading-tight">
                                📋 {c.proxima_acao.length > 50 ? c.proxima_acao.slice(0, 50) + '...' : c.proxima_acao}
                              </div>
                            )}
                            {c.proxima_acao_data && (
                              <div className={`text-[10px] font-bold mb-2 ${new Date(c.proxima_acao_data) < new Date() ? 'text-red-600' : 'text-gray-500'}`}>
                                ⏰ {new Date(c.proxima_acao_data).toLocaleDateString('pt-BR')}
                                {new Date(c.proxima_acao_data) < new Date() && ' (ATRASADO!)'}
                              </div>
                            )}
                            {/* Actions */}
                            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                              {prevStatus(col.status) && (
                                <button onClick={() => updStatus(c.id, prevStatus(col.status))}
                                  className="text-[11px] text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100" title="Voltar etapa">
                                  ←
                                </button>
                              )}
                              {nextStatus(col.status) && (
                                <button onClick={() => updStatus(c.id, nextStatus(col.status))}
                                  className="text-[11px] bg-gray-900 text-white px-2 py-1 rounded font-medium hover:bg-gray-700 flex-1">
                                  {col.status === 'qualificados' ? 'Assumir →' : 'Avançar →'}
                                </button>
                              )}
                              <button onClick={() => abrirModalFollowup(c)}
                                className="text-[11px] text-amber-600 hover:text-amber-800 p-1 rounded hover:bg-amber-50 font-bold" title="Agendar Próxima Ação / Follow-up">
                                ⏰
                              </button>
                              <button onClick={() => {
                                setModalNotas(c);
                                setNovaNota('');
                                fetchNotas(c.id);
                              }}
                                className="text-[11px] text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100" title="Notas">
                                📝
                              </button>
                              <button onClick={() => {
                                setModalHistorico(c);
                                fetchHistoricoStatus(c.id);
                              }}
                                className="text-[11px] text-indigo-500 hover:text-indigo-700 p-1 rounded hover:bg-indigo-50" title="Histórico de etapas">
                                🕘
                              </button>
                              <button onClick={() => setModalReviews(c)}
                                className={`text-[11px] p-1 rounded font-bold ${c.enriquecido_em ? 'text-purple-600 hover:bg-purple-50' : 'text-gray-400 hover:bg-gray-100'}`} title="Ver Insights & Avaliações do Google Maps">
                                ✨
                              </button>
                              <button onClick={() => abrirChatModal(c)}
                                className="text-[11px] text-emerald-600 hover:text-emerald-800 p-1 rounded hover:bg-emerald-50 font-bold" title="Abrir Chat + Playbook de Fechamento">
                                💬
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* MODAL DE NOTAS */}
        {modalNotas && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">📝 Notas — {modalNotas.nome}</h3>
                  <p className="text-xs text-gray-500">{maskPhone(modalNotas.tel)} · {modalNotas.categoria || 'Sem categoria'}</p>
                </div>
                <button onClick={() => setModalNotas(null)} className="text-gray-400 hover:text-gray-900 bg-white p-2 rounded-xl shadow-sm border border-gray-100">✕</button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto space-y-2">
                {(pipelineNotas[modalNotas.id] || []).length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-8">Nenhuma nota registrada.</div>
                )}
                {(pipelineNotas[modalNotas.id] || []).map(n => (
                  <div key={n.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100 group">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <span className={`text-[10px] font-bold uppercase mr-2 ${
                          n.tipo === 'ligacao' ? 'text-green-600' : n.tipo === 'reuniao' ? 'text-violet-600' : n.tipo === 'mensagem_manual' ? 'text-blue-600' : 'text-gray-400'
                        }`}>{n.tipo === 'ligacao' ? '📞 Ligação' : n.tipo === 'reuniao' ? '📅 Reunião' : n.tipo === 'mensagem_manual' ? '💬 Mensagem' : '📝 Nota'}</span>
                        <span className="text-[10px] text-gray-400">{new Date(n.criado_em).toLocaleString('pt-BR')}</span>
                      </div>
                      <button onClick={async () => {
                        const cId = modalNotas.id;
                        const nId = n.id;
                        await fetch(`${API}/clinicas/${cId}/notas/${nId}`, { method: 'DELETE' });
                        const r = await fetch(`${API}/clinicas/${cId}/notas`);
                        if (r.ok) {
                          const data = await r.json();
                          setPipelineNotas(prev => ({ ...prev, [cId]: data }));
                        }
                      }}
                        className="text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>
                    </div>
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{n.texto}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                <div className="flex gap-2 mb-2">
                  {[['nota', '📝 Nota'], ['ligacao', '📞 Ligação'], ['reuniao', '📅 Reunião']].map(([tipo, label]) => (
                    <button key={tipo} onClick={async () => {
                      if (!novaNota.trim()) return;
                      await fetch(`${API}/clinicas/${modalNotas.id}/notas`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ texto: novaNota, tipo })
                      });
                      const r = await fetch(`${API}/clinicas/${modalNotas.id}/notas`);
                      if (r.ok) {
                        const data = await r.json();
                        setPipelineNotas(prev => ({ ...prev, [modalNotas.id]: data }));
                      }
                      setNovaNota('');
                    }}
                      className="text-[11px] border border-gray-200 px-2 py-1 rounded-lg hover:bg-gray-50 font-medium">{label}</button>
                  ))}
                </div>
                <textarea
                  value={novaNota}
                  onChange={e => setNovaNota(e.target.value)}
                  placeholder="Escreva uma nota... (ex: Liguei, falei com a recepcionista Maria. Agendar demo para 2a-feira)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none resize-none h-20 mb-2"
                />
              </div>
            </div>
          </div>
        )}

        {modalHistorico && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">🕘 Histórico do pipeline</h3>
                  <p className="text-xs text-gray-500">{modalHistorico.nome}</p>
                </div>
                <button onClick={() => setModalHistorico(null)} className="text-gray-400 hover:text-gray-900 bg-white p-2 rounded-xl shadow-sm border border-gray-100">✕</button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto space-y-3">
                {(pipelineHistorico[modalHistorico.id] || []).length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-8">Nenhuma movimentação registrada ainda.</div>
                ) : (pipelineHistorico[modalHistorico.id] || []).map(item => (
                  <div key={item.id} className="flex gap-3 items-start border-l-2 border-indigo-200 pl-3 py-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {STATUS[item.old_status] || item.old_status || 'Cadastro inicial'}
                        <span className="text-gray-400 font-normal mx-2">→</span>
                        {STATUS[item.new_status] || item.new_status}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">{new Date(item.changed_at + (item.changed_at.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CENTRAL DE MENSAGENS */}
        {tab === 'conversas' && (
          <div className="space-y-6">
            {/* Cabeçalho de Busca */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    💬 Central de Mensagens do WhatsApp
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Pesquise e consulte qualquer mensagem enviada ou recebida por nome da clínica, telefone ou conteúdo.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fetchTodasMensagensGlobal(buscaMensagemGlobal)}
                    className="text-xs bg-gray-900 hover:bg-gray-700 text-white font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    🔄 Atualizar Mensagens
                  </button>
                </div>
              </div>

              {/* Input de Busca */}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
                <input
                  value={buscaMensagemGlobal}
                  onChange={e => {
                    setBuscaMensagemGlobal(e.target.value);
                    fetchTodasMensagensGlobal(e.target.value);
                  }}
                  placeholder="Digite o nome da clínica, telefone (ex: 85994465642) ou texto da mensagem..."
                  className="w-full text-sm border border-gray-200 rounded-xl pl-11 pr-4 py-3 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                />
              </div>
            </div>

            {/* Tabela de Mensagens Encontradas */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {todasMensagens.length} mensagem{todasMensagens.length !== 1 ? 's' : ''} encontrada{todasMensagens.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-3.5">Data / Hora</th>
                      <th className="px-5 py-3.5">Clínica</th>
                      <th className="px-5 py-3.5">Telefone</th>
                      <th className="px-5 py-3.5">Direção / Emissor</th>
                      <th className="px-5 py-3.5">Conteúdo da Mensagem</th>
                      <th className="px-5 py-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {carregandoMensagensGlobal ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 text-sm">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
                            Buscando mensagens no banco de dados...
                          </div>
                        </td>
                      </tr>
                    ) : todasMensagens.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400 text-sm">
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xl mx-auto mb-2">💬</div>
                          Nenhuma mensagem encontrada para essa busca.
                        </td>
                      </tr>
                    ) : (
                      todasMensagens.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50/80 transition-colors">
                          {/* Timestamp */}
                          <td className="px-5 py-4 whitespace-nowrap text-xs text-gray-500 font-medium">
                            {m.timestamp ? new Date(m.timestamp).toLocaleString('pt-BR') : '—'}
                          </td>

                          {/* Nome da Clínica */}
                          <td className="px-5 py-4">
                            <div className="font-bold text-gray-900 text-xs">{m.clinica_nome}</div>
                            <span className="text-[10px] text-gray-400 block">{m.clinica_categoria || 'Sem categoria'}</span>
                          </td>

                          {/* Telefone */}
                          <td className="px-5 py-4 whitespace-nowrap text-xs text-gray-600 font-semibold">
                            {maskPhone(m.clinica_tel) || '—'}
                          </td>

                          {/* Direção / Emissor */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            {m.direction === 'inbound' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                                🟢 Recebida (Lead)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                                🔵 Enviada ({m.sender === 'human' ? 'Humano' : 'Robô'})
                              </span>
                            )}
                            {m.source && (
                              <span className="text-[9px] text-gray-400 uppercase font-bold block mt-1 ml-1">
                                Origem: {m.source}
                              </span>
                            )}
                          </td>

                          {/* Conteúdo */}
                          <td className="px-5 py-4 text-xs text-gray-800 font-normal max-w-md whitespace-pre-wrap leading-relaxed">
                            {m.content}
                          </td>

                          {/* Ação */}
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleIaClinica(m.clinica_id, m.clinica_ia_ativa !== 0 ? 1 : 0);
                                }}
                                disabled={atualizandoIaId === m.clinica_id}
                                className={`text-xs font-bold border px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 ${
                                  m.clinica_ia_ativa === 0
                                    ? 'bg-amber-500 hover:bg-amber-400 text-gray-950 font-black border-amber-400 ring-2 ring-amber-300'
                                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                                }`}
                                title={m.clinica_ia_ativa === 0 ? "IA Pausada para este cliente. Clique para reativar." : "IA Ativa. Clique para pausar interferência da IA."}
                              >
                                {atualizandoIaId === m.clinica_id ? '⏳' : m.clinica_ia_ativa === 0 ? '🛑 Sem IA (Ativar)' : '🤖 IA Ativa (Pausar)'}
                              </button>
                              <button
                                onClick={() => abrirChatModal({ id: m.clinica_id, nome: m.clinica_nome, tel: m.clinica_tel, status: m.clinica_status, categoria: m.clinica_categoria, ia_ativa: m.clinica_ia_ativa })}
                                className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 px-3 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1"
                              >
                                💬 Abrir Conversa
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* FILA DE FOLLOW-UPS */}
        {tab === 'followups' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Fila de follow-ups</h2>
                  <p className="text-sm text-gray-500 mt-1">Acompanhe os contatos que já chegaram ao prazo de retorno e assuma a conversa manualmente.</p>
                </div>
                <button onClick={fetchFollowupQueue} disabled={loadingFollowupQueue}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {loadingFollowupQueue ? 'Atualizando...' : '↻ Atualizar fila'}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                  <div className="text-xs text-gray-500">Aguardando retorno</div>
                  <div className="text-2xl font-bold text-gray-900">{followupQueue.total}</div>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                  <div className="text-xs text-red-700">Vencidos</div>
                  <div className="text-2xl font-bold text-red-700">{followupQueue.items.filter(item => item.due_status === 'overdue').length}</div>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                  <div className="text-xs text-amber-700">No prazo de hoje</div>
                  <div className="text-2xl font-bold text-amber-700">{followupQueue.items.filter(item => item.due_status === 'due').length}</div>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                  <div className="text-xs text-gray-500">Envio automático</div>
                  <div className="text-sm font-bold text-gray-900 mt-1">{followupQueue.enabled ? 'Habilitado' : 'Desativado'}</div>
                  <div className="text-[11px] text-gray-500">Esta tela não envia mensagens.</div>
                </div>
              </div>
              {followupQueue.scheduleDays?.length > 0 && (
                <p className="text-xs text-gray-500 mt-3">Cadência configurada: {followupQueue.scheduleDays.join(' · ')} dias após cada contato.</p>
              )}
            </div>

            {followupQueueError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {followupQueueError}
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Contatos elegíveis para retorno</h3>
                <span className="text-xs text-gray-500">{followupQueue.returned} de {followupQueue.total} exibidos</span>
              </div>
              {loadingFollowupQueue && followupQueue.items.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">Carregando fila...</div>
              ) : followupQueue.items.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-3xl mb-2">✓</div>
                  <p className="font-semibold text-gray-800">Nenhum follow-up pendente neste momento.</p>
                  <p className="text-sm text-gray-500 mt-1">Quando um contato atingir o prazo configurado, ele aparecerá aqui.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {followupQueue.items.map(item => (
                    <div key={item.id} className="p-4 flex flex-col gap-3">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-bold text-gray-900">{item.nome}</h4>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${item.due_status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                            {item.due_status === 'overdue' ? 'ATRASADO' : 'NO PRAZO'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${item.sales_priority === 'HIGH' ? 'bg-red-50 text-red-700' : item.sales_priority === 'MEDIUM' ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                            Prioridade {item.sales_priority || 'LOW'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">{maskPhone(item.tel)}{item.categoria ? ` · ${item.categoria}` : ''}{item.cidade ? ` · ${item.cidade}` : ''}</div>
                        <div className="text-xs text-gray-500 mt-2">
                          Etapa {Number(item.followup_stage || 0) + 1} · Prazo: {item.due_at ? new Date(item.due_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : '—'}
                          {item.last_followup_at ? ` · Último follow-up: ${new Date(item.last_followup_at.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => abrirChatModal(item)}
                          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700">
                          Abrir conversa
                        </button>
                        <button onClick={() => registrarFollowupManual(item)}
                          className="px-4 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-semibold hover:bg-emerald-100">
                          Registrar retorno feito
                        </button>
                        <button onClick={() => carregarHistoricoFollowup(item)}
                          className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50">
                          Ver histórico
                        </button>
                      </div>
                      </div>
                      {followupHistory[item.id] && (
                        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                          <div className="text-xs font-bold text-gray-700 mb-2">Histórico de follow-ups</div>
                          {followupHistory[item.id].length === 0 ? (
                            <p className="text-xs text-gray-500">Nenhuma tentativa registrada ainda.</p>
                          ) : (
                            <div className="space-y-2">
                              {followupHistory[item.id].map(entry => (
                                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="text-gray-700">Etapa {entry.stage} · {entry.source === 'manual' ? 'Registrado manualmente' : 'Enviado pelo piloto automático'}</span>
                                  <span className="text-gray-500">{new Date(entry.created_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">A fila é informativa. Nenhum contato é acionado automaticamente por esta tela; revise o histórico e decida manualmente se deve enviar uma mensagem.</p>
          </div>
        )}

        {/* PILOTO AUTOMÁTICO */}
        {tab === 'autopilot' && (
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Card Principal */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Piloto Automático 🚀</h2>
              <p className="text-gray-500 mb-8 max-w-lg mx-auto">Deixe a Inteligência Artificial e o Motor de WhatsApp prospectarem por você enquanto você toma um café.</p>
              <div className="flex flex-col md:flex-row gap-8 justify-center items-center">
                {/* Status da Conexão */}
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 w-full md:w-1/2 flex flex-col items-center">
                  <h3 className="font-semibold text-gray-700 mb-4">1. Conexão do WhatsApp</h3>
                  {autopilotQr === 'ready' ? (
                    <div className="text-emerald-600 flex flex-col items-center">
                      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                      <span className="font-bold">WhatsApp Conectado!</span>
                      <span className="text-xs text-gray-500 mt-1">Pronto para disparos invisíveis.</span>
                    </div>
                  ) : autopilotQr ? (
                    <div className="flex flex-col items-center">
                      <p className="text-xs text-gray-500 mb-3">Escaneie o QR Code com seu WhatsApp (Aparelhos Conectados)</p>
                      <img src={autopilotQr} alt="QR Code WhatsApp" className="w-48 h-48 border border-gray-300 rounded" />
                    </div>
                  ) : (
                    <div className="text-gray-400 flex flex-col items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mb-3"></div>
                      <span className="text-sm">Iniciando motor do WhatsApp...</span>
                    </div>
                  )}
                  <button 
                    onClick={async () => {
                      try {
                        await fetch(`${API}/autopilot/restart-qr`, { method: 'POST' });
                        alert('🔄 Reiniciando WhatsApp... Aguarde alguns segundos para o novo QR Code carregar.');
                        fetchAutopilot();
                      } catch(e) { alert('Erro ao reiniciar QR Code'); }
                    }}
                    className="mt-4 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1">
                    🔄 Gerar Novo QR Code / Reconectar
                  </button>
                </div>

                {/* Controle */}
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 w-full md:w-1/2 flex flex-col items-center justify-center min-h-[220px]">
                  <h3 className="font-semibold text-gray-700 mb-4">2. Motor de Automação</h3>
                  <button
                    onClick={toggleAutopilot}
                    disabled={autopilotQr !== 'ready'}
                    className={`px-8 py-4 rounded-full font-bold text-lg transition-all shadow-lg flex items-center gap-2 ${autopilotStatus.isOn ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'} ${autopilotQr !== 'ready' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {autopilotStatus.isOn ? '🛑 DESLIGAR Piloto' : '🚀 LIGAR Piloto Automático'}
                  </button>
                  <div className="mt-6 text-sm font-medium text-gray-600">
                    Status Atual: <span className={autopilotStatus.isOn ? 'text-emerald-600 font-bold' : 'text-gray-400'}>{autopilotStatus.isOn ? 'RODANDO' : 'DESLIGADO'}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 text-center px-4">{autopilotStatus.currentTask}</div>
                  <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-center">
                    <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Envios automáticos hoje</div>
                    <div className="text-xl font-bold text-gray-900 tabular-nums">
                      {autopilotStatus.dailyStats?.sentCount ?? 0}
                      <span className="text-sm text-gray-400 font-medium"> / {autopilotStatus.dailyLimit ?? autoConfig.limite_diario_envios ?? 40}</span>
                    </div>
                    <div className="text-[10px] text-gray-400">Contagem recuperada do histórico salvo</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Terminal de Logs */}
            <div className="bg-gray-900 rounded-xl p-4 shadow-inner">
              <div className="flex items-center gap-2 mb-3 px-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-gray-400 text-xs font-mono ml-2">Terminal do Piloto Automático</span>
              </div>
              <div className="bg-black/50 rounded text-green-400 font-mono text-xs p-4 h-64 overflow-y-auto font-medium leading-relaxed">
                {autopilotStatus.logs.length === 0 ? (
                  <span className="text-gray-600">Nenhum log registrado ainda...</span>
                ) : (
                  autopilotStatus.logs.map((log, i) => (<div key={i}>{log}</div>))
                )}
              </div>
            </div>

            {/* CONFIGURAÇÃO DE BUSCA AUTOMÁTICA */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-bold text-gray-900">⚙️ Configurações do Piloto Automático</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Regras de busca de novos leads e controle de disparos.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-sm text-gray-600">{autoConfig.busca_auto_ativa === 'true' || autoConfig.busca_auto_ativa === true ? 'Ativado' : 'Desativado'}</span>
                  <div
                    onClick={async () => {
                      const novoValor = autoConfig.busca_auto_ativa === 'true' || autoConfig.busca_auto_ativa === true ? 'false' : 'true';
                      setAutoConfig(p => ({ ...p, busca_auto_ativa: novoValor }));
                      // Salva imediatamente no backend para não ser sobrescrito pelo fetch periódico
                      await fetch(`${API}/autopilot/config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ busca_auto_ativa: novoValor })
                      });
                    }}
                    className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${autoConfig.busca_auto_ativa === 'true' || autoConfig.busca_auto_ativa === true ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${autoConfig.busca_auto_ativa === 'true' || autoConfig.busca_auto_ativa === true ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Cidade</label>
                  <input value={autoConfig.busca_cidade || ''} onChange={e => setAutoConfig(p => ({ ...p, busca_cidade: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="Ex: Fortaleza" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Leads por Busca</label>
                  <input type="number" min="5" max="60" value={autoConfig.busca_quantidade || 30} onChange={e => setAutoConfig(p => ({ ...p, busca_quantidade: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Bairros (rotação automática)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(autoConfig.busca_bairros || []).map((b, i) => (
                      <span key={i} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded-full">
                        {b}
                        <button onClick={() => setAutoConfig(p => ({ ...p, busca_bairros: p.busca_bairros.filter((_, j) => j !== i) }))} className="text-blue-400 hover:text-blue-700 font-bold">×</button>
                      </span>
                    ))}
                  </div>
                  <input className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="Digite um bairro e pressione Enter" onKeyDown={e => { if (e.key === 'Enter') { const val = e.target.value.trim(); if (val) { setAutoConfig(p => ({ ...p, busca_bairros: [...(p.busca_bairros || []), val] })); e.target.value = ''; } } }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Tipos de Clínica (rotação automática)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(autoConfig.busca_tipos || []).map((t, i) => (
                      <span key={i} className="flex items-center gap-1 bg-purple-50 text-purple-700 text-xs font-medium px-2 py-1 rounded-full">
                        {t}
                        <button onClick={() => setAutoConfig(p => ({ ...p, busca_tipos: p.busca_tipos.filter((_, j) => j !== i) }))} className="text-purple-400 hover:text-purple-700 font-bold">×</button>
                      </span>
                    ))}
                  </div>
                  <input className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="Digite um tipo e pressione Enter" onKeyDown={e => { if (e.key === 'Enter') { const val = e.target.value.trim(); if (val) { setAutoConfig(p => ({ ...p, busca_tipos: [...(p.busca_tipos || []), val] })); e.target.value = ''; } } }} />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 mb-6">
                <h4 className="text-sm font-bold text-gray-900 mb-2">⏸️ Pausa de Disparos por Categoria</h4>
                <p className="text-xs text-gray-500 mb-4">O robô não enviará mensagens para as categorias marcadas em laranja. Os leads continuarão salvos na fila, apenas sendo ignorados momentaneamente.</p>
                <div className="flex flex-wrap gap-2">
                  {categoriasArr.map(cat => {
                    const isPaused = (autoConfig.categorias_pausadas || []).includes(cat);
                    return (
                      <button
                        key={cat}
                        onClick={async () => {
                          const paused = autoConfig.categorias_pausadas || [];
                          const newPaused = isPaused ? paused.filter(c => c !== cat) : [...paused, cat];
                          setAutoConfig(p => ({ ...p, categorias_pausadas: newPaused }));
                          
                          // Salva instantaneamente no backend
                          await fetch(`${API}/autopilot/config`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ categorias_pausadas: newPaused })
                          });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${isPaused ? 'bg-orange-100 text-orange-800 border-orange-200 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                      >
                        {isPaused ? '⏸ ' : ''}{cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 mb-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">🕒 Janela de Envios (Horário Comercial)</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Quando ativado, disparos ocorrem apenas de Segunda a Sexta (09:00-11:30 e 14:00-17:30) para maximizar respostas e evitar denúncias de spam fora do expediente. Desative para disparar 24h por dia sem restrições.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const isAtivo = autoConfig.horario_inteligente_ativo === 'true' || autoConfig.horario_inteligente_ativo === true || autoConfig.horario_inteligente_ativo === undefined;
                      const novoValor = isAtivo ? 'false' : 'true';
                      setAutoConfig(p => ({ ...p, horario_inteligente_ativo: novoValor }));
                      await fetch(`${API}/autopilot/config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ horario_inteligente_ativo: novoValor })
                      });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors shrink-0 ${
                      (autoConfig.horario_inteligente_ativo === 'true' || autoConfig.horario_inteligente_ativo === true || autoConfig.horario_inteligente_ativo === undefined)
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {(autoConfig.horario_inteligente_ativo === 'true' || autoConfig.horario_inteligente_ativo === true || autoConfig.horario_inteligente_ativo === undefined) ? 'Ativado' : 'Desativado'}
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 mb-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Follow-up Automático</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Envia lembretes leves para leads enviados que ainda não responderam.</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const novoValor = autoConfig.followup_auto_ativo === 'true' || autoConfig.followup_auto_ativo === true ? 'false' : 'true';
                      setAutoConfig(p => ({ ...p, followup_auto_ativo: novoValor }));
                      await fetch(`${API}/autopilot/config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ followup_auto_ativo: novoValor })
                      });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${autoConfig.followup_auto_ativo === 'true' || autoConfig.followup_auto_ativo === true ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                  >
                    {autoConfig.followup_auto_ativo === 'true' || autoConfig.followup_auto_ativo === true ? 'Ativado' : 'Desativado'}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Primeiro follow-up após</label>
                    <input type="number" min="1" max="10" value={autoConfig.followup_dias_1 || '1'} onChange={e => setAutoConfig(p => ({ ...p, followup_dias_1: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300" />
                    <span className="text-[11px] text-gray-400 mt-1 block">dias sem resposta</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Segundo follow-up após</label>
                    <input type="number" min="2" max="20" value={autoConfig.followup_dias_2 || '3'} onChange={e => setAutoConfig(p => ({ ...p, followup_dias_2: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300" />
                    <span className="text-[11px] text-gray-400 mt-1 block">dias após o primeiro follow-up</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 mb-6">
                <h4 className="text-sm font-bold text-gray-900 mb-1">🔔 Notificação de Lead Quente</h4>
                <p className="text-xs text-gray-500 mb-4">Receba um alerta no seu WhatsApp pessoal quando um lead responder e for transferido para atendimento humano.</p>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Seu número de WhatsApp (com DDD)</label>
                  <input 
                    value={autoConfig.whatsapp_vendedor || ''} 
                    onChange={e => setAutoConfig(p => ({ ...p, whatsapp_vendedor: e.target.value.replace(/\D/g, '').slice(0, 11) }))} 
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300" 
                    placeholder="Ex: 81997666157" 
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">Deixe vazio para desativar notificações</span>
                </div>
              </div>

              <button
                disabled={salvandoConfig}
                onClick={async () => {
                  setSalvandoConfig(true);
                  try {
                    await fetch(`${API}/autopilot/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(autoConfig) });
                    alert('✅ Configuração salva com sucesso!');
                  } catch(e) { alert('Erro ao salvar.'); }
                  setSalvandoConfig(false);
                }}
                 className="bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {salvandoConfig ? 'Salvando...' : '💾 Salvar Configuração'}
              </button>
            </div>

          </div>
        )}

        {/* CLÍNICAS */}
        {tab === 'clinicas' && (
          <div>
            {/* Formulário */}
            {mostrarForm && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-gray-900">{editandoId ? 'Editar clínica' : 'Nova clínica'}</p>
                  <button onClick={() => { setMostrarForm(false); setEditandoId(null); }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {[
                    ['nome', 'Nome da clínica *', 'Clínica São Lucas', 'md:col-span-2'],
                    ['tel', 'Telefone / WhatsApp', '(81) 99999-0000', ''],
                    ['bairro', 'Bairro', 'Boa Viagem', ''],
                    ['categoria', 'Categoria', 'Clínica Odontológica', ''],
                    ['email', 'Email', 'contato@clinica.com', ''],
                    ['endereco', 'Endereço completo', 'Rua das Flores, 123', 'md:col-span-2'],
                    ['site', 'Site', 'www.clinica.com.br', ''],
                    ['avaliacao', 'Avaliação Google (ex: 4.5)', '4.5', ''],
                  ].map(([k, l, ph, cls]) => (
                    <div key={k} className={cls}>
                      <label className="block text-xs text-gray-500 mb-1">{l}</label>
                      <input value={(k === 'tel') ? maskPhone(form[k]) : (form[k] || '')} 
                        onChange={e => {
                          const val = (k === 'tel') ? e.target.value.replace(/\D/g, '').slice(0, 11) : e.target.value;
                          setForm({ ...form, [k]: val });
                        }} 
                        placeholder={ph}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300" />
                    </div>
                  ))}
                  <div className="">
                    <label className="block text-xs text-gray-500 mb-1">Prioridade comercial</label>
                    <select value={form.sales_priority || 'LOW'} 
                      onChange={e => setForm({ ...form, sales_priority: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                    >
                      <option value="HIGH">🔥 ALTA</option>
                      <option value="MEDIUM">⚡ MÉDIA</option>
                      <option value="LOW">💤 BAIXA</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={salvar} disabled={salvando}
                    className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                    {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Cadastrar clínica'}
                  </button>
                  <button onClick={() => { setMostrarForm(false); setEditandoId(null); }}
                    className="text-sm border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50">Cancelar</button>
                </div>
              </div>
            )}

            {/* Barra de busca e filtros */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <div className="flex-1 min-w-48 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome, bairro, telefone, email..."
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300 bg-white" />
              </div>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
                <option value="todos">Todos os status</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
                <option value="">Todas as prioridades</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Média</option>
                <option value="LOW">Baixa</option>
              </select>
              <select value={filtroBairro} onChange={e => setFiltroBairro(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
                <option value="">Todos os bairros</option>
                {bairros.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none">
                <option value="">Todas as categorias</option>
                {categoriasArr.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroIa} onChange={e => setFiltroIa(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none font-semibold">
                <option value="todos">🤖 Interferência IA: Todas</option>
                <option value="ativa">🟢 Apenas IA Ativa</option>
                <option value="pausada">🛑 Apenas IA Pausada (Manual)</option>
              </select>
              <button onClick={() => window.open(`${API}/clinicas/export/csv`)}
                className="text-sm border border-gray-200 bg-white px-3 py-2 rounded-lg hover:bg-gray-50">Exportar CSV</button>
              <button onClick={() => setMostrarDesativados(!mostrarDesativados)}
                className={`text-sm border px-3 py-2 rounded-lg transition-colors ${mostrarDesativados ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {mostrarDesativados ? 'Ocultar Desativados' : 'Mostrar Desativados'}
              </button>
            </div>

            {/* Resultado da busca */}
            {busca || filtroStatus !== 'todos' || filtroPrioridade || filtroBairro ? (
              <p className="text-xs text-gray-400 mb-3">{filtradas.length} resultado{filtradas.length !== 1 ? 's' : ''} encontrado{filtradas.length !== 1 ? 's' : ''}</p>
            ) : null}

            {/* Tabela */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-4 uppercase tracking-wider">Nome</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-4 uppercase tracking-wider">Prioridade comercial / Fit</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-4 uppercase tracking-wider">Categoria</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-4 uppercase tracking-wider">Contato</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-4 uppercase tracking-wider">Local (Bairro/Cidade)</th>
                    <th className="text-center text-xs font-bold text-gray-400 px-4 py-4 uppercase tracking-wider">Status</th>
                    <th className="text-right text-xs font-bold text-gray-400 px-4 py-4 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {!filtradas.length && (
                    <tr><td colSpan={7} className="text-center text-gray-400 py-10 text-sm">
                      {clinicas.length === 0 ? 'Nenhuma clínica cadastrada. Clique em "+ Nova clínica" para começar.' : 'Nenhum resultado para essa busca.'}
                    </td></tr>
                  )}
                  {filtradasOrdenadas.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-900 text-[13px] leading-tight" title={c.nome}>{c.nome && c.nome.length > 35 ? c.nome.slice(0, 35) + '...' : c.nome}</div>
                        <div className="text-[12px] text-gray-500 mt-1" title={c.endereco}>{c.endereco ? (c.endereco.length > 45 ? c.endereco.slice(0, 45) + '...' : c.endereco) : ''}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <button onClick={() => abrirChatModal(c)} className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded inline-flex items-center gap-1">
                            💬 Mensagens
                          </button>
                          <button 
                            onClick={() => toggleIaClinica(c.id, c.ia_ativa !== 0 ? 1 : 0)}
                            disabled={atualizandoIaId === c.id}
                            className={`text-[11px] font-bold border px-2 py-0.5 rounded inline-flex items-center gap-1 transition-all ${
                              c.ia_ativa === 0
                                ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                            }`}
                            title={c.ia_ativa === 0 ? "IA Pausada para este cliente (Clique para reativar respostas automáticas)" : "IA Ativa (Clique para desativar interferência da IA e assumir manualmente)"}
                          >
                            {atualizandoIaId === c.id ? '⏳' : c.ia_ativa === 0 ? '🛑 Sem IA (Manual)' : '🤖 IA Ativa'}
                          </button>
                          <button onClick={() => setModalReviews(c)} className={`text-[11px] font-bold border px-2 py-0.5 rounded inline-flex items-center gap-1 ${c.enriquecido_em ? 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200' : 'text-gray-500 bg-gray-50 hover:bg-gray-100 border-gray-200'}`} title="Ver dados e resumos das avaliações do Google Maps">
                            ✨ {c.enriquecido_em ? 'Insights Maps' : 'Enriquecer'}
                          </button>
                        </div>
                        {c.site && <a href={c.site.startsWith('http') ? c.site : 'https://' + c.site} target="_blank" rel="noreferrer"
                          className="text-[11px] text-blue-600 hover:underline mt-1 block font-medium" title={c.site}>{(() => { const s = c.site.replace(/^https?:\/\//, ''); return s.length > 35 ? s.slice(0, 35) + '...' : s; })()}</a>}
                        {c.dor_detectada && <div className="text-[11px] text-rose-600 mt-1 font-medium" title={c.dor_detectada}>{c.dor_detectada.length > 55 ? c.dor_detectada.slice(0, 55) + '...' : c.dor_detectada}</div>}
                        {c.progresso_lead && c.progresso_lead !== 'PENDENTE' && (
                          <div className={`text-[10px] font-bold px-2 py-0.5 rounded inline-block mt-1.5 border ${
                            c.progresso_lead === 'INTERESSE_ALTO' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            c.progresso_lead === 'INDICOU_RESPONSAVEL' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                            c.progresso_lead === 'QUALIFICADO_DOR' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                            c.progresso_lead === 'ROBO_URA' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                            c.progresso_lead === 'SEM_INTERESSE' ? 'bg-red-50 text-red-800 border-red-200' :
                            'bg-sky-50 text-sky-700 border-sky-200'
                          }`} title={c.progresso_motivo || ''}>
                            {c.progresso_lead === 'INTERESSE_ALTO' ? '🔥 Alto Interesse' :
                             c.progresso_lead === 'INDICOU_RESPONSAVEL' ? '📌 Indicou Responsável' :
                             c.progresso_lead === 'QUALIFICADO_DOR' ? '💡 Qualificado' :
                             c.progresso_lead === 'ROBO_URA' ? '🤖 Robô / URA' :
                             c.progresso_lead === 'SEM_INTERESSE' ? '🛑 Sem Interesse' :
                             '💬 Em Qualificação'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold shadow-sm whitespace-nowrap border ${
                          c.sales_priority === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200' :
                          c.sales_priority === 'MEDIUM' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          {c.sales_priority === 'HIGH' ? '🔥 ALTA' :
                           c.sales_priority === 'MEDIUM' ? '⚡ MÉDIA' :
                           '💤 BAIXA'}
                        </span>
                        <div className="text-[11px] text-gray-500 mt-1 font-semibold">{Number(c.fit_score || 0)}/100 · Adequação {c.lead_priority === 'HIGH' ? 'alta' : c.lead_priority === 'MEDIUM' ? 'média' : 'baixa'}</div>
                        {c.score_reason && <div className="text-[10px] text-gray-400 mt-0.5 max-w-[150px] truncate" title={c.score_reason}>{c.score_reason}</div>}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[12px] bg-gray-100 text-gray-700 px-3 py-1 rounded-lg font-semibold whitespace-nowrap border border-gray-200/50">
                          {c.categoria || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-[13px] font-bold text-gray-800 flex items-center gap-1.5 flex-wrap">
                          <span>{maskPhone(c.tel) || '—'}</span>
                          {c.whatsapp_valido ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded" title="WhatsApp verificado no servidor">
                              ⚡ WA Ativo
                            </span>
                          ) : null}
                          {c.tel_origem === 'site_wame' || c.tel_origem === 'site_texto' ? (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded" title="Telefone resgatado do site da clínica">
                              🌐 Do Site
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[12px] text-gray-400 truncate max-w-[150px]">{c.email || ''}</div>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-gray-600 font-medium">
                        <div>{c.bairro || '—'}</div>
                        <div className="text-[11px] text-gray-400 font-normal">{c.cidade || ''}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="inline-flex items-center justify-center">
                          <select value={c.status} onChange={e => updStatus(c.id, e.target.value)}
                            className={`text-xs font-bold border-0 rounded-full px-4 py-1.5 focus:outline-none cursor-pointer appearance-none text-center min-w-[110px] shadow-sm ring-1 ring-inset ring-gray-200/50 ${STATUS_COLOR[c.status]}`}>
                            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k} className="bg-white text-gray-900">{v}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end items-center gap-1.5">
                          <button 
                            onClick={() => toggleIaClinica(c.id, c.ia_ativa !== 0 ? 1 : 0)}
                            disabled={atualizandoIaId === c.id}
                            className={`text-xs font-bold border px-2.5 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1 ${
                              c.ia_ativa === 0
                                ? 'bg-amber-500 hover:bg-amber-400 text-gray-950 font-black border-amber-400 ring-2 ring-amber-300'
                                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                            }`}
                            title={c.ia_ativa === 0 ? "IA Pausada para este cliente. Clique para reativar respostas automáticas." : "IA Ativa. Clique para pausar interferência da IA neste cliente."}
                          >
                            {atualizandoIaId === c.id ? '⏳' : c.ia_ativa === 0 ? '🛑 IA Pausada' : '🤖 IA Ativa'}
                          </button>
                          <button onClick={() => abrirChatModal(c)}
                            className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1.5 rounded-xl hover:bg-emerald-100 flex items-center gap-1 transition-all shadow-sm" title="Ver Histórico de Mensagens">
                            💬 Mensagens
                          </button>
                          {c.status === 'reply' && (
                            <button onClick={() => {
                              setModalResposta(c);
                              setTextoResposta('');
                            }}
                              className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-200" title="Responder pelo Sistema">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                            </button>
                          )}
                          {['reply', 'diagnostico', 'proposta', 'converted'].includes(c.status) && (
                            <button onClick={() => router.push(`/diagnostico?clinicaId=${c.id}&nome=${encodeURIComponent(c.nome)}`)}
                              className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-xl transition-colors border border-transparent hover:border-purple-200" title="Diagnóstico Consultivo">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </button>
                          )}
                          <button onClick={() => editarClinica(c)}
                            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors border border-transparent hover:border-gray-200" title="Editar">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          {c.status !== 'disabled' ? (
                            <button onClick={() => updStatus(c.id, 'disabled')}
                              className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors border border-transparent hover:border-amber-200" title="Desativar">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            </button>
                          ) : (
                            <button onClick={() => updStatus(c.id, 'pending')}
                              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors border border-transparent hover:border-emerald-200" title="Reativar">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                          )}
                          <button onClick={() => remover(c.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-200" title="Excluir">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DISPARAR */}
        {tab === 'disparar' && (
          <div>
            {!pendentes.length && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800 mb-4">
                Todas as clínicas já foram contatadas! 🎉
              </div>
            )}
            <div className="space-y-3">
              {pendentes.map(c => {
                const msg = tmplW.replace(/{nome}/g, c.nome).replace(/{bairro}/g, c.bairro || '');
                const tel = (c.tel || '').replace(/\D/g, '');
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-medium text-gray-900">{c.nome}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {c.bairro}{c.tel && ` · ${maskPhone(c.tel)}`}{c.avaliacao && ` · ⭐ ${c.avaliacao}`}
                        </div>
                      </div>
                      <span className="text-xs bg-amber-50 text-amber-800 px-2 py-1 rounded-full flex-shrink-0 ml-2">Não contatado</span>
                    </div>
                    <pre className="text-xs bg-gray-50 rounded-lg p-3 whitespace-pre-wrap mb-3 font-sans leading-relaxed border border-gray-100">{msg}</pre>
                    <div className="flex gap-2 flex-wrap">
                      {tel && (
                        <button 
                          onClick={async () => {
                            try {
                              const res = await fetch(`${API}/clinicas/${c.id}/mensagem`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ texto: msg })
                              });
                              if (!res.ok) {
                                const data = await res.json();
                                throw new Error(data.erro || 'Falha ao enviar');
                              }
                              await updStatus(c.id, 'sent');
                              alert(`✅ Mensagem enviada para ${c.nome} e registrada na Central de Mensagens!`);
                            } catch(e) {
                              alert('Erro ao enviar pelo sistema: ' + e.message);
                            }
                          }}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold transition-all shadow-sm flex items-center gap-1">
                          ⚡ Disparar pelo Sistema (Salva no Banco)
                        </button>
                      )}
                      {tel && (
                        <a 
                          href={`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`} 
                          target="_blank" 
                          rel="noreferrer"
                          onClick={() => {
                            fetch(`${API}/clinicas/${c.id}/mensagem`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ texto: msg })
                            }).catch(() => {});
                          }}
                        >
                          <button className="text-xs border border-emerald-600 text-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-50 font-medium">Abrir wa.me ↗</button>
                        </a>
                      )}
                      <button onClick={async () => {
                        fetch(`${API}/clinicas/${c.id}/mensagem`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ texto: msg })
                        }).catch(() => {});
                        await updStatus(c.id, 'sent');
                      }}
                        className="text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 font-semibold">✓ Marcar como enviado</button>
                      <button onClick={() => updStatus(c.id, 'disabled')}
                        className="text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-500">Desativar</button>
                      <button onClick={() => editarClinica(c)}
                        className="text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">Editar</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TEMPLATE */}
        {tab === 'mensagem' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Template WhatsApp</p>
              <p className="text-xs text-gray-400 mb-3">
                Use <code className="bg-gray-100 px-1 rounded">{'{nome}'}</code> e <code className="bg-gray-100 px-1 rounded">{'{bairro}'}</code> — substituídos automaticamente.
              </p>
              <textarea value={tmplW} onChange={e => setTmplW(e.target.value)} rows={8}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none resize-y font-sans leading-relaxed" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Pré-visualização</p>
              <pre className="text-sm bg-gray-50 rounded-lg p-4 whitespace-pre-wrap font-sans leading-relaxed border border-gray-100 text-gray-700">
                {tmplW.replace(/{nome}/g, 'Clínica São Lucas').replace(/{bairro}/g, 'Boa Viagem')}
              </pre>
            </div>
          </div>
        )}

        {/* ACOMPANHAR */}
        {tab === 'acompanhar' && (
          <div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Progresso geral</p>
              <div className="space-y-3">
                {[
                  ['Não contatado', pendentes.length, total, 'bg-amber-400'],
                  ['Enviado', enviados, total, 'bg-blue-400'],
                  ['Respondeu', responderam, total, 'bg-emerald-400'],
                  ['Convertido', convertidos, total, 'bg-green-600'],
                ].map(([l, v, t, color]) => (
                  <div key={l}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{l}</span>
                      <span className="font-medium">{v} de {t} ({t > 0 ? Math.round(v / t * 100) : 0}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: t > 0 ? `${Math.round(v / t * 100)}%` : '0%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Clínica', 'Telefone', 'Bairro', 'Status', 'Atualizar'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clinicas.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{c.nome}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{maskPhone(c.tel) || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.bairro || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[c.status]}`}>{STATUS[c.status]}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select value={c.status} onChange={e => updStatus(c.id, e.target.value)}
                            className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none">
                            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <button onClick={() => remover(c.id)}
                            className="text-xs text-red-500 hover:text-red-700 p-1" title="Excluir clínica">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DESATIVADOS */}
        {tab === 'desativados' && (
          <div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Nome', 'Contato', 'Bairro', 'Ações'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clinicas.filter(c => c.status === 'disabled').length === 0 && (
                    <tr><td colSpan={4} className="text-center text-gray-400 py-10 text-sm">Nenhum contato desativado.</td></tr>
                  )}
                  {clinicas.filter(c => c.status === 'disabled').map(c => (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{c.nome}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{maskPhone(c.tel) || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{c.bairro || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => updStatus(c.id, 'pending')}
                            className="text-xs border border-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors">
                            Reativar
                          </button>
                          <button onClick={() => remover(c.id)}
                            className="text-xs text-red-600 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors font-medium">
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {/* MODAL RESPOSTA MANUAL */}
      {modalResposta && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Responder Clínica</h3>
                <p className="text-xs text-gray-500">Enviando como CleanMed para {modalResposta.nome}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setModalResposta(null); abrirChatModal(modalResposta); }} className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100">
                  💬 Ver Histórico Completo
                </button>
                <button onClick={() => setModalResposta(null)} className="text-gray-400 hover:text-gray-900 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-3 flex gap-1.5 flex-wrap">
                {gerarScriptsPlaybook(modalResposta).map(sp => (
                  <button
                    key={sp.id}
                    onClick={() => setTextoResposta(sp.texto)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-colors ${sp.color}`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
              
              <textarea 
                value={textoResposta}
                onChange={e => setTextoResposta(e.target.value)}
                placeholder="Digite sua resposta aqui..."
                className="w-full h-32 text-sm px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none mb-4"
              />
              
              <button 
                onClick={enviarRespostaManual}
                disabled={salvando || !textoResposta.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                {salvando ? 'Enviando...' : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    Disparar WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HISTÓRICO DE MENSAGENS (CHAT) */}
      {modalMensagens && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center text-lg shadow-inner">
                  {modalMensagens.nome ? modalMensagens.nome.charAt(0).toUpperCase() : 'C'}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white leading-tight flex items-center gap-2">
                    {modalMensagens.nome}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLOR[modalMensagens.status] || 'bg-gray-100 text-gray-800'}`}>
                      {STATUS[modalMensagens.status] || modalMensagens.status}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-300 mt-0.5 flex items-center gap-2">
                    <span>📞 {maskPhone(modalMensagens.tel) || 'Sem telefone'}</span>
                    {modalMensagens.categoria && <span>· 🏷️ {modalMensagens.categoria}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* BOTÃO PARA LIGAR/DESLIGAR INTERFERÊNCIA DA IA NESTE CLIENTE */}
                <button
                  onClick={() => toggleIaClinica(modalMensagens.id, modalMensagens.ia_ativa !== 0 ? 1 : 0)}
                  disabled={atualizandoIaId === modalMensagens.id}
                  title={modalMensagens.ia_ativa === 0 
                    ? "A IA está pausada para este cliente. Clique para reativar respostas automáticas." 
                    : "A IA está ativa respondendo este lead. Clique para desativar a IA e assumir o atendimento 100% manual."}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm ${
                    modalMensagens.ia_ativa === 0
                      ? 'bg-amber-500 hover:bg-amber-400 text-gray-950 font-black ring-2 ring-amber-300 shadow-md'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/50'
                  }`}
                >
                  {atualizandoIaId === modalMensagens.id ? (
                    <span>⏳ Salvando...</span>
                  ) : modalMensagens.ia_ativa === 0 ? (
                    <>
                      <span>🛑</span>
                      <span>IA Pausada</span>
                      <span className="text-[10px] bg-amber-600/30 text-amber-950 px-1.5 py-0.5 rounded font-bold underline ml-1">Reativar IA</span>
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      <span>IA Ativa no Chat</span>
                      <span className="text-[10px] bg-indigo-700/80 text-indigo-100 px-1.5 py-0.5 rounded font-normal ml-1 hover:bg-red-600 hover:text-white transition-colors">Pausar IA</span>
                    </>
                  )}
                </button>

                <button 
                  onClick={() => syncHistoricoChat(modalMensagens.id)} 
                  title="Puxar mensagens anteriores do WhatsApp Web" 
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors shadow-sm">
                  🔄 Importar do WhatsApp
                </button>
                <button onClick={() => fetchMensagens(modalMensagens.id)} title="Atualizar mensagens" className="text-gray-300 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
                  🔄
                </button>
                <button onClick={() => setModalMensagens(null)} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
                  ✕
                </button>
              </div>
            </div>

            {/* Banner explicativo de status da IA no chat */}
            {modalMensagens.ia_ativa === 0 ? (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900 shadow-inner">
                <div className="flex items-center gap-2">
                  <span className="text-base">🛑</span>
                  <span>
                    <strong>Modo Manual (Sem interferência da IA):</strong> A IA está desativada para este cliente. O robô CleanMed não responderá automaticamente e você tem controle 100% manual da conversa.
                  </span>
                </div>
                <button
                  onClick={() => toggleIaClinica(modalMensagens.id, 0)}
                  disabled={atualizandoIaId === modalMensagens.id}
                  className="text-xs font-bold text-amber-900 hover:text-amber-950 underline ml-4 whitespace-nowrap bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded border border-amber-300 transition-colors"
                >
                  Reativar IA
                </button>
              </div>
            ) : (
              <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-2 flex items-center justify-between text-[11px] text-indigo-900">
                <div className="flex items-center gap-2">
                  <span>🤖</span>
                  <span>
                    <strong>IA Ativa:</strong> O robô CleanMed responderá as mensagens recebidas deste lead automaticamente. Clique no botão acima para pausar quando quiser atender pessoalmente.
                  </span>
                </div>
                <button
                  onClick={() => toggleIaClinica(modalMensagens.id, 1)}
                  disabled={atualizandoIaId === modalMensagens.id}
                  className="font-bold text-indigo-700 hover:text-red-700 underline ml-4 whitespace-nowrap"
                >
                  Pausar IA
                </button>
              </div>
            )}

            {/* Body: Chat Stream */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50 space-y-4">
              {carregandoMensagens ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
                  Carregando histórico do banco...
                </div>
              ) : historicoMensagens.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2 py-12">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xl">💬</div>
                  <p className="font-semibold text-gray-600 text-sm">Nenhuma mensagem gravada para este lead ainda.</p>
                  <p className="text-xs text-gray-400 text-center max-w-sm">
                    Toda mensagem enviada pelo Autopilot, IA ou manualmente a partir de agora será salva aqui no banco.
                  </p>
                </div>
              ) : (
                historicoMensagens.map((msg, index) => {
                  const isInbound = msg.direction === 'inbound';
                  return (
                    <div key={msg.id || index} className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}>
                      {/* Sender/Source tag above bubble */}
                      <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-gray-400 font-medium">
                        {isInbound ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <span>👤 Lead ({modalMensagens.nome})</span>
                          </span>
                        ) : (
                          <span className="text-blue-700 font-bold flex items-center gap-1">
                            {msg.sender === 'human' ? '👨‍💼 Henrique (Humano)' : msg.sender === 'bot' ? '🤖 CleanMed IA' : '⚙️ Sistema'}
                          </span>
                        )}
                        {msg.source && (
                          <span className="bg-gray-200 text-gray-600 px-1.5 py-0.2 rounded text-[9px] uppercase font-bold">
                            {msg.source}
                          </span>
                        )}
                        <span>· {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>

                      {/* Message Bubble */}
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm border text-sm leading-relaxed whitespace-pre-wrap ${
                        isInbound 
                          ? 'bg-white text-gray-800 border-gray-200 rounded-tl-none' 
                          : 'bg-blue-600 text-white border-blue-600 rounded-tr-none'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: Input Area */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">⚡ Playbook de Fechamento (1 clique):</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => abrirModalFollowup(modalMensagens)}
                    className="text-[11px] bg-amber-50 text-amber-800 px-2.5 py-1 rounded-lg border border-amber-200 hover:bg-amber-100 font-bold whitespace-nowrap"
                  >
                    ⏰ Agendar Follow-up
                  </button>
                  <select
                    value={modalMensagens.status || 'reply'}
                    onChange={async (e) => {
                      const novoStatus = e.target.value;
                      await updStatus(modalMensagens.id, novoStatus);
                      setModalMensagens(prev => prev ? { ...prev, status: novoStatus } : prev);
                    }}
                    className="text-[11px] font-bold border border-gray-200 rounded-lg px-2 py-1 bg-gray-50 text-gray-800"
                    title="Mover etapa do funil"
                  >
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
                {gerarScriptsPlaybook(modalMensagens).map(sp => (
                  <button
                    key={sp.id}
                    onClick={() => setNovaMensagemTexto(sp.texto)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold whitespace-nowrap transition-colors ${sp.color}`}
                  >
                    {sp.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={novaMensagemTexto}
                  onChange={e => setNovaMensagemTexto(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      enviarChatMessage();
                    }
                  }}
                  placeholder="Digite uma mensagem para o WhatsApp do lead... (Enter para enviar)"
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none h-12"
                />
                <button
                  onClick={enviarChatMessage}
                  disabled={enviandoChatMessage || !novaMensagemTexto.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  {enviandoChatMessage ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <span>Enviar</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INSIGHTS GOOGLE MAPS & REVIEWS */}
      {modalReviews && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/30 text-white font-bold flex items-center justify-center text-lg border border-purple-400/40 shadow-inner">
                  ✨
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white leading-tight flex items-center gap-2">
                    {modalReviews.nome}
                    {modalReviews.enriquecido_em ? (
                      <span className="text-[10px] bg-purple-500/40 text-purple-200 border border-purple-400/40 px-2 py-0.5 rounded-full font-bold">
                        Enriquecido via IA
                      </span>
                    ) : (
                      <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full font-bold">
                        Não Enriquecido
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-purple-200 mt-0.5 flex items-center gap-2">
                    <span>📍 {modalReviews.bairro || modalReviews.cidade || 'Sem localização'}</span>
                    {modalReviews.categoria && <span>· 🏷️ {modalReviews.categoria}</span>}
                  </p>
                </div>
              </div>
              <button onClick={() => setModalReviews(null)} className="text-gray-300 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 bg-slate-50">
              {/* Informações Principais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Proprietário / Gestor</span>
                  <span className="text-sm font-bold text-gray-800">{modalReviews.nome_dono || 'Não identificado nas respostas'}</span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Avaliação no Google Maps</span>
                  <span className="text-sm font-bold text-amber-600 flex items-center gap-1">
                    ⭐ {modalReviews.avaliacao || 'N/A'} <span className="text-xs text-gray-500 font-normal">({modalReviews.total_avaliacoes || 0} avaliações)</span>
                  </span>
                </div>
              </div>

              {/* Pontos Fortes */}
              <div className="bg-white p-4 rounded-xl border border-emerald-200/80 shadow-sm">
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span>👍</span> Pontos Fortes (Elogios Recorrentes)
                </h4>
                {modalReviews.pontos_fortes ? (
                  <div className="flex flex-wrap gap-1.5">
                    {modalReviews.pontos_fortes.split(';').map((pf, i) => (
                      <span key={i} className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg font-medium">
                        {pf.trim()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Nenhum ponto forte mapeado ainda.</p>
                )}
              </div>

              {/* Pontos de Atenção / Fracos */}
              <div className="bg-white p-4 rounded-xl border border-amber-200/80 shadow-sm">
                <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span>⚠️</span> Pontos de Atenção (Reclamações / Oportunidades)
                </h4>
                {modalReviews.pontos_fracos ? (
                  <div className="flex flex-wrap gap-1.5">
                    {modalReviews.pontos_fracos.split(';').map((pfr, i) => (
                      <span key={i} className="text-xs bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg font-medium">
                        {pfr.trim()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Sem reclamações significativas encontradas.</p>
                )}
              </div>

              {/* Resumo da IA */}
              {modalReviews.reviews_resumo && (
                <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm">
                  <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider mb-1.5">
                    🧠 Resumo Estratégico da IA
                  </h4>
                  <p className="text-xs text-gray-700 leading-relaxed">{modalReviews.reviews_resumo}</p>
                </div>
              )}

              {/* Abordagem Gemini */}
              {modalReviews.mensagem_ia && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      💬 Abordagem Personalizada Gerada (WhatsApp)
                    </h4>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(modalReviews.mensagem_ia);
                        alert('📋 Abordagem copiada!');
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                      📋 Copiar Texto
                    </button>
                  </div>
                  <pre className="text-xs bg-gray-50 p-3 rounded-lg text-gray-800 font-sans whitespace-pre-wrap leading-relaxed border border-gray-100">
                    {modalReviews.mensagem_ia}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {modalReviews.enriquecido_em ? `Última atualização: ${new Date(modalReviews.enriquecido_em).toLocaleString()}` : 'Não enriquecido'}
              </span>
              <button
                onClick={() => enriquecerClinicaManual(modalReviews.id)}
                disabled={enriquecendoId === modalReviews.id}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5">
                {enriquecendoId === modalReviews.id ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    <span>Extraindo do Google Maps...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>{modalReviews.enriquecido_em ? 'Re-enriquecer Dados' : 'Enriquecer Agora'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AGENDAR FOLLOW-UP / QUALIFICAÇÃO */}
      {modalFollowup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">⏰ Próxima Ação & Qualificação</h3>
                <p className="text-xs text-gray-500">{modalFollowup.nome}</p>
              </div>
              <button onClick={() => setModalFollowup(null)} className="text-gray-400 hover:text-gray-900 bg-white p-2 rounded-xl shadow-sm border border-gray-100">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Próxima Ação</label>
                <input
                  value={followupForm.proxima_acao}
                  onChange={e => setFollowupForm(p => ({ ...p, proxima_acao: e.target.value }))}
                  placeholder="Ex: Ligar para confirmar teste / Fazer call de 5 min"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {[
                    'Enviar áudio + convidar p/ Demo 5 min',
                    'Criar conta de teste assistida',
                    'Cobrar ativação do teste (Dia 2)',
                    'Fechar Plano Pro (R$149,90)'
                  ].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setFollowupForm(p => ({ ...p, proxima_acao: sug }))}
                      className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg font-medium"
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Data do Retorno</label>
                  <input
                    type="date"
                    value={followupForm.proxima_acao_data}
                    onChange={e => setFollowupForm(p => ({ ...p, proxima_acao_data: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Prioridade comercial</label>
                  <select
                    value={followupForm.sales_priority}
                    onChange={e => setFollowupForm(p => ({ ...p, sales_priority: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="HIGH">🔥 ALTA</option>
                    <option value="MEDIUM">⚡ MÉDIA</option>
                    <option value="LOW">💤 BAIXA</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome do Decisor / Dono</label>
                  <input
                    value={followupForm.nome_dono}
                    onChange={e => setFollowupForm(p => ({ ...p, nome_dono: e.target.value }))}
                    placeholder="Ex: Dra. Débora"
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sistema Atual</label>
                  <input
                    value={followupForm.sistema_atual}
                    onChange={e => setFollowupForm(p => ({ ...p, sistema_atual: e.target.value }))}
                    placeholder="Ex: Manual / Planilha / Doctoralia"
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Dor Detectada</label>
                <textarea
                  value={followupForm.dor_detectada}
                  onChange={e => setFollowupForm(p => ({ ...p, dor_detectada: e.target.value }))}
                  placeholder="Ex: Confirmação manual pelo WhatsApp gera faltas e toma tempo da recepção"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 h-16 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={salvarFollowup}
                  disabled={salvandoFollowup}
                  className="flex-1 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
                >
                  {salvandoFollowup ? 'Salvando...' : '💾 Salvar Follow-up'}
                </button>
                <button
                  onClick={() => setModalFollowup(null)}
                  className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
