import React, { useState, useEffect } from 'react';
import { X, FileText, Check, Send, Sparkles } from 'lucide-react';

interface EditObservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (obs: string) => void;
  onSaveAndOpenDespacho?: (obs: string) => void;
  medicaoNumero: string;
  currentObservation?: string;
}

export const EditObservationModal: React.FC<EditObservationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onSaveAndOpenDespacho,
  medicaoNumero,
  currentObservation = '',
}) => {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(currentObservation || '');
  }, [currentObservation, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(text.trim());
    onClose();
  };

  const handleSaveAndOpen = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (onSaveAndOpenDespacho) {
      onSaveAndOpenDespacho(trimmed);
    } else {
      onSave(trimmed);
    }
    onClose();
  };

  const isNger =
    text.toUpperCase().includes('SOLICITAR EMPENHO PARA NGER') ||
    text.toUpperCase().includes('NGER');

  const quickOptions = [
    'SOLICITAR EMPENHO PARA NGER',
    'AGUARDANDO NOTA FISCAL / ATESTO',
    'SOLICITEI O EMPENHO PARA ATENDER A DEMANDA',
    'AGUARDANDO SUPLEMENTAÇÃO ORÇAMENTÁRIA',
    'EMPENHO EM TRAMITAÇÃO NO SIGADOC',
    'AGUARDANDO PAGAMENTO DA MEDIÇÃO',
    'ATENDIMENTO PARCIAL POR FALTA DE SALDO',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div className="bg-amber-600 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider leading-tight">
                OBSERVAÇÃO DA MEDIÇÃO - {medicaoNumero}
              </h3>
              <p className="text-[10px] text-amber-100 font-medium leading-tight">
                Ao salvar, esta medição constará na Aba de Pendências
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
              TEXTO DA OBSERVAÇÃO
            </label>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ex: SOLICITAR EMPENHO PARA NGER"
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-medium uppercase focus:ring-1 focus:ring-amber-600 outline-none resize-none"
            />
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
              SUGESTÕES RÁPIDAS:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {quickOptions.map((opt) => {
                const isOptionNger = opt === 'SOLICITAR EMPENHO PARA NGER';
                return (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => setText(opt)}
                    className={`text-[10px] rounded px-2.5 py-1 text-left transition-all cursor-pointer font-semibold ${
                      isOptionNger
                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 shadow-2xs flex items-center gap-1 font-bold'
                        : 'bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200'
                    }`}
                  >
                    {isOptionNger && <Sparkles className="w-3 h-3 text-amber-700 shrink-0" />}
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Destaque quando selecionado NGER */}
          {isNger && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 flex items-start gap-2 text-amber-950">
              <Send className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-snug">
                <strong className="font-bold uppercase block text-amber-900">
                  Despacho NGER Disponível
                </strong>
                Ao salvar esta observação, a opção <span className="font-bold text-amber-900">"Despacho NGER"</span> aparecerá na linha desta medição com o despacho oficial preenchido para a Chefia de Unidade.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2 flex-wrap">
            {currentObservation ? (
              <button
                type="button"
                onClick={() => {
                  onSave('');
                  onClose();
                }}
                className="text-xs text-red-600 hover:text-red-800 font-semibold cursor-pointer underline"
              >
                Remover Observação
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>

              {isNger && onSaveAndOpenDespacho && (
                <button
                  type="button"
                  onClick={handleSaveAndOpen}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#d97706] hover:bg-[#b45309] active:scale-95 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs"
                  title="Salvar e abrir imediatamente o Despacho NGER"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Salvar e Abrir Despacho NGER</span>
                </button>
              )}

              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Observação</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
