import React from 'react';
import { X, Printer, BarChart3, PieChart, AlertTriangle, Filter, Edit3 } from 'lucide-react';
import { Contrato } from '../../types/contract';
import { formatCurrency, formatPercent, formatDataHojePorExtenso, formatDataHojeBR } from '../../utils/formatters';
import { useSignerConfig } from '../../utils/signerConfig';

export interface FilterInfo {
  searchTerm: string;
  filterTipo: 'ALL' | 'OBRAS' | 'MANUTENÇÃO PREDIAL';
  isExpiringFilterActive: boolean;
  totalOriginal: number;
  totalFiltrados: number;
}

interface PrintPainelPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  contratos: Contrato[];
  allContratos?: Contrato[];
  metrics: {
    valorContratado: number;
    valorContratadoNaoExecutado: number;
    valorEmpenhado: number;
    valorMedido: number;
    valorLiquidado: number;
    valorPago: number;
  };
  filterInfo?: FilterInfo;
}

export const PrintPainelPdfModal: React.FC<PrintPainelPdfModalProps> = ({
  isOpen,
  onClose,
  contratos,
  allContratos = [],
  metrics,
  filterInfo,
}) => {
  const { signer, updateSigner } = useSignerConfig();

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const isFiltered =
    (filterInfo && (
      filterInfo.searchTerm.trim() !== '' ||
      filterInfo.filterTipo !== 'ALL' ||
      filterInfo.isExpiringFilterActive
    )) ||
    (allContratos.length > 0 && contratos.length !== allContratos.length);

  // Groupings for Donut Chart
  const obras = contratos.filter((c) => c.tipo === 'OBRAS');
  const manutencao = contratos.filter((c) => c.tipo === 'MANUTENÇÃO PREDIAL');

  const totalQtd = contratos.length;
  const obrasQtd = obras.length;
  const manutencaoQtd = manutencao.length;

  const obrasValor = obras.reduce((acc, c) => acc + c.valorContratado, 0);
  const manutencaoValor = manutencao.reduce((acc, c) => acc + c.valorContratado, 0);
  const totalValor = obrasValor + manutencaoValor || 1;

  const obrasPct = totalQtd > 0 ? Math.round((obrasQtd / totalQtd) * 100) : 0;
  const manutencaoPct = totalQtd > 0 ? 100 - obrasPct : 0;

  const obrasValorPct = Math.round((obrasValor / totalValor) * 100);
  const manutencaoValorPct = 100 - obrasValorPct;

  // SVG Donut calculation
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (obrasPct / 100) * circumference;

  // Bars for Financial Chart
  const maxVal = Math.max(
    metrics.valorContratado,
    metrics.valorContratadoNaoExecutado,
    metrics.valorEmpenhado,
    metrics.valorMedido,
    metrics.valorLiquidado,
    metrics.valorPago,
    1
  );

  const bars = [
    {
      label: 'VALOR CONTRATADO',
      value: metrics.valorContratado,
      hexColor: '#10192e',
      heightPct: Math.max((metrics.valorContratado / maxVal) * 100, 6),
    },
    {
      label: 'VALOR CONTRATADO NÃO EXECUTADO',
      value: metrics.valorContratadoNaoExecutado,
      hexColor: '#3b4858',
      heightPct: Math.max((metrics.valorContratadoNaoExecutado / maxVal) * 100, 6),
    },
    {
      label: 'VALOR EMPENHADO',
      value: metrics.valorEmpenhado,
      hexColor: '#2563eb',
      heightPct: metrics.valorEmpenhado > 0 ? Math.max((metrics.valorEmpenhado / maxVal) * 100, 6) : 3,
    },
    {
      label: 'VALOR MEDIDO (ATESTADO)',
      value: metrics.valorMedido,
      hexColor: '#c2410c',
      heightPct: metrics.valorMedido > 0 ? Math.max((metrics.valorMedido / maxVal) * 100, 6) : 3,
    },
    {
      label: 'VALOR LIQUIDADO',
      value: metrics.valorLiquidado,
      hexColor: '#059669',
      heightPct: metrics.valorLiquidado > 0 ? Math.max((metrics.valorLiquidado / maxVal) * 100, 6) : 3,
    },
    {
      label: 'VALOR PAGO',
      value: metrics.valorPago,
      hexColor: '#0d9488',
      heightPct: metrics.valorPago > 0 ? Math.max((metrics.valorPago / maxVal) * 100, 6) : 3,
    },
  ];

  // Totals for table footer
  const totalContratadoTabela = contratos.reduce((acc, c) => acc + c.valorContratado, 0);
  const totalSaldoTabela = contratos.reduce((acc, c) => acc + c.saldoContrato, 0);
  const avgExecucao =
    contratos.length > 0
      ? contratos.reduce((acc, c) => acc + c.execucaoFisica, 0) / contratos.length
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-1 sm:p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:inset-auto print:overflow-visible">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[1550px] max-h-[96vh] flex flex-col overflow-hidden border border-slate-300 print:border-none print:shadow-none print:max-h-none print:overflow-visible printable-sheet">
        
        {/* Top Control Bar (HIDDEN ON PRINT) */}
        <div className="print:hidden bg-[#162a52] text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded bg-red-600 font-black text-xs text-white shadow-xs">
              PDF
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                EXTRAÇÃO DE PDF DO PAINEL PRINCIPAL
              </h3>
              <p className="text-[11px] text-blue-200">
                {isFiltered
                  ? `Visualização com filtros aplicados (${contratos.length} contrato${contratos.length === 1 ? '' : 's'} selecionado${contratos.length === 1 ? '' : 's'})`
                  : `Visualização completa idêntica ao Print 1 (${contratos.length} contratos)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isFiltered && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400 text-amber-300 text-[11px] font-semibold">
                <Filter className="w-3 h-3 text-amber-400" />
                <span>Dados Filtrados</span>
              </span>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md hover:shadow-lg active:scale-95"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>IMPRIMIR / SALVAR COMO PDF</span>
            </button>

            <button
              onClick={onClose}
              title="Fechar visualização"
              className="text-white/80 hover:text-white p-1.5 rounded hover:bg-white/10 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Canvas Document (EXACT VISUAL REPLICA OF PRINT 1) */}
        <div className="overflow-y-auto bg-[#f8fafc] print:bg-white text-slate-900 font-sans p-4 sm:p-6 space-y-4 print:p-0 print:space-y-3 print:overflow-visible">
          
          {/* 1. Header Banner (Same as Print 1) */}
          <div
            style={{ backgroundColor: '#172b53' }}
            className="text-white px-5 py-3 rounded-t flex items-center justify-between shadow-xs print:rounded-none"
          >
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-5 h-5 text-blue-300 shrink-0" />
              <h1 className="text-sm font-black tracking-wider uppercase">
                SISTEMA DE CONTROLE DE ORÇAMENTO
              </h1>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold tracking-wider uppercase text-blue-200 block">
                {formatDataHojePorExtenso()}
              </span>
              <span className="text-[9px] font-mono text-blue-300/80 uppercase block">
                COORDENADORIA DE INFRAESTRUTURA E SERVIÇOS DE ENGENHARIA — CISE/SOE/SEJUS/MT
              </span>
            </div>
          </div>

          {/* 2. Filter Notification Banner (appears if filters are active) */}
          {isFiltered && (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-300 px-4 py-2 rounded text-xs text-amber-900 shadow-2xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-bold uppercase tracking-wider">
                  RELATÓRIO FILTRADO:
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {filterInfo?.isExpiringFilterActive && (
                    <span className="px-2 py-0.5 bg-amber-200 border border-amber-400 font-semibold rounded">
                      CONTRATOS A VENCER EM ATÉ 60 DIAS
                    </span>
                  )}
                  {filterInfo?.searchTerm && (
                    <span className="px-2 py-0.5 bg-blue-100 border border-blue-300 text-blue-900 font-semibold rounded">
                      BUSCA: &quot;{filterInfo.searchTerm.toUpperCase()}&quot;
                    </span>
                  )}
                  {filterInfo?.filterTipo && filterInfo.filterTipo !== 'ALL' && (
                    <span className="px-2 py-0.5 bg-slate-200 border border-slate-300 text-slate-800 font-semibold rounded">
                      TIPO: {filterInfo.filterTipo}
                    </span>
                  )}
                </div>
              </div>
              <span className="font-black text-amber-900 uppercase font-mono text-[11px]">
                {contratos.length} de {allContratos.length || contratos.length} contratos listados
              </span>
            </div>
          )}

          {/* 3. Top Executive Charts Row (Identical to Print 1) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch print:grid-cols-3">
            {/* Chart 1: Financial & Budget Execution (6 Bars) */}
            <div className="lg:col-span-2 print:col-span-2 bg-white rounded border border-slate-200 p-4 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h2 className="font-bold tracking-wide text-slate-700 uppercase text-xs">
                  EXECUÇÃO ORÇAMENTÁRIA E FINANCEIRA DOS CONTRATOS {isFiltered ? '(FILTRADOS)' : ''}
                </h2>
                <span className="text-[10px] text-slate-400 font-semibold tracking-wider">
                  VALORES EM REAIS (R$)
                </span>
              </div>

              {/* Chart Graphic Area */}
              <div className="relative flex items-end justify-between h-44 pt-7 px-3 sm:px-6">
                {/* Guidelines */}
                <div className="absolute inset-x-3 top-7 border-b border-dashed border-slate-200 pointer-events-none" />
                <div className="absolute inset-x-3 bottom-9 border-b border-dashed border-slate-300 pointer-events-none" />

                {/* Bars */}
                <div className="w-full flex items-end justify-between gap-2 z-10 pb-9">
                  {bars.map((bar, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center">
                      {/* Formatted Currency Number above bar */}
                      <span className="font-bold text-slate-800 text-[10px] sm:text-[11px] mb-1 font-mono tracking-tight text-center">
                        {formatCurrency(bar.value, false)}
                      </span>
                      {/* Bar element with inline background-color for guaranteed print rendering */}
                      <div className="w-full max-w-[44px] flex items-end justify-center">
                        <div
                          style={{
                            height: `${(bar.heightPct / 100) * 88}px`,
                            backgroundColor: bar.hexColor,
                            WebkitPrintColorAdjust: 'exact',
                            printColorAdjust: 'exact',
                          }}
                          className="w-full rounded-t-xs shadow-2xs transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Labels under baseline */}
              <div className="flex items-start justify-between gap-2 px-3 sm:px-6 pt-1">
                {bars.map((bar, idx) => (
                  <div key={idx} className="flex-1 text-center">
                    <span className="block leading-tight text-slate-600 font-semibold uppercase text-[8px] sm:text-[9px]">
                      {bar.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 2: Types of Contract Donut (Identical to Print 1) */}
            <div className="lg:col-span-1 print:col-span-1 bg-white rounded border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs uppercase tracking-wide">
                  <PieChart className="w-4 h-4 text-slate-500" />
                  <span>TIPOS DE CONTRATO</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase">
                  {totalQtd} CONTRATOS
                </span>
              </div>

              <div className="flex items-center justify-around py-3 gap-3">
                {/* Donut SVG */}
                <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r={radius}
                      stroke="#0284c7"
                      strokeWidth="15"
                      fill="transparent"
                      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r={radius}
                      stroke="#1b336a"
                      strokeWidth="15"
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="butt"
                      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                    <span className="text-lg font-black text-slate-900 leading-none">
                      {totalQtd}
                    </span>
                    <span className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">
                      TOTAL
                    </span>
                  </div>
                </div>

                {/* Legend */}
                <div className="space-y-3 text-[10px]">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ backgroundColor: '#1b336a' }}
                        className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                      />
                      <span className="font-bold text-slate-800 uppercase">OBRAS</span>
                    </div>
                    <div className="pl-4 font-semibold text-slate-600">
                      <span>{obrasQtd} contratos</span>{' '}
                      <span className="text-slate-400">({obrasPct}%)</span>
                      <div className="font-mono text-[9px] text-slate-700">
                        {formatCurrency(obrasValor)} ({obrasValorPct}%)
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ backgroundColor: '#0284c7' }}
                        className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                      />
                      <span className="font-bold text-slate-800 uppercase">MANUTENÇÃO PREDIAL</span>
                    </div>
                    <div className="pl-4 font-semibold text-slate-600">
                      <span>{manutencaoQtd} contratos</span>{' '}
                      <span className="text-slate-400">({manutencaoPct}%)</span>
                      <div className="font-mono text-[9px] text-slate-700">
                        {formatCurrency(manutencaoValor)} ({manutencaoValorPct}%)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Table of Contracts (Identical to Print 1) */}
          <div className="bg-white rounded border border-slate-300 shadow-2xs overflow-hidden">
            <table className="w-full border-collapse text-left text-[10px] table-fixed">
              <thead>
                <tr
                  style={{ backgroundColor: '#1b356c', color: '#ffffff' }}
                  className="font-bold tracking-wider uppercase border-b border-[#142854] text-[10px]"
                >
                  <th style={{ width: '115px' }} className="py-2.5 px-3 shrink-0">Nº DO CONTRATO</th>
                  <th style={{ width: '120px' }} className="py-2.5 px-3 shrink-0">TIPO DE CONTRATO</th>
                  <th style={{ width: '230px' }} className="py-2.5 px-3">DESCRIÇÃO</th>
                  <th style={{ width: '195px' }} className="py-2.5 px-3 shrink-0">RAZÃO SOCIAL / CNPJ</th>
                  <th style={{ width: '170px' }} className="py-2.5 px-3 shrink-0">FISCAL / SUBSTITUTO</th>
                  <th style={{ width: '115px' }} className="py-2.5 px-2.5 text-right shrink-0">VALOR / SALDO</th>
                  <th style={{ width: '75px' }} className="py-2.5 px-2 text-center shrink-0">DIAS P/ VENCER</th>
                  <th style={{ width: '80px' }} className="py-2.5 px-2 text-center shrink-0">EXECUÇÃO FÍSICA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {contratos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                      Nenhum contrato corresponde aos filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  contratos.map((c, index) => {
                    const execFis = (() => {
                      if (!c.medicoes || c.medicoes.length === 0) return c.execucaoFisica || 0;
                      const medido = c.medicoes.reduce((acc, m) => acc + (Number(m.valorMedicao) || 0), 0);
                      return c.valorContratado > 0 ? (medido / c.valorContratado) * 100 : c.execucaoFisica || 0;
                    })();

                    return (
                      <tr
                        key={c.id || index}
                        className={index % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                      >
                        {/* Nº DO CONTRATO */}
                        <td className="py-2 px-3 align-top">
                          <span className="font-bold text-slate-900 block font-mono text-[10.5px]">
                            {c.numero}
                          </span>
                          {c.processoSigadoc && c.processoSigadoc !== 'NÃO INFORMADO' && (
                            <div className="flex flex-col mt-0.5 space-y-0.5">
                              {c.processoSigadoc
                                .split(/;|\n/)
                                .map((p) => p.trim())
                                .filter(Boolean)
                                .map((proc, idx) => (
                                  <span key={idx} className="text-[9px] text-slate-500 block font-mono leading-tight">
                                    {proc}
                                  </span>
                                ))}
                            </div>
                          )}
                        </td>

                        {/* TIPO DE CONTRATO */}
                        <td className="py-2 px-3 align-top font-bold text-slate-700 uppercase leading-tight">
                          {c.tipo}
                        </td>

                        {/* DESCRIÇÃO */}
                        <td className="py-2 px-3 align-top uppercase leading-snug text-slate-800 break-words">
                          {c.descricao}
                        </td>

                        {/* RAZÃO SOCIAL / CNPJ */}
                        <td className="py-2 px-3 align-top">
                          <span className="font-bold text-slate-900 block leading-tight uppercase">
                            {c.razaoSocial}
                            {c.siglaEmpresa && (
                              <span className="text-slate-500 font-semibold ml-1">({c.siglaEmpresa})</span>
                            )}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono block mt-0.5">
                            {c.cnpj}
                          </span>
                        </td>

                        {/* FISCAL / SUBSTITUTO */}
                        <td className="py-2 px-3 align-top">
                          <span className="font-bold text-slate-900 block leading-tight uppercase">
                            {c.fiscal}
                          </span>
                          <span className="text-[9px] text-slate-500 block uppercase mt-0.5 leading-tight">
                            SUB: {c.substituto || '-'}
                          </span>
                        </td>

                        {/* VALOR / SALDO (Unified column matching Image 1) */}
                        <td className="py-2 px-2.5 align-top text-right whitespace-nowrap font-mono">
                          <span className="font-semibold text-slate-900 block text-[10.5px] leading-tight">
                            {formatCurrency(c.valorContratado)}
                          </span>
                          <span
                            style={{ color: '#047857' }}
                            className="font-bold text-[9.5px] block mt-0.5"
                          >
                            {formatCurrency(c.saldoContrato)}
                          </span>
                        </td>

                        {/* DIAS P/ VENCER */}
                        <td className="py-2 px-2 align-top text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              c.diasVencer <= 60
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'text-slate-700'
                            }`}
                          >
                            {c.diasVencer} DIAS
                          </span>
                        </td>

                        {/* EXECUÇÃO FÍSICA (Never cut off!) */}
                        <td className="py-2 px-2 align-top text-center whitespace-nowrap">
                          <span className="font-bold text-slate-900 block text-[10px]">
                            {formatPercent(execFis)}
                          </span>
                          {execFis > 0 && (
                            <div className="w-12 mx-auto bg-slate-200 rounded-full h-1 mt-1 overflow-hidden">
                              <div
                                style={{
                                  width: `${Math.min(execFis, 100)}%`,
                                  backgroundColor: '#2563eb',
                                  WebkitPrintColorAdjust: 'exact',
                                  printColorAdjust: 'exact',
                                }}
                                className="h-full rounded-full"
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Total Footer Row */}
              <tfoot>
                <tr className="bg-slate-200 font-black text-slate-900 border-t-2 border-slate-400">
                  <td colSpan={5} className="py-2.5 px-3 uppercase text-right">
                    TOTAL {isFiltered ? 'DOS CONTRATOS FILTRADOS' : 'GERAL DOS CONTRATOS'} ({contratos.length}):
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap">
                    <span className="font-black text-slate-900 block text-[11px] leading-tight">
                      {formatCurrency(totalContratadoTabela)}
                    </span>
                    <span style={{ color: '#065f46' }} className="font-black text-[10px] block mt-0.5">
                      {formatCurrency(totalSaldoTabela)}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-center text-[10px] text-slate-600">
                    -
                  </td>
                  <td className="py-2.5 px-2 text-center font-mono text-[10px]">
                    {formatPercent(avgExecucao)} MÉD.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 5. Institutional Signature Block (Official Footer) */}
          <div className="pt-6 pb-2 text-center space-y-1 max-w-md mx-auto group relative">
            <div className="w-80 mx-auto border-t-2 border-slate-800 pt-2 font-black text-xs uppercase text-slate-900 tracking-wider">
              <input
                type="text"
                value={signer.nome}
                onChange={(e) => updateSigner({ nome: e.target.value.toUpperCase() })}
                title="Clique para editar o nome do responsável"
                placeholder="JOÃO ALEXANDRE DOURADO"
                className="w-full text-center font-black text-xs uppercase text-slate-900 tracking-wider bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 outline-none border border-transparent hover:border-slate-300 transition-all cursor-text"
              />
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-700">
              <input
                type="text"
                value={signer.cargo}
                onChange={(e) => updateSigner({ cargo: e.target.value.toUpperCase() })}
                title="Clique para editar o cargo"
                placeholder="ASSISTENTE ADMINISTRATIVO DO SISPEN"
                className="w-full text-center text-[10px] uppercase font-bold text-slate-700 bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 outline-none border border-transparent hover:border-slate-300 transition-all cursor-text"
              />
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-600 font-mono tracking-wider">
              <input
                type="text"
                value={signer.setor}
                onChange={(e) => updateSigner({ setor: e.target.value.toUpperCase() })}
                title="Clique para editar o setor/lotação"
                placeholder="CISE / SOE / SEJUS / MT"
                className="w-full text-center text-[10px] uppercase font-bold text-slate-600 font-mono tracking-wider bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5 outline-none border border-transparent hover:border-slate-300 transition-all cursor-text"
              />
            </div>
            <div className="print:hidden text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 font-medium pt-0.5">
              <Edit3 className="w-2.5 h-2.5" />
              <span>Clique no nome ou cargo para editar</span>
            </div>
            <div className="text-[9px] uppercase text-slate-400 font-mono pt-1">
              Documento extraído eletronicamente pelo Sistema de Controle de Orçamento em {formatDataHojeBR()}
            </div>
          </div>
        </div>

        {/* Bottom Control Bar on Screen (HIDDEN ON PRINT) */}
        <div className="print:hidden bg-slate-100 border-t border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs text-slate-600">
          <span>
            {isFiltered
              ? `Visualizando ${contratos.length} contrato(s) filtrado(s). O PDF será gerado com estes mesmos dados e gráficos.`
              : `Visualizando todos os ${contratos.length} contratos do sistema. O PDF será gerado exatamente como exibido.`}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
            >
              FECHAR
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold uppercase transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>IMPRIMIR / SALVAR COMO PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
