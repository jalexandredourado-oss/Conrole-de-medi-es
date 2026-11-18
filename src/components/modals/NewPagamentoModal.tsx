import React, { useState, useEffect } from 'react';
import { X, DollarSign, Plus, RotateCcw } from 'lucide-react';
import { Contrato, Medicao, Pagamento } from '../../types/contract';
import {
  formatCurrency,
  formatDateBR,
  formatCurrencyInput,
  formatCurrencyBlur,
  parseFlexibleNumber,
  formatNumeroLiquidacaoInput,
  extractSigadocFromHistorico,
} from '../../utils/formatters';

interface NewPagamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pagamento: Pagamento) => void;
  contrato: Contrato;
  initialMedicao?: Medicao | null;
}

export const NewPagamentoModal: React.FC<NewPagamentoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contrato,
  initialMedicao,
}) => {
  const [numeroLiquidacao, setNumeroLiquidacao] = useState('');
  const [dataPagamento, setDataPagamento] = useState('2026-09-30');
  const [empenhoVinculado, setEmpenhoVinculado] = useState('');
  const [valorPagamento, setValorPagamento] = useState('');
  const [historico, setHistorico] = useState('');

  const buildHistoricoPadrao = (targetMed?: Medicao | null, nfNum = 'XX'): string => {
    let numContrato = contrato.numero || '';
    if (numContrato && !numContrato.includes('SEJUS') && !numContrato.includes('SESP')) {
      numContrato = `${numContrato}/SEJUS`;
    }
    const vigencia = `${contrato.dataInicio || '14/01/2025'} A ${contrato.dataFim || '10/12/2025'}`;
    
    // Services: prioritize measurement's own description if exists, else contract object/description
    const servicos = (
      targetMed?.descricao ||
      contrato.objeto ||
      contrato.descricao ||
      'SERVIÇO DE ENGENHARIA E ARQUITETURA P/ OBRAS'
    ).toUpperCase();

    let refMedicao = '1ª MEDIÇÃO';
    let periodoMed = '01/2026';
    let protocolo = contrato.processoSigadoc || 'SEJUS-PRO-2026/01764.06';

    const med =
      targetMed ||
      (contrato.medicoes && contrato.medicoes.length > 0
        ? contrato.medicoes[contrato.medicoes.length - 1]
        : null);

    if (med) {
      refMedicao = med.numeroMed.includes('MED')
        ? med.numeroMed
        : `${med.numeroMed}ª MEDIÇÃO`;
      periodoMed = med.periodo || '01/2026';
      if (
        med.sigadoc &&
        med.sigadoc !== '-' &&
        med.sigadoc.toUpperCase() !== 'NÃO INFORMADO'
      ) {
        protocolo = med.sigadoc;
      }
    }

    return `CONTRATO: ${numContrato} - VIGÊNCIA: ${vigencia}
SERVIÇOS - ${servicos}
NF: ${nfNum}
REFERÊNCIA: ${refMedicao} (${periodoMed})
PROTOCOLO: ${protocolo}`;
  };

  useEffect(() => {
    if (isOpen) {
      setNumeroLiquidacao('');
      setDataPagamento('2026-09-30');

      const target =
        initialMedicao ||
        (contrato.medicoes && contrato.medicoes.length > 0
          ? contrato.medicoes[contrato.medicoes.length - 1]
          : null);

      if (target) {
        if (target.empenhoVinculado && target.empenhoVinculado !== 'SEM EMPENHO') {
          setEmpenhoVinculado(target.empenhoVinculado);
        } else if (contrato.empenhos && contrato.empenhos.length > 0) {
          setEmpenhoVinculado(contrato.empenhos[0].numeroEmp);
        } else {
          setEmpenhoVinculado('');
        }

        if (target.valorMedicao > 0) {
          setValorPagamento(formatCurrency(target.valorMedicao, true));
        } else {
          setValorPagamento('');
        }
      } else {
        if (contrato.empenhos && contrato.empenhos.length > 0) {
          setEmpenhoVinculado(contrato.empenhos[0].numeroEmp);
        } else {
          setEmpenhoVinculado('');
        }
        setValorPagamento('');
      }

      setHistorico(buildHistoricoPadrao(target));
    }
  }, [isOpen, contrato, initialMedicao]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFlexibleNumber(valorPagamento);

    const novoPag: Pagamento = {
      id: `pag-${Date.now()}`,
      ordemBancaria:
        numeroLiquidacao.trim().toUpperCase() ||
        `00000.0000.26.000001-0`,
      dataPagamento: formatDateBR(dataPagamento),
      medicaoVinculada: empenhoVinculado.trim().toUpperCase(),
      sigadoc: extractSigadocFromHistorico(historico) || initialMedicao?.sigadoc || '',
      historico: historico.trim().toUpperCase(),
      valorBruto: valor,
      retencoes: {
        inss: 0,
        iss: 0,
        irrf: 0,
      },
      valorLiquido: valor,
      status: 'PAGO',
    };

    onSave(novoPag);
    onClose();
  };

  const activeEmp = (contrato.empenhos || []).find(
    (e) => e.numeroEmp === empenhoVinculado
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[94vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-emerald-600 text-white px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              LANÇAR PAGAMENTO - CONTRATO Nº {contrato.numero}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Row 1: Nº da Liquidação & Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Nº DA LIQUIDAÇÃO (LIQ) *
              </label>
              <input
                type="text"
                placeholder="00000.0000.00.000000-0"
                value={numeroLiquidacao}
                onChange={(e) => setNumeroLiquidacao(formatNumeroLiquidacaoInput(e.target.value))}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded font-mono font-bold text-slate-900 focus:ring-1 focus:ring-emerald-600 outline-none"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                DATA DO PAGAMENTO *
              </label>
              <input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded font-medium focus:ring-1 focus:ring-emerald-600 outline-none"
                required
              />
            </div>
          </div>

          {/* Row 2: Empenho Vinculado & Valor do Pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                EMPENHO VINCULADO
              </label>
              <select
                value={empenhoVinculado}
                onChange={(e) => setEmpenhoVinculado(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-emerald-600 outline-none cursor-pointer font-mono"
              >
                <option value="">Nenhum empenho vinculado</option>
                {(contrato.empenhos || []).map((emp) => (
                  <option key={emp.id} value={emp.numeroEmp}>
                    {emp.numeroEmp} {emp.regiao ? `(${emp.regiao})` : ''} - Saldo: {formatCurrency(emp.saldoDisponivel)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                VALOR DO PAGAMENTO (R$) *
              </label>
              <input
                type="text"
                placeholder="R$ 0,00"
                value={valorPagamento}
                onChange={(e) => setValorPagamento(formatCurrencyInput(e.target.value))}
                onBlur={() => setValorPagamento(formatCurrencyBlur(valorPagamento))}
                className="w-full text-sm px-3 py-2 bg-white border border-slate-300 rounded font-bold text-emerald-700 font-mono focus:ring-1 focus:ring-emerald-600 outline-none"
                required
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Coluna AF da guia LIQ (Valor LIQ)
              </span>
            </div>
          </div>

          {activeEmp && (
            <p className="text-[11px] text-emerald-800 font-medium -mt-2">
              Saldo disponível no empenho: <strong className="font-mono">{formatCurrency(activeEmp.saldoDisponivel)}</strong>
            </p>
          )}

          {/* Row 3: Caixa de Histórico da Liquidação */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">
                HISTÓRICO DA LIQUIDAÇÃO / PAGAMENTO *
              </label>
              <button
                type="button"
                onClick={() => setHistorico(buildHistoricoPadrao(initialMedicao))}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 hover:underline cursor-pointer"
                title="Recarregar dados originais da medição no histórico"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restaurar Padrão</span>
              </button>
            </div>
            <textarea
              rows={5}
              value={historico}
              onChange={(e) => setHistorico(e.target.value.toUpperCase())}
              placeholder={'CONTRATO: ...\nSERVIÇOS - ...\nNF: xx\nREFERÊNCIA: ...\nPROTOCOLO: ...'}
              className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded font-mono text-slate-800 focus:bg-white focus:ring-1 focus:ring-emerald-600 outline-none uppercase leading-relaxed resize-y"
              required
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Substitua o <strong className="text-slate-600">"NF: XX"</strong> pelo número da Nota Fiscal emitida. As demais informações são preenchidas automaticamente a partir da medição realizada e do contrato.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Confirmar Pagamento</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
