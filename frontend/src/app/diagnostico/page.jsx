'use client';
import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const BLOCOS = [
  { id: 'bloco1', titulo: '🏥 A Clínica', desc: 'Dados gerais do negócio' },
  { id: 'bloco2', titulo: '⚙️ Operacional', desc: 'Agenda, recepção e faltas' },
  { id: 'bloco3', titulo: '💰 Financeiro', desc: 'Controle de receitas e despesas' },
  { id: 'bloco4', titulo: '📊 Gestão', desc: 'Relatórios e produtividade' },
  { id: 'bloco5', titulo: '💻 Tecnologia', desc: 'Sistemas utilizados' },
  { id: 'bloco6', titulo: '🚀 Crescimento', desc: 'Objetivos para o futuro' },
];

function Campo({ label, name, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {type === 'textarea' ? (
        <textarea name={name} value={value || ''} onChange={onChange} placeholder={placeholder}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24" />
      ) : (
        <input type={type} name={name} value={value || ''} onChange={onChange} placeholder={placeholder}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      )}
    </div>
  );
}

function RadioGroup({ label, name, value, onChange, options }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
      <div className="flex gap-3">
        {options.map(opt => (
          <button key={opt} type="button"
            onClick={() => onChange({ target: { name, value: opt } })}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${value === opt ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function DiagnosticoContent() {
  const searchParams = useSearchParams();
  const clinicaId = searchParams.get('clinicaId');
  const clinicaNome = searchParams.get('nome') || '';

  const [step, setStep] = useState(0);
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [respostas, setRespostas] = useState({
    bloco1: { nome_clinica: clinicaNome, cidade: '', especialidades: '', qtd_medicos: '', qtd_funcionarios: '', atendimentos_mes: '' },
    bloco2: { como_agenda: '', agenda_online: '', usa_whatsapp_agenda: '', qtd_recepcionistas: '', horas_mensagens: '', como_confirma: '', processo_automatico: '', faltas_mes: '' },
    bloco3: { controle_receitas: '', controle_despesas: '', sistema_financeiro: '', faz_repasse: '', emite_nf: '', acompanha_lucro: '' },
    bloco4: { acompanha_resultados: '', tem_relatorios: '', controle_estoque: '', acompanha_produtividade: '' },
    bloco5: { usa_sistema: '', sistema_atual: '', o_que_gosta: '', o_que_incomoda: '' },
    bloco6: { objetivo_principal: '', objetivos: '' },
  });

  const handleChange = (bloco) => (e) => {
    setRespostas(prev => ({ ...prev, [bloco]: { ...prev[bloco], [e.target.name]: e.target.value } }));
  };

  useEffect(() => {
    if (!clinicaId) return;
    async function loadExistente() {
      try {
        const res = await fetch(`${API}/diagnostico/${clinicaId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.respostas) {
            const parsed = typeof data.respostas === 'string' ? JSON.parse(data.respostas) : data.respostas;
            // Preenche mantendo chaves padrão para campos que continuem vazios
            setRespostas(prev => {
              const novo = { ...prev };
              for (const [blocoKey, blocoVal] of Object.entries(parsed)) {
                novo[blocoKey] = { ...(novo[blocoKey] || {}), ...blocoVal };
              }
              return novo;
            });
          }
          if (data.overview) {
            setResultado(data);
          }
        }
      } catch (e) {
        console.error("Erro ao carregar diagnóstico existente:", e);
      }
    }
    loadExistente();
  }, [clinicaId]);

  async function gerarDiagnostico() {
    if (!clinicaId) return alert('ID da clínica não encontrado.');
    setGerando(true);
    try {
      const res = await fetch(`${API}/diagnostico/${clinicaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respostas })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro);
      setResultado(data);
    } catch (e) {
      alert('Erro ao gerar diagnóstico: ' + e.message);
    }
    setGerando(false);
  }

  if (resultado) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Diagnóstico Gerado ✅</h1>
            <p className="text-xs text-gray-500">{clinicaNome} — Plano recomendado: <span className="font-bold text-blue-600">{resultado.plano_recomendado}</span></p>
          </div>
          <div className="flex gap-2">
            <a href={`${API}/diagnostico/${clinicaId}/html`} target="_blank" rel="noreferrer"
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">
              🖥️ Abrir Apresentação
            </a>
            <Link href="/" className="border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
              ← Voltar
            </Link>
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
          {[
            ['🔍 Diagnóstico', resultado.overview],
            ['💰 Estimativa de ROI', resultado.roi],
            ['📄 Proposta Comercial', resultado.proposal],
            resultado.competitor_analysis ? ['⚔️ Análise de Concorrência', resultado.competitor_analysis] : null,
          ].filter(Boolean).map(([titulo, conteudo]) => (
            <div key={titulo} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">{titulo}</h2>
              </div>
              <div className="px-6 py-5 prose prose-sm max-w-none whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">
                {conteudo}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const blocoAtual = BLOCOS[step];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Diagnóstico Consultivo</h1>
          <p className="text-xs text-gray-500">{clinicaNome || 'Nova clínica'}</p>
        </div>
        <Link href="/" className="border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
          ← Voltar
        </Link>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Stepper */}
        <div className="flex items-center justify-between mb-8">
          {BLOCOS.map((b, i) => (
            <div key={b.id} className="flex items-center">
              <button onClick={() => setStep(i)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${i === step ? 'bg-blue-600 text-white shadow-lg scale-110' : i < step ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {i < step ? '✓' : i + 1}
              </button>
              {i < BLOCOS.length - 1 && <div className={`w-8 h-0.5 mx-1 ${i < step ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Card do bloco */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">{blocoAtual.titulo}</h2>
          <p className="text-sm text-gray-500 mb-6">{blocoAtual.desc}</p>

          {step === 0 && (
            <>
              <Campo label="Nome da clínica" name="nome_clinica" value={respostas.bloco1.nome_clinica} onChange={handleChange('bloco1')} />
              <Campo label="Cidade" name="cidade" value={respostas.bloco1.cidade} onChange={handleChange('bloco1')} placeholder="Ex: Fortaleza" />
              <Campo label="Especialidades" name="especialidades" value={respostas.bloco1.especialidades} onChange={handleChange('bloco1')} placeholder="Ex: Odontologia, Dermatologia" />
              <Campo label="Quantos médicos atuam?" name="qtd_medicos" value={respostas.bloco1.qtd_medicos} onChange={handleChange('bloco1')} type="number" />
              <Campo label="Quantos funcionários na operação?" name="qtd_funcionarios" value={respostas.bloco1.qtd_funcionarios} onChange={handleChange('bloco1')} type="number" />
              <Campo label="Quantos atendimentos por mês?" name="atendimentos_mes" value={respostas.bloco1.atendimentos_mes} onChange={handleChange('bloco1')} type="number" />
            </>
          )}

          {step === 1 && (
            <>
              <Campo label="Como os agendamentos são feitos hoje?" name="como_agenda" value={respostas.bloco2.como_agenda} onChange={handleChange('bloco2')} type="textarea" placeholder="WhatsApp, telefone, pessoalmente..." />
              <RadioGroup label="Possuem agenda online?" name="agenda_online" value={respostas.bloco2.agenda_online} onChange={handleChange('bloco2')} options={['Sim', 'Não']} />
              <RadioGroup label="Usam WhatsApp para agendar?" name="usa_whatsapp_agenda" value={respostas.bloco2.usa_whatsapp_agenda} onChange={handleChange('bloco2')} options={['Sim', 'Não']} />
              <Campo label="Quantas pessoas cuidam do atendimento?" name="qtd_recepcionistas" value={respostas.bloco2.qtd_recepcionistas} onChange={handleChange('bloco2')} type="number" />
              <Campo label="Horas/dia gastas respondendo mensagens?" name="horas_mensagens" value={respostas.bloco2.horas_mensagens} onChange={handleChange('bloco2')} type="number" />
              <Campo label="Como confirmam consultas?" name="como_confirma" value={respostas.bloco2.como_confirma} onChange={handleChange('bloco2')} type="textarea" />
              <RadioGroup label="Existe processo automático de confirmação?" name="processo_automatico" value={respostas.bloco2.processo_automatico} onChange={handleChange('bloco2')} options={['Sim', 'Não']} />
              <Campo label="Quantas faltas/cancelamentos por mês?" name="faltas_mes" value={respostas.bloco2.faltas_mes} onChange={handleChange('bloco2')} type="number" />
            </>
          )}

          {step === 2 && (
            <>
              <Campo label="Como controlam receitas?" name="controle_receitas" value={respostas.bloco3.controle_receitas} onChange={handleChange('bloco3')} type="textarea" placeholder="Planilha, caderno, sistema..." />
              <Campo label="Como controlam despesas?" name="controle_despesas" value={respostas.bloco3.controle_despesas} onChange={handleChange('bloco3')} type="textarea" />
              <RadioGroup label="Utilizam sistema financeiro?" name="sistema_financeiro" value={respostas.bloco3.sistema_financeiro} onChange={handleChange('bloco3')} options={['Sim', 'Não']} />
              <RadioGroup label="Fazem repasse médico?" name="faz_repasse" value={respostas.bloco3.faz_repasse} onChange={handleChange('bloco3')} options={['Sim', 'Não']} />
              <RadioGroup label="Emitem nota fiscal (NFS-e)?" name="emite_nf" value={respostas.bloco3.emite_nf} onChange={handleChange('bloco3')} options={['Sim', 'Não']} />
              <RadioGroup label="Conseguem acompanhar o lucro mensal?" name="acompanha_lucro" value={respostas.bloco3.acompanha_lucro} onChange={handleChange('bloco3')} options={['Sim', 'Não', 'Parcialmente']} />
            </>
          )}

          {step === 3 && (
            <>
              <Campo label="Como acompanham os resultados da clínica?" name="acompanha_resultados" value={respostas.bloco4.acompanha_resultados} onChange={handleChange('bloco4')} type="textarea" />
              <RadioGroup label="Possuem relatórios gerenciais?" name="tem_relatorios" value={respostas.bloco4.tem_relatorios} onChange={handleChange('bloco4')} options={['Sim', 'Não']} />
              <Campo label="Como controlam estoque?" name="controle_estoque" value={respostas.bloco4.controle_estoque} onChange={handleChange('bloco4')} type="textarea" placeholder="Planilha, manual, sistema..." />
              <Campo label="Como acompanham a produtividade?" name="acompanha_produtividade" value={respostas.bloco4.acompanha_produtividade} onChange={handleChange('bloco4')} type="textarea" />
            </>
          )}

          {step === 4 && (
            <>
              <RadioGroup label="Utilizam algum sistema atualmente?" name="usa_sistema" value={respostas.bloco5.usa_sistema} onChange={handleChange('bloco5')} options={['Sim', 'Não']} />
              {respostas.bloco5.usa_sistema === 'Sim' && (
                <>
                  <Campo label="Qual sistema?" name="sistema_atual" value={respostas.bloco5.sistema_atual} onChange={handleChange('bloco5')} placeholder="Ex: Simples Dental, iClinic..." />
                  <Campo label="O que gostam nele?" name="o_que_gosta" value={respostas.bloco5.o_que_gosta} onChange={handleChange('bloco5')} type="textarea" />
                  <Campo label="O que mais incomoda?" name="o_que_incomoda" value={respostas.bloco5.o_que_incomoda} onChange={handleChange('bloco5')} type="textarea" />
                </>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <Campo label="Qual o principal objetivo para os próximos 12 meses?" name="objetivo_principal" value={respostas.bloco6.objetivo_principal} onChange={handleChange('bloco6')} type="textarea" placeholder="Ex: Aumentar faturamento, reduzir faltas, expandir..." />
              <Campo label="Outros objetivos" name="objetivos" value={respostas.bloco6.objetivos} onChange={handleChange('bloco6')} type="textarea" placeholder="Organizar processos, abrir unidade, contratar..." />
            </>
          )}

          {/* Navegação */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
              className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-30 transition-all">
              ← Anterior
            </button>

            {step < BLOCOS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)}
                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all">
                Próximo →
              </button>
            ) : (
              <button onClick={gerarDiagnostico} disabled={gerando}
                className="px-8 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center gap-2">
                {gerando ? (
                  <>⏳ Gerando diagnóstico com IA...</>
                ) : (
                  <>🧠 Gerar Diagnóstico Completo</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DiagnosticoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <DiagnosticoContent />
    </Suspense>
  );
}
