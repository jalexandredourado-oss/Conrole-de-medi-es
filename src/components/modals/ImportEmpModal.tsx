import React, { useState } from 'react';
import {
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Building2,
  DollarSign,
} from 'lucide-react';
import { Contrato, Empenho } from '../../types/contract';
import { formatCurrency } from '../../utils/formatters';
import {
  parseEmpFromDriveText,
  FlatEmpenhoRow,
  isSameContractNumber,
} from '../../utils/driveSpreadsheetSync';

interface ImportEmpModalProps {
  isOpen: boolean;
  onClose: () => void;
  contrato: Contrato;
  onUpdateContract?: (updated: Contrato) => void;
}

export const ImportEmpModal: React.FC<ImportEmpModalProps> = ({
  isOpen,
  onClose,
  contrato,
  onUpdateContract,
}) => {
  const [pasteRawText, setPasteRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<FlatEmpenhoRow[]>([]);
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());
  const [importStatusMessage, setImportStatusMessage] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  if (!isOpen) return null;

  const handleProcessarPaste = () => {
    setImportStatusMessage(null);
    if (!pasteRawText.trim()) {
      setImportStatusMessage('Cole as linhas da planilha para processar.');
      return;
    }

    const allParsed = parseEmpFromDriveText(pasteRawText, 'GERAL', contrato.numero);
    if (allParsed.length === 0) {
      setImportStatusMessage(
        'Nenhuma nota de empenho identificada. Verifique se copiou as linhas da guia EMP contendo o contrato ou a coluna BM (Falta Liquidar por Emp / Saldo do EMP).'
      );
      setParsedRows([]);
      setSelectedRowIndices(new Set());
      return;
    }

    // Filter for current contract if multiple are in clipboard, or accept all if they match
    let matched = allParsed.filter((r) => isSameContractNumber(r.contratoNumero, contrato.numero));
    if (matched.length === 0 && allParsed.length > 0) {
      // If user copied rows while inside this contract, associate with this contract
      matched = allParsed.map((r) => ({ ...r, contratoNumero: contrato.numero }));
    }

    setParsedRows(matched);
    const all = new Set<number>();
    matched.forEach((_, idx) => all.add(idx));
    setSelectedRowIndices(all);
  };

  const handleConfirmarImportacao = () => {
    if (selectedRowIndices.size === 0 || !onUpdateContract) return;

    const selecionados = parsedRows
      .filter((_, idx) => selectedRowIndices.has(idx))
      .map((r) => r.empenho);

    let novosEmpenhos: Empenho[] = replaceExisting ? [] : [...(contrato.empenhos || [])];

    selecionados.forEach((incomingEmp) => {
      const incomingDigits = incomingEmp.numeroEmp.replace(/[^\d]/g, '');
      const existingIdx = novosEmpenhos.findIndex((e) => {
        if (e.numeroEmp.trim() === incomingEmp.numeroEmp.trim()) return true;
        const eDigits = e.numeroEmp.replace(/[^\d]/g, '');
        return incomingDigits.length > 0 && eDigits === incomingDigits;
      });

      if (existingIdx >= 0) {
        novosEmpenhos[existingIdx] = {
          ...novosEmpenhos[existingIdx],
          ...incomingEmp,
          saldoEmpenho:
            incomingEmp.saldoEmpenho !== undefined
              ? incomingEmp.saldoEmpenho
              : novosEmpenhos[existingIdx].saldoEmpenho,
        };
      } else {
        novosEmpenhos.push(incomingEmp);
      }
    });

    const totalEmp = novosEmpenhos.reduce((acc, e) => acc + (e.valorTotal || 0), 0);

    onUpdateContract({
      ...contrato,
      empenhos: novosEmpenhos,
      valorEmpenhado: totalEmp > 0 ? totalEmp : contrato.valorEmpenhado,
    });

    onClose();
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

  const toggleSelectAll = () => {
    if (selectedRowIndices.size === parsedRows.length) {
      setSelectedRowIndices(new Set());
    } else {
      const all = new Set<number>();
      parsedRows.forEach((_, i) => all.add(i));
      setSelectedRowIndices(all);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#1b346d] text-white px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/10 rounded">
              <FileSpreadsheet className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider">
                IMPORTAR NOTAS DE EMPENHO DA GUIA EMP (GOOGLE DRIVE)
              </h3>
              <p className="text-[10px] text-blue-200">
                CONTRATO Nº {contrato.numero} — {contrato.razaoSocial}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Instructions Callout */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 text-xs text-blue-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-blue-950">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Mapeamento Automático da Guia EMP (Planilha do Google Drive):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 text-[11px] text-blue-800">
              <div>• <strong>COLUNA B:</strong> Nº de EMP</div>
              <div>• <strong>COLUNA D:</strong> Nº do Processo</div>
              <div>• <strong>COLUNA BH:</strong> Valor do EMP</div>
              <div>• <strong>COLUNA BJ:</strong> Saldo EMP</div>
              <div>• <strong>COLUNA BK:</strong> Nº Contrato ({contrato.numero})</div>
              <div className="bg-amber-100/70 text-amber-950 px-1 py-0.5 rounded font-bold">
                • <strong>COLUNA BM:</strong> Falta Liquidar por Emp (Saldo do EMP)
              </div>
            </div>
            <p className="text-[10.5px] text-blue-700 pt-0.5">
              Copie as linhas da aba <strong>EMP</strong> do Google Drive (você pode copiar toda a planilha ou apenas o bloco das colunas BH até BO) e cole no campo abaixo:
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
              placeholder="Cole aqui as linhas da aba EMP copiadas do Google Drive (com ou sem cabeçalho)..."
              className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-600 focus:bg-white outline-none placeholder-slate-400"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleProcessarPaste}
                disabled={!pasteRawText.trim()}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer shadow-xs"
              >
                Processar Linhas da Planilha
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
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 uppercase">
                    {parsedRows.length} NOTA(S) DE EMPENHO IDENTIFICADA(S)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    ({selectedRowIndices.size} selecionada(s))
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="font-bold text-blue-600 hover:text-blue-800 hover:underline uppercase text-[11px] cursor-pointer"
                >
                  {selectedRowIndices.size === parsedRows.length
                    ? 'Desmarcar Todos'
                    : 'Selecionar Todos'}
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#1b346d] text-white font-bold uppercase text-[10.5px] sticky top-0 shadow-xs z-10">
                    <tr>
                      <th className="p-2 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedRowIndices.size > 0 &&
                            selectedRowIndices.size === parsedRows.length
                          }
                          onChange={toggleSelectAll}
                          className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
                        />
                      </th>
                      <th className="p-2 whitespace-nowrap">Nº DE EMP</th>
                      <th className="p-2 whitespace-nowrap">PROCESSO</th>
                      <th className="p-2 whitespace-nowrap">REGIÃO</th>
                      <th className="p-2 text-right whitespace-nowrap bg-blue-900/40 text-blue-200 border-l border-blue-500/30">
                        VALOR DO EMP (COL BH)
                      </th>
                      <th className="p-2 text-right whitespace-nowrap bg-amber-900/40 text-amber-300 font-bold border-l border-r border-amber-500/30">
                        SALDO DO EMP (COL BM)
                      </th>
                      <th className="p-2 whitespace-nowrap">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11.5px]">
                    {parsedRows.map((row, idx) => {
                      const isSelected = selectedRowIndices.has(idx);
                      const emp = row.empenho;
                      return (
                        <tr
                          key={idx}
                          onClick={() => toggleSelectRow(idx)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50/60 hover:bg-blue-50'
                              : 'bg-white hover:bg-slate-50 opacity-60'
                          }`}
                        >
                          <td
                            className="p-2 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(idx)}
                              className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {emp.numeroEmp}
                          </td>
                          <td className="p-2 font-mono text-[10.5px] text-slate-600 whitespace-nowrap">
                            {emp.numeroProcesso || '-'}
                          </td>
                          <td className="p-2 uppercase text-[10.5px] whitespace-nowrap">
                            {emp.regiao || 'GERAL'}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-blue-700 whitespace-nowrap">
                            {formatCurrency(emp.valorTotal)}
                          </td>
                          <td className="p-2 text-right font-mono whitespace-nowrap bg-amber-50/50">
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px]">
                              {formatCurrency(
                                emp.saldoEmpenho !== undefined
                                  ? emp.saldoEmpenho
                                  : emp.saldoDisponivel
                              )}
                            </span>
                          </td>
                          <td className="p-2 text-[10.5px] text-slate-600 whitespace-nowrap">
                            {emp.observacao || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Replace Option */}
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700 pt-1">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
                <span>
                  Substituir todos os empenhos atuais deste contrato (se desmarcado, serão adicionados / atualizados)
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded text-xs font-bold uppercase transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmarImportacao}
            disabled={selectedRowIndices.size === 0}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              Importar {selectedRowIndices.size} Nota(s) de Empenho
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
