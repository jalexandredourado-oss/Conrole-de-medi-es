import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Medicao } from '../../types/contract';
import { formatCurrency, formatNumeroMedicao } from '../../utils/formatters';

interface DeleteMedicaoModalProps {
  medicao: Medicao | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteMedicaoModal: React.FC<DeleteMedicaoModalProps> = ({
  medicao,
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !medicao) return null;

  const isLinked =
    Boolean(
      medicao.empenhoVinculado &&
        medicao.empenhoVinculado.trim() !== '' &&
        medicao.empenhoVinculado.toUpperCase() !== 'SEM EMPENHO' &&
        medicao.empenhoVinculado !== '-'
    );

  const valorRestituir = medicao.valorDescontadoEmpenho ?? medicao.valorMedicao;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-red-600 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-red-700/60 rounded">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                EXCLUIR MEDIÇÃO
              </h3>
              <p className="text-[11px] text-red-100 font-medium">
                Confirmação de exclusão definitiva
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-full shrink-0 border border-red-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-700 leading-relaxed">
                Tem certeza que deseja excluir esta medição? Esta ação não pode ser desfeita.
              </p>
              {isLinked && (
                <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 p-2 rounded leading-tight font-medium mt-1">
                  O saldo de <strong className="font-bold">{formatCurrency(valorRestituir)}</strong> será restituído à Nota de Empenho vinculada (<strong className="font-bold">{medicao.empenhoVinculado}</strong>).
                </p>
              )}
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
              <span className="text-slate-500 font-medium uppercase text-[10px]">Nº Medição:</span>
              <span className="font-bold text-slate-800 uppercase">{formatNumeroMedicao(medicao.numeroMed)}</span>
            </div>
            {medicao.periodo && (
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium uppercase text-[10px]">Período:</span>
                <span className="text-slate-700 uppercase font-semibold">{medicao.periodo}</span>
              </div>
            )}
            {medicao.unidadeCidade && (
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium uppercase text-[10px]">Unidade / Cidade:</span>
                <span className="text-slate-700 uppercase font-semibold">{medicao.unidadeCidade}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-500 font-medium uppercase text-[10px]">Valor da Medição:</span>
              <span className="font-mono font-bold text-red-600 text-sm">
                {formatCurrency(medicao.valorMedicao)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-xs font-semibold rounded text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold uppercase rounded shadow-xs transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sim, Excluir Medição</span>
          </button>
        </div>
      </div>
    </div>
  );
};
