import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Copy,
  Printer,
  Loader2,
} from 'lucide-react';
import { Contrato } from '../../types/contract';
import { formatCurrency, matchesContractSearch } from '../../utils/formatters';
import { downloadPainelPdf } from '../../utils/downloadPdf';

interface ContratosComSaldoReportTabProps {
  contratos: Contrato[];
  onSelectContractByNumero: (numero: string) => void;
  onPrintReport?: () => void;
}

export const ContratosComSaldoReportTab: React.FC<ContratosComSaldoReportTabProps> = ({
  contratos,
  onSelectContractByNumero,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOption, setFilterOption] = useState<'ALL' | 'EXPIRING'>('ALL');
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  // Contracts that have a remaining balance > 0
  const contratosComSaldo = useMemo(() => {
    return contratos.filter((c) => (c.saldoContrato ?? 0) > 0);
  }, [contratos]);

  const expiringCount = useMemo(() => {
    return contratosComSaldo.filter((c) => c.diasVencer <= 60).length;
  }, [contratosComSaldo]);

  const filtered = useMemo(() => {
    return contratosComSaldo.filter((c) => {
      if (filterOption === 'EXPIRING' && c.diasVencer > 60) return false;

      if (!searchTerm.trim()) return true;
      if (matchesContractSearch(c, searchTerm)) return true;

      const term = searchTerm.toLowerCase();
      return (
        c.numero.toLowerCase().includes(term) ||
        c.razaoSocial.toLowerCase().includes(term) ||
        (c.cnpj && c.cnpj.includes(term)) ||
        (c.processoSigadoc && c.processoSigadoc.toLowerCase().includes(term))
      );
    });
  }, [contratosComSaldo, filterOption, searchTerm]);

  const totalValorContratado = filtered.reduce((acc, c) => acc + c.valorContratado, 0);
  const totalSaldoDisponivel = filtered.reduce((acc, c) => acc + c.saldoContrato, 0);
  const totalValorEmpenhado = filtered.reduce((acc, c) => acc + (c.valorEmpenhado || 0), 0);

  const handleCopyTable = () => {
    const lines: string[] = [];
    lines.push('Nº CONTRATO\tRAZÃO SOCIAL\tVALOR DO CONTRATO\tSALDO DO CONTRATO\tVALOR EMPENHADO');
    for (const c of filtered) {
      lines.push(
        `Nº ${c.numero}\t${c.razaoSocial}\t${formatCurrency(c.valorContratado)}\t${formatCurrency(
          c.saldoContrato
        )}\t${formatCurrency(c.valorEmpenhado || 0)}`
      );
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to format contract number for filename and title (e.g. "011/2025" -> "11.2025")
  const formatContractNumber = (num: string) => {
    return num.replace(/^0+/, '').replace('/', '.');
  };

  // Helper to get first word or company sigla (e.g. "SW ENGENHARIA LTDA" -> "SW")
  const getCompanyFirstWord = (c: Contrato) => {
    if (c.siglaEmpresa && c.siglaEmpresa.trim()) return c.siglaEmpresa.trim().toUpperCase();
    const words = c.razaoSocial.trim().split(/\s+/);
    return words[0].toUpperCase();
  };

  // Determine custom title and filename when filtered
  const singleFilteredContract = useMemo(() => {
    if (filtered.length === 1) return filtered[0];
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const directMatch = filtered.find(
        (c) =>
          c.numero.toLowerCase() === term ||
          c.numero.toLowerCase().replace('/', '.') === term ||
          c.numero.replace(/^0+/, '').toLowerCase() === term.replace(/^0+/, '')
      );
      if (directMatch) return directMatch;
    }
    return null;
  }, [filtered, searchTerm]);

  const pdfTitleInfo = useMemo(() => {
    if (singleFilteredContract) {
      const numFmt = formatContractNumber(singleFilteredContract.numero);
      const primeiroNome = getCompanyFirstWord(singleFilteredContract);
      return {
        filename: `Contrato ${numFmt} - ${primeiroNome} - Saldo.pdf`,
        documentTitle: `CONTRATO ${numFmt} - ${primeiroNome} - SALDO DO CONTRATO`,
      };
    }
    return {
      filename: `Relatorio_Contrato_Com_Saldo_SEJUS_MT_${new Date().toISOString().slice(0, 10)}.pdf`,
      documentTitle: `RELATÓRIO GERENCIAL DE CONTRATOS COM SALDO A EXECUTAR (${filtered.length} CONTRATOS)`,
    };
  }, [singleFilteredContract, filtered.length]);

  const handleGeneratePdf = async () => {
    if (!pdfTemplateRef.current || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await downloadPainelPdf(pdfTemplateRef.current, pdfTitleInfo.filename);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="FILTRAR POR CONTRATO, PROCESSO, EMPRESA, FISCAL..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 outline-none uppercase font-semibold text-slate-800 shadow-2xs"
          />
        </div>

        {/* Categories / Type filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterOption('ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterOption === 'ALL'
                ? 'bg-[#1b346d] text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            TODOS ({contratosComSaldo.length})
          </button>
          <button
            onClick={() => setFilterOption('EXPIRING')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterOption === 'EXPIRING'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white border border-slate-300 text-amber-800 hover:bg-amber-50'
            }`}
          >
            Fim da Vig. (60 dias) ({expiringCount})
          </button>
        </div>

        {/* Actions: Copiar & Gerar PDF */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 shrink-0">
          <button
            onClick={handleCopyTable}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md text-xs font-bold uppercase transition-colors cursor-pointer shadow-2xs"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'COPIADO!' : 'COPIAR'}</span>
          </button>

          <button
            onClick={handleGeneratePdf}
            disabled={isGeneratingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-md text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-2xs active:scale-95"
            title="Exportar Relatório de Contrato com Saldo em PDF"
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

      {/* Main Table for Contratos com Saldo: 5 requested columns separated by vertical lines */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#1b346d] text-white font-bold uppercase text-[11px] tracking-wider border-b border-[#142854]">
              <th className="py-3.5 px-4 w-52 border-r border-[#2a4585]">Nº DO CONTRATO</th>
              <th className="py-3.5 px-4 border-r border-[#2a4585]">RAZÃO SOCIAL</th>
              <th className="py-3.5 px-4 text-right w-48 border-r border-[#2a4585]">VALOR DO CONTRATO</th>
              <th className="py-3.5 px-4 text-right w-48 border-r border-[#2a4585]">SALDO DO CONTRATO</th>
              <th className="py-3.5 px-4 text-right w-48">VALOR EMPENHADO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                  Nenhum contrato com saldo encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onSelectContractByNumero(c.numero)}
                  className="hover:bg-blue-50/70 transition-colors cursor-pointer group select-none"
                  title={`Clique para abrir os detalhes do Contrato Nº ${c.numero}`}
                >
                  {/* 1. Nº DO CONTRATO */}
                  <td className="py-3 px-4 align-middle whitespace-nowrap border-r border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 group-hover:text-blue-700 block text-xs">
                        Nº {c.numero}
                      </span>
                      {c.processoSigadoc && c.processoSigadoc !== 'NÃO INFORMADO' && (
                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                          {c.processoSigadoc}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 2. RAZÃO SOCIAL */}
                  <td className="py-3 px-4 align-middle border-r border-slate-200">
                    <span className="font-bold text-slate-900 block leading-tight text-xs uppercase">
                      {c.razaoSocial}
                    </span>
                    {c.cnpj && (
                      <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                        {c.cnpj}
                      </span>
                    )}
                  </td>

                  {/* 3. VALOR DO CONTRATO */}
                  <td className="py-3 px-4 align-middle text-right font-semibold text-slate-900 font-mono text-xs sm:text-[13px] whitespace-nowrap border-r border-slate-200">
                    {formatCurrency(c.valorContratado)}
                  </td>

                  {/* 4. SALDO DO CONTRATO */}
                  <td className="py-3 px-4 align-middle text-right font-bold text-emerald-600 font-mono text-xs sm:text-[13px] whitespace-nowrap border-r border-slate-200">
                    {formatCurrency(c.saldoContrato)}
                  </td>

                  {/* 5. VALOR EMPENHADO */}
                  <td className="py-3 px-4 align-middle text-right font-semibold text-slate-800 font-mono text-xs sm:text-[13px] whitespace-nowrap">
                    {formatCurrency(c.valorEmpenhado || 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300 font-black uppercase text-xs">
              <td colSpan={2} className="py-3.5 px-4 text-right text-slate-800 font-bold border-r border-slate-300">
                TOTAIS ({filtered.length} CONTRATOS COM SALDO):
              </td>
              <td className="py-3.5 px-4 text-right text-slate-900 font-mono font-bold text-xs sm:text-[13px] border-r border-slate-300">
                {formatCurrency(totalValorContratado)}
              </td>
              <td className="py-3.5 px-4 text-right text-emerald-700 font-mono font-black text-xs sm:text-[13px] border-r border-slate-300">
                {formatCurrency(totalSaldoDisponivel)}
              </td>
              <td className="py-3.5 px-4 text-right text-slate-900 font-mono font-bold text-xs sm:text-[13px]">
                {formatCurrency(totalValorEmpenhado)}
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
                  ESTADO DE MATO GROSSO - SECRETARIA DE ESTADO DE JUSTIÇA (SEJUS/MT)
                </h1>
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mt-0.5">
                  {pdfTitleInfo.documentTitle}
                </h2>
                <p className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">
                  COORDENADORIA DE INFRAESTRUTURA E SERVIÇOS DE ENGENHARIA (SOE/CISE) • EMISSÃO:{' '}
                  {new Date().toLocaleDateString('pt-BR')} ÀS{' '}
                  {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>

          {/* Table with discrete vertical column dividers */}
          <table className="w-full text-left text-xs border border-slate-300 border-collapse">
            <thead>
              <tr className="bg-[#1b346d] text-white font-bold uppercase text-[10.5px]">
                <th className="py-2.5 px-3 border border-slate-400 border-r border-slate-300/40 w-44">
                  Nº DO CONTRATO
                </th>
                <th className="py-2.5 px-3 border border-slate-400 border-r border-slate-300/40">
                  RAZÃO SOCIAL
                </th>
                <th className="py-2.5 px-3 border border-slate-400 border-r border-slate-300/40 text-right w-44">
                  VALOR DO CONTRATO
                </th>
                <th className="py-2.5 px-3 border border-slate-400 border-r border-slate-300/40 text-right w-44">
                  SALDO DO CONTRATO
                </th>
                <th className="py-2.5 px-3 border border-slate-400 text-right w-44">
                  VALOR EMPENHADO
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => (
                <tr key={c.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                  <td className="py-2 px-3 border border-slate-300 border-r border-slate-200 font-bold text-slate-900">
                    Nº {c.numero}
                    {c.processoSigadoc && (
                      <span className="block text-[9.5px] font-mono text-slate-500 font-normal">
                        {c.processoSigadoc}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 border border-slate-300 border-r border-slate-200 text-slate-800 font-semibold uppercase text-[11px]">
                    {c.razaoSocial}
                    {c.cnpj && (
                      <span className="block text-[9.5px] font-mono text-slate-500 font-normal">
                        {c.cnpj}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 border border-slate-300 border-r border-slate-200 text-right font-mono font-semibold text-slate-900">
                    {formatCurrency(c.valorContratado)}
                  </td>
                  <td className="py-2 px-3 border border-slate-300 border-r border-slate-200 text-right font-mono font-bold text-emerald-700">
                    {formatCurrency(c.saldoContrato)}
                  </td>
                  <td className="py-2 px-3 border border-slate-300 text-right font-mono font-semibold text-slate-800">
                    {formatCurrency(c.valorEmpenhado || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 font-black text-xs uppercase">
                <td colSpan={2} className="py-2.5 px-3 border border-slate-400 border-r border-slate-300 text-right text-slate-900">
                  TOTAIS ({filtered.length} CONTRATOS):
                </td>
                <td className="py-2.5 px-3 border border-slate-400 border-r border-slate-300 text-right font-mono text-slate-900">
                  {formatCurrency(totalValorContratado)}
                </td>
                <td className="py-2.5 px-3 border border-slate-400 border-r border-slate-300 text-right font-mono text-emerald-800 font-black">
                  {formatCurrency(totalSaldoDisponivel)}
                </td>
                <td className="py-2.5 px-3 border border-slate-400 text-right font-mono text-slate-900">
                  {formatCurrency(totalValorEmpenhado)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Footer note */}
          <div className="mt-4 pt-3 border-t border-slate-300 flex items-center justify-start text-[10px] text-slate-500 uppercase font-semibold">
            <span>SISTEMA DE GESTÃO DE CONTRATOS - SEJUS/MT</span>
          </div>
        </div>
      </div>
    </div>
  );
};
