import React, { useState, useEffect } from 'react';
import { X, FileText, Plus, Check } from 'lucide-react';
import { Empenho } from '../../types/contract';
import {
  formatCurrency,
  formatCurrencyInput,
  formatCurrencyBlur,
  formatNumeroEmpenhoInput,
  parseFlexibleNumber,
} from '../../utils/formatters';

interface NewEmpenhoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (empenho: Empenho) => void;
  contractNumero: string;
  empenhoToEdit?: Empenho | null;
}

export const NewEmpenhoModal: React.FC<NewEmpenhoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contractNumero,
  empenhoToEdit,
}) => {
  const [numeroEmp, setNumeroEmp] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [regiao, setRegiao] = useState('');
  const [valorTotal, setValorTotal] = useState('');

  useEffect(() => {
    if (empenhoToEdit) {
      setNumeroEmp(empenhoToEdit.numeroEmp || '');
      setNumeroProcesso(empenhoToEdit.numeroProcesso || '');
      setRegiao(empenhoToEdit.regiao || '');
      setValorTotal(empenhoToEdit.valorTotal ? formatCurrency(empenhoToEdit.valorTotal, true) : '');
    } else {
      setNumeroEmp('');
      setNumeroProcesso('');
      setRegiao('');
      setValorTotal('');
    }
  }, [empenhoToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFlexibleNumber(valorTotal);

    if (empenhoToEdit) {
      // Calculate adjusted saldo
      const diff = valor - empenhoToEdit.valorTotal;
      const newSaldo = Math.max(0, empenhoToEdit.saldoDisponivel + diff);

      const updatedEmp: Empenho = {
        ...empenhoToEdit,
        numeroEmp: numeroEmp.trim().toUpperCase(),
        numeroProcesso: numeroProcesso.trim().toUpperCase(),
        regiao: regiao.trim().toUpperCase() || 'GERAL',
        valorTotal: valor,
        saldoDisponivel: newSaldo,
      };
      onSave(updatedEmp);
    } else {
      const newEmp: Empenho = {
        id: `emp-${Date.now()}`,
        numeroEmp: numeroEmp.trim().toUpperCase(),
        numeroProcesso: numeroProcesso.trim().toUpperCase(),
        regiao: regiao.trim().toUpperCase() || 'GERAL',
        valorTotal: valor,
        saldoDisponivel: valor,
        dataEmissao: '30/09/2026',
      };
      onSave(newEmp);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div className="bg-[#2563eb] text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {empenhoToEdit ? 'EDITAR NOTA DE EMPENHO' : 'LANÇAR NOTA DE EMPENHO'} - {contractNumero}
            </h3>
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
              Nº DA NOTA DE EMPENHO * (MÁSCARA: 00000.0000.00.000000-0)
            </label>
            <input
              type="text"
              placeholder="ex: 18101.0001.26.000142-3"
              value={numeroEmp}
              onChange={(e) => setNumeroEmp(formatNumeroEmpenhoInput(e.target.value))}
              className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded font-mono uppercase font-bold focus:ring-1 focus:ring-blue-600 outline-none"
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
              Nº DO PROCESSO
            </label>
            <input
              type="text"
              placeholder="ex: SEJUS-PRO-2024/09112"
              value={numeroProcesso}
              onChange={(e) => setNumeroProcesso(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded font-mono uppercase focus:ring-1 focus:ring-blue-600 outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
              REGIÃO / POLO
            </label>
            <input
              type="text"
              placeholder="ex: TANGARÁ DA SERRA"
              value={regiao}
              onChange={(e) => setRegiao(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded uppercase focus:ring-1 focus:ring-blue-600 outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
              VALOR TOTAL (R$) *
            </label>
            <input
              type="text"
              placeholder="R$ 0,00"
              value={valorTotal}
              onChange={(e) => setValorTotal(formatCurrencyInput(e.target.value))}
              onBlur={() => setValorTotal(formatCurrencyBlur(valorTotal))}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-bold text-blue-700 text-sm focus:ring-1 focus:ring-blue-600 outline-none"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs"
            >
              {empenhoToEdit ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar Alterações</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Salvar Empenho</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
