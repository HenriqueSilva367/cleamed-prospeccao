'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function BuscaLeads() {
  const [cidade, setCidade] = useState('');
  const [bairro, setBairro] = useState('');
  const [tipo, setTipo] = useState('Clínica Odontológica');
  const [quantidade, setQuantidade] = useState(10);
  const [flags, setFlags] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [mensagem, setMensagem] = useState('');
  const [historico, setHistorico] = useState([]);

  const carregarHistorico = async () => {
    try {
      const res = await fetch(`${API}/busca/historico`);
      if (res.ok) {
        const data = await res.json();
        setHistorico(data);
      }
    } catch (e) {
      console.error('Erro ao carregar historico', e);
    }
  };

  useEffect(() => {
    carregarHistorico();
  }, []);

  async function iniciarBusca(e) {
    e.preventDefault();
    if (!cidade) return alert('Por favor, digite uma cidade.');

    setBuscando(true);
    setMensagem('Iniciando o robô de busca... Isso pode levar de 1 a 2 minutos.');
    setResultados([]);

    try {
      const response = await fetch(`${API}/busca/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cidade, bairro, tipo, quantidade, flags }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setResultados(data.resultados || []);
        let details = '';
        if (data.novos !== undefined && data.atualizados !== undefined) {
          details = ` (${data.novos} novos e ${data.atualizados} atualizados).`;
        }
        setMensagem(`Busca finalizada! ${data.total || 0} leads processados${details}`);
        carregarHistorico();
      } else {
        setMensagem('Erro na busca: ' + (data.erro || 'Erro desconhecido'));
      }
    } catch (error) {
      setMensagem('Erro de conexão com o servidor.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            ← Voltar
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Buscar Novos Leads</h1>
            <p className="text-xs text-gray-500">Extração automática do Google Maps</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm mb-8">
          <form onSubmit={iniciarBusca} className="flex flex-col md:flex-row flex-wrap gap-4 items-end">
            <div className="flex-1 w-full md:w-64">
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                Cidade para buscar
              </label>
              <input
                type="text"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: Fortaleza, Curitiba..."
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-900 transition-all bg-gray-50/50"
                disabled={buscando}
              />
            </div>
            <div className="flex-1 w-full md:w-48">
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                Bairro (Opcional)
              </label>
              <input
                type="text"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Ex: Aldeota"
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-900 transition-all bg-gray-50/50"
                disabled={buscando}
              />
            </div>
            <div className="w-full md:w-64">
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                Tipo de Estabelecimento
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-900 transition-all bg-gray-50/50"
                disabled={buscando}
              >
                <option value="Clínica Odontológica">Clínica Odontológica</option>
                <option value="Clínica de Estética">Clínica de Estética</option>
                <option value="Dermatologista">Dermatologista</option>
                <option value="Clínica Médica">Clínica Médica</option>
                <option value="Fisioterapia">Fisioterapia</option>
              </select>
            </div>
            <div className="w-full md:w-32">
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                Qtd
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={quantidade}
                onChange={(e) => setQuantidade(parseInt(e.target.value))}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-900 transition-all bg-gray-50/50"
                disabled={buscando}
              />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                Tags / Flags (opcional)
              </label>
              <input
                type="text"
                value={flags}
                onChange={(e) => setFlags(e.target.value)}
                placeholder="Ex: com site, instagram..."
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-900/5 focus:border-gray-900 transition-all bg-gray-50/50"
                disabled={buscando}
              />
            </div>
            <button
              type="submit"
              disabled={buscando}
              className={`w-full md:w-auto px-8 py-3 rounded-xl font-medium text-sm transition-all shadow-lg ${
                buscando 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-gray-900 text-white hover:bg-gray-800 active:scale-95 shadow-gray-900/20'
              }`}
            >
              {buscando ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Buscando...
                </span>
              ) : 'Iniciar Busca'}
            </button>
          </form>

          {historico.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3 block">
                Cidades buscadas recentemente
              </span>
              <div className="flex flex-wrap gap-2">
                {historico.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCidade(h.cidade)}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-gray-900 hover:border-gray-300 transition-colors"
                  >
                    {h.cidade}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensagem && (
            <div className={`mt-6 p-4 rounded-xl text-sm border ${
              mensagem.includes('Erro') 
              ? 'bg-red-50 border-red-100 text-red-800' 
              : 'bg-emerald-50 border-emerald-100 text-emerald-800'
            }`}>
              {mensagem}
            </div>
          )}
        </div>

        {resultados.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest px-2">
              Leads Encontrados Recentemente
            </h2>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left text-xs font-bold text-gray-400 px-6 py-4 uppercase tracking-tighter">Nome</th>
                    <th className="text-center text-xs font-bold text-gray-400 px-4 py-4 uppercase tracking-tighter">Status</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-6 py-4 uppercase tracking-tighter">Telefone</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-6 py-4 uppercase tracking-tighter">Bairro</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-6 py-4 uppercase tracking-tighter">Estrelas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {resultados.map((l, i) => (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{l.nome}</div>
                        <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{l.endereco}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${l.isNovo ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'}`}>
                          {l.isNovo ? 'Novo' : 'Atualizado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-600">
                        <div className="flex flex-col gap-1">
                          <span>{l.tel || '—'}</span>
                          {l.whatsapp_valido ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded w-fit">
                              ⚡ WhatsApp Ativo
                            </span>
                          ) : null}
                          {l.tel_origem === 'site_wame' || l.tel_origem === 'site_texto' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded w-fit">
                              🌐 Do Site
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{l.bairro || '—'}</td>
                      <td className="px-6 py-4">
                        {l.avaliacao ? (
                          <div className="flex items-center gap-1">
                            <span className="text-amber-400">★</span>
                            <span className="font-bold text-gray-700">{l.avaliacao}</span>
                            <span className="text-gray-300 text-xs">({l.total_avaliacoes})</span>
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-center mt-6">
              <Link href="/" className="text-sm font-medium text-gray-900 hover:underline decoration-gray-300 underline-offset-4">
                Ir para a lista completa de clínicas →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
