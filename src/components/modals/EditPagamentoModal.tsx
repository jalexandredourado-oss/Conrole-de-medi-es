import React, { useState, useEffect } from 'react';
import { X, DollarSign, Trash2, Save, AlertTriangle, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { Contrato, Pagamento } from '../../types/contract';
import {
  formatCurrency,
  formatDateBR,
  formatDateISO,
  formatCurrencyInput,
  formatCurrencyBlur,
  parseFlexibleNumber,
  formatNumeroLiquidacaoInput,
  extractSigadocFromHistorico,
} from '../../utils/formatters';

interface EditPagamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  pagamento: Pagamento | null;
  contrato: Contrato;
  onSave: (updated: Pagamento) => void;
  onDelete: (id: string) => void;
}

export const EditPagamentoModal: React.FC<EditPagamentoModalProps> = ({
  isOpen,
  onClose,
  pagamento,
  contrato,
  onSave,
  onDelete,
}) => {
  const [numeroLiquidacao, setNumeroLiquidacao] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [empenhoVinculado, setEmpenhoVinculado] = useState('');
  const [valorPagamento, setValorPagamento] = useState('');
  const [historico, setHistorico] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (isOpen && pagamento) {
      setNumeroLiquidacao(pagamento.ordemBancaria || '');
      setDataPagamento(formatDateISO(pagamento.dataPagamento) || '2026-09-30');
      setEmpenhoVinculado(pagamento.medicaoVinculada || '');
      setValorPagamento(
        pagamento.valorBruto > 0 ? formatCurrency(pagamento.valorBruto, true) : ''
      );
      setHistorico(pagamento.historico || '');
      setIsConfirmingDelete(false);
    }
  }, [isOpen, pagamento]);

  if (!isOpen || !pagamento) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFlexibleNumber(valorPagamento);

    const updatedPag: Pagamento = {
      ...pagamento,
      ordemBancaria: numeroLiquidacao.trim().toUpperCase() || pagamento.ordemBancaria,
      dataPagamento: formatDateBR(dataPagamento) || pagamento.dataPagamento,
      medicaoVinculada: empenhoVinculado.trim().toUpperCase(),
      sigadoc: extractSigadocFromHistorico(historico) || pagamento.sigadoc || '',
      historico: historico.trim().toUpperCase(),
      valorBruto: valor,
      valorLiquido: valor,
    };

    onSave(updatedPag);
    onClose();
  };

  const handleConfirmDelete = () => {
    onDelete(pagamento.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                EDITAR PAGAMENTO / LIQUIDAÇÃO
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                CONTRATO Nº {contrato.numero} • LIQ: {pagamento.ordemBancaria}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nº da Liquidação */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                Nº da Liquidação (LIQ) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={numeroLiquidacao}
                onChange={(e) => setNumeroLiquidacao(formatNumeroLiquidacaoInput(e.target.value))}
                placeholder="Ex: 18101.0002.26.002539-5"
                className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Coluna G da planilha LIQ
              </span>
            </div>

            {/* Data do Pagamento */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                Data do Pagamento <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Coluna W (Data p/ Pagtº)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Empenho Vinculado */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                Empenho Vinculado
              </label>
              <input
                type="text"
                list="empenhos-list-edit"
                value={empenhoVinculado}
                onChange={(e) => setEmpenhoVinculado(e.target.value.toUpperCase())}
                placeholder="Ex: 18101.0001.26.000142-3"
                className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              <datalist id="empenhos-list-edit">
                {(contrato.empenhos || []).map((emp) => (
                  <option key={emp.id} value={emp.numeroEmp}>
                    {emp.numeroEmp} ({formatCurrency(emp.valorTotal)})
                  </option>
                ))}
              </datalist>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Coluna I da planilha LIQ
              </span>
            </div>

            {/* Valor do Pagamento */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                Valor do Pagamento <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={valorPagamento}
                  onChange={(e) => setValorPagamento(formatCurrencyInput(e.target.value))}
                  onBlur={() => setValorPagamento(formatCurrencyBlur(valorPagamento))}
                  placeholder="R$ 0,00"
                  className="w-full text-xs font-bold font-mono text-emerald-800 bg-emerald-50/30 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Coluna AF (Valor da LIQ)
              </span>
            </div>
          </div>

          {/* Histórico do Pagamento */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold uppercase text-slate-700">
                Histórico do Pagamento
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Coluna T</span>
            </div>
            <textarea
              rows={4}
              value={historico}
              onChange={(e) => setHistorico(e.target.value)}
              placeholder="Descreva o histórico do pagamento (ex: CONTRATO: 001/2026 - SERVIÇOS DE ENGENHARIA - REF: 1ª MEDIÇÃO)"
              className="w-full text-xs font-mono border border-slate-300 rounded-lg p-2.5 uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all leading-relaxed"
            />
          </div>

          {/* Confirmation Box for deletion */}
          {isConfirmingDelete && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-red-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>
                  Confirmar exclusão de <strong>{pagamento.ordemBancaria}</strong>? Esta ação não pode ser desfeita.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="px-2.5 py-1 text-[11px] text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-3 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 rounded shadow-xs cursor-pointer"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            {!isConfirmingDelete ? (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100/80 border border-red-200 rounded-lg transition-colors cursor-pointer"
                title="Excluir este pagamento do contrato"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Pagamento
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Alterações
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
