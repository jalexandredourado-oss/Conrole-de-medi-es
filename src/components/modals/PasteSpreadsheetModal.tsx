import React, { useState } from 'react';
import { X, Table2, Check } from 'lucide-react';
import { Medicao } from '../../types/contract';
import { formatNumeroMedicao } from '../../utils/formatters';

interface PasteSpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (medicoes: Medicao[]) => void;
}

export const PasteSpreadsheetModal: React.FC<PasteSpreadsheetModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [rawText, setRawText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleProcessPaste = () => {
    setErrorMsg('');
    if (!rawText.trim()) {
      setErrorMsg('Por favor, cole os dados da planilha na caixa de texto abaixo.');
      return;
    }

    try {
      const lines = rawText.trim().split('\n');
      const newMedicoes: Medicao[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Split by tab (Excel/Google Sheets) or semicolon
        const cols = line.includes('\t') ? line.split('\t') : line.split(';');
        if (cols.length < 2) continue;

        // Skip potential header row
        if (
          cols[0].toLowerCase().includes('med') ||
          cols[0].toLowerCase().includes('número') ||
          cols[0].toLowerCase().includes('item') ||
          cols[0].toLowerCase().includes('sigadoc') ||
          cols[0].toLowerCase().includes('processo')
        ) {
          continue;
        }

        let sigadoc = '';
        let unidadeCidade = '';
        let descricao = '';
        let numeroMed = '';
        let periodo = '';
        let empenhoVinculado = '-';
        let valorRaw = '0';

        // Check for continuation row:
        // Either starts with empty cells in cols 0-3 and has empenho/valor in later cols, or col 8 starts with '↳'
        const isContinuationRow =
          Boolean(newMedicoes.length > 0) &&
          ((cols.length >= 10 && !cols[0]?.trim() && !cols[1]?.trim() && !cols[3]?.trim()) ||
            (cols[8] && cols[8].includes('↳')) ||
            (cols[0] && cols[0].includes('↳')));

        if (isContinuationRow) {
          const parentMed = newMedicoes[newMedicoes.length - 1];
          let empCol = '';
          let valorCol = '';

          if (cols.length >= 10) {
            empCol = cols[8]?.trim() || '';
            valorCol = cols[9]?.trim() || '';
          } else {
            // Find column with ↳
            const arrowCol = cols.find((c) => c.includes('↳')) || '';
            empCol = arrowCol;
            valorCol = cols[cols.length - 1]?.trim() || '0';
          }

          let empClean = empCol.replace(/^[↳\s]+/, '').trim();
          let valorDesc = 0;
          if (empClean.includes('DESC:')) {
            const parts = empClean.split('DESC:');
            empClean = parts[0].trim();
            const descPart = parts[1]?.split('\n')[0]?.trim() || '0';
            valorDesc = parseFloat(descPart.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
          }
          if (empClean.includes('OBS:')) {
            empClean = empClean.split('OBS:')[0].trim();
          }

          const valorMedicao = parseFloat(valorCol.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;

          newMedicoes.push({
            id: `med-import-cont-${Date.now()}-${i}`,
            numeroMed: `${parentMed.numeroMed} (CONT.)`,
            periodo: parentMed.periodo,
            unidadeCidade: parentMed.unidadeCidade,
            descricao: parentMed.descricao,
            sigadoc: parentMed.sigadoc,
            numeroOs: parentMed.numeroOs,
            numeroNf: parentMed.numeroNf,
            dataEmissaoNf: parentMed.dataEmissaoNf,
            dataAtesto: parentMed.dataAtesto,
            empenhoVinculado: empClean || 'SEM EMPENHO',
            valorDescontadoEmpenho: valorDesc > 0 ? valorDesc : valorMedicao,
            valorMedicao,
            medicaoPendente: false,
            valorPendente: 0,
            percentualFisico: parentMed.percentualFisico || 0,
            dataRegistro: '30/09/2026',
            parentMedicaoId: parentMed.id,
            isContinuation: true,
          });
          continue;
        }

        // Full 12-column format check:
        // SIGADOC (0) | Local (1) | Descrição (2) | Nº Med (3) | OS (4) | Período (5) | NF (6) | Atesto (7) | Empenho (8) | Valor (9) | Pendente (10) | Pago (11)
        if (cols.length >= 10 && (cols[0]?.includes('/') || cols[0]?.toUpperCase().includes('SEJUS') || cols[3]?.includes('ª') || cols[3]?.includes('º'))) {
          sigadoc = cols[0]?.trim() || 'SEJUS-PRO-2024';
          unidadeCidade = cols[1]?.trim() || 'UNIDADE REGIONAL';
          descricao = cols[2]?.trim() || 'SERVIÇOS DE ENGENHARIA';
          numeroMed = cols[3]?.trim() || `${newMedicoes.length + 1}ª`;
          const numeroOs = cols[4]?.trim() || '';
          periodo = cols[5]?.trim() || 'PERÍODO ATESTADO';
          const numeroNf = cols[6]?.trim() || '';
          const dataAtesto = cols[7]?.trim() || '';
          
          let empCol = cols[8]?.trim() || 'SEM EMPENHO';
          let valorDesc = 0;
          if (empCol.includes('DESC:')) {
            const parts = empCol.split('DESC:');
            empCol = parts[0].trim();
            const descPart = parts[1]?.split('\n')[0]?.trim() || '0';
            valorDesc = parseFloat(descPart.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
          }
          if (empCol.includes('OBS:')) {
            empCol = empCol.split('OBS:')[0].trim();
          }
          empenhoVinculado = empCol.replace(/^[↳\s]+/, '').trim() || 'SEM EMPENHO';

          valorRaw = cols[9]?.trim() || '0';
          const valorMedicao = parseFloat(valorRaw.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;

          newMedicoes.push({
            id: `med-import-${Date.now()}-${i}`,
            numeroMed: formatNumeroMedicao(numeroMed) || numeroMed.toUpperCase(),
            periodo: periodo.toUpperCase(),
            unidadeCidade: unidadeCidade.toUpperCase(),
            descricao: descricao.toUpperCase(),
            sigadoc: sigadoc.toUpperCase(),
            numeroOs: numeroOs || undefined,
            numeroNf: numeroNf && numeroNf !== '-' ? numeroNf.replace(/^NF\s*/i, '') : undefined,
            dataAtesto: dataAtesto && dataAtesto !== '-' ? dataAtesto : undefined,
            empenhoVinculado,
            valorDescontadoEmpenho: valorDesc > 0 ? valorDesc : (empenhoVinculado !== 'SEM EMPENHO' ? valorMedicao : 0),
            valorMedicao,
            medicaoPendente: empenhoVinculado === 'SEM EMPENHO',
            valorPendente: empenhoVinculado === 'SEM EMPENHO' ? valorMedicao : 0,
            percentualFisico: 0,
            dataRegistro: '30/09/2026',
          });
          continue;
        }

        // Check if first column is SIGADOC (e.g. "SEJUS-PRO-..." or contains "/20")
        const isSigadocFirst =
          cols[0].toUpperCase().includes('SEJUS') ||
          cols[0].toUpperCase().includes('PRO') ||
          cols[0].toUpperCase().includes('DIC') ||
          /\/\d{4}/.test(cols[0]);

        if (isSigadocFirst) {
          // Standard order: SIGADOC | Local/Cidade | Descrição | N° Medições | Período | Valor (6 columns)
          sigadoc = cols[0]?.trim() || 'SEJUS-PRO-2024';
          unidadeCidade = cols[1]?.trim() || 'UNIDADE REGIONAL';
          descricao = cols[2]?.trim() || 'SERVIÇOS DE ENGENHARIA';
          numeroMed = cols[3]?.trim() || `${newMedicoes.length + 1}ª`;
          periodo = cols[4]?.trim() || 'PERÍODO ATESTADO';
          
          // Column 5 is the Valor da Medição
          if (cols.length >= 6) {
            const col5 = cols[5]?.trim();
            const lastCol = cols[cols.length - 1]?.trim();
            if (col5 && (col5.includes('R$') || /[\d.,]+/.test(col5))) {
              valorRaw = col5;
            } else {
              valorRaw = lastCol || '0';
            }
          } else {
            valorRaw = cols[cols.length - 1]?.trim() || '0';
          }
          empenhoVinculado = 'SEM EMPENHO';
        } else {
          // Alternative order: Nº MED | PERÍODO | LOCAL/CIDADE | DESCRIÇÃO | SIGADOC | VALOR
          numeroMed = cols[0]?.trim() || `${newMedicoes.length + 1}ª`;
          periodo = cols[1]?.trim() || 'PERÍODO ATESTADO';
          unidadeCidade = cols[2]?.trim() || 'UNIDADE REGIONAL';
          descricao = cols[3]?.trim() || 'SERVIÇOS DE ENGENHARIA';
          sigadoc = cols[4]?.trim() || 'SEJUS-PRO-2024';
          valorRaw = cols[cols.length - 1]?.trim() || '0';
          empenhoVinculado = 'SEM EMPENHO';
        }

        const valorMedicao = parseFloat(valorRaw.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;

        newMedicoes.push({
          id: `med-import-${Date.now()}-${i}`,
          numeroMed: formatNumeroMedicao(numeroMed) || numeroMed.toUpperCase(),
          periodo: periodo.toUpperCase(),
          unidadeCidade: unidadeCidade.toUpperCase(),
          descricao: descricao.toUpperCase(),
          sigadoc: sigadoc.toUpperCase(),
          empenhoVinculado: 'SEM EMPENHO',
          valorDescontadoEmpenho: 0,
          valorMedicao,
          medicaoPendente: true,
          valorPendente: valorMedicao,
          percentualFisico: 0,
          dataRegistro: '30/09/2026',
        });
      }

      if (newMedicoes.length === 0) {
        setErrorMsg('Nenhuma linha válida reconhecida. Cole linhas com colunas separadas por tabulação.');
        return;
      }

      onImport(newMedicoes);
      onClose();
    } catch (err: any) {
      setErrorMsg('Erro ao processar os dados da planilha. Verifique o formato.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200">
        <div className="bg-[#059669] text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Table2 className="w-5 h-5" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              COLAR MEDIÇÕES DIRETAMENTE DA PLANILHA (EXCEL / SHEETS)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Copie as linhas da sua planilha no Excel ou Google Sheets (Ctrl+C) e cole na caixa abaixo (Ctrl+V).
            <br />
            <strong>Colunas da planilha:</strong> SIGADOC | LOCAL/CIDADE | DESCRIÇÃO | Nº MEDIÇÕES | PERÍODO | VALOR DA MEDIÇÃO
            <br />
            <span className="text-[11px] text-emerald-700 font-medium">
              * O número do empenho não precisa estar na planilha; as medições serão importadas prontas para você vincular ao empenho depois.
            </span>
          </p>

          <textarea
            rows={8}
            placeholder={`SEJUS-PRO-2025/03206.01\tÁGUA BOA\tCONSTRUÇÃO DA ESTAÇÃO DE ESGOTO\t1\t01 A 31/01/2025\tR$ 84.168,69\nSEJUS-PRO-2025/03206.02\tÁGUA BOA\tCONSTRUÇÃO DA ESTAÇÃO DE ESGOTO\t2\t01 A 28/02/2025\tR$ 241.337,84`}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full text-xs font-mono p-3 border border-slate-300 rounded bg-slate-50 focus:bg-white focus:ring-1 focus:ring-emerald-600 outline-none"
          />

          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleProcessPaste}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Importar Dados</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
