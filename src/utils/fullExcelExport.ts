import ExcelJS from 'exceljs';
import { Contrato, Medicao } from '../types/contract';
import { triggerFileDownload, resolveCodigoCredor, isCnpjValue } from './driveSpreadsheetSync';
import {
  getSaldoDisponivelAposMedicao,
  getExpandedMedicoes,
  formatCurrency,
  formatNumeroMedicao,
  calculateOsSaldo,
  isPagamentoOfMedicao,
} from './formatters';

// Estilos padronizados fiéis à planilha da SEJUS (Imagem do usuário)
const GREEN_HEADER_BG = 'FFD9EAD3'; // Verde suave idêntico ao cabeçalho do print
const GREEN_BOX_BORDER = 'FF5B8E5D'; // Borda verde das caixas de Empresa, CNPJ e Valores
const RED_TEXT_COLOR = 'FFCC0000'; // Vermelho para destaque de saldo em aberto
const BLUE_LINK_COLOR = 'FF1155CC'; // Azul para links
const BORDER_BLACK = 'FF000000';

// Bordas padronizadas conforme solicitado pelo usuário:
// 1. Linhas laterais mais discretas, quase imperceptíveis (#E2E8F0)
const FAINT_LATERAL_BORDER: ExcelJS.Border = { style: 'thin', color: { argb: 'FFE2E8F0' } };

// 2. Linha entre o empenho principal e o complementar bem imperceptível, bem fina (#E5E7EB, hair)
const FAINT_SUBROW_BORDER: ExcelJS.Border = { style: 'hair', color: { argb: 'FFE5E7EB' } };

// 3. Linha horizontal entre cada processo diferente um pouquinho mais grossa (style 'medium', #94A3B8)
const PROCESS_DIVIDER_BORDER: ExcelJS.Border = { style: 'medium', color: { argb: 'FF94A3B8' } };
const STANDARD_ROW_BORDER: ExcelJS.Border = PROCESS_DIVIDER_BORDER;
const HEADER_BORDER_LINE: ExcelJS.Border = { style: 'medium', color: { argb: 'FF94A3B8' } };

// Células de tabela padrão com laterais discretas e quase imperceptíveis
const THIN_BLACK_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: FAINT_LATERAL_BORDER,
  right: FAINT_LATERAL_BORDER,
};

const GREEN_CELL_BOX_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: GREEN_BOX_BORDER } },
  left: { style: 'thin', color: { argb: GREEN_BOX_BORDER } },
  bottom: { style: 'thin', color: { argb: GREEN_BOX_BORDER } },
  right: { style: 'thin', color: { argb: GREEN_BOX_BORDER } },
};

const CURRENCY_FORMAT = '"R$" #,##0.00';
const PERCENT_FORMAT = '0.0%';

/**
 * Formata o número da OS para exibir exclusivamente número e ano (ex: 001/2025; 003/2025)
 */
export function formatOsNumeroAno(osRaw?: string): string {
  if (!osRaw || osRaw.trim() === '' || osRaw.trim() === '-') return '-';
  const clean = osRaw.replace(/^OS:?\s*(?:N[º°]?\s*)?/i, '').trim();
  const match = clean.match(/(\d{1,4}\/\d{4})/);
  if (match) {
    const [numPart, yearPart] = match[1].split('/');
    return `${numPart.padStart(3, '0')}/${yearPart}`;
  }
  return clean;
}

/**
 * Verifica se a medição está paga de acordo com os lançamentos de $ PAGAMENTOS (contrato.pagamentos)
 */
export function checkIsMedicaoPaga(m: Medicao, c: Contrato): boolean {
  if (m.empenhoVinculado && m.empenhoVinculado.toUpperCase().includes('PAGO PELA UO')) {
    return true;
  }

  const pagamentos = c.pagamentos || [];
  if (pagamentos.length === 0) return false;

  return pagamentos.some((p) => isPagamentoOfMedicao(p, m));
}

