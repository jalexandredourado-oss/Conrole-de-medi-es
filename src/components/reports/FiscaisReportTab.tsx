import React, { useState, useMemo, useRef } from 'react';
import {
  Printer,
  Search,
  Copy,
  Loader2,
} from 'lucide-react';
import { FiscalGroup } from '../../types/reports';
import { formatCurrency } from '../../utils/formatters';
import { downloadPainelPdf } from '../../utils/downloadPdf';

interface FiscaisReportTabProps {
  fiscais: FiscalGroup[];
  onSelectContractByNumero: (numero: string) => void;
  onPrintReport?: () => void;
}

export const FiscaisReportTab: React.FC<FiscaisReportTabProps> = ({
  fiscais,
  onSelectContractByNumero,
  onPrintReport,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'OBRAS' | 'MANUTENCAO'>('ALL');
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  // Filter & sort
  const filteredFiscais = useMemo(() => {
    return fiscais
      .filter((f) => {
        if (filterType === 'OBRAS' && f.obrasCount === 0) return false;
        if (filterType === 'MANUTENCAO' && f.manutencaoCount === 0) return false;

        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        const matchName = f.nome.toLowerCase().includes(term);
        const matchContract = f.contratos.some(
          (c) =>
            c.numero.toLowerCase().includes(term) ||
            c.descricao.toLowerCase().includes(term) ||
            c.empresa.toLowerCase().includes(term)
        );
        return matchName || matchContract;
      })
      .sort((a, b) => b.totalContratos - a.totalContratos);
  }, [fiscais, filterType, searchTerm]);

  const totalContratosFiltered = useMemo(
    () => filteredFiscais.reduce((sum, f) => sum + f.totalContratos, 0),
    [filteredFiscais]
  );

  const getFiscalSaldoTotal = (f: FiscalGroup): number => {
    return f.contratos.reduce((acc, c) => acc + (c.saldoContrato || 0), 0);
  };

  const totalValorFiltered = useMemo(
    () => filteredFiscais.reduce((sum, f) => sum + f.valorTotal, 0),
    [filteredFiscais]
  );

  const totalSaldoFiltered = useMemo(
    () => filteredFiscais.reduce((sum, f) => sum + getFiscalSaldoTotal(f), 0),
    [filteredFiscais]
  );

  const handleCopyTable = () => {
    const lines: string[] = [];
    lines.push('FISCAL\tCONTRATOS\tQTD\tVALOR TOTAL\tSALDO TOTAL');
    for (const f of filteredFiscais) {
      const contractNums = f.contratos.map((c) => `Nº ${c.numero}`).join(', ');
      const saldo = getFiscalSaldoTotal(f);
      lines.push(
        `${f.nome}\t${contractNums}\t${f.totalContratos}\t${formatCurrency(
          f.valorTotal
        )}\t${formatCurrency(saldo)}`
      );
    }
    navigator.clipboard.writeText(lines.join('\n'));
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
      const filename = `Relatorio_Fiscais_Contratos_SEJUS_MT_${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      await downloadPainelPdf(pdfTemplateRef.current, filename);
    } catch (err) {
      console.error('Erro ao gerar PDF de Fiscais:', err);
      if (onPrintReport) onPrintReport();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Actions Row (matching Contrato com Saldo pattern) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="FILTRAR POR FISCAL, CONTRATO, EMPRESA..."
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
            TODOS OS FISCAIS ({fiscais.length})
          </button>
          <button
            onClick={() => setFilterType('OBRAS')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterType === 'OBRAS'
                ? 'bg-[#1b346d] text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            COM OBRAS ({fiscais.filter((f) => f.obrasCount > 0).length})
          </button>
          <button
            onClick={() => setFilterType('MANUTENCAO')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase transition-all cursor-pointer shadow-2xs ${
              filterType === 'MANUTENCAO'
                ? 'bg-[#1b346d] text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            COM MANUTENÇÃO ({fiscais.filter((f) => f.manutencaoCount > 0).length})
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
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-md text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-2xs active:scale-95"
            title="Exportar Relatório de Fiscais em PDF"
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

      {/* Main Table for Fiscais (matching Contrato com Saldo pattern) */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#1b346d] text-white font-bold uppercase text-[11px] tracking-wider border-b border-[#142854]">
              <th className="py-3.5 px-4 w-72 border-r border-[#2a4585]">FISCAL RESPONSÁVEL</th>
              <th className="py-3.5 px-4 border-r border-[#2a4585]">CONTRATOS FISCALIZADOS</th>
              <th className="py-3.5 px-4 text-center w-40 border-r border-[#2a4585]">QTD CONTRATOS</th>
              <th className="py-3.5 px-4 text-right w-48 border-r border-[#2a4585]">VALOR CONTRATADO</th>
              <th className="py-3.5 px-4 text-right w-48">SALDO DOS CONTRATOS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredFiscais.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400 italic">
                  Nenhum fiscal encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredFiscais.map((fiscal) => {
                const saldo = getFiscalSaldoTotal(fiscal);

                return (
                  <tr
                    key={fiscal.id}
                    className="hover:bg-blue-50/70 transition-colors group select-none"
                  >
                    {/* 1. FISCAL RESPONSÁVEL */}
                    <td className="py-3 px-4 align-middle border-r border-slate-200">
                      <div>
                        <span className="font-bold text-slate-900 group-hover:text-blue-700 block text-xs uppercase leading-tight">
                          {fiscal.nome}
                        </span>
                        <span className="text-[10px] text-slate-500 font-semibold block mt-0.5 uppercase">
                          Fiscal de Contrato • SEJUS/MT
                        </span>
                      </div>
                    </td>

                    {/* 2. CONTRATOS FISCALIZADOS (Tags Clicáveis) */}
                    <td className="py-3 px-4 align-middle border-r border-slate-200">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {fiscal.contratos.map((c, ci) => (
                          <button
                            key={ci}
                            type="button"
                            onClick={() => onSelectContractByNumero(c.numero)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold font-mono bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 hover:border-blue-300 transition-colors cursor-pointer shadow-2xs active:scale-95"
                            title={`Acessar Contrato Nº ${c.numero} (${c.empresa})`}
                          >
                            <span>Nº {c.numero}</span>
                            <span className="text-[9.5px] font-semibold text-blue-600 uppercase font-sans">
                              {c.tipo === 'OBRAS' ? 'OBRA' : 'MANUT.'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </td>

                    {/* 3. QTD CONTRATOS */}
                    <td className="py-3 px-4 align-middle text-center border-r border-slate-200 whitespace-nowrap">
                      <span className="font-bold text-slate-900 block text-xs">
                        {fiscal.totalContratos}{' '}
                        {fiscal.totalContratos === 1 ? 'CONTRATO' : 'CONTRATOS'}
                      </span>
                      <span className="text-[10px] text-slate-500 block mt-0.5 uppercase font-medium">
                        {fiscal.obrasCount > 0
                          ? `${fiscal.obrasCount} Obra${
                              fiscal.obrasCount > 1 ? 's' : ''
                            }`
                          : ''}
                        {fiscal.obrasCount > 0 && fiscal.manutencaoCount > 0
                          ? ' • '
                          : ''}
                        {fiscal.manutencaoCount > 0
                          ? `${fiscal.manutencaoCount} Manut.`
                          : ''}
                      </span>
                    </td>

                    {/* 4. VALOR CONTRATADO */}
                    <td className="py-3 px-4 align-middle text-right font-semibold text-slate-900 font-mono text-xs sm:text-[13px] whitespace-nowrap border-r border-slate-200">
                      {formatCurrency(fiscal.valorTotal)}
                    </td>

                    {/* 5. SALDO DOS CONTRATOS */}
                    <td className="py-3 px-4 align-middle text-right font-bold text-emerald-600 font-mono text-xs sm:text-[13px] whitespace-nowrap">
                      {formatCurrency(saldo)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 border-t-2 border-slate-300 font-black uppercase text-xs">
              <td
                colSpan={3}
                className="py-3.5 px-4 text-right text-slate-800 font-bold border-r border-slate-300"
              >
                TOTAIS ({filteredFiscais.length} FISCAIS |{' '}
                {totalContratosFiltered} CONTRATOS):
              </td>
              <td className="py-3.5 px-4 text-right text-slate-900 font-mono font-bold text-xs sm:text-[13px] border-r border-slate-300">
                {formatCurrency(totalValorFiltered)}
              </td>
              <td className="py-3.5 px-4 text-right text-emerald-700 font-mono font-black text-xs sm:text-[13px]">
                {formatCurrency(totalSaldoFiltered)}
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
          <div className="border-b-2 border-[#1b346d] pb-3 mb-4">
            <h1 className="text-lg font-black text-[#1b346d] uppercase tracking-wide">
              RELATÓRIO GERENCIAL DE FISCAIS E CONTRATOS
            </h1>
            <p className="text-xs text-slate-600 uppercase font-semibold">
              SEJUS - SECRETARIA DE ESTADO DE JUSTIÇA DE MATO GROSSO • GERÊNCIA DE OBRAS E ENGENHARIA
            </p>
          </div>

          <table className="w-full text-left text-xs border border-slate-300 border-collapse">
            <thead>
              <tr className="bg-[#1b346d] text-white font-bold uppercase text-[10.5px]">
                <th className="py-2.5 px-3 border border-slate-400 border-r border-slate-300/40 w-56">
                  FISCAL RESPONSÁVEL
                </th>
                <th className="py-2.5 px-3 border border-slate-400 border-r border-slate-300/40">
                  CONTRATOS FISCALIZADOS
                </th>
                <th className="py-2.5 px-3 border border-slate-400 border-r border-slate-300/40 text-center w-36">
                  QTD CONTRATOS
                </th>
                <th className="py-2.5 px-3 border border-slate-400 border-r border-slate-300/40 text-right w-44">
                  VALOR CONTRATADO
                </th>
                <th className="py-2.5 px-3 border border-slate-400 text-right w-44">
                  SALDO DOS CONTRATOS
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredFiscais.map((f, idx) => {
                const saldo = getFiscalSaldoTotal(f);
                const contractStr = f.contratos
                  .map((c) => `Nº ${c.numero} (${c.empresa})`)
                  .join('; ');

                return (
                  <tr
                    key={f.id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}
                  >
                    <td className="py-2 px-3 border border-slate-300 border-r border-slate-200 font-bold text-slate-900 uppercase">
                      {f.nome}
                    </td>
                    <td className="py-2 px-3 border border-slate-300 border-r border-slate-200 text-slate-700 text-[10px]">
                      {contractStr}
                    </td>
                    <td className="py-2 px-3 border border-slate-300 border-r border-slate-200 text-center font-bold text-slate-800">
                      {f.totalContratos}
                    </td>
                    <td className="py-2 px-3 border border-slate-300 border-r border-slate-200 text-right font-mono font-semibold text-slate-900">
                      {formatCurrency(f.valorTotal)}
                    </td>
                    <td className="py-2 px-3 border border-slate-300 text-right font-mono font-bold text-emerald-700">
                      {formatCurrency(saldo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 font-black text-xs uppercase">
                <td
                  colSpan={3}
                  className="py-2.5 px-3 border border-slate-400 border-r border-slate-300 text-right text-slate-900"
                >
                  TOTAIS ({filteredFiscais.length} FISCAIS |{' '}
                  {totalContratosFiltered} CONTRATOS):
                </td>
                <td className="py-2.5 px-3 border border-slate-400 border-r border-slate-300 text-right font-mono text-slate-900">
                  {formatCurrency(totalValorFiltered)}
                </td>
                <td className="py-2.5 px-3 border border-slate-400 text-right font-mono text-emerald-800 font-black">
                  {formatCurrency(totalSaldoFiltered)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
