import React from 'react';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { Contrato } from '../../types/contract';
import {
  formatCurrency,
  formatPercent,
  formatDataHojePorExtenso,
  formatDataHojeBR,
} from '../../utils/formatters';
import { FilterInfo } from '../modals/PrintPainelPdfModal';
import { getSignerConfig } from '../../utils/signerConfig';

interface PainelPdfTemplateProps {
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

export const PainelPdfTemplate = React.forwardRef<HTMLDivElement, PainelPdfTemplateProps>(
  ({ contratos, allContratos = [], filterInfo }, ref) => {
    const isFiltered =
      (filterInfo &&
        (filterInfo.searchTerm.trim() !== '' ||
          filterInfo.filterTipo !== 'ALL' ||
          filterInfo.isExpiringFilterActive)) ||
      (allContratos.length > 0 && contratos.length !== allContratos.length);

    // Helper to calculate exact medicao and physical execution
    const getContratoMedicaoInfo = (c: Contrato) => {
      const hasMedicoes = c.medicoes && c.medicoes.length > 0;
      if (!hasMedicoes) {
        const medido = c.valorMedido || 0;
        const execucaoFisica =
          typeof c.execucaoFisica === 'number' && c.execucaoFisica > 0
            ? c.execucaoFisica
            : c.valorContratado > 0 && medido > 0
            ? (medido / c.valorContratado) * 100
            : 0;
        return {
          medido,
          execucaoFisica,
        };
      }
      const medido = c.medicoes.reduce((acc, m) => {
        const isCont = Boolean(
          m.isContinuation ||
          m.parentMedicaoId ||
          (m.numeroMed && (m.numeroMed.toUpperCase().includes('(CONT') || m.numeroMed.toUpperCase().includes('CONT.'))) ||
          (m.descricao && (m.descricao.toUpperCase().includes('(CONT') || m.descricao.toUpperCase().includes('CONT.')))
        );
        if (isCont) return acc;
        return acc + (Number(m.valorMedicao) || 0);
      }, 0);
      const execucaoFisica =
        c.valorContratado > 0
          ? (medido / c.valorContratado) * 100
          : typeof c.execucaoFisica === 'number'
          ? c.execucaoFisica
          : 0;
      return { medido, execucaoFisica };
    };

    // Totals for table footer
    const totalContratadoTabela = contratos.reduce((acc, c) => acc + c.valorContratado, 0);
    const totalSaldoTabela = contratos.reduce((acc, c) => acc + c.saldoContrato, 0);
    const avgExecucao =
      contratos.length > 0
        ? contratos.reduce((acc, c) => acc + getContratoMedicaoInfo(c).execucaoFisica, 0) / contratos.length
        : 0;

    return (
      <div
        ref={ref}
        style={{
          width: '1140px',
          minWidth: '1140px',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxSizing: 'border-box',
          padding: '16px 20px',
        }}
        className="space-y-3"
      >
        {/* 1. Header Banner (Print 1 style) with dynamic today date */}
        <div
          data-pdf-block="header"
          style={{ backgroundColor: '#172b53', color: '#ffffff' }}
          className="px-5 py-3 rounded flex items-center justify-between"
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

        {/* 2. Filter Notification Banner (if filtered) */}
        {isFiltered && (
          <div
            data-pdf-block="filter"
            style={{ backgroundColor: '#fffbeb', borderColor: '#fcd34d' }}
            className="flex items-center justify-between border px-4 py-2 rounded text-xs text-amber-900"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-bold uppercase tracking-wider">RELATÓRIO FILTRADO:</span>
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

        {/* 3. Table of Contracts with exact columns matching Image 1 */}
        <div
          data-pdf-block="table-container"
          style={{ borderColor: '#cbd5e1', width: '100%', boxSizing: 'border-box' }}
          className="bg-white rounded border overflow-visible"
        >
          <table
            style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', boxSizing: 'border-box' }}
            className="text-left text-[10px]"
          >
            <thead>
              <tr
                style={{ backgroundColor: '#1b356c', color: '#ffffff' }}
                className="font-bold tracking-wider uppercase text-[10px]"
              >
                <th style={{ width: '105px' }} className="py-2.5 px-2.5 shrink-0">Nº DO CONTRATO</th>
                <th style={{ width: '105px' }} className="py-2.5 px-2.5 shrink-0">TIPO DE CONTRATO</th>
                <th style={{ width: '230px' }} className="py-2.5 px-2.5">DESCRIÇÃO</th>
                <th style={{ width: '180px' }} className="py-2.5 px-2.5 shrink-0">RAZÃO SOCIAL / CNPJ</th>
                <th style={{ width: '155px' }} className="py-2.5 px-2.5 shrink-0">FISCAL / SUBSTITUTO</th>
                <th style={{ width: '125px' }} className="py-2.5 px-2.5 text-right shrink-0">VALOR / SALDO</th>
                <th style={{ width: '85px' }} className="py-2.5 px-2 text-center shrink-0">DIAS P/ VENCER</th>
                <th style={{ width: '115px' }} className="py-2.5 px-2 text-center shrink-0">EXECUÇÃO FÍSICA</th>
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
                  const { execucaoFisica: execFis } = getContratoMedicaoInfo(c);

                  return (
                    <tr
                      key={c.id || index}
                      data-pdf-row={c.numero}
                      style={{
                        backgroundColor: index % 2 === 1 ? '#f8fafc' : '#ffffff',
                        breakInside: 'avoid',
                        pageBreakInside: 'avoid',
                      }}
                    >
                      {/* Nº DO CONTRATO */}
                      <td className="py-2 px-2.5 align-top">
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
                      <td className="py-2 px-2.5 align-top font-bold text-slate-700 uppercase leading-tight">
                        {c.tipo}
                      </td>

                      {/* DESCRIÇÃO */}
                      <td className="py-2 px-2.5 align-top uppercase leading-snug text-slate-800 break-words">
                        {c.descricao}
                      </td>

                      {/* RAZÃO SOCIAL / CNPJ */}
                      <td className="py-2 px-2.5 align-top">
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
                      <td className="py-2 px-2.5 align-top">
                        <span className="font-bold text-slate-900 block leading-tight uppercase">
                          {c.fiscal}
                        </span>
                        <span className="text-[9px] text-slate-500 block uppercase mt-0.5 leading-tight">
                          SUB: {c.substituto || '-'}
                        </span>
                      </td>

                      {/* VALOR / SALDO (Unified Column matching Image 1) */}
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
                          style={{
                            backgroundColor: c.diasVencer <= 60 ? '#fef3c7' : 'transparent',
                            color: c.diasVencer <= 60 ? '#78350f' : '#334155',
                            borderColor: c.diasVencer <= 60 ? '#fcd34d' : 'transparent',
                          }}
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border"
                        >
                          {c.diasVencer} DIAS
                        </span>
                      </td>

                      {/* EXECUÇÃO FÍSICA */}
                      <td
                        className="py-2.5 px-2 align-middle text-center whitespace-nowrap"
                        style={{ width: '115px', minWidth: '115px', boxSizing: 'border-box' }}
                      >
                        <span className="font-bold text-slate-900 block text-[10.5px] leading-tight font-mono">
                          {formatPercent(execFis)}
                        </span>
                        <div
                          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                          className="w-16 mx-auto bg-slate-200 rounded-full h-1.5 mt-1 overflow-hidden"
                        >
                          <div
                            style={{
                              width: `${Math.min(Math.max(execFis, 0), 100)}%`,
                              backgroundColor: execFis >= 100 ? '#16a34a' : execFis > 0 ? '#2563eb' : 'transparent',
                              WebkitPrintColorAdjust: 'exact',
                              printColorAdjust: 'exact',
                            }}
                            className="h-full rounded-full"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Footer Row */}
            <tfoot>
              <tr
                data-pdf-block="table-footer"
                style={{
                  backgroundColor: '#e2e8f0',
                  color: '#0f172a',
                  breakInside: 'avoid',
                  pageBreakInside: 'avoid',
                }}
                className="font-black border-t-2 border-slate-400"
              >
                <td colSpan={5} className="py-2.5 px-3 uppercase text-right font-black">
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
                <td className="py-2.5 px-2 text-center text-[10px] text-slate-600">-</td>
                <td className="py-2.5 px-2 text-center font-mono text-[10px] font-bold text-slate-900">
                  {formatPercent(avgExecucao)} MÉD.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 4. Institutional Signature Block with dynamic today date */}
        {(() => {
          const signer = getSignerConfig();
          return (
            <div
              data-pdf-block="signature"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              className="pt-6 pb-2 text-center space-y-1"
            >
              <div
                style={{ borderColor: '#1e293b' }}
                className="w-80 mx-auto border-t-2 pt-2 font-black text-xs uppercase text-slate-900 tracking-wider"
              >
                {signer.nome}
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-700">
                {signer.cargo}
              </div>
              <div className="text-[10px] uppercase font-bold text-slate-600 font-mono tracking-wider">
                {signer.setor}
              </div>
              <div className="text-[9px] uppercase text-slate-400 font-mono pt-1">
                Documento extraído eletronicamente pelo Sistema de Controle de Orçamento em {formatDataHojeBR()}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }
);

PainelPdfTemplate.displayName = 'PainelPdfTemplate';

