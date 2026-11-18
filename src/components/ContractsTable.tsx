import React, { useState } from 'react';
import { Search, AlertTriangle, Edit3, Trash2, X, ExternalLink } from 'lucide-react';
import { Contrato } from '../types/contract';
import { formatCurrency, formatPercent } from '../utils/formatters';

interface ContractsTableProps {
  contratos: Contrato[];
  filteredContratos: Contrato[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filterTipo: 'ALL' | 'OBRAS' | 'MANUTENÇÃO PREDIAL';
  onFilterTipoChange: (tipo: 'ALL' | 'OBRAS' | 'MANUTENÇÃO PREDIAL') => void;
  isExpiringFilterActive: boolean;
  onToggleExpiringFilter: () => void;
  onSelectContract: (contrato: Contrato) => void;
  onEditContract: (contrato: Contrato, e: React.MouseEvent) => void;
  onDeleteContract: (contrato: Contrato, e: React.MouseEvent) => void;
}

export const ContractsTable: React.FC<ContractsTableProps> = ({
  contratos,
  filteredContratos,
  searchTerm,
  onSearchChange,
  filterTipo,
  onFilterTipoChange,
  isExpiringFilterActive,
  onToggleExpiringFilter,
  onSelectContract,
  onEditContract,
  onDeleteContract,
}) => {
  const [hoveredExecFisicaId, setHoveredExecFisicaId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; showAbove: boolean } | null>(null);
  const expiringCount = contratos.filter((c) => c.diasVencer <= 60).length;

  // Helper to ensure accurate measurement values: if no measurements are registered, value and execution are 0
  const getContratoMedicaoInfo = (c: Contrato) => {
    const hasMedicoes = c.medicoes && c.medicoes.length > 0;
    if (!hasMedicoes) {
      return {
        medido: 0,
        execucaoFisica: 0,
      };
    }
    const medido = c.medicoes.reduce((acc, m) => acc + (Number(m.valorMedicao) || 0), 0);
    const execucaoFisica = c.valorContratado > 0 ? (medido / c.valorContratado) * 100 : 0;
    return { medido, execucaoFisica };
  };

  const handleMouseEnterExecFisica = (contratoId: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const showAbove = rect.bottom + 180 > window.innerHeight && rect.top > 200;
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: showAbove ? rect.top - 8 : rect.bottom + 8,
      showAbove,
    });
    setHoveredExecFisicaId(contratoId);
  };

  const handleMouseLeaveExecFisica = () => {
    setHoveredExecFisicaId(null);
    setTooltipPos(null);
  };

  return (
    <div className="space-y-3">
      {/* Search and Alert Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Left: Yellow Alert Banner */}
        <div className="flex items-center gap-2">
          <div
            onClick={onToggleExpiringFilter}
            className={`flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-all ${
              isExpiringFilterActive
                ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-xs'
                : 'bg-amber-50/80 border-amber-300 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {expiringCount} CONTRATO{expiringCount === 1 ? '' : 'S'} VENCE EM ATÉ 60 DIAS
            </span>
            <span className="ml-2 text-amber-700 underline font-bold tracking-wider hover:text-amber-900">
              {isExpiringFilterActive ? 'LIMPAR FILTRO' : 'FILTRAR'}
            </span>
          </div>

          {filterTipo !== 'ALL' && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded text-xs">
              <span>Tipo: {filterTipo}</span>
              <button
                onClick={() => onFilterTipoChange('ALL')}
                className="hover:text-blue-950 cursor-pointer ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Search Box */}
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="PESQUISAR CONTRATO, MUNICÍPIO, RAZÃO SOCIAL..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none text-slate-800 placeholder-slate-400 transition-all uppercase"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded border border-slate-200 shadow-2xs overflow-x-auto max-h-[560px] 2xl:max-h-[640px] overflow-y-auto custom-table-scrollbar">
        <table className="w-full border-collapse text-left text-xs min-w-[1300px]">
          <thead className="sticky top-0 z-10 shadow-xs">
            <tr className="bg-[#1b356c] text-white font-bold tracking-wider text-xs uppercase border-b border-[#142854]">
              <th className="py-3 px-3.5 w-60 min-w-[220px] bg-[#1b356c]">Nº DO CONTRATO / PROCESSO</th>
              <th className="py-3 px-3 w-36 bg-[#1b356c]">TIPO DE CONTRATO</th>
              <th className="py-3 px-4 max-w-xs bg-[#1b356c]">DESCRIÇÃO</th>
              <th className="py-3 px-3 w-56 bg-[#1b356c]">RAZÃO SOCIAL / CNPJ</th>
              <th className="py-3 px-3 w-52 bg-[#1b356c]">FISCAL / SUBSTITUTO</th>
              <th className="py-3 px-3 text-right w-40 bg-[#1b356c]" title="Valor Contratado / Saldo do Contrato">
                VALOR / SALDO
              </th>
              <th className="py-3 px-2 text-center w-24 bg-[#1b356c]">DIAS P/ VENCER</th>
              <th className="py-3 px-2 text-center w-24 bg-[#1b356c]">EXECUÇÃO FÍSICA</th>
              <th className="py-3 px-2 text-center w-20 bg-[#1b356c]">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredContratos.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                  Nenhum contrato encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredContratos.map((contrato, index) => (
                <tr
                  key={contrato.id}
                  onClick={() => onSelectContract(contrato)}
                  className="hover:bg-blue-50/70 transition-colors cursor-pointer group select-none"
                >
                  {/* 1. Nº DO CONTRATO E PROCESSO */}
                  <td className="py-3 px-3.5 align-top whitespace-nowrap min-w-[220px]">
                    <span className="font-bold text-slate-900 block text-sm whitespace-nowrap">
                      {contrato.numero}
                    </span>
                    {contrato.processoSigadoc && contrato.processoSigadoc !== 'NÃO INFORMADO' && (
                      <div className="flex flex-col mt-0.5 space-y-0.5">
                        {contrato.processoSigadoc
                          .split(/;|\n/)
                          .map((p) => p.trim())
                          .filter(Boolean)
                          .map((proc, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] text-slate-500 font-mono whitespace-nowrap block"
                            >
                              {proc}
                            </span>
                          ))}
                      </div>
                    )}
                  </td>

                  {/* 2. TIPO DE CONTRATO */}
                  <td className="py-3 px-3 align-top font-bold text-slate-800 uppercase text-xs">
                    {contrato.tipo}
                  </td>

                  {/* 3. DESCRIÇÃO */}
                  <td className="py-3 px-4 align-top text-slate-700 font-medium leading-relaxed">
                    <p className="line-clamp-2 uppercase text-xs">
                      {contrato.descricao}
                    </p>
                  </td>

                  {/* 4. RAZÃO SOCIAL / CNPJ */}
                  <td className="py-3 px-3 align-top">
                    <span className="font-bold text-slate-900 block leading-tight text-xs uppercase">
                      {contrato.razaoSocial}
                      {contrato.siglaEmpresa && (
                        <span className="text-slate-500 font-semibold ml-1">({contrato.siglaEmpresa})</span>
                      )}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                      {contrato.cnpj}
                    </span>
                  </td>

                  {/* 5. FISCAL / SUBSTITUTO */}
                  <td className="py-3 px-3 align-top">
                    <span className="font-bold text-slate-900 block text-xs uppercase leading-tight">
                      {contrato.fiscal}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5 uppercase">
                      SUB: {contrato.substituto || '-'}
                    </span>
                  </td>

                  {/* 6. VALOR / SALDO DO CONTRATO */}
                  <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                    <span className="font-semibold text-slate-900 font-mono text-xs sm:text-[13px] block leading-tight">
                      {formatCurrency(contrato.valorContratado)}
                    </span>
                    <span
                      className="text-[10px] text-emerald-600 font-mono block mt-0.5 font-normal"
                      title={`Saldo do Contrato: ${formatCurrency(contrato.saldoContrato)}`}
                    >
                      {formatCurrency(contrato.saldoContrato)}
                    </span>
                  </td>

                  {/* 7. DIAS P/ VENCER */}
                  <td
                    className="py-3 px-2 align-top text-center whitespace-nowrap"
                    title={
                      contrato.dataInicio && contrato.dataFim
                        ? `Vigência: ${contrato.dataInicio} a ${contrato.dataFim}`
                        : contrato.dataFim
                        ? `Vigência até ${contrato.dataFim}`
                        : `${contrato.diasVencer} dias para vencer`
                    }
                  >
                    {(() => {
                      let dias = contrato.diasVencer;
                      if (dias > 0 && contrato.dataFim) {
                        const parts = contrato.dataFim.split('/');
                        if (parts.length === 3) {
                          const d = parseInt(parts[0], 10);
                          const m = parseInt(parts[1], 10) - 1;
                          const y = parseInt(parts[2], 10);
                          if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                            const dtFim = new Date(y, m, d, 23, 59, 59);
                            if (dtFim.getTime() < Date.now()) {
                              dias = -Math.abs(dias);
                            }
                          }
                        }
                      }
                      return (
                        <span
                          title={
                            contrato.dataInicio && contrato.dataFim
                              ? `Vigência: ${contrato.dataInicio} a ${contrato.dataFim}`
                              : contrato.dataFim
                              ? `Vigência até ${contrato.dataFim}`
                              : dias < 0
                              ? `${Math.abs(dias)} dias vencidos`
                              : `${dias} dias para vencer`
                          }
                          className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold uppercase ${
                            dias <= 60
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'text-slate-700'
                          }`}
                        >
                          {dias} DIAS
                        </span>
                      );
                    })()}
                  </td>

                  {/* 9. EXECUÇÃO FÍSICA */}
                  <td
                    className="py-3 px-2 align-top text-center"
                    onClick={(e) => e.stopPropagation()}
                    onMouseEnter={(e) => handleMouseEnterExecFisica(contrato.id, e)}
                    onMouseLeave={handleMouseLeaveExecFisica}
                  >
                    {(() => {
                      const { execucaoFisica: execFis } = getContratoMedicaoInfo(contrato);
                      return (
                        <div className="inline-block relative cursor-help">
                          <span className="font-bold text-slate-900 block text-xs hover:text-blue-600 transition-colors">
                            {formatPercent(execFis)}
                          </span>
                          {execFis > 0 && (
                            <div className="w-14 mx-auto bg-slate-200 rounded-full h-1 mt-1 overflow-hidden">
                              <div
                                className="bg-blue-600 h-full rounded-full"
                                style={{ width: `${Math.min(execFis, 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* 10. AÇÕES */}
                  <td
                    className="py-3 px-2 align-top text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={(e) => onEditContract(contrato, e)}
                        title="Editar Contrato"
                        className="text-emerald-600 hover:text-emerald-800 p-1 hover:bg-emerald-50 rounded cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => onDeleteContract(contrato, e)}
                        title="Excluir Contrato"
                        className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer Stats */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1 pt-1">
        <span>
          Mostrando <strong>{filteredContratos.length}</strong> de <strong>{contratos.length}</strong> contratos
        </span>
        <span className="text-[11px] text-slate-400">
          Clique em qualquer linha para abrir os detalhes completos, empenhos e medições
        </span>
      </div>

      {/* Balãozinho discreto de Execução Física (Fixed positioning para nunca cortar no scroll ou filtro) */}
      {hoveredExecFisicaId && tooltipPos && (() => {
        const hoveredContrato = contratos.find((c) => c.id === hoveredExecFisicaId);
        if (!hoveredContrato) return null;

        const { medido: tooltipMedido, execucaoFisica: tooltipExecFisica } = getContratoMedicaoInfo(hoveredContrato);

        return (
          <div
            style={{
              position: 'fixed',
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              transform: tooltipPos.showAbove
                ? 'translate(-50%, -100%)'
                : 'translate(-50%, 0)',
            }}
            className="z-9999 pointer-events-none w-60 text-left p-2.5 rounded-lg shadow-2xl bg-slate-900/95 text-white backdrop-blur-xs border border-slate-700/80 transition-opacity duration-150 animate-in fade-in zoom-in-95"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-1">
                <span className="text-[10.5px] font-bold text-sky-300">
                  Execução Física: {formatPercent(tooltipExecFisica)}
                </span>
                <span
                  className={`text-[8.5px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                    tooltipExecFisica >= 100
                      ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800'
                      : tooltipExecFisica > 0
                      ? 'text-sky-400 bg-sky-950/80 border-sky-800'
                      : 'text-slate-400 bg-slate-800/80 border-slate-700'
                  }`}
                >
                  {tooltipExecFisica >= 100
                    ? 'Concluído'
                    : tooltipExecFisica > 0
                    ? 'Em Andamento'
                    : 'Não Iniciado'}
                </span>
              </div>
              <div className="text-[9.5px] text-slate-300 font-mono pt-0.5">
                Medido:{' '}
                <span className="text-emerald-400 font-semibold">
                  {formatCurrency(tooltipMedido)}
                </span>{' '}
                de {formatCurrency(hoveredContrato.valorContratado)}
              </div>
            </div>

            {/* Seta do balãozinho */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
                tooltipPos.showAbove
                  ? 'top-full border-t-slate-900/95'
                  : 'bottom-full border-b-slate-900/95'
              }`}
            />
          </div>
        );
      })()}
    </div>
  );
};
