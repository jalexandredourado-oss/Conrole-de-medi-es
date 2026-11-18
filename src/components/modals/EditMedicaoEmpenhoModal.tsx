import React, { useState, useEffect } from 'react';
import { X, DollarSign, Check } from 'lucide-react';
import { Contrato, Medicao } from '../../types/contract';
import {
  formatCurrency,
  formatCurrencyInput,
  formatCurrencyBlur,
  parseFlexibleNumber,
  formatNumeroMedicao,
} from '../../utils/formatters';

interface EditMedicaoEmpenhoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (medicaoId: string, empenhoNumero: string, valorDescontado: number) => void;
  medicao: Medicao | null;
  contrato: Contrato;
  initialEmpenhoNumero?: string;
}

export const EditMedicaoEmpenhoModal: React.FC<EditMedicaoEmpenhoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  medicao,
  contrato,
  initialEmpenhoNumero,
}) => {
  const [selectedEmpNumero, setSelectedEmpNumero] = useState('');
  const [valorDescontadoInput, setValorDescontadoInput] = useState('');

  useEffect(() => {
    if (isOpen && medicao) {
      const empNum = initialEmpenhoNumero || medicao.empenhoVinculado || '';
      setSelectedEmpNumero(empNum);

      if (
        medicao.valorDescontadoEmpenho !== undefined &&
        medicao.valorDescontadoEmpenho > 0 &&
        medicao.empenhoVinculado === empNum
      ) {
        setValorDescontadoInput(formatCurrency(medicao.valorDescontadoEmpenho, true));
      } else {
        setValorDescontadoInput('');
      }
    }
  }, [isOpen, medicao, initialEmpenhoNumero]);

  if (!isOpen || !medicao) return null;

  const currentEmpenho = contrato.empenhos.find(
    (e) => e.numeroEmp === selectedEmpNumero
  );

  const otherMedsDeductions = currentEmpenho
    ? (contrato.medicoes || [])
        .filter(
          (m) =>
            m.id !== medicao.id &&
            m.empenhoVinculado &&
            (m.empenhoVinculado.trim() === currentEmpenho.numeroEmp.trim() ||
              m.empenhoVinculado.replace(/[^\d]/g, '') === currentEmpenho.numeroEmp.replace(/[^\d]/g, ''))
        )
        .reduce((sum, m) => {
          const v =
            m.valorDescontadoEmpenho !== undefined && m.valorDescontadoEmpenho !== null
              ? m.valorDescontadoEmpenho
              : m.valorMedicao;
          return sum + (v || 0);
        }, 0)
    : 0;

  const baseEmpenhoTotal = currentEmpenho
    ? currentEmpenho.valorTotal > 0
      ? currentEmpenho.valorTotal
      : (currentEmpenho.saldoDisponivel ?? 0)
    : 0;

  const effectiveSaldoDisponivel = Math.max(0, baseEmpenhoTotal - otherMedsDeductions);
  const calculoAutomaticoPadrao = Math.min(medicao.valorMedicao, effectiveSaldoDisponivel);

  const parsedTyped = parseFlexibleNumber(valorDescontadoInput);
  const valorDescontoEfetivo =
    valorDescontadoInput.trim() === ''
      ? calculoAutomaticoPadrao
      : Math.min(parsedTyped, effectiveSaldoDisponivel);

  const novoSaldoEmpenho = Math.max(0, effectiveSaldoDisponivel - valorDescontoEfetivo);
  const remainingPending = Math.max(0, medicao.valorMedicao - valorDescontoEfetivo);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(medicao.id, selectedEmpNumero, valorDescontoEfetivo);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden border border-slate-200">
        {/* Header Discreto */}
        <div className="bg-[#b91c1c] text-white px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 stroke-[2.5] text-white/90 shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider leading-tight">
                DESCONTO DO EMPENHO
              </h3>
              <p className="text-[10px] text-white/85 font-medium uppercase leading-tight">
                {formatNumeroMedicao(medicao.numeroMed) || medicao.numeroMed}
                {medicao.periodo ? ` - ${medicao.periodo}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {/* Resumo essencial */}
          <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold uppercase text-[10.5px]">
                VALOR DA MEDIÇÃO:
              </span>
              <span className="font-bold text-slate-800 font-mono text-xs">
                {formatCurrency(medicao.valorMedicao)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold uppercase text-[10.5px]">
                EMPENHO:
              </span>
              <span className="font-mono font-bold text-slate-700 text-[11px]">
                {selectedEmpNumero}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold uppercase text-[10.5px]">
                SALDO DISPONÍVEL:
              </span>
              <span className="font-bold text-emerald-700 font-mono text-xs">
                {formatCurrency(effectiveSaldoDisponivel)}
              </span>
            </div>
          </div>

          {/* Valor a descontar */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 uppercase block">
              VALOR A DESCONTAR (R$)
            </label>
            <input
              type="text"
              value={valorDescontadoInput}
              onChange={(e) => setValorDescontadoInput(formatCurrencyInput(e.target.value))}
              onBlur={() => {
                if (valorDescontadoInput.trim()) {
                  setValorDescontadoInput(formatCurrencyBlur(valorDescontadoInput));
                }
              }}
              placeholder={`Padrão: ${formatCurrency(calculoAutomaticoPadrao)}`}
              className="w-full text-xs font-bold font-mono text-slate-900 border border-slate-300 rounded-md px-3 py-2 placeholder:text-slate-400 placeholder:font-sans placeholder:font-normal focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 bg-white"
            />
          </div>

          {/* Resultado discreto */}
          <div className="pt-1.5 border-t border-slate-100 space-y-1 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold uppercase">NOVO SALDO DO EMPENHO:</span>
              <span className="font-mono font-bold text-emerald-700">
                {formatCurrency(novoSaldoEmpenho)}
              </span>
            </div>
            {remainingPending > 0.01 && (
              <div className="flex items-center justify-between">
                <span className="text-amber-700 font-semibold uppercase">SALDO PENDENTE DA MEDIÇÃO:</span>
                <span className="font-mono font-bold text-amber-700">
                  {formatCurrency(remainingPending)}
                </span>
              </div>
            )}
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-300 rounded text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors uppercase cursor-pointer"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-[#b91c1c] hover:bg-[#991b1b] text-white rounded text-[11px] font-bold uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>CONFIRMAR</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
