import React, { useState, useMemo, useRef } from 'react';
import {
  Copy,
  Printer,
  Search,
  Loader2,
  Check,
} from 'lucide-react';
import { MedicaoPendenteItem } from '../../types/reports';
import { formatCurrency } from '../../utils/formatters';
import { downloadPainelPdf } from '../../utils/downloadPdf';

interface MedicoesPendentesTabProps {
  medicoes: MedicaoPendenteItem[];
  onSelectContractByNumero: (numero: string) => void;
  onOpenDespachoNger?: (medicao: MedicaoPendenteItem) => void;
  onLiquidarMedicao: (medicaoId: string) => void;
  onPrintReport?: () => void;
}

export const MedicoesPendentesTab: React.FC<MedicoesPendentesTabProps> = ({
  medicoes,
  onSelectContractByNumero,
  onOpenDespachoNger,
  onLiquidarMedicao,
  onPrintReport,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PENDENTES' | 'OBSERVACOES'>('ALL');
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  const medicoesComPendente = useMemo(
    () => medicoes.filter((m) => (m.valorPendente ?? 0) > 0),
    [medicoes]
  );

  const medicoesComObs = useMemo(
    () => medicoes.filter((m) => !!m.observacao && m.observacao.trim() !== ''),
    [medicoes]
  );

  const filtered = useMemo(() => {
    return medicoes.filter((m) => {
      // Filter type
      if (filterType === 'PENDENTES' && (m.valorPendente ?? 0) <= 0) return false;
      if (filterType === 'OBSERVACOES' && (!m.observacao || m.observacao.trim() === '')) return false;

      // Search term
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        m.sigadoc.toLowerCase().includes(term) ||
        m.contratoNumero.toLowerCase().includes(term) ||
        m.empresa.toLowerCase().includes(term) ||
        m.descricao.toLowerCase().includes(term) ||
        m.numeroMedicao.toLowerCase().includes(term) ||
        (m.observacao && m.observacao.toLowerCase().includes(term))
      );
    });
  }, [medicoes, filterType, searchTerm]);

  const totalValorMedicao = useMemo(
    () => filtered.reduce((acc, m) => acc + (m.valorMedicao || 0), 0),
    [filtered]
  );
  const totalValorPendente = useMemo(
    () => filtered.reduce((acc, m) => acc + (m.valorPendente || 0), 0),
    [filtered]
  );

  const handleCopyTable = () => {
    const header = 'SIGADOC\tCONTRATO\tEMPRESA\tNº MEDIÇÃO\tDESCRIÇÃO\tVALOR DA MEDIÇÃO\tVALOR PENDENTE\tOBSERVAÇÃO';
    const lines = filtered.map(
      (m) =>
        `${m.sigadoc}\tNº ${m.contratoNumero}\t${m.empresa}\t${m.numeroMedicao}\t${m.descricao}\t${formatCurrency(
          m.valorMedicao
        )}\t${formatCurrency(m.valorPendente)}\t${m.observacao || ''}`
    );
    navigator.clipboard.writeText([header, ...lines].join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = async () => {
    if (!pdfTemplateRef.current || isGeneratingPdf) {
      if (onPrintReport) onPrintReport();
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const filename = `Relatorio_Medicoes_Pendentes_SEJUS_MT_${new Date().toISOString().slice(0, 10)}.pdf`;
      await downloadPainelPdf(pdfTemplateRef.current, filename);
    } catch (err) {
      console.error('Erro ao gerar PDF de Medições Pendentes:', err);
      if (onPrintReport) onPrintReport();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Actions Row (Matching Contratos com Saldo Pattern) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="FILTRAR POR SIGADOC, CONTRATO, EMPRESA, MEDIÇÃO..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 outline-none uppercase font-semibold text-slate-800 shadow-2xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterType === 'ALL'
                ? 'bg-[#1b346d] text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            TODAS AS MEDIÇÕES ({medicoes.length})
          </button>
          <button
            onClick={() => setFilterType('PENDENTES')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterType === 'PENDENTES'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-white border border-slate-300 text-red-700 hover:bg-red-50'
            }`}
          >
            COM VALOR PENDENTE ({medicoesComPendente.length})
          </button>
          {medicoesComObs.length > 0 && (
            <button
              onClick={() => setFilterType('OBSERVACOES')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
                filterType === 'OBSERVACOES'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-white border border-slate-300 text-amber-800 hover:bg-amber-50'
              }`}
            >
              COM OBSERVAÇÃO ({medicoesComObs.length})
            </button>
          )}
        </div>

        {/* Action Buttons: COPIAR & PDF */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 shrink-0">
          <button
            onClick={handleCopyTable}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md text-xs font-bold uppercase transition-colors cursor-pointer shadow-2xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span>{copied ? 'COPIADO!' : 'COPIAR'}</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-md text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-2xs active:scale-95"
            title="Exportar Relatório de Medições Pendentes em PDF"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>GERANDO...</span>
              </>
            ) : (
              <>
                <Printer className="w-3.5 h-3.5" />
                <span>PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Table (Matching Contratos com Saldo Pattern) */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[1150px]">
          <thead>
            <tr className="bg-[#1b346d] text-white font-bold uppercase text-[11px] tracking-wider border-b border-[#142854]">
              <th className="py-3.5 px-4 w-52 min-w-[190px] whitespace-nowrap border-r border-[#2a4585]">
                SIGADOC
              </th>
              <th className="py-3.5 px-4 w-60 border-r border-[#2a4585]">
                CONTRATO / EMPRESA
              </th>
              <th className="py-3.5 px-3 w-32 text-center border-r border-[#2a4585]">
                Nº MEDIÇÃO
              </th>
              <th className="py-3.5 px-4 border-r border-[#2a4585]">
                DESCRIÇÃO
              </th>
              <th className="py-3.5 px-4 text-right w-40 border-r border-[#2a4585]">
                VALOR DA MEDIÇÃO
              </th>
              <th className="py-3.5 px-4 text-right w-40 border-r border-[#2a4585]">
                VALOR PENDENTE
              </th>
              <th className="py-3.5 px-4 text-center w-56">
                MOTIVO
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                  Nenhuma medição encontrada para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtered.map((item, idx) => (
                <tr
                  key={`${item.id}-${idx}`}
                  onClick={() => onSelectContractByNumero(item.contratoNumero)}
                  className="hover:bg-blue-50/70 transition-colors cursor-pointer group select-none"
                  title={`Clique para abrir os detalhes do Contrato Nº ${item.contratoNumero}`}
                >
                  {/* 1. SIGADOC */}
                  <td className="py-3 px-4 align-middle font-mono font-bold text-slate-800 text-[11px] whitespace-nowrap border-r border-slate-200">
                    {item.sigadoc || '-'}
                  </td>

                  {/* 2. CONTRATO / EMPRESA */}
                  <td className="py-3 px-4 align-middle border-r border-slate-200">
                    <span className="font-bold text-slate-900 group-hover:text-blue-700 block text-xs">
                      Nº {item.contratoNumero}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium uppercase block truncate mt-0.5">
                      {item.empresa}
                    </span>
                  </td>

                  {/* 3. Nº MEDIÇÃO */}
                  <td className="py-3 px-3 align-middle text-center border-r border-slate-200">
                    <span className="font-bold text-slate-900 block font-mono text-xs uppercase">
                      {item.numeroMedicao}
                    </span>
                    {item.periodo && (
                      <span className="text-[10px] text-slate-400 block mt-0.5 uppercase">
                        {item.periodo}
                      </span>
                    )}
                  </td>

                  {/* 4. DESCRIÇÃO */}
                  <td className="py-3 px-4 align-middle border-r border-slate-200">
                    <span className="font-medium text-slate-800 uppercase block text-[11px] leading-tight">
                      {item.descricao}
                    </span>
                    {item.empenhoCodigo && (
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        EMP: {item.empenhoCodigo}
                      </span>
                    )}
                  </td>

                  {/* 5. VALOR DA MEDIÇÃO */}
                  <td className="py-3 px-4 align-middle text-right font-mono font-semibold text-slate-800 border-r border-slate-200">
                    {formatCurrency(item.valorMedicao)}
                  </td>

                  {/* 6. VALOR PENDENTE */}
                  <td className="py-3 px-4 align-middle text-right font-mono font-black border-r border-slate-200">
                    <span className={item.valorPendente > 0 ? 'text-red-600' : 'text-slate-700'}>
                      {formatCurrency(item.valorPendente)}
                    </span>
                  </td>

                  {/* 7. MOTIVO */}
                  <td className="py-3 px-4 align-middle text-center">
                    {item.observacao && item.observacao.trim() ? (
                      <span className="text-[11px] font-bold text-slate-800 uppercase leading-snug block">
                        {item.observacao}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-semibold">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300 font-black uppercase text-xs">
              <td colSpan={4} className="py-3.5 px-4 text-right text-slate-900 border-r border-slate-300">
                TOTAIS ({filtered.length} MEDIÇÕES):
              </td>
              <td className="py-3.5 px-4 text-right text-slate-900 font-mono border-r border-slate-300">
                {formatCurrency(totalValorMedicao)}
              </td>
              <td className="py-3.5 px-4 text-right text-red-600 font-mono font-black border-r border-slate-300">
                {formatCurrency(totalValorPendente)}
              </td>
              <td className="py-3.5 px-4 text-center text-slate-400">
                —
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Hidden Offscreen Template for Direct High-Quality PDF Generation */}
      <div
        style={{
          position: 'fixed',
          left: '-99999px',
          top: 0,
          zIndex: -9999,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <div
          ref={pdfTemplateRef}
          style={{ width: '1120px', backgroundColor: '#ffffff', padding: '24px' }}
        >
          {/* Header */}
          <div className="border-b-2 border-slate-300 pb-4 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#1b346d] flex items-center justify-center text-white font-bold text-lg">
                MT
              </div>
              <div>
                <h1 className="text-base font-black text-slate-900 uppercase tracking-wide">
                  ESTADO DE MATO GROSSO — SECRETARIA DE ESTADO DE JUSTIÇA (SEJUS/MT)
                </h1>
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mt-0.5">
                  RELATÓRIO GERENCIAL DE MEDIÇÕES PENDENTES ({filtered.length} MEDIÇÕES)
                </h2>
                <p className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">
                  COORDENADORIA DE INFRAESTRUTURA E SERVIÇOS DE ENGENHARIA (SOE/CISE) • EMISSÃO:{' '}
                  {new Date().toLocaleDateString('pt-BR')} ÀS{' '}
                  {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="text-right text-xs">
              <span className="block font-bold text-slate-700 uppercase">
                TOTAL MEDIDO: {formatCurrency(totalValorMedicao)}
              </span>
              <span className="block font-black text-red-600 font-mono text-sm mt-0.5">
                TOTAL PENDENTE: {formatCurrency(totalValorPendente)}
              </span>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left text-[10px] border border-slate-300 border-collapse table-fixed">
            <thead>
              <tr className="bg-[#1b346d] text-white font-bold uppercase text-[9.5px]">
                <th style={{ width: '170px' }} className="py-2 px-2.5">SIGADOC</th>
                <th style={{ width: '180px' }} className="py-2 px-2.5">CONTRATO / EMPRESA</th>
                <th style={{ width: '90px' }} className="py-2 px-2 text-center">Nº MEDIÇÃO</th>
                <th className="py-2 px-2.5">DESCRIÇÃO / OBJETO</th>
                <th style={{ width: '120px' }} className="py-2 px-2.5 text-right">VALOR MEDIÇÃO</th>
                <th style={{ width: '120px' }} className="py-2 px-2.5 text-right">VALOR PENDENTE</th>
                <th style={{ width: '150px' }} className="py-2 px-2.5 text-center">SITUAÇÃO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((item, idx) => (
                <tr
                  key={item.id || idx}
                  data-pdf-row={`med-${idx}`}
                  style={{
                    backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff',
                    breakInside: 'avoid',
                    pageBreakInside: 'avoid',
                  }}
                >
                  <td className="py-2 px-2.5 font-mono font-bold text-slate-900 text-[9.5px] truncate">
                    {item.sigadoc || '-'}
                  </td>
                  <td className="py-2 px-2.5">
                    <span className="font-bold text-slate-900 block font-mono">Nº {item.contratoNumero}</span>
                    <span className="text-[8.5px] text-slate-600 uppercase block truncate">{item.empresa}</span>
                  </td>
                  <td className="py-2 px-2 text-center font-bold font-mono text-slate-900">
                    {item.numeroMedicao}
                  </td>
                  <td className="py-2 px-2.5 uppercase text-slate-700 leading-tight">
                    {item.descricao}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900">
                    {formatCurrency(item.valorMedicao)}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono font-black text-red-600">
                    {formatCurrency(item.valorPendente)}
                  </td>
                  <td className="py-2 px-2.5 text-center uppercase text-[9px] font-bold">
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                      PENDENTE LIQUIDAÇÃO
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-black uppercase text-[10px]">
                <td colSpan={4} className="py-2.5 px-2.5 text-right text-slate-900">
                  TOTAIS ({filtered.length} PENDÊNCIAS):
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono text-slate-900">
                  {formatCurrency(totalValorMedicao)}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono text-red-600 font-bold">
                  {formatCurrency(totalValorPendente)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>

          {/* Footer note */}
          <div className="mt-4 pt-3 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-500 uppercase font-semibold">
            <span>SISTEMA DE GESTÃO DE CONTRATOS — SEJUS/MT</span>
            <span>TOTAL PENDENTE: {formatCurrency(totalValorPendente)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
