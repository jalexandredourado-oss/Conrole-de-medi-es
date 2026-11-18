import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Contrato } from '../../types/contract';
import { formatCurrency } from '../../utils/formatters';

interface DeleteContractModalProps {
  contrato: Contrato | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteContractModal: React.FC<DeleteContractModalProps> = ({
  contrato,
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !contrato) return null;

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
            <div className="p-1 bg-red-700/60 rounded">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                EXCLUIR CONTRATO
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
                Tem certeza que deseja excluir o contrato{' '}
                <strong className="text-slate-900 font-bold">Nº {contrato.numero}</strong>?
              </p>
              <p className="text-[11px] text-slate-500">
                Esta ação é irreversível. Todos os dados orçamentários, empenhos e medições vinculados serão removidos permanentemente.
              </p>
            </div>
          </div>

          {/* Contract preview card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200">
              <span className="font-bold text-slate-800 uppercase">
                {contrato.tipo}
              </span>
              <span className="font-bold text-blue-700 font-mono">
                CONTRATO Nº {contrato.numero}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                EMPRESA CONTRATADA
              </span>
              <p className="font-bold text-slate-800 uppercase leading-snug">
                {contrato.razaoSocial}
              </p>
              {contrato.cnpj && (
                <p className="text-[11px] font-mono text-slate-500">{contrato.cnpj}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                  VALOR CONTRATADO
                </span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(contrato.valorContratado)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                  SALDO RESTANTE
                </span>
                <span className="font-bold text-emerald-700">
                  {formatCurrency(contrato.saldoContrato)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-xs font-bold uppercase rounded text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold uppercase rounded transition-all cursor-pointer shadow-xs"
          >
            <Trash2 className="w-4 h-4" />
            <span>Sim, Excluir Contrato</span>
          </button>
        </div>
      </div>
    </div>
  );
};
