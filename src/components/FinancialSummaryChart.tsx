import React from 'react';
import { formatCurrency } from '../utils/formatters';

interface FinancialMetrics {
  valorContratado: number;
  valorContratadoNaoExecutado: number;
  valorEmpenhado: number;
  valorMedido: number;
  valorLiquidado: number;
  valorPago: number;
}

interface FinancialSummaryChartProps {
  metrics: FinancialMetrics;
  isCompact?: boolean;
  title?: string;
  heightClass?: string;
  barMaxWidthClass?: string;
}

export const FinancialSummaryChart: React.FC<FinancialSummaryChartProps> = ({
  metrics,
  isCompact = false,
  title,
  heightClass,
  barMaxWidthClass,
}) => {
  const maxVal = Math.max(
    metrics.valorContratado,
    metrics.valorContratadoNaoExecutado,
    metrics.valorEmpenhado,
    metrics.valorMedido,
    1
  );

  const bars = [
    {
      label: isCompact ? 'VALOR CONTRATADO' : 'VALOR CONTRATADO',
      value: metrics.valorContratado,
      color: 'bg-[#10192e]',
      heightPct: Math.max((metrics.valorContratado / maxVal) * 100, 4),
    },
    {
      label: 'VALOR CONTRATADO NÃO EXECUTADO',
      value: metrics.valorContratadoNaoExecutado,
      color: 'bg-[#3b4858]',
      heightPct: Math.max((metrics.valorContratadoNaoExecutado / maxVal) * 100, 4),
    },
    {
      label: 'VALOR EMPENHADO',
      value: metrics.valorEmpenhado,
      color: 'bg-[#2563eb]',
      heightPct: metrics.valorEmpenhado > 0 ? Math.max((metrics.valorEmpenhado / maxVal) * 100, 4) : 0,
    },
    {
      label: isCompact ? 'VALOR MEDIDO (ATESTADO)' : 'VALOR MEDIDO (ATESTADO)',
      value: metrics.valorMedido,
      color: 'bg-[#c2410c]',
      heightPct: metrics.valorMedido > 0 ? Math.max((metrics.valorMedido / maxVal) * 100, 4) : 0,
    },
    {
      label: 'VALOR LIQUIDADO',
      value: metrics.valorLiquidado,
      color: 'bg-emerald-600',
      heightPct: metrics.valorLiquidado > 0 ? Math.max((metrics.valorLiquidado / maxVal) * 100, 4) : 0,
    },
    {
      label: 'VALOR PAGO',
      value: metrics.valorPago,
      color: 'bg-teal-600',
      heightPct: metrics.valorPago > 0 ? Math.max((metrics.valorPago / maxVal) * 100, 4) : 0,
    },
  ];

  return (
    <div className={`bg-white rounded-lg border border-slate-200 shadow-2xs ${isCompact ? 'p-2.5' : 'p-3.5 sm:p-4'}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <h2 className={`font-bold tracking-wide text-slate-700 uppercase ${isCompact ? 'text-[11px]' : 'text-xs'}`}>
          {title || (isCompact
            ? 'EXECUÇÃO ORÇAMENTÁRIA E FINANCEIRA'
            : 'EXECUÇÃO ORÇAMENTÁRIA E FINANCEIRA DOS CONTRATOS')}
        </h2>
        <span className="text-[10px] text-slate-400 font-medium">
          {isCompact ? 'VALORES EM R$' : 'VALORES EM REAIS (R$)'}
        </span>
      </div>

      {/* Chart Canvas */}
      <div className={`relative flex items-end justify-between ${heightClass || (isCompact ? 'h-28 pt-3' : 'h-36 pt-4')} px-2 sm:px-6`}>
        {/* Dashed guidelines */}
        <div className="absolute inset-x-2 top-4 border-b border-dashed border-slate-200 pointer-events-none" />
        <div className="absolute inset-x-2 bottom-4 border-b border-dashed border-slate-300 pointer-events-none" />

        {/* Bars */}
        <div className="w-full flex items-end justify-between gap-1.5 sm:gap-3 z-10 pb-4">
          {bars.map((bar, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center group">
              {/* Value formatted above bar */}
              <div
                className={`font-bold text-slate-800 text-center select-all transition-transform group-hover:scale-105 mb-1 ${
                  isCompact ? 'text-[9px]' : 'text-[10.5px] sm:text-[11px]'
                }`}
              >
                {formatCurrency(bar.value, false)}
              </div>

              {/* Bar element */}
              <div className={`w-full ${barMaxWidthClass || (isCompact ? 'max-w-[42px]' : 'max-w-[85px] sm:max-w-[105px] md:max-w-[125px]')} flex items-end justify-center`}>
                {bar.heightPct > 0 ? (
                  <div
                    style={{ height: `${(bar.heightPct / 100) * (isCompact ? 56 : 78)}px` }}
                    className={`w-full ${bar.color} rounded-t-xs transition-all duration-500 shadow-xs`}
                  />
                ) : (
                  <div className="h-0.5 w-full bg-slate-300" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bar Labels below baseline */}
      <div className="flex items-start justify-between gap-1.5 sm:gap-3 px-2 sm:px-6 pt-1 pb-0.5">
        {bars.map((bar, idx) => (
          <div key={idx} className="flex-1 text-center">
            <span
              className={`block leading-tight text-slate-600 font-semibold uppercase ${
                isCompact ? 'text-[8px]' : 'text-[9px] sm:text-[9.5px]'
              }`}
            >
              {bar.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
