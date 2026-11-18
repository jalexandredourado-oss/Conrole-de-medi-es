import React, { useState, useMemo, useRef } from 'react';
import {
  Copy,
  Printer,
  Search,
  Check,
  Loader2,
} from 'lucide-react';
import { EmpenhoPendenteItem } from '../../types/reports';
import { Contrato } from '../../types/contract';
import { formatCurrency } from '../../utils/formatters';
import { downloadPainelPdf } from '../../utils/downloadPdf';

export type FiltroEmpenhoPeriodo =
  | 'TODOS'
  | 'NUNCA_UTILIZADO'
  | 'MAIS_60_DIAS'
  | 'EXERCICIO_ANTERIOR';

interface EmpenhosPendentesTabProps {
  empenhos: EmpenhoPendenteItem[];
  allEmpenhos?: EmpenhoPendenteItem[];
  contratos?: Contrato[];
  selectedContratoFilter?: string;
  onChangeContratoFilter?: (numero: string) => void;
  onSelectContractByNumero: (numero: string) => void;
  onPrintReport?: () => void;
}

export const EmpenhosPendentesTab: React.FC<EmpenhosPendentesTabProps> = ({
  empenhos,
  allEmpenhos,
  contratos,
  selectedContratoFilter,
  onChangeContratoFilter,
  onSelectContractByNumero,
  onPrintReport,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState<FiltroEmpenhoPeriodo>('TODOS');
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  // Map of contracts for process info
  const contractMap = useMemo(() => {
    const map = new Map<string, Contrato>();
    (contratos || []).forEach((c) => {
      if (c.numero) map.set(c.numero.trim(), c);
    });
    return map;
  }, [contratos]);

  // Lista consolidada de contratos que possuem empenhos com saldo
  const contractsWithEmpenhos = useMemo(() => {
    const map = new Map<string, { numero: string; empresa: string; count: number }>();
    const listToAnalyze = (allEmpenhos && allEmpenhos.length > 0) ? allEmpenhos : empenhos;
    for (const e of listToAnalyze) {
      if (!e.contratoNumero) continue;
      const cNum = e.contratoNumero.trim();
      if (!map.has(cNum)) {
        map.set(cNum, {
          numero: cNum,
          empresa: e.empresa || '',
          count: 1,
        });
      } else {
        map.get(cNum)!.count++;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [allEmpenhos, empenhos]);

  const getEffectiveDays = (item: EmpenhoPendenteItem): number => {
    if (typeof item.diasSemUtilizar === 'number' && item.diasSemUtilizar > 0) {
      return item.diasSemUtilizar;
    }
    if (typeof item.diasSemMedicao === 'number' && item.diasSemMedicao > 0) {
      return item.diasSemMedicao;
    }
    if (item.situacao === 'EXERCICIO_ANTERIOR' || item.codigo.includes('.25.') || item.codigo.includes('.24.')) {
      return 365;
    }
    if (item.situacao === 'NAO_UTILIZADO') {
      return 180;
    }
    return 60;
  };

  const isNuncaUtilizado = (item: EmpenhoPendenteItem): boolean => {
    return item.situacao === 'NAO_UTILIZADO' || item.saldo >= item.empenhado;
  };

  const isExercicioAnt = (item: EmpenhoPendenteItem): boolean => {
    return (
      item.situacao === 'EXERCICIO_ANTERIOR' ||
      item.codigo.includes('.25.') ||
      item.codigo.includes('.24.')
    );
  };

  const countNuncaUtilizado = useMemo(
    () => empenhos.filter((e) => isNuncaUtilizado(e)).length,
    [empenhos]
  );
  const countMais60Dias = useMemo(
    () => empenhos.filter((e) => getEffectiveDays(e) >= 60).length,
    [empenhos]
  );
  const countExercicioAnterior = useMemo(
    () => empenhos.filter((e) => isExercicioAnt(e)).length,
    [empenhos]
  );

  const filtered = useMemo(() => {
    return empenhos
      .filter((item) => {
        // 0. Filtro rigoroso de Contrato Selecionado
        if (selectedContratoFilter && selectedContratoFilter !== 'ALL') {
          if (item.contratoNumero.trim() !== selectedContratoFilter.trim()) {
            return false;
          }
        }

        // 1. Filtro de Período
        const dias = getEffectiveDays(item);
        const nunca = isNuncaUtilizado(item);
        const exAnt = isExercicioAnt(item);

        if (filterPeriodo === 'NUNCA_UTILIZADO') {
          if (!nunca) return false;
        } else if (filterPeriodo === 'MAIS_60_DIAS') {
          if (dias < 60 && !nunca) return false;
        } else if (filterPeriodo === 'EXERCICIO_ANTERIOR') {
          if (!exAnt) return false;
        }

        // 2. Busca por texto
        if (searchTerm.trim() !== '') {
          const term = searchTerm.toLowerCase().trim();
          const matches =
            item.codigo.toLowerCase().includes(term) ||
            item.contratoNumero.toLowerCase().includes(term) ||
            item.empresa.toLowerCase().includes(term);
          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => b.saldo - a.saldo);
  }, [empenhos, selectedContratoFilter, filterPeriodo, searchTerm]);

  const totalSaldo = useMemo(() => filtered.reduce((acc, e) => acc + (e.saldo || 0), 0), [filtered]);
  const totalEmpenhado = useMemo(() => filtered.reduce((acc, e) => acc + (e.empenhado || 0), 0), [filtered]);

  const handleCopyTable = () => {
    const header = 'Nº EMPENHO\tCONTRATO\tEMPRESA\tPROCESSO\tSITUAÇÃO\tSEM USO\tVALOR EMPENHADO\tSALDO DO EMPENHO';
    const lines = filtered.map((e) => {
      const c = contractMap.get(e.contratoNumero.trim());
      const proc = c?.processoSigadoc && c.processoSigadoc !== 'NÃO INFORMADO' ? c.processoSigadoc : '-';
      const dias = getEffectiveDays(e);
      const nunca = isNuncaUtilizado(e);
      const tempo = nunca ? 'NUNCA UTILIZADO' : isExercicioAnt(e) ? '> 365 DIAS' : `${dias} DIAS`;
      const sit = nunca ? 'NÃO UTILIZADO' : isExercicioAnt(e) ? 'EXERCÍCIO ANTERIOR' : 'COM SALDO';
      return `${e.codigo}\tNº ${e.contratoNumero}\t${e.empresa}\t${proc}\t${sit}\t${tempo}\t${formatCurrency(
        e.empenhado
      )}\t${formatCurrency(e.saldo)}`;
    });
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
      const filename = `Relatorio_Empenhos_Com_Saldo_SEJUS_MT_${new Date().toISOString().slice(0, 10)}.pdf`;
      await downloadPainelPdf(pdfTemplateRef.current, filename);
    } catch (err) {
      console.error('Erro ao gerar PDF de Empenhos com Saldo:', err);
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
            placeholder="FILTRAR POR EMPENHO, CONTRATO, EMPRESA..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 outline-none uppercase font-semibold text-slate-800 shadow-2xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterPeriodo('TODOS')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterPeriodo === 'TODOS'
                ? 'bg-[#1b346d] text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            TODOS ({empenhos.length})
          </button>
          <button
            onClick={() => setFilterPeriodo('NUNCA_UTILIZADO')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterPeriodo === 'NUNCA_UTILIZADO'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white border border-slate-300 text-amber-800 hover:bg-amber-50'
            }`}
          >
            NÃO UTILIZADO ({countNuncaUtilizado})
          </button>
          <button
            onClick={() => setFilterPeriodo('MAIS_60_DIAS')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterPeriodo === 'MAIS_60_DIAS'
                ? 'bg-[#1b346d] text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            &gt; 60 DIAS ({countMais60Dias})
          </button>
          <button
            onClick={() => setFilterPeriodo('EXERCICIO_ANTERIOR')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterPeriodo === 'EXERCICIO_ANTERIOR'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-white border border-slate-300 text-purple-800 hover:bg-purple-50'
            }`}
          >
            EXERCÍCIO ANTERIOR ({countExercicioAnterior})
          </button>

          {/* Select de Contrato discreto integrado */}
          {contractsWithEmpenhos.length > 0 && (
            <select
              value={selectedContratoFilter || 'ALL'}
              onChange={(e) => {
                if (onChangeContratoFilter) {
                  onChangeContratoFilter(e.target.value);
                }
              }}
              className="px-2.5 py-1.5 rounded-md text-xs font-bold uppercase bg-white border border-slate-300 text-slate-700 outline-none cursor-pointer max-w-[210px] truncate shadow-2xs"
              title="Filtrar por contrato específico"
            >
              <option value="ALL">TODOS OS CONTRATOS ({contractsWithEmpenhos.length})</option>
              {contractsWithEmpenhos.map((c) => (
                <option key={c.numero} value={c.numero}>
                  Nº {c.numero} {c.empresa ? `- ${c.empresa.substring(0, 18)}` : ''} ({c.count})
                </option>
              ))}
            </select>
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
            title="Exportar Relatório de Empenhos com Saldo em PDF"
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
        <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-[#1b346d] text-white font-bold uppercase text-[11px] tracking-wider border-b border-[#142854]">
              <th className="py-3.5 px-4 w-48 border-r border-[#2a4585]">
                Nº DO EMPENHO (NE)
              </th>
              <th className="py-3.5 px-4 border-r border-[#2a4585]">
                CONTRATO / EMPRESA
              </th>
              <th className="py-3.5 px-4 w-44 border-r border-[#2a4585]">
                PROCESSO VINCULADO
              </th>
              <th className="py-3.5 px-4 w-40 text-center border-r border-[#2a4585]">
                SITUAÇÃO DO SALDO
              </th>
              <th className="py-3.5 px-4 w-32 text-center border-r border-[#2a4585]">
                SEM USO
              </th>
              <th className="py-3.5 px-4 text-right w-44 border-r border-[#2a4585]">
                VALOR EMPENHADO
              </th>
              <th className="py-3.5 px-4 text-right w-44">
                SALDO DO EMPENHO
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                  Nenhum empenho encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtered.map((item, idx) => {
                const c = contractMap.get(item.contratoNumero.trim());
                const proc = c?.processoSigadoc && c.processoSigadoc !== 'NÃO INFORMADO' ? c.processoSigadoc : '-';
                const dias = getEffectiveDays(item);
                const nunca = isNuncaUtilizado(item);
                const exAnt = isExercicioAnt(item);

                return (
                  <tr
                    key={`${item.id}-${idx}`}
                    onClick={() => onSelectContractByNumero(item.contratoNumero)}
                    className="hover:bg-blue-50/70 transition-colors cursor-pointer group select-none"
                    title={`Clique para abrir os detalhes do Contrato Nº ${item.contratoNumero}`}
                  >
                    {/* 1. Nº DO EMPENHO (NE) */}
                    <td className="py-3 px-4 align-middle font-mono font-bold text-slate-900 group-hover:text-blue-700 text-xs whitespace-nowrap border-r border-slate-200">
                      {item.codigo}
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

                    {/* 3. PROCESSO VINCULADO */}
                    <td className="py-3 px-4 align-middle font-mono text-xs text-slate-700 whitespace-nowrap border-r border-slate-200">
                      {proc}
                    </td>

                    {/* 4. SITUAÇÃO DO SALDO */}
                    <td className="py-3 px-4 align-middle text-center border-r border-slate-200">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          nunca
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : exAnt
                            ? 'bg-purple-100 text-purple-900 border border-purple-300'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}
                      >
                        {nunca
                          ? 'NÃO UTILIZADO'
                          : exAnt
                          ? 'EXERCÍCIO ANTERIOR'
                          : item.situacao === 'SEM_MEDICAO'
                          ? 'SEM MEDIÇÃO'
                          : 'COM SALDO'}
                      </span>
                    </td>

                    {/* 5. SEM USO */}
                    <td className="py-3 px-4 align-middle text-center font-mono text-xs text-slate-700 whitespace-nowrap border-r border-slate-200">
                      {nunca ? 'NUNCA' : exAnt ? '> 365 DIAS' : `${dias} DIAS`}
                    </td>

                    {/* 6. VALOR EMPENHADO */}
                    <td className="py-3 px-4 align-middle text-right font-mono text-xs text-slate-800 font-semibold border-r border-slate-200">
                      {formatCurrency(item.empenhado)}
                    </td>

                    {/* 7. SALDO DO EMPENHO */}
                    <td className="py-3 px-4 align-middle text-right font-mono text-xs font-black text-emerald-600">
                      {formatCurrency(item.saldo)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300 font-black uppercase text-xs">
              <td colSpan={5} className="py-3.5 px-4 text-right text-slate-900 border-r border-slate-300">
                TOTAIS ({filtered.length} EMPENHOS COM SALDO):
              </td>
              <td className="py-3.5 px-4 text-right text-slate-900 font-mono border-r border-slate-300">
                {formatCurrency(totalEmpenhado)}
              </td>
              <td className="py-3.5 px-4 text-right text-emerald-600 font-mono font-black">
                {formatCurrency(totalSaldo)}
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
                  RELATÓRIO GERENCIAL DE EMPENHOS COM SALDO ({filtered.length} EMPENHOS)
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
                TOTAL EMPENHADO: {formatCurrency(totalEmpenhado)}
              </span>
              <span className="block font-black text-emerald-700 font-mono text-sm mt-0.5">
                SALDO TOTAL: {formatCurrency(totalSaldo)}
              </span>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left text-[10px] border border-slate-300 border-collapse table-fixed">
            <thead>
              <tr className="bg-[#1b346d] text-white font-bold uppercase text-[9.5px]">
                <th style={{ width: '150px' }} className="py-2 px-2.5">CÓDIGO EMPENHO</th>
                <th style={{ width: '130px' }} className="py-2 px-2.5">SITUAÇÃO</th>
                <th style={{ width: '110px' }} className="py-2 px-2 text-center">SEM USO</th>
                <th style={{ width: '120px' }} className="py-2 px-2.5 text-right">VALOR EMPENHADO</th>
                <th style={{ width: '130px' }} className="py-2 px-2.5 text-right">SALDO DO EMPENHO</th>
                <th style={{ width: '110px' }} className="py-2 px-2 text-center">CONTRATO</th>
                <th className="py-2 px-2.5">EMPRESA CONTRATADA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((item, idx) => {
                const dias = getEffectiveDays(item);
                return (
                  <tr
                    key={item.id || idx}
                    data-pdf-row={`emp-${idx}`}
                    style={{
                      backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff',
                      breakInside: 'avoid',
                      pageBreakInside: 'avoid',
                    }}
                  >
                    <td className="py-2 px-2.5 font-mono font-bold text-slate-900 text-[9.5px]">
                      {item.codigo}
                    </td>
                    <td className="py-2 px-2.5 uppercase font-semibold text-slate-700 text-[9px]">
                      {item.situacao === 'EXERCICIO_ANTERIOR'
                        ? 'EXERCÍCIO ANTERIOR'
                        : item.situacao === 'NAO_UTILIZADO'
                        ? 'NÃO UTILIZADO'
                        : 'SEM MEDIÇÃO'}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-medium text-slate-700">
                      {dias} dias
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(item.empenhado)}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono font-black text-emerald-700">
                      {formatCurrency(item.saldo)}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-blue-900">
                      Nº {item.contratoNumero}
                    </td>
                    <td className="py-2 px-2.5 uppercase text-slate-700 truncate">
                      {item.empresa}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-black uppercase text-[10px]">
                <td colSpan={3} className="py-2.5 px-2.5 text-right text-slate-900">
                  TOTAIS ({filtered.length} EMPENHOS):
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono text-slate-900">
                  {formatCurrency(totalEmpenhado)}
                </td>
                <td className="py-2.5 px-2.5 text-right font-mono text-emerald-800 font-bold">
                  {formatCurrency(totalSaldo)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>

          {/* Footer note */}
          <div className="mt-4 pt-3 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-500 uppercase font-semibold">
            <span>SISTEMA DE GESTÃO DE CONTRATOS — SEJUS/MT</span>
            <span>SALDO TOTAL: {formatCurrency(totalSaldo)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