export async function generateFullExcelBlob(contratos: Contrato[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SEJUS-MT';
  workbook.lastModifiedBy = 'SEJUS-MT';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Mapeamento de nomes de guia seguros (máx 31 caracteres, sem caracteres inválidos)
  const contractSheetNameMap = new Map<string, string>();
  const usedSheetNames = new Set<string>(['Resumo do contrato']);

  contratos.forEach((c, idx) => {
    let cleanNumero = (c.numero || `CTR_${idx + 1}`).trim().replace(/[/\\?*[\]:]/g, '-');
    if (cleanNumero.length > 31) cleanNumero = cleanNumero.slice(0, 31);
    let sheetName = cleanNumero;
    let dupCount = 1;
    while (usedSheetNames.has(sheetName)) {
      sheetName = `${cleanNumero.slice(0, 27)}_${dupCount}`;
      dupCount++;
    }
    usedSheetNames.add(sheetName);
    contractSheetNameMap.set(c.id || c.numero, sheetName);
  });

  // =========================================================================
  // 1ª GUIA: "Resumo do contrato" (CONSOLIDADO DE TODOS OS CONTRATOS - IMAGEM 3)
  // =========================================================================
  const wsResumo = workbook.addWorksheet('Resumo do contrato', {
    views: [{ showGridLines: false }],
  });
  wsResumo.views = [{ showGridLines: false }];

  // Configuração das larguras das colunas
  wsResumo.columns = [
    { key: 'numero', width: 16 },
    { key: 'empresa', width: 38 },
    { key: 'objeto', width: 44 },
    { key: 'valorGlobal', width: 20 },
    { key: 'saldoContrato', width: 20 },
    { key: 'valorEmpenhado', width: 20 },
    { key: 'saldoEmpenho', width: 20 },
    { key: 'valorMedido', width: 20 },
    { key: 'totalLiquidado', width: 20 },
    { key: 'totalPago', width: 20 },
    { key: 'pctEmpDisp', width: 18 },
  ];

  // Linha 1: Título "Resumo do contrato"
  const titleRow = wsResumo.addRow(['Resumo do contrato']);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF000000' } };
  titleRow.height = 24;

  // Linha 2: Cabeçalho com fundo verde suave e negrito
  const headerRow = wsResumo.addRow([
    'Nº Contrato',
    'Empresa',
    'Objeto',
    'Valor Global',
    'Saldo do contrato',
    'Valor Empenhado',
    'Saldo de Empenho',
    'Valor Medido',
    'Total Liquidado',
    'Total Pago',
    '% EMP Disponível'
  ]);
  headerRow.height = 24;

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: GREEN_HEADER_BG }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber === 1 ? 'left' : colNumber >= 4 && colNumber <= 10 ? 'right' : colNumber === 11 ? 'center' : 'left'
    };
    cell.border = {
      top: HEADER_BORDER_LINE,
      bottom: HEADER_BORDER_LINE,
      left: FAINT_LATERAL_BORDER,
      right: FAINT_LATERAL_BORDER,
    };
  });

  let totalValorGlobal = 0;
  let totalSaldoContrato = 0;
  let totalValorEmpenhado = 0;
  let totalSaldoEmpenho = 0;
  let totalValorMedido = 0;
  let totalLiquidadoGeral = 0;
  let totalPagoGeral = 0;

  contratos.forEach((c) => {
    const valGlobal = c.valorContratado || 0;
    const saldoContrato = c.saldoContrato !== undefined ? c.saldoContrato : Math.max(0, valGlobal - (c.valorEmpenhado || 0));

    const empenhos = c.empenhos || [];
    let valEmpenhado = c.valorEmpenhado || 0;
    let saldoEmp = 0;

    if (empenhos.length > 0) {
      let sumEmp = 0;
      let sumSaldo = 0;
      empenhos.forEach((e) => {
        sumEmp += (e.valorTotal || 0);
        sumSaldo += getSaldoDisponivelAposMedicao(e, c.medicoes);
      });
      if (sumEmp > 0) valEmpenhado = sumEmp;
      saldoEmp = sumSaldo;
    } else {
      saldoEmp = Math.max(0, valEmpenhado - (c.valorMedido || c.valorLiquidado || 0));
    }

    const hasMedicoes = Boolean(c.medicoes && c.medicoes.length > 0);
    const valMedido = hasMedicoes
      ? c.medicoes.reduce((acc, m) => acc + (Number(m.valorMedicao) || 0), 0)
      : (Number(c.valorMedido) || 0);

    const valLiquidado = c.valorLiquidado !== undefined && c.valorLiquidado !== null
      ? c.valorLiquidado
      : (c.valorMedido || c.valorPago || 0);
    const valPago = c.valorPago || 0;
    const pctEmpDisp = valEmpenhado > 0 ? (saldoEmp / valEmpenhado) : 0;

    totalValorGlobal += valGlobal;
    totalSaldoContrato += saldoContrato;
    totalValorEmpenhado += valEmpenhado;
    totalSaldoEmpenho += saldoEmp;
    totalValorMedido += valMedido;
    totalLiquidadoGeral += valLiquidado;
    totalPagoGeral += valPago;

    const row = wsResumo.addRow([
      c.numero,
      c.razaoSocial,
      c.objeto || c.descricao || '',
      valGlobal,
      saldoContrato,
      valEmpenhado,
      saldoEmp,
      valMedido,
      valLiquidado,
      valPago,
      pctEmpDisp
    ]);

    row.height = 20;

    const targetSheet = contractSheetNameMap.get(c.id || c.numero);

    row.eachCell((cell, colNumber) => {
      cell.border = THIN_BLACK_BORDER;
      cell.alignment = { vertical: 'middle' };

      // Coluna 1: Nº Contrato em azul com hiperlink
      if (colNumber === 1) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: BLUE_LINK_COLOR }, underline: true };
        if (targetSheet) {
          cell.value = {
            text: c.numero,
            hyperlink: `#'${targetSheet}'!A1`,
          };
        }
      } else if (colNumber === 2 || colNumber === 3) {
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
      } else if (colNumber >= 4 && colNumber <= 10) {
        cell.numFmt = CURRENCY_FORMAT;
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (colNumber === 11) {
        cell.numFmt = PERCENT_FORMAT;
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  });

  // Linha de Total Geral da Guia Resumo
  const pctTotalGeralDisp = totalValorEmpenhado > 0 ? (totalSaldoEmpenho / totalValorEmpenhado) : 0;
  const totalRow = wsResumo.addRow([
    'TOTAL GERAL',
    `${contratos.length} CONTRATOS CADASTRADOS`,
    '',
    totalValorGlobal,
    totalSaldoContrato,
    totalValorEmpenhado,
    totalSaldoEmpenho,
    totalValorMedido,
    totalLiquidadoGeral,
    totalPagoGeral,
    pctTotalGeralDisp
  ]);
  totalRow.height = 22;

  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' }
    };
    cell.border = THIN_BLACK_BORDER;
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber >= 4 && colNumber <= 10 ? 'right' : colNumber === 11 ? 'center' : 'left'
    };
    if (colNumber >= 4 && colNumber <= 10) {
      cell.numFmt = CURRENCY_FORMAT;
    } else if (colNumber === 11) {
      cell.numFmt = PERCENT_FORMAT;
    }
  });

  // =========================================================================
  // 2ª GUIA EM DIANTE: CADA CONTRATO
  // =========================================================================
  contratos.forEach((c) => {
    const sheetName = contractSheetNameMap.get(c.id || c.numero) || 'CONTRATO';
    const ws = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: false }],
    });
    ws.views = [{ showGridLines: false }];

    // Larguras das colunas A a L com todas as informações padronizadas fiéis à interface
    ws.columns = [
      { key: 'colA', width: 30 }, // 1. SIGADOC (Processo de pagamento) / Nº EMP / Rótulo
      { key: 'colB', width: 35 }, // 2. PROCESSO / Local/Cidade / Empresa (tamanho horizontal aumentado para visibilidade total do nº de processo)
      { key: 'colC', width: 38 }, // 3. Descrição / Região
      { key: 'colD', width: 14 }, // 4. Nº Medições / Valor
      { key: 'colE', width: 22 }, // 5. Ordem de Serviço (OS) / Saldo Disp. / Rótulo Valor Global
      { key: 'colF', width: 18 }, // 6. Período / Caixa Valor Global
      { key: 'colG', width: 16 }, // 7. Nota Fiscal
      { key: 'colH', width: 16 }, // 8. Data do Atesto
      { key: 'colI', width: 30 }, // 9. EMPENHO VINCULADO (com DESC: R$ e quebra de linha)
      { key: 'colJ', width: 20 }, // 10. VALOR DA MEDIÇÃO
      { key: 'colK', width: 20 }, // 11. MEDIÇÃO PENDENTE
      { key: 'colL', width: 16 }, // 12. Pago (Checkbox / Status)
    ];

    // Linha 1: CONTRATO [Nº]  ...  [ Voltar para a GERAL ]
    const r1 = ws.getRow(1);
    r1.height = 22;
    const a1 = r1.getCell(1);
    a1.value = `CONTRATO ${c.numero}`;
    a1.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    a1.alignment = { vertical: 'middle', horizontal: 'left' };

    const d1 = r1.getCell(4);
    d1.value = {
      text: '[ Voltar para a GERAL ]',
      hyperlink: `#'Resumo do contrato'!A1`,
    };
    d1.font = { name: 'Arial', size: 11, bold: true, color: { argb: BLUE_LINK_COLOR }, underline: true };
    d1.alignment = { vertical: 'middle', horizontal: 'left' };

    // Linha 2: Empresa | SW ENGENHARIA LTDA (com caixinha de borda verde)
    const r2 = ws.getRow(2);
    r2.height = 20;
    const a2 = r2.getCell(1);
    a2.value = 'Empresa';
    a2.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    a2.alignment = { vertical: 'middle', horizontal: 'left' };

    const b2 = r2.getCell(2);
    b2.value = c.razaoSocial;
    b2.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
    b2.alignment = { vertical: 'middle', horizontal: 'left' };
    b2.border = GREEN_CELL_BOX_BORDER;

    try {
      ws.mergeCells('B2:C2');
    } catch {}

    // Linha 3: Código do Credor | CNPJ  ...  Valor Global: | R$ ... (caixinha verde)
    const r3 = ws.getRow(3);
    r3.height = 20;
    const a3 = r3.getCell(1);
    a3.value = 'Código do Credor';
    a3.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    a3.alignment = { vertical: 'middle', horizontal: 'left' };

    const credorCode =
      (!isCnpjValue(c.codigoCredor) ? c.codigoCredor : '') ||
      resolveCodigoCredor(c.codigoCredor, c.cnpj) ||
      c.codigoCredor ||
      '-';
    const b3 = r3.getCell(2);
    b3.value = credorCode;
    b3.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
    b3.alignment = { vertical: 'middle', horizontal: 'left' };
    b3.border = GREEN_CELL_BOX_BORDER;

    const e3 = r3.getCell(5);
    e3.value = 'Valor Global:';
    e3.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    e3.alignment = { vertical: 'middle', horizontal: 'right' };

    const f3 = r3.getCell(6);
    f3.value = c.valorContratado || 0;
    f3.numFmt = CURRENCY_FORMAT;
    f3.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
    f3.alignment = { vertical: 'middle', horizontal: 'right' };
    f3.border = GREEN_CELL_BOX_BORDER;

    // Linha 4: Saldo do Contrato: | R$ ... (caixinha verde)
    const r4 = ws.getRow(4);
    r4.height = 20;
    const e4 = r4.getCell(5);
    e4.value = 'Saldo do Contrato:';
    e4.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
    e4.alignment = { vertical: 'middle', horizontal: 'right' };

    const f4 = r4.getCell(6);
    f4.value = c.saldoContrato !== undefined ? c.saldoContrato : (c.valorContratado || 0);
    f4.numFmt = CURRENCY_FORMAT;
    f4.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
    f4.alignment = { vertical: 'middle', horizontal: 'right' };
    f4.border = GREEN_CELL_BOX_BORDER;

    // Linha 5: Título NOTAS DE EMPENHO em negrito
    const r5 = ws.getRow(5);
    r5.height = 22;
    const a5 = r5.getCell(1);
    a5.value = 'NOTAS DE EMPENHO';
    a5.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    a5.alignment = { vertical: 'middle', horizontal: 'left' };

    // Linha 6: Cabeçalho com fundo verde (#d9ead3), negrito e bordas finas
    // EXATAMENTE 5 COLUNAS SOLICITADAS: Nº EMP | PROCESSO | REGIÃO | VALOR | SALDO DISP.
    const r6 = ws.getRow(6);
    r6.height = 22;
    const empHeaderTitles = [
      'Nº EMP',
      'PROCESSO',
      'REGIÃO',
      'VALOR',
      'SALDO DISP.'
    ];

    empHeaderTitles.forEach((title, idx) => {
      const cell = r6.getCell(idx + 1);
      cell.value = title;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: GREEN_HEADER_BG }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: idx === 3 || idx === 4 ? 'right' : 'left'
      };
      cell.border = {
        top: HEADER_BORDER_LINE,
        bottom: HEADER_BORDER_LINE,
        left: FAINT_LATERAL_BORDER,
        right: FAINT_LATERAL_BORDER,
      };
    });

    // Linhas de empenhos com grade de bordas finas (grid de pelo menos 6 linhas como no print)
    const empenhos = c.empenhos || [];
    const minEmpRows = 6;
    const totalEmpRows = Math.max(empenhos.length, minEmpRows);

    for (let i = 0; i < totalEmpRows; i++) {
      const rowIdx = 7 + i;
      const row = ws.getRow(rowIdx);
      row.height = 20;
      const e = empenhos[i];

      if (e) {
        const vEmp = e.valorTotal || 0;
        const sDisp = getSaldoDisponivelAposMedicao(e, c.medicoes);

        // Col A: Nº EMP
        const cA = row.getCell(1);
        cA.value = e.numeroEmp;
        cA.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cA.alignment = { vertical: 'middle', horizontal: 'left' };
        cA.border = THIN_BLACK_BORDER;

        // Col B: PROCESSO
        const cB = row.getCell(2);
        cB.value = e.numeroProcesso || '-';
        cB.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cB.alignment = { vertical: 'middle', horizontal: 'left' };
        cB.border = THIN_BLACK_BORDER;

        // Col C: REGIÃO
        const cC = row.getCell(3);
        cC.value = e.regiao || 'GERAL';
        cC.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cC.alignment = { vertical: 'middle', horizontal: 'left' };
        cC.border = THIN_BLACK_BORDER;

        // Col D: VALOR
        const cD = row.getCell(4);
        cD.value = vEmp;
        cD.numFmt = CURRENCY_FORMAT;
        cD.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cD.alignment = { vertical: 'middle', horizontal: 'right' };
        cD.border = THIN_BLACK_BORDER;

        // Col E: SALDO DISP. (em negrito e vermelho se tiver saldo pendente de execução)
        const cE = row.getCell(5);
        cE.value = sDisp;
        cE.numFmt = CURRENCY_FORMAT;
        cE.font = {
          name: 'Arial',
          size: 10,
          bold: sDisp > 0,
          color: { argb: sDisp > 0 ? RED_TEXT_COLOR : 'FF000000' }
        };
        cE.alignment = { vertical: 'middle', horizontal: 'right' };
        cE.border = THIN_BLACK_BORDER;
      } else {
        // Linhas em branco com grade de bordas finas
        for (let col = 1; col <= 5; col++) {
          const cell = row.getCell(col);
          cell.value = '';
          cell.border = THIN_BLACK_BORDER;
        }
      }
    }

    // =========================================================================
    // TABELA: ORDENS DE SERVIÇO (OS)
    // =========================================================================
    let currentRowIdx = 7 + totalEmpRows + 1; // 1 linha de espaço

    const rOsTitle = ws.getRow(currentRowIdx);
    rOsTitle.height = 22;
    const aOsTitle = rOsTitle.getCell(1);
    aOsTitle.value = 'ORDENS DE SERVIÇO (OS)';
    aOsTitle.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    aOsTitle.alignment = { vertical: 'middle', horizontal: 'left' };

    currentRowIdx++;
    const rOsHeader = ws.getRow(currentRowIdx);
    rOsHeader.height = 22;
    const osHeaderTitles = [
      'Nº DA OS',
      'EMISSÃO',
      'DESCRIÇÃO',
      'VALOR TOTAL',
      'SALDO DA OS'
    ];

    osHeaderTitles.forEach((title, idx) => {
      const cell = rOsHeader.getCell(idx + 1);
      cell.value = title;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: GREEN_HEADER_BG }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: idx === 3 || idx === 4 ? 'right' : 'left'
      };
      cell.border = {
        top: HEADER_BORDER_LINE,
        bottom: HEADER_BORDER_LINE,
        left: FAINT_LATERAL_BORDER,
        right: FAINT_LATERAL_BORDER,
      };
    });

    const ordensServico = c.ordensServico || [];
    const minOsRows = 3;
    const totalOsRows = Math.max(ordensServico.length, minOsRows);

    for (let k = 0; k < totalOsRows; k++) {
      currentRowIdx++;
      const row = ws.getRow(currentRowIdx);
      row.height = 20;
      const os = ordensServico[k];

      if (os) {
        // Calcula o total medido e saldo da OS (incluindo eventual 2ª OS rateada)
        const osStats = calculateOsSaldo(os, c.medicoes || [], ordensServico.length);
        const totalMedido = osStats.totalMedido;
        const saldoOs = Math.max(0, osStats.saldo);

        // Col A: Nº DA OS
        const cA = row.getCell(1);
        cA.value = os.numeroOs;
        cA.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cA.alignment = { vertical: 'middle', horizontal: 'left' };
        cA.border = THIN_BLACK_BORDER;

        // Col B: EMISSÃO
        const cB = row.getCell(2);
        cB.value = os.dataEmissao || '-';
        cB.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cB.alignment = { vertical: 'middle', horizontal: 'left' };
        cB.border = THIN_BLACK_BORDER;

        // Col C: DESCRIÇÃO
        const cC = row.getCell(3);
        cC.value = os.descricao || '-';
        cC.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cC.alignment = { vertical: 'middle', horizontal: 'left' };
        cC.border = THIN_BLACK_BORDER;

        // Col D: VALOR TOTAL
        const cD = row.getCell(4);
        cD.value = os.valorTotal || 0;
        cD.numFmt = CURRENCY_FORMAT;
        cD.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cD.alignment = { vertical: 'middle', horizontal: 'right' };
        cD.border = THIN_BLACK_BORDER;

        // Col E: SALDO DA OS
        const cE = row.getCell(5);
        cE.value = saldoOs;
        cE.numFmt = CURRENCY_FORMAT;
        cE.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        cE.alignment = { vertical: 'middle', horizontal: 'right' };
        cE.border = THIN_BLACK_BORDER;
      } else {
        for (let col = 1; col <= 5; col++) {
          const cell = row.getCell(col);
          cell.value = '';
          cell.border = THIN_BLACK_BORDER;
        }
      }
    }

    // =========================================================================
    // TABELA: HISTÓRICO DE MEDIÇÕES LANÇADAS
    // Colunas padronizadas fiéis à interface (Imagens do usuário):
    // 1: SIGADOC | 2: Local/Cidade | 3: Descrição | 4: Nº Medições |
    // 5: Ordem de Serviço (OS) | 6: Período | 7: Nota Fiscal | 8: Data do Atesto |
    // 9: Empenho Vinculado | 10: Valor da Medição | 11: Medição Pendente | 12: Pago
    // =========================================================================
    currentRowIdx += 2; // 1 linha de espaço antes de MEDIÇÕES

    // Linha de Título
    const rMedTitle = ws.getRow(currentRowIdx);
    rMedTitle.height = 22;
    const aMedTitle = rMedTitle.getCell(1);
    aMedTitle.value = 'HISTÓRICO DE MEDIÇÕES LANÇADAS';
    aMedTitle.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    aMedTitle.alignment = { vertical: 'middle', horizontal: 'left' };

    currentRowIdx++;
    const rMedHeader = ws.getRow(currentRowIdx);
    rMedHeader.height = 22;
    const medHeaderTitles = [
      'SIGADOC',
      'Local/Cidade',
      'Descrição',
      'Nº Medições',
      'Ordem de Serviço (OS)',
      'Período',
      'Nota Fiscal',
      'Data do Atesto',
      'Empenho Vinculado',
      'Valor da Medição',
      'Medição Pendente',
      'Pago'
    ];

    medHeaderTitles.forEach((title, idx) => {
      const cell = rMedHeader.getCell(idx + 1);
      cell.value = title;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: GREEN_HEADER_BG }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          idx === 3 || idx === 4 || idx === 6 || idx === 7 || idx === 11
            ? 'center'
            : idx === 9 || idx === 10
            ? 'right'
            : 'left'
      };
      cell.border = {
        top: HEADER_BORDER_LINE,
        bottom: HEADER_BORDER_LINE,
        left: FAINT_LATERAL_BORDER,
        right: FAINT_LATERAL_BORDER,
      };
    });

    const medicoes = getExpandedMedicoes(c);
    const minMedRows = 8;
    const totalMedRows = Math.max(medicoes.length, minMedRows);

    for (let j = 0; j < totalMedRows; j++) {
      currentRowIdx++;
      const row = ws.getRow(currentRowIdx);
      const m = medicoes[j];

      if (m) {
        const isContRow = Boolean(
          m.isContinuation ||
          m.parentMedicaoId ||
          (m.numeroMed && m.numeroMed.toUpperCase().includes('(CONT'))
        );

        // Altura da linha dinâmica para que o texto da coluna Descrição apareça por completo sem cortar (como na linha 22)
        const rawDesc = (m.descricao || '').trim();
        if (!isContRow && rawDesc) {
          const manualParagraphs = rawDesc.split('\n');
          let totalLines = 0;
          for (const p of manualParagraphs) {
            totalLines += Math.max(1, Math.ceil(p.trim().length / 32));
          }

          if (totalLines >= 4) {
            row.height = Math.max(52, totalLines * 13 + 6);
          } else if (totalLines === 3 || rawDesc.length > 55) {
            row.height = 42; // Exatamente a altura da linha 22, com as 3 linhas visíveis sem cortar
          } else if (totalLines === 2 || rawDesc.length > 28) {
            row.height = 30; // 2 linhas completas
          } else {
            row.height = 24;
          }
        } else {
          row.height = 20;
        }

        const nextM = medicoes[j + 1];
        const hasContinuationBelow = Boolean(
          nextM && (
            nextM.parentMedicaoId === m.id ||
            nextM.isContinuation ||
            (nextM.numeroMed && nextM.numeroMed.toUpperCase().includes('(CONT'))
          )
        );

        // Borda inferior:
        // - Se houver continuação logo abaixo (empenho complementar do mesmo processo),
        //   a linha é bem imperceptível e bem fina (hairline suave #E5E7EB).
        // - Se for a última linha daquele processo/medição, a linha divisória horizontal
        //   de cada processo diferente é um pouquinho mais grossa (style 'medium', #94A3B8).
        const rowBottomBorder: ExcelJS.Border = hasContinuationBelow
          ? FAINT_SUBROW_BORDER
          : PROCESS_DIVIDER_BORDER;

        // Borda superior:
        // - Se for continuação, conecta suavemente pela divisória fina.
        // - Se for o início de um novo processo, conecta com a linha mais grossa do processo anterior.
        const rowTopBorder: ExcelJS.Border = isContRow
          ? FAINT_SUBROW_BORDER
          : PROCESS_DIVIDER_BORDER;

        const medCellBorder: Partial<ExcelJS.Borders> = {
          top: rowTopBorder,
          bottom: rowBottomBorder,
          left: FAINT_LATERAL_BORDER,
          right: FAINT_LATERAL_BORDER,
        };

        const isLinked = Boolean(
          m.empenhoVinculado &&
          m.empenhoVinculado.trim() !== '' &&
          m.empenhoVinculado.toUpperCase() !== 'SEM EMPENHO' &&
          m.empenhoVinculado !== '-' &&
          !m.empenhoVinculado.includes('R$') &&
          !/^\s*R?\$?\s*[\d.,]+\s*$/.test(m.empenhoVinculado)
        );

        const sigadocProcesso = isContRow ? '' : (m.sigadoc || c.processoSigadoc || '-');
        const valorMed = m.valorMedicao || 0;

        // 1. Col 1: SIGADOC (vazio se for linha de continuação)
        const c1 = row.getCell(1);
        c1.value = sigadocProcesso;
        c1.font = { name: 'Arial', size: 10, bold: !isContRow, color: { argb: 'FF000000' } };
        c1.alignment = { vertical: 'middle', horizontal: 'left' };
        c1.border = medCellBorder;

        // 2. Col 2: Local/Cidade (vazio se for linha de continuação)
        const c2 = row.getCell(2);
        c2.value = isContRow ? '' : (m.unidadeCidade || '');
        c2.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        c2.alignment = { vertical: 'middle', horizontal: 'left' };
        c2.border = medCellBorder;

        // 3. Col 3: Descrição (vazio se for linha de continuação)
        const c3 = row.getCell(3);
        c3.value = isContRow ? '' : (m.descricao || '');
        c3.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        c3.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        c3.border = medCellBorder;

        // 4. Col 4: Nº Medições (vazio se for linha de continuação, sem repetir ex: "5ª (CONT.)")
        const c4 = row.getCell(4);
        c4.value = isContRow ? '' : formatNumeroMedicao(m.numeroMed);
        c4.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF000000' } };
        c4.alignment = { vertical: 'middle', horizontal: 'center' };
        c4.border = medCellBorder;

        // 5. Col 5: Ordem de Serviço (OS) (vazio se for linha de continuação)
        const c5 = row.getCell(5);
        if (isContRow) {
          c5.value = '';
        } else if (m.numeroOs && m.numeroOs2) {
          c5.value = `${formatOsNumeroAno(m.numeroOs)} / ${formatOsNumeroAno(m.numeroOs2)}`;
        } else {
          c5.value = formatOsNumeroAno(m.numeroOs) || '';
        }
        c5.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        c5.alignment = { vertical: 'middle', horizontal: 'center' };
        c5.border = medCellBorder;

        // 6. Col 6: Período (vazio se for linha de continuação)
        const c6 = row.getCell(6);
        c6.value = isContRow ? '' : (m.periodo || '');
        c6.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        c6.alignment = { vertical: 'middle', horizontal: 'left' };
        c6.border = medCellBorder;

        // 7. Col 7: Nota Fiscal (vazio se for linha de continuação)
        const c7 = row.getCell(7);
        c7.value = isContRow
          ? ''
          : m.numeroNf
          ? (m.numeroNf.toUpperCase().startsWith('NF') ? m.numeroNf : `NF ${m.numeroNf}`)
          : '-';
        c7.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        c7.alignment = { vertical: 'middle', horizontal: 'center' };
        c7.border = medCellBorder;

        // 8. Col 8: Data do Atesto (vazio se for linha de continuação)
        const c8 = row.getCell(8);
        c8.value = isContRow ? '' : (m.dataAtesto || '-');
        c8.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
        c8.alignment = { vertical: 'middle', horizontal: 'center' };
        c8.border = medCellBorder;

        // 9. Col 9: Empenho Vinculado (deixando SOMENTE o nº do empenho, com ↳ se for linha de continuação)
        const c9 = row.getCell(9);
        let empDisplay = '';
        if (m.empenhoVinculado === 'Pago pela UO da SESP') {
          empDisplay = isContRow ? '↳ Pago pela UO da SESP' : 'Pago pela UO da SESP';
        } else if (isLinked) {
          const rawEmp = m.empenhoVinculado.replace(/^↳\s*/, '').trim();
          empDisplay = isContRow ? `↳ ${rawEmp}` : rawEmp;
        } else {
          empDisplay = isContRow ? '↳ SEM EMPENHO' : 'SEM EMPENHO';
        }

        c9.value = empDisplay;
        c9.font = {
          name: 'Arial',
          size: isContRow ? 9.5 : 10,
          bold: !isContRow,
          color: { argb: isContRow ? 'FF475569' : 'FF1E40AF' }
        };
        c9.alignment = { vertical: 'middle', horizontal: 'left' };
        c9.border = medCellBorder;

        // 10. Col 10: Valor da Medição
        const c10 = row.getCell(10);
        c10.value = valorMed;
        c10.numFmt = CURRENCY_FORMAT;
        c10.font = {
          name: 'Arial',
          size: isContRow ? 9.5 : 10,
          bold: !isContRow,
          color: { argb: isContRow ? 'FF64748B' : 'FF000000' }
        };
        c10.alignment = { vertical: 'middle', horizontal: 'right' };
        c10.border = medCellBorder;

        // 11. Col 11: Medição Pendente
        // Regra idêntica à interface do sistema:
        // - Se a medição continua abaixo (ou houve rateio com continuação): exibe '-' (traço)
        // - Se for a linha final e estiver coberta/liquidada: exibe R$ 0,00 em verde
        // - Se houver saldo pendente real não empenhado: exibe o valor em destaque
        const c11 = row.getCell(11);
        const isContinuing =
          hasContinuationBelow ||
          (isLinked &&
            m.valorDescontadoEmpenho !== undefined &&
            m.valorDescontadoEmpenho > 0 &&
            m.valorMedicao - m.valorDescontadoEmpenho > 0.01);

        if (isContinuing) {
          c11.value = '-';
          c11.numFmt = '@';
          c11.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF94A3B8' } };
          c11.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (m.empenhoVinculado === 'Pago pela UO da SESP' || isLinked) {
          c11.value = 0;
          c11.numFmt = CURRENCY_FORMAT;
          c11.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF137333' } };
          c11.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (m.valorPendente && m.valorPendente > 0) {
          c11.value = m.valorPendente;
          c11.numFmt = CURRENCY_FORMAT;
          c11.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFEA580C' } };
          c11.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (m.medicaoPendente && (!m.empenhoVinculado || m.empenhoVinculado.toUpperCase() === 'SEM EMPENHO')) {
          c11.value = m.valorMedicao;
          c11.numFmt = CURRENCY_FORMAT;
          c11.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFEA580C' } };
          c11.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
          c11.value = 0;
          c11.numFmt = CURRENCY_FORMAT;
          c11.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF137333' } };
          c11.alignment = { vertical: 'middle', horizontal: 'right' };
        }
        c11.border = medCellBorder;

        // 12. Col 12: Pago (Checkbox alimentada pelos registros de Pagamentos)
        const isPago = checkIsMedicaoPaga(m, c);
        const c12 = row.getCell(12);
        c12.value = isPago ? '☑ PAGO' : '☐ NÃO PAGO';
        c12.font = {
          name: 'Arial',
          size: 10,
          bold: true,
          color: { argb: isPago ? 'FF137333' : 'FF7F8C8D' }
        };
        c12.alignment = { vertical: 'middle', horizontal: 'center' };
        c12.border = medCellBorder;
      } else {
        // Linhas em branco com bordas laterais discretas e divisórias finas (12 colunas)
        const emptyCellBorder: Partial<ExcelJS.Borders> = {
          top: FAINT_SUBROW_BORDER,
          bottom: FAINT_SUBROW_BORDER,
          left: FAINT_LATERAL_BORDER,
          right: FAINT_LATERAL_BORDER,
        };
        for (let col = 1; col <= 12; col++) {
          const cell = row.getCell(col);
          cell.value = '';
          cell.border = emptyCellBorder;
        }
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function exportFullExcelWorkbook(
  contratos: Contrato[],
  filename?: string
): Promise<void> {
  const blob = await generateFullExcelBlob(contratos);
  const dateStr = new Date().toISOString().slice(0, 10);
  const finalFilename = filename || `Planilha_Completa_Contratos_Empenhos_Medicoes_${dateStr}.xlsx`;
  triggerFileDownload(blob, finalFilename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
