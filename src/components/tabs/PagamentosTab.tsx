import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Trash2, FileSpreadsheet, X, CheckCircle2, AlertCircle, Pencil } from 'lucide-react';
import { Contrato, Pagamento } from '../../types/contract';
import { formatCurrency, formatHistoricoDisplay } from '../../utils/formatters';
import { parseLiqFromDriveText, FlatLiqRow } from '../../utils/driveSpreadsheetSync';
import { NewPagamentoModal } from '../modals/NewPagamentoModal';
import { EditPagamentoModal } from '../modals/EditPagamentoModal';

interface PagamentosTabProps {
  contrato: Contrato;
  onUpdateContract: (updated: Contrato) => void;
  highlightedPagamentoId?: string | null;
}

export const PagamentosTab: React.FC<PagamentosTabProps> = ({
  contrato,
  onUpdateContract,
  highlightedPagamentoId,
}) => {
  const [isNewPagamentoModalOpen, setIsNewPagamentoModalOpen] = useState(false);
  const [isImportLiqModalOpen, setIsImportLiqModalOpen] = useState(false);
  const [editingPagamento, setEditingPagamento] = useState<Pagamento | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [pagamentoToDelete, setPagamentoToDelete] = useState<Pagamento | null>(null);
  const [pasteRawText, setPasteRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<FlatLiqRow[]>([]);
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [importStatusMessage, setImportStatusMessage] = useState<string | null>(null);

  const pagamentos = contrato.pagamentos || [];

  useEffect(() => {
    if (highlightedPagamentoId) {
      const el = document.getElementById(`pagamento-row-${highlightedPagamentoId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedPagamentoId]);

  const handleSalvarPagamento = (novoPag: Pagamento) => {
    const novosPagamentos = [...pagamentos, novoPag];
    const totalPago = novosPagamentos.reduce((sum, p) => sum + p.valorBruto, 0);
    const totalLiquidado = totalPago;

    onUpdateContract({
      ...contrato,
      pagamentos: novosPagamentos,
      valorPago: totalPago,
      valorLiquidado: totalLiquidado,
    });
  };

  const handleSalvarEdicaoPagamento = (updated: Pagamento) => {
    const novosPagamentos = pagamentos.map((p) => (p.id === updated.id ? updated : p));
    const totalPago = novosPagamentos.reduce((sum, p) => sum + p.valorBruto, 0);
    const totalLiquidado = totalPago;

    onUpdateContract({
      ...contrato,
      pagamentos: novosPagamentos,
      valorPago: totalPago,
      valorLiquidado: totalLiquidado,
    });
  };

  const handleExcluirPagamentoConfirmado = (id: string) => {
    const novosPagamentos = pagamentos.filter((p) => p.id !== id);
    const totalPago = novosPagamentos.reduce((sum, p) => sum + p.valorBruto, 0);
    const totalLiquidado = totalPago;

    onUpdateContract({
      ...contrato,
      pagamentos: novosPagamentos,
      valorPago: totalPago,
      valorLiquidado: totalLiquidado,
    });
  };

  const handleRemoverPagamento = (pag: Pagamento) => {
    setPagamentoToDelete(pag);
  };

  const handleOpenEditModal = (pag: Pagamento) => {
    setEditingPagamento(pag);
    setIsEditModalOpen(true);
  };

  const handleProcessarPaste = () => {
    setImportStatusMessage(null);
    if (!pasteRawText.trim()) {
      setImportStatusMessage('Cole as linhas da planilha para processar.');
      return;
    }

    const parsed = parseLiqFromDriveText(pasteRawText, [contrato]);
    if (parsed.length === 0) {
      setImportStatusMessage(
        'Nenhum pagamento identificado. Verifique se copiou as linhas da guia LIQ contendo as colunas G (Nº LIQ), W (Data), I (Empenho) e AF (Valor).'
      );
      setParsedRows([]);
      setSelectedRowIndices(new Set());
    } else {
      setParsedRows(parsed);
      const all = new Set<number>();
      parsed.forEach((_, idx) => all.add(idx));
      setSelectedRowIndices(all);
    }
  };

  const handleConfirmarImportacao = () => {
    if (selectedRowIndices.size === 0) return;

    const selecionados = parsedRows
      .filter((_, idx) => selectedRowIndices.has(idx))
      .map((r) => r.pagamento);

    const novosPagamentos = [...pagamentos];
    selecionados.forEach((np) => {
      const exists = novosPagamentos.some(
        (p) => p.ordemBancaria === np.ordemBancaria && p.dataPagamento === np.dataPagamento
      );
      if (!exists) {
        novosPagamentos.push(np);
      }
    });

    const totalPago = novosPagamentos.reduce((sum, p) => sum + p.valorBruto, 0);
    onUpdateContract({
      ...contrato,
      pagamentos: novosPagamentos,
      valorPago: totalPago,
      valorLiquidado: totalPago,
    });

    setIsImportLiqModalOpen(false);
    setPasteRawText('');
    setParsedRows([]);
    setSelectedRowIndices(new Set());
  };

  const toggleSelectRow = (idx: number) => {
    const next = new Set(selectedRowIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedRowIndices(next);
  };

  return (
    <div className="space-y-4">
      {/* Main Payments Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  HISTÓRICO DE LIQUIDAÇÕES E PAGAMENTOS
                </h3>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.2 rounded-full">
                  {pagamentos.length}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">
                REGISTRO DE LIQUIDAÇÕES E PAGAMENTOS (LIQ)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsImportLiqModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 active:scale-95 text-white text-xs font-semibold uppercase rounded transition-all cursor-pointer shadow-2xs"
              title="Importar linhas da Guia LIQ da planilha do Google Drive"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>IMPORTAR GUIA LIQ</span>
            </button>

            <button
              type="button"
              onClick={() => setIsNewPagamentoModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold uppercase rounded transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>LANÇAR PAGAMENTO</span>
            </button>
          </div>
        </div>

        {/* Payments Table */}
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200 shadow-2xs">
                <th className="py-2.5 px-3.5 whitespace-nowrap border-r border-slate-200 w-48">Nº DA LIQUIDAÇÃO (LIQ)</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap border-r border-slate-200 w-32">DATA DO PAGAMENTO</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap border-r border-slate-200 w-48">EMPENHO VINCULADO</th>
                <th className="py-2.5 px-3.5 w-[320px] min-w-[280px] max-w-[340px] border-r border-slate-200">HISTÓRICO DE PAGAMENTO</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap border-r border-slate-200 w-36">VALOR DO PAGAMENTO</th>
                <th className="py-2.5 px-3 text-center w-16">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagamentos.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-xs text-slate-400 uppercase font-medium"
                  >
                    NENHUM PAGAMENTO REGISTRADO PARA ESTE CONTRATO.
                  </td>
                </tr>
              ) : (
                pagamentos.map((pag) => (
                  <tr
                    key={pag.id}
                    id={`pagamento-row-${pag.id}`}
                    className={`hover:bg-slate-50/80 transition-all border-b border-slate-100 last:border-b-0 ${
                      highlightedPagamentoId === pag.id
                        ? 'bg-emerald-50/90 ring-2 ring-emerald-500 shadow-xs'
                        : ''
                    }`}
                  >
                    <td className="py-3 px-3.5 whitespace-nowrap border-r border-slate-200">
                      <div className="font-bold text-slate-800 font-mono text-xs">
                        {pag.ordemBancaria}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-medium text-center whitespace-nowrap border-r border-slate-200">
                      {pag.dataPagamento}
                    </td>
                    <td className="py-3 px-3.5 text-slate-700 font-mono text-xs whitespace-nowrap border-r border-slate-200">
                      {pag.medicaoVinculada || '-'}
                    </td>
                    <td className="py-2.5 px-3.5 w-[320px] min-w-[280px] max-w-[340px] text-slate-700 text-xs font-mono border-r border-slate-200">
                      <div className="select-text whitespace-normal break-words leading-relaxed text-[11px] max-h-24 overflow-y-auto custom-table-scrollbar pr-1" title={pag.historico}>
                        {formatHistoricoDisplay(pag.historico)}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-right font-bold text-emerald-700 font-mono text-xs whitespace-nowrap border-r border-slate-200">
                      {formatCurrency(pag.valorBruto)}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div
                        className="flex items-center justify-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(pag)}
                          title="Editar Pagamento"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoverPagamento(pag)}
                          title="Excluir Pagamento"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Lançar Pagamento */}
      <NewPagamentoModal
        isOpen={isNewPagamentoModalOpen}
        onClose={() => setIsNewPagamentoModalOpen(false)}
        onSave={handleSalvarPagamento}
        contrato={contrato}
      />

      {/* Modal Editar / Excluir Pagamento */}
      <EditPagamentoModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingPagamento(null);
        }}
        pagamento={editingPagamento}
        contrato={contrato}
        onSave={handleSalvarEdicaoPagamento}
        onDelete={handleExcluirPagamentoConfirmado}
      />

      {/* Modal Importar Guia LIQ do Drive */}
      {isImportLiqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="bg-blue-700 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    IMPORTAR PAGAMENTOS DA GUIA LIQ (GOOGLE DRIVE)
                  </h3>
                  <p className="text-[10px] text-blue-100">
                    CONTRATO Nº {contrato.numero}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportLiqModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Instructions Callout */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-blue-950">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>Mapeamento Automático da Planilha:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-blue-800">
                  <div>• <strong>COLUNA G:</strong> Nº da Liquidação (LIQ)</div>
                  <div>• <strong>COLUNA W:</strong> Data do Pagamento (Data p/ Pagtº)</div>
                  <div>• <strong>COLUNA I:</strong> Empenho (EMP)</div>
                  <div>• <strong>COLUNA T:</strong> Histórico de Pagamento</div>
                  <div>• <strong>COLUNA AF:</strong> Valor do Pagamento (coluna "Valor LIQ")</div>
                  <div>• <strong>COLUNA AJ:</strong> Tipo de Pagamento (somente "P - Credor Principal")</div>
                </div>
                <p className="text-[10px] text-blue-700 pt-1">
                  Copie as linhas da aba <strong>LIQ</strong> do Google Drive (ou apenas a coluna AF com os valores) e cole no campo abaixo:
                </p>
              </div>

              {/* Paste Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase block">
                  Colar Linhas Copiadas da Planilha (Ctrl+V):
                </label>
                <textarea
                  rows={4}
                  value={pasteRawText}
                  onChange={(e) => setPasteRawText(e.target.value)}
                  placeholder="Cole aqui as linhas da aba LIQ copiadas do Google Drive (com ou sem cabeçalho)..."
                  className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-600 focus:bg-white outline-none placeholder-slate-400"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleProcessarPaste}
                    disabled={!pasteRawText.trim()}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer"
                  >
                    Processar Linhas
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {importStatusMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{importStatusMessage}</span>
                </div>
              )}

              {/* Preview Table */}
              {parsedRows.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 uppercase">
                      {parsedRows.length} Pagamento(s) identificado(s) na Guia LIQ:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedRowIndices.size === parsedRows.length) {
                          setSelectedRowIndices(new Set());
                        } else {
                          const all = new Set<number>();
                          parsedRows.forEach((_, idx) => all.add(idx));
                          setSelectedRowIndices(all);
                        }
                      }}
                      className="text-blue-700 hover:underline font-semibold"
                    >
                      {selectedRowIndices.size === parsedRows.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 w-10 text-center border-r border-slate-200">Sel.</th>
                          <th className="p-2.5 whitespace-nowrap border-r border-slate-200">
                            <span className="text-[9px] text-blue-600 block">COL G</span>
                            Nº LIQUIDAÇÃO (LIQ)
                          </th>
                          <th className="p-2.5 text-center whitespace-nowrap border-r border-slate-200">
                            <span className="text-[9px] text-blue-600 block">COL W</span>
                            DATA PAGAMENTO
                          </th>
                          <th className="p-2.5 whitespace-nowrap border-r border-slate-200">
                            <span className="text-[9px] text-blue-600 block">COL I</span>
                            EMPENHO
                          </th>
                          <th className="p-2.5 w-[300px] min-w-[280px] max-w-[340px] border-r border-slate-200">
                            <span className="text-[9px] text-blue-600 block">COL T</span>
                            HISTÓRICO DE PAGAMENTO
                          </th>
                          <th className="p-2.5 text-right whitespace-nowrap">
                            <span className="text-[9px] text-blue-600 block">COL AF (VALOR LIQ)</span>
                            VALOR DO PAGAMENTO
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.map((r, idx) => {
                          const isSelected = selectedRowIndices.has(idx);
                          return (
                            <tr
                              key={idx}
                              onClick={() => toggleSelectRow(idx)}
                              className={`cursor-pointer transition-colors border-b border-slate-100 last:border-b-0 ${
                                isSelected ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-white hover:bg-slate-50 opacity-60'
                              }`}
                            >
                              <td className="p-2.5 text-center border-r border-slate-200" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectRow(idx)}
                                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                                />
                              </td>
                              <td className="p-2.5 font-mono font-bold text-slate-800 whitespace-nowrap border-r border-slate-200">
                                {r.pagamento.ordemBancaria}
                              </td>
                              <td className="p-2.5 text-center text-slate-600 font-medium whitespace-nowrap border-r border-slate-200">
                                {r.pagamento.dataPagamento}
                              </td>
                              <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap border-r border-slate-200">
                                {r.pagamento.medicaoVinculada || '-'}
                              </td>
                              <td className="p-2.5 w-[300px] min-w-[280px] max-w-[340px] text-slate-700 text-[11px] font-mono border-r border-slate-200">
                                <div className="whitespace-normal break-words max-h-20 overflow-y-auto leading-relaxed" title={r.pagamento.historico}>
                                  {formatHistoricoDisplay(r.pagamento.historico)}
                                </div>
                              </td>
                              <td className="p-2.5 text-right font-bold text-emerald-700 font-mono whitespace-nowrap">
                                {formatCurrency(r.pagamento.valorBruto)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                {selectedRowIndices.size} item(ns) selecionado(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportLiqModalOpen(false)}
                  className="px-3.5 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarImportacao}
                  disabled={selectedRowIndices.size === 0}
                  className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs"
                >
                  Importar {selectedRowIndices.size} Pagamento(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {pagamentoToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                <Trash2 className="w-4 h-4" />
                <span>EXCLUIR PAGAMENTO</span>
              </div>
              <button
                type="button"
                onClick={() => setPagamentoToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-700 leading-relaxed">
                Tem certeza que deseja remover o pagamento com Ordem Bancária{' '}
                <strong className="text-slate-900 font-mono">
                  {pagamentoToDelete.ordemBancaria}
                </strong>{' '}
                no valor de{' '}
                <strong className="text-emerald-700 font-mono font-bold">
                  {formatCurrency(pagamentoToDelete.valorBruto)}
                </strong>
                ?
              </p>
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2.5">
                Esta ação atualizará automaticamente os totais pagos e liquidados do contrato.
              </p>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPagamentoToDelete(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  handleExcluirPagamentoConfirmado(pagamentoToDelete.id);
                  setPagamentoToDelete(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 transition-colors shadow-2xs cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
