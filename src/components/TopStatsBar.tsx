import React from 'react';
import { AlertTriangle, Plus } from 'lucide-react';

interface TopStatsBarProps {
  expiringCount: number;
  onFilterExpiring: () => void;
  isFilterExpiringActive: boolean;
  onOpenRelatorioGerencial?: () => void;
  onDownloadPdf?: () => void;
  isDownloadingPdf?: boolean;
  onExportExcel?: () => void;
  onNewContract: () => void;
  pendingObservationsCount?: number;
  onTogglePendencias?: () => void;
  isPendenciasActive?: boolean;
}

export const TopStatsBar: React.FC<TopStatsBarProps> = ({
  expiringCount,
  onFilterExpiring,
  isFilterExpiringActive,
  onOpenRelatorioGerencial,
  onDownloadPdf,
  isDownloadingPdf = false,
  onExportExcel,
  onNewContract,
  pendingObservationsCount,
  onTogglePendencias,
  isPendenciasActive = false,
}) => {
  return (
    <div className="flex items-center justify-end gap-2 px-1 py-0.5 select-none w-full">
      <div className="flex items-center gap-2">
        {/* 1. Alert Triangle Button with Badge for Process Observations / Pendências */}
      <div className="relative">
        <button
          onClick={onTogglePendencias || onFilterExpiring}
          title={
            pendingObservationsCount !== undefined
              ? `${pendingObservationsCount} processo(s) com observações/pendências registradas (clique para abrir a tela de pendências)`
              : `${expiringCount} contrato(s) vencendo em até 60 dias`
          }
          className={`flex items-center justify-center w-8 h-8 rounded border transition-all cursor-pointer shadow-2xs active:scale-95 ${
            isPendenciasActive
              ? 'bg-[#d97706] border-[#b45309] text-white shadow-xs'
              : (pendingObservationsCount ?? 0) > 0
              ? 'bg-white border-amber-300 text-amber-500 hover:bg-amber-50'
              : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className={`w-4 h-4 ${isPendenciasActive ? 'text-white' : 'text-amber-500'}`} />
        </button>
        {pendingObservationsCount !== undefined && pendingObservationsCount > 0 ? (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
            {pendingObservationsCount}
          </span>
        ) : expiringCount > 0 && !pendingObservationsCount ? (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
            {expiringCount}
          </span>
        ) : null}
      </div>

      {/* New Contract Button */}
      <button
        onClick={onNewContract}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500 text-emerald-700 bg-white hover:bg-emerald-50 text-xs font-semibold tracking-wider transition-colors shadow-2xs cursor-pointer active:scale-95"
      >
        <div className="w-4 h-4 rounded-full border border-emerald-600 flex items-center justify-center">
          <Plus className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
        </div>
        <span>NOVO CONTRATO</span>
      </button>
      </div>
    </div>
  );
};
