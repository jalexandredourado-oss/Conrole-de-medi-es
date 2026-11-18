import { Contrato, Empenho, Medicao, Pagamento, TipoContrato } from '../types/contract';
import { formatCurrency, formatNumeroLiquidacaoInput, formatCnpj, getSaldoDisponivelAposMedicao, getExpandedMedicoes, isPagamentoOfMedicao, extractSigadocFromHistorico } from './formatters';
import * as XLSX from 'xlsx';

// Helper to format currency numbers to standard Brazilian format
function fmtNum(val: number): string {
  return (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Clean and parse currency from string (supports "R$ 1.200.000,50", "1200000.50", "1.200.000,50", "(500,00)", etc.)
export function parseCurrencyInput(val: string | number | undefined): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/["']/g, '').replace(/R\$\s?/gi, '').replace(/\s+/g, '');
  if (!str) return 0;

  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1).trim();
  } else if (str.startsWith('-')) {
    isNegative = true;
    str = str.slice(1).trim();
  }

  let n = 0;
  // If format is like 1.234.567,89 or 189.726,33
  if (str.includes(',')) {
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    n = parseFloat(cleaned);
  } else {
    n = parseFloat(str);
  }

  if (isNaN(n)) return 0;
  return isNegative ? -n : n;
}

// List of municipalities in Mato Grosso and common section header labels to filter out
export const MT_MUNICIPALITIES_AND_SECTIONS = new Set([
  'TAPURAH', 'CLÁUDIA', 'CLAUDIA', 'CUIABÁ', 'CUIABA', 'VÁRZEA GRANDE', 'VARZEA GRANDE',
  'RONDONÓPOLIS', 'RONDONOPOLIS', 'SINOP', 'SORRISO', 'LUCAS DO RIO VERDE', 'TANGARÁ DA SERRA',
  'TANGARA DA SERRA', 'BARRA DO GARÇAS', 'BARRA DO GARCAS', 'PRIMAVERA DO LESTE', 'ALTA FLORESTA',
  'PONTES E LACERDA', 'JUÍNA', 'JUINA', 'CÁCERES', 'CACERES', 'CAMPO VERDE', 'DIAMANTINO',
  'CAMPO NOVO DO PARECIS', 'NOVA MUTUM', 'GUARANTÃ DO NORTE', 'GUARANTA DO NORTE', 'JUARA',
  'COLÍDER', 'COLIDER', 'PEIXOTO DE AZEVEDO', 'POCONÉ', 'POCONE', 'JACIARA', 'MIRASSOL D\'OESTE',
  'ÁGUA BOA', 'AGUA BOA', 'SÃO JOSÉ DOS QUATRO MARCOS', 'SAO JOSE DOS QUATRO MARCOS',
  'NOVA XAVANTINA', 'BARRA DO BUGRES', 'CHAPADA DOS GUIMARÃES', 'CHAPADA DOS GUIMARAES',
  'SÃO FÉLIX DO ARAGUAIA', 'SAO FELIX DO ARAGUAIA', 'CANARANA', 'PARANATINGA', 'ARIPUANÃ', 'ARIPUANA',
  'MATUPÁ', 'MATUPA', 'VERA', 'NOVA UBIRATÃ', 'NOVA UBIRATA', 'SANTA CARMEM', 'ITANHANGÁ', 'ITANHANGA',
  'IPIRANGA DO NORTE', 'FELIZ NATAL', 'UNIÃO DO SUL', 'UNIAO DO SUL', 'TABAPORÃ', 'TABAPORA',
  'PORTO DOS GAÚCHOS', 'PORTO DOS GAUCHOS', 'NOVO HORIZONTE DO NORTE', 'BRASNORTE', 'SAPEZAL',
  'CAMPOS DE JÚLIO', 'CAMPOS DE JULIO', 'COMODORO', 'VILA BELA DA SANTÍSSIMA TRINDADE',
  'JAURU', 'FIGUEIRÓPOLIS D\'OESTE', 'INDIAVAÍ', 'ARAPUTANGA', 'RESERVA DO CABAÇAL',
  'RIO BRANCO', 'SALTO DO CÉU', 'PORTO ESPERIDIÃO', 'CURVELÂNDIA', 'LAMBARI D\'OESTE',
  'NOVA OLÍMPIA', 'NOVA OLIMPIA', 'PEDRA PRETA', 'GUIRATINGA', 'ALTO ARAGUAIA', 'ALTO TAQUARI',
  'ALTO GARÇAS', 'ALTO GARCAS', 'ITIQUIRA', 'ROSÁRIO OESTE', 'ROSARIO OESTE', 'NOBRES',
  'SANTO ANTÔNIO DO LEVERGER', 'SANTO ANTONIO DO LEVERGER', 'NOSSA SENHORA DO LIVRAMENTO',
  'BARÃO DE MELGAÇO', 'BARAO DE MELGACO', 'MUNICÍPIO', 'MUNICIPIO', 'CIDADE', 'COMARCA',
  'LOCALIDADE', 'UNIDADE', 'SUBTOTAL', 'TOTAL', 'TOTAL GERAL', 'GERAL'
]);

export function isInvalidContractNumber(numero: string): boolean {
  if (!numero || numero.trim().length === 0) return true;
  const clean = numero.trim().toUpperCase().replace(/^CONTRATO\s*(?:N[º°.]?)?\s*:?\s*/i, '');
  if (!clean || clean.length < 1) return true;

  // 0. Formula error values or placeholders
  if (
    clean.includes('VALUE') ||
    clean.includes('#REF') ||
    clean.includes('#N/A') ||
    clean.includes('#DIV/0') ||
    clean.includes('EXEMPLO') ||
    clean.includes('DUMMY')
  ) {
    return true;
  }

  // 1. Must contain at least one digit (e.g. "152", "070/2024"). Pure text like "Tapurah", "Cláudia" is NOT a contract!
  if (!/\d/.test(clean)) return true;

  // 2. Dummy zero codes like "0", "00", "000" are not contracts
  if (/^0+$/.test(clean) || clean === '-' || clean === '--') return true;

  // 3. Known municipalities / section titles
  if (MT_MUNICIPALITIES_AND_SECTIONS.has(clean)) return true;

  // 4. Header or totalizer keywords
  if (
    clean === 'CONTRATO' ||
    clean.includes('Nº DO CONTRATO') ||
    clean.includes('FIPLAN') ||
    clean.includes('TOTAL') ||
    clean.includes('SECRETARIA') ||
    clean.includes('ÓRGÃO') ||
    clean.includes('ORGAO') ||
    clean.includes('MUNICÍPIO') ||
    clean.includes('MUNICIPIO')
  ) {
    return true;
  }

  // 5. Reject CNPJ branch filial suffixes like /0001, /0002, /0055, etc.
  // In Brazilian public contracts, contract numbers have a slash followed by a valid year (e.g. /2024, /2025, /2026 or 2 digits /24, /25).
  // Suffixes like 0001, 0002, 0014, 0055 belong to CNPJs (e.g. ...522/0001-90), NEVER contract numbers.
  if (clean.includes('/')) {
    const parts = clean.split('/');
    const yearPart = parts[1]?.trim() || '';
    if (yearPart.length === 4) {
      const y = parseInt(yearPart, 10);
      if (isNaN(y) || y < 2010 || y > 2040) {
        return true;
      }
    } else if (yearPart.length === 2) {
      const y = parseInt(yearPart, 10);
      if (isNaN(y) || y < 10 || y > 40) {
        return true;
      }
    } else {
      return true;
    }
  }

  return false;
}

export function isInvalidSavedContractNumber(numero: string): boolean {
  if (!numero || numero.trim().length === 0) return true;
  const clean = numero.trim().toUpperCase().replace(/^CONTRATO\s*(?:N[º°.]?)?\s*:?\s*/i, '');
  if (!clean || clean.length < 1) return true;

  if (
    clean.includes('VALUE') ||
    clean.includes('#REF') ||
    clean.includes('#N/A') ||
    clean.includes('#DIV/0') ||
    clean.includes('EXEMPLO') ||
    clean.includes('DUMMY')
  ) {
    return true;
  }

  if (!/\d/.test(clean)) return true;
  if (/^0+$/.test(clean) || clean === '-' || clean === '--') return true;
  if (MT_MUNICIPALITIES_AND_SECTIONS.has(clean)) return true;

  if (
    clean === 'CONTRATO' ||
    clean.includes('Nº DO CONTRATO') ||
    clean.includes('FIPLAN') ||
    clean.includes('TOTAL') ||
    clean.includes('SECRETARIA') ||
    clean.includes('ÓRGÃO') ||
    clean.includes('ORGAO') ||
    clean.includes('MUNICÍPIO') ||
    clean.includes('MUNICIPIO')
  ) {
    return true;
  }

  if (clean.includes('/')) {
    const parts = clean.split('/');
    const yearPart = parts[1]?.trim() || '';
    if (!/^\d{2}$|^\d{4}$/.test(yearPart)) {
      return true;
    }
  }

  return false;
}

/**
 * Formats a contract number to strictly 8 characters: 3 characters before the slash and 4 digits for the year:
 * Format: XXX/YYYY (ex: "070/2024", "117/2025", "152/2024")
 */
export function formatContractNumber(
  rawNumero: string | undefined,
  contextDataInicio?: string,
  contextSigadoc?: string,
  fallbackYear = '2024'
): string {
  if (!rawNumero) return '';
  let clean = rawNumero.trim().toUpperCase().replace(/^CONTRATO\s*(?:N[º°.]?)?\s*:?\s*/i, '');

  let numPart = '';
  let yearPart = '';

  if (clean.includes('/')) {
    const parts = clean.split('/');
    numPart = parts[0].replace(/\D/g, '');
    yearPart = parts[1].replace(/\D/g, '');
  } else if (clean.includes('-')) {
    const parts = clean.split('-');
    numPart = parts[0].replace(/\D/g, '');
    yearPart = parts[1].replace(/\D/g, '');
  } else {
    numPart = clean.replace(/\D/g, '');
  }

  // If year is not present in contract number, extract from dataInicio (DD/MM/YYYY)
  if (!yearPart || yearPart.length < 2) {
    if (contextDataInicio) {
      const match = contextDataInicio.match(/\b(20\d{2})\b/);
      if (match) yearPart = match[1];
    }
  }

  // If still not present, extract from contextSigadoc (e.g. ".../2024")
  if (!yearPart || yearPart.length < 2) {
    if (contextSigadoc) {
      const match = contextSigadoc.match(/\b(20\d{2})\b/);
      if (match) yearPart = match[1];
    }
  }

  // Fallback year
  if (!yearPart || yearPart.length < 2) {
    yearPart = fallbackYear;
  } else if (yearPart.length === 2) {
    yearPart = `20${yearPart}`;
  } else if (yearPart.length > 4) {
    yearPart = yearPart.slice(0, 4);
  }

  if (!numPart) return clean;

  // Exactly 3 characters before the slash
  const numPadded = numPart.padStart(3, '0').slice(-3);

  return `${numPadded}/${yearPart}`;
}

// Precise matching helper for contract numbers (handles "070/2024" vs "70/2024", prevents false matches)
export function isSameContractNumber(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const cleanA = a.trim().toUpperCase().replace(/^CONTRATO\s*(?:N[º°.]?)?\s*:?\s*/i, '');
  const cleanB = b.trim().toUpperCase().replace(/^CONTRATO\s*(?:N[º°.]?)?\s*:?\s*/i, '');

  if (cleanA === cleanB) return true;

  const numA = parseInt(cleanA.split('/')[0].replace(/\D/g, ''), 10);
  const numB = parseInt(cleanB.split('/')[0].replace(/\D/g, ''), 10);

  if (!isNaN(numA) && !isNaN(numB) && numA === numB) {
    const yearA = cleanA.includes('/') ? cleanA.split('/')[1].replace(/\D/g, '') : null;
    const yearB = cleanB.includes('/') ? cleanB.split('/')[1].replace(/\D/g, '') : null;

    if (!yearA || !yearB) return true;

    const fullYearA = yearA.length === 2 ? `20${yearA}` : yearA;
    const fullYearB = yearB.length === 2 ? `20${yearB}` : yearB;

    return fullYearA === fullYearB;
  }

  return false;
}

// Helper to split raw clipboard or CSV text into rows and columns with robust RFC 4180 delimiter and quote handling
export function parseDelimitedText(raw: string): string[][] {
  if (!raw) return [];
  const text = raw.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  // Detect delimiter by checking line-level tab prevalence first (Excel/Sheets clipboard pastes are always TSV,
  // even when Brazilian currency/descriptions contain more commas than tabs), then comparing ',', ';', '\t'.
  let commaCount = 0;
  let tabCount = 0;
  let semiCount = 0;
  let inQ = false;
  const sampleLen = Math.min(text.length, 30000);
  const sampleText = text.slice(0, sampleLen);
  const sampleLines = sampleText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const linesWithTab = sampleLines.filter((l) => l.includes('\t')).length;

  for (let i = 0; i < sampleLen; i++) {
    const c = text[i];
    if (c === '"') {
      const prev = i > 0 ? text[i - 1] : '\n';
      const atFieldStart = !inQ && (prev === '\n' || prev === '\r' || prev === '\t' || prev === ';' || prev === ',');
      if (atFieldStart) {
        inQ = true;
      } else if (inQ) {
        if (text[i + 1] === '"') {
          i++;
        } else {
          const next = text[i + 1];
          if (next === undefined || next === '\n' || next === '\r' || next === '\t' || next === ';' || next === ',') {
            inQ = false;
          }
        }
      }
    } else if (!inQ) {
      if (c === '\t') tabCount++;
      else if (c === ';') semiCount++;
      else if (c === ',') commaCount++;
    }
  }

  let delimiter = '\t';
  if (tabCount > 0 && sampleLines.length > 0 && linesWithTab >= Math.max(1, Math.floor(sampleLines.length * 0.5))) {
    delimiter = '\t';
  } else if (tabCount >= semiCount && tabCount >= commaCount && tabCount > 0) {
    delimiter = '\t';
  } else if (semiCount >= commaCount && semiCount > 0) {
    delimiter = ';';
  } else if (commaCount > 0) {
    delimiter = ',';
  } else if (tabCount > 0) {
    delimiter = '\t';
  } else if (semiCount > 0) {
    delimiter = ';';
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const cleanCell = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/""/g, '"').trim();
    }
    return trimmed;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (!inQuotes && currentCell.length === 0) {
        inQuotes = true;
      } else if (inQuotes) {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i++; // skip escaped double-quote
        } else {
          const next = text[i + 1];
          if (next === undefined || next === delimiter || next === '\r' || next === '\n') {
            inQuotes = false;
          } else {
            // Stray quote inside a quoted cell; keep it literal instead of breaking rows
            currentCell += '"';
          }
        }
      } else {
        // Stray quote inside an unquoted cell (e.g. 4" pipe); keep literal so following rows are never swallowed
        currentCell += '"';
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(cleanCell(currentCell));
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i++; // skip \r\n
      }
      currentRow.push(cleanCell(currentCell));
      currentCell = '';
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(cleanCell(currentCell));
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// ==========================================
// 1. CONTRATOS (Planilha do Drive - Aba Contratos)
// ==========================================
export const CONTRATOS_HEADERS = [
  'Nº DO CONTRATO',
  'PROCESSO SIGADOC',
  'TIPO DE CONTRATO',
  'RAZÃO SOCIAL',
  'CNPJ',
  'OBJETO / DESCRIÇÃO',
  'VALOR CONTRATADO (R$)',
  'SALDO DO CONTRATO (R$)',
  'VALOR EMPENHADO (R$)',
  'VALOR MEDIDO (R$)',
  'VALOR PAGO (R$)',
  'INÍCIO VIGÊNCIA',
  'FIM VIGÊNCIA',
  'DIAS P/ VENCER',
  'EXECUÇÃO FÍSICA (%)',
  'FISCAL TITULAR',
  'FISCAL SUBSTITUTO',
];

export function generateContratosDriveExport(contratos: Contrato[], delimiter = ';'): string {
  const rows = contratos.map((c) => [
    c.numero,
    c.processoSigadoc || '',
    c.tipo,
    c.razaoSocial,
    c.cnpj,
    c.objeto || c.descricao,
    fmtNum(c.valorContratado),
    fmtNum(c.saldoContrato),
    fmtNum(c.valorEmpenhado),
    fmtNum(c.valorMedido),
    fmtNum(c.valorPago),
    c.dataInicio,
    c.dataFim,
    c.diasVencer,
    c.execucaoFisica.toFixed(1).replace('.', ','),
    c.fiscal,
    c.substituto || '',
  ]);

  if (delimiter === '\t') {
    // For clipboard
    return [CONTRATOS_HEADERS.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
  }

  // For CSV file (with BOM)
  const escaped = rows.map((r) =>
    r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(delimiter)
  );
  return '\uFEFF' + [CONTRATOS_HEADERS.map((h) => `"${h}"`).join(delimiter), ...escaped].join('\n');
}

/**
 * Extrai o ID do documento de qualquer formato de link do Google Drive ou Google Sheets:
 * - https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit#gid=0
 * - https://drive.google.com/file/d/1BxiMVs0XRA5.../view?usp=sharing
 * - https://drive.google.com/open?id=1BxiMVs0XRA5...
 * - https://drive.google.com/uc?id=1BxiMVs0XRA5...
 * - ID puro colado diretamente
 */
export function extractGoogleDriveId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // 1. Google Sheets standard: /spreadsheets/d/<id> ou /spreadsheets/u/0/d/<id>
  const sheetMatch = trimmed.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9-_]+)/i);
  if (sheetMatch) return sheetMatch[1];

  // 2. Google Drive file: /file/d/<id>
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/i);
  if (fileMatch) return fileMatch[1];

  // 3. Query param id=: ?id=<id> ou &id=<id>
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/i);
  if (idParamMatch) return idParamMatch[1];

  // 4. /d/<id> genérico
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/i);
  if (dMatch) return dMatch[1];

  // 5. Se o usuário colou diretamente o código/ID alfanumérico (mínimo 20 caracteres)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Extrai o GID numérico da aba da URL do Google Sheets (se houver #gid= ou ?gid=)
 */
export function extractGoogleDriveGid(url: string): string | null {
  if (!url) return null;
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/i);
  return gidMatch ? gidMatch[1] : null;
}

export function extractGoogleSheetsExportUrl(
  inputUrl: string,
  customGidOrTab?: string,
  mode: 'export' | 'gviz' = 'export'
): string | null {
  try {
    const trimmed = inputUrl.trim();
    if (!trimmed) return null;

    if (trimmed.includes('/pub') && trimmed.includes('output=csv')) {
      return trimmed;
    }

    const docId = extractGoogleDriveId(trimmed);
    if (!docId) return null;

    let gid = '';

    // 1. If customGidOrTab is a numeric GID
    if (customGidOrTab && /^\d+$/.test(customGidOrTab.trim())) {
      gid = customGidOrTab.trim();
    } else {
      gid = extractGoogleDriveGid(trimmed) || '';
    }

    // 2. GViz endpoint supports both sheet names (e.g. "LIQ") and GIDs
    if (mode === 'gviz') {
      if (customGidOrTab && !/^\d+$/.test(customGidOrTab.trim())) {
        return `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(customGidOrTab.trim())}`;
      }
      return `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${gid || '0'}`;
    }

    return `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid || '0'}`;
  } catch {
    return null;
  }
}

export function colLetterToIndex(col: string): number {
  let index = 0;
  const upper = col.toUpperCase().trim();
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index - 1;
}

export function isValidDateOrSerial(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const s = String(raw).trim().replace(/["']/g, '');
  if (!s || s === '-' || s === '--') return false;
  if (/^\d{5}$/.test(s)) {
    const num = parseInt(s, 10);
    return num >= 30000 && num <= 65000;
  }
  return (
    /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(s) ||
    /^\d{4}-\d{1,2}-\d{1,2}/.test(s)
  );
}

export function normalizeDateStr(raw: string | undefined | null, defaultDate: string): string {
  if (!raw) return defaultDate;
  const trimmed = String(raw).trim().replace(/["']/g, '');
  if (!trimmed || trimmed === '-' || trimmed === '--') return defaultDate;

  // 1. Excel serial number (e.g. 45234 for dates)
  if (/^\d{5}$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10);
    if (serial >= 30000 && serial <= 65000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const msPerDay = 24 * 60 * 60 * 1000;
      const date = new Date(excelEpoch.getTime() + serial * msPerDay);
      if (!isNaN(date.getTime())) {
        const d = String(date.getUTCDate()).padStart(2, '0');
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const y = String(date.getUTCFullYear());
        return `${d}/${m}/${y}`;
      }
    }
  }

  // 2. Standard DD/MM/YYYY or DD/MM/YY (also handles time: 01/01/2025 00:00:00)
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const d = slashMatch[1].padStart(2, '0');
    const m = slashMatch[2].padStart(2, '0');
    let y = slashMatch[3];
    if (y.length === 2) {
      y = parseInt(y, 10) > 70 ? `19${y}` : `20${y}`;
    }
    return `${d}/${m}/${y}`;
  }

  // 3. Dash format: DD-MM-YYYY or DD-MM-YY
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (dashMatch) {
    const d = dashMatch[1].padStart(2, '0');
    const m = dashMatch[2].padStart(2, '0');
    let y = dashMatch[3];
    if (y.length === 2) {
      y = parseInt(y, 10) > 70 ? `19${y}` : `20${y}`;
    }
    return `${d}/${m}/${y}`;
  }

  // 4. Dot format: DD.MM.YYYY or DD.MM.YY
  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (dotMatch) {
    const d = dotMatch[1].padStart(2, '0');
    const m = dotMatch[2].padStart(2, '0');
    let y = dotMatch[3];
    if (y.length === 2) {
      y = parseInt(y, 10) > 70 ? `19${y}` : `20${y}`;
    }
    return `${d}/${m}/${y}`;
  }

  // 5. ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  return trimmed || defaultDate;
}

function calculateDiasVencer(dataFimStr: string): number {
  try {
    if (!dataFimStr) return 365;
    const parts = dataFimStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const targetDate = new Date(year, month, day);
        const today = new Date();
        const diffMs = targetDate.getTime() - today.getTime();
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }
    }
  } catch {
    // fallback
  }
  return 365;
}

// Official FIPLAN Creditor codes mapped from the FIPLAN CONSULTAR CONTRATO sheet (Coluna M)
export const FIPLAN_CREDORES_MAP: Record<string, string> = {
  '39.826.240/0001-85': '2021.02611-0', // SERVICOS DE ENGENHARIA J M LTDA (008/2025)
  '36.909.349/0001-98': '2009.01145-1', // TMF CONSTRUCOES, INCORPORACAO E SERVICOS LTDA (012/2025, 034/2025)
  '37.993.033/0001-90': '2022.01365-9', // CEDROS LOCACAO DE EQUIPAMENTOS E MAQUINAS LTDA (070/2024)
  '20.151.547/0001-03': '2024.07906-1', // MARCIO SOUZA FARIA LTDA (130/2024)
  '50.279.747/0001-07': '2024.08464-2', // STN SANEAMENTO LTDA (142/2024, 152/2024, 153/2024, 293/2024, 044/2025, 026/2026)
  '39.510.728/0001-07': '2021.02984-5', // BUILT UP ENGENHARIA E SOLUCOES LTDA (184/2024, 208/2024, 016/2025, 027/2026, 035/2026)
  '25.282.681/0001-59': '2023.01630-9', // AREMCO EMPREENDIMENTOS LTDA (310/2024)
  '18.363.482/0001-00': '2024.13110-1', // HOME E INVEST CONSTRUTORA LTDA (344/2024)
  '26.574.991/0001-00': '2018.02114-6', // D TRES INCORPORADORA LTDA (009/2025, 035/2025)
  '33.075.863/0001-87': '2022.02204-6', // CONSTRUTORA SOBERANA LTDA (010/2025)
  '28.546.803/0001-65': '2023.17281-5', // SW ENGENHARIA LTDA (011/2025)
  '07.419.055/0001-80': '2006.02260-5', // PROPLAN PLANEJAMENTO DE PROJETOS LTDA (025/2025, 037/2025)
  '34.155.401/0001-32': '2023.01539-6', // EVOLUTION NEGÓCIOS EMPRESARIAIS LTDA (036/2025)
  '36.969.897/0001-03': '2019.06357-8', // VIGA CONSTRUCOES E SERVIÇOS LTDA (038/2025)
  '27.203.302/0001-13': '2024.06804-1', // SAMEDAL ENGENHARIA PROJETOS E CONSTRUCOES LTDA (057/2025)
};

export function isCnpjValue(val: string | undefined): boolean {
  if (!val) return false;
  const str = String(val).trim();
  const digitsOnly = str.replace(/\D/g, '');
  return digitsOnly.length === 14 || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(str) || (str.includes('/') && digitsOnly.length >= 11 && !str.includes('.00'));
}

export function resolveCodigoCredor(rawCredor: string | undefined, cnpj: string | undefined): string {
  const credorStr = (rawCredor || '').trim();
  // If credor is empty, is a CNPJ, or matches the CNPJ value, map it from FIPLAN_CREDORES_MAP
  if (!credorStr || isCnpjValue(credorStr) || (cnpj && credorStr === cnpj.trim())) {
    if (cnpj) {
      const cleanCnpj = cnpj.trim();
      const mapped = FIPLAN_CREDORES_MAP[cleanCnpj] || 
                     FIPLAN_CREDORES_MAP[cleanCnpj.replace(/\D/g, '')] ||
                     FIPLAN_CREDORES_MAP[formatCnpj(cleanCnpj)];
      if (mapped) return mapped;
    }
    return '';
  }
  return credorStr;
}

export function parseContratosFromDriveText(raw: string): Partial<Contrato>[] {
  const matrix = parseDelimitedText(raw);
  if (matrix.length === 0) return [];

  // Default FIPLAN column mapping:
  // Column M (12): Código do Credor (FIPLAN)
  // Column N (13): Razão Social / Nome do Credor
  // Column O (14): CPF/CNPJ do Credor
  // Column AB (27): Descrição / Objeto
  // Column AC (28): Nº do Contrato
  // Column L (11): Tipo de Contrato
  // Column Z (25): Fiscal Titular
  // Column AA (26): Fiscal Substituto
  // Column S (18): Valor Contratado
  // Column AF (31): Saldo do Contrato
  // Column I (8): Início de Vigência
  // Column J (9): Fim de Vigência
  // Column AE (30): Processo SIGADOC
  let idxM = colLetterToIndex('M');   // 12: Código do Credor (FIPLAN)
  let idxN = colLetterToIndex('N');   // 13: Razão Social
  let idxO = colLetterToIndex('O');   // 14: CNPJ
  let idxAB = colLetterToIndex('AB'); // 27: Descrição / Objeto
  let idxAC = colLetterToIndex('AC'); // 28: Nº do Contrato
  let idxL = colLetterToIndex('L');   // 11: Tipo de contrato
  let idxZ = colLetterToIndex('Z');   // 25: Fiscal Titular
  let idxAA = colLetterToIndex('AA'); // 26: Fiscal Substituto
  let idxS = colLetterToIndex('S');   // 18: Valor Contratado
  let idxAF = colLetterToIndex('AF'); // 31: Saldo do Contrato
  let idxI = colLetterToIndex('I');   // 8:  Início de vigência
  let idxJ = colLetterToIndex('J');   // 9:  Fim de vigência
  let idxAE = colLetterToIndex('AE'); // 30: Processo SIGADOC

  // Locate header row dynamically within first 15 rows
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(15, matrix.length); r++) {
    const rowStr = matrix[r].map((c) => (c || '').toUpperCase().trim()).join(' ');
    if (
      rowStr.includes('CÓDIGO DO CREDOR') ||
      rowStr.includes('CODIGO DO CREDOR') ||
      rowStr.includes('NOME DO CREDOR') ||
      (rowStr.includes('CONTRATO') && (rowStr.includes('CREDOR') || rowStr.includes('OBJETO') || rowStr.includes('FISCAL') || rowStr.includes('VIGÊNCIA') || rowStr.includes('VIGENCIA')))
    ) {
      headerRowIndex = r;
      break;
    }
  }

  let startIndex = 0;
  if (headerRowIndex >= 0) {
    startIndex = headerRowIndex + 1;
    const headerRow = matrix[headerRowIndex];
    headerRow.forEach((h, colIdx) => {
      const s = (h || '').toUpperCase().trim();
      if (!s) return;

      if (
        s === 'CÓDIGO DO CREDOR' ||
        s === 'CODIGO DO CREDOR' ||
        s === 'CÓD. CREDOR' ||
        s === 'COD. CREDOR' ||
        s === 'CÓD. DO CREDOR' ||
        s === 'COD. DO CREDOR' ||
        s === 'CÓDIGO CREDOR' ||
        s === 'CODIGO CREDOR' ||
        s === 'CÓDIGO FIPLAN' ||
        s === 'CODIGO FIPLAN' ||
        s === 'CÓD. FIPLAN' ||
        s === 'COD. FIPLAN' ||
        s === 'CÓDIGO (FIPLAN)' ||
        s === 'CODIGO (FIPLAN)' ||
        s === 'CÓDIGO BENEFICIÁRIO' ||
        s === 'CODIGO BENEFICIARIO' ||
        s === 'CÓD. BENEFICIÁRIO' ||
        s === 'COD. BENEFICIARIO' ||
        s === 'CÓDIGO DO FORNECEDOR' ||
        s === 'CODIGO DO FORNECEDOR' ||
        s === 'CÓDIGO FORNECEDOR' ||
        s === 'CODIGO FORNECEDOR' ||
        s === 'ID CREDOR' ||
        s === 'ID DO CREDOR' ||
        s.includes('CÓDIGO DO CREDOR') ||
        s.includes('CODIGO DO CREDOR') ||
        s.includes('CODIGO CREDOR') ||
        s.includes('CÓDIGO CREDOR') ||
        (s.includes('CREDOR') && (s.includes('CÓD') || s.includes('COD') || s.includes('NUM') || s.includes('Nº') || s.includes('ID'))) ||
        ((s === 'CÓDIGO' || s === 'CODIGO') && !s.includes('CONTRATO') && !s.includes('PROCESSO'))
      ) {
        idxM = colIdx;
      } else if (
        s === 'NOME DO CREDOR' ||
        s.includes('NOME DO CREDOR') ||
        s === 'RAZÃO SOCIAL' ||
        s === 'RAZAO SOCIAL'
      ) {
        idxN = colIdx;
      } else if (s.includes('CPF/CNPJ') || s.includes('CNPJ') || s === 'CPF / CNPJ') {
        idxO = colIdx;
      } else if (
        s === 'Nº DO CONTRATO' ||
        s === 'NUMERO DO CONTRATO' ||
        s === 'Nº CONTRATO' ||
        (s.includes('CONTRATO') && (s.includes('Nº') || s.includes('NUMERO')))
      ) {
        idxAC = colIdx;
      } else if (s.includes('PROCESSO') || s.includes('SIGADOC')) {
        idxAE = colIdx;
      } else if (s === 'TIPO DE CONTRATO' || s === 'TIPO') {
        idxL = colIdx;
      } else if (s === 'OBJETO' || s.includes('OBJETO') || s.includes('DESCRIÇÃO') || s.includes('DESCRICAO')) {
        idxAB = colIdx;
      } else if (s.includes('VALOR CONTRATADO') || s.includes('VALOR TOTAL')) {
        idxS = colIdx;
      } else if (s.includes('SALDO')) {
        idxAF = colIdx;
      } else if (
        colIdx === colLetterToIndex('I') ||
        (s.includes('VIG') && (s.includes('INIC') || s.includes('INÍCI'))) ||
        s === 'INÍCIO DA VIGÊNCIA' ||
        s === 'INICIO DA VIGENCIA' ||
        s === 'INÍCIO DE VIGÊNCIA' ||
        s === 'INICIO DE VIGENCIA' ||
        s === 'INÍCIO VIGÊNCIA' ||
        s === 'INICIO VIGENCIA' ||
        s === 'VIGÊNCIA - INÍCIO' ||
        s === 'VIGENCIA - INICIO' ||
        s === 'VIGÊNCIA INICIAL' ||
        s === 'VIGENCIA INICIAL'
      ) {
        idxI = colIdx;
      } else if (
        colIdx === colLetterToIndex('J') ||
        (s.includes('VIG') && (s.includes('FIM') || s.includes('TÉRMIN') || s.includes('TERMIN'))) ||
        s === 'FIM DA VIGÊNCIA' ||
        s === 'FIM DA VIGENCIA' ||
        s === 'FIM DE VIGÊNCIA' ||
        s === 'FIM DE VIGENCIA' ||
        s === 'FIM VIGÊNCIA' ||
        s === 'FIM VIGENCIA' ||
        s === 'VIGÊNCIA - FIM' ||
        s === 'VIGENCIA - FIM' ||
        s === 'VIGÊNCIA FINAL' ||
        s === 'VIGENCIA FINAL' ||
        s === 'TÉRMINO DA VIGÊNCIA' ||
        s === 'TERMINO DA VIGENCIA'
      ) {
        idxJ = colIdx;
      } else if (s.includes('FISCAL') && !s.includes('SUBST')) {
        idxZ = colIdx;
      } else if (s.includes('SUBSTITUTO')) {
        idxAA = colIdx;
      }
    });
  } else {
    // If no explicit header row, check whether row 0 has data or line 7 starts data
    if (matrix.length >= 7) {
      const row0Contract = (matrix[0][idxAC] || '').trim();
      const row0IsData = row0Contract.includes('/') && !isNaN(Number(row0Contract.replace(/[^0-9]/g, '')));
      startIndex = row0IsData ? 0 : 6;
    } else {
      const firstRowText = matrix[0].join(' ').toUpperCase();
      if (firstRowText.includes('CONTRATO') || firstRowText.includes('FIPLAN')) {
        startIndex = 1;
      }
    }
  }

  const results: Partial<Contrato>[] = [];
  for (let i = startIndex; i < matrix.length; i++) {
    const row = matrix[i];
    if (row.length < 2) continue;

    // 1. Planilha (coluna AC) -> Sistema (Nº do Contrato)
    let numero = (row[idxAC] || '').trim();
    // Strip any "CONTRATO:" prefix
    numero = numero.replace(/^CONTRATO\s*(?:N[º°.]?)?\s*:?\s*/i, '').trim();

    // Check if invalid contract number (e.g. municipality names like "Tapurah", dummy codes like "00", header text)
    if (isInvalidContractNumber(numero)) {
      continue;
    }

    // 2. Planilha (coluna L) -> Sistema (Tipo de contrato)
    const tipoRaw = (row[idxL] || '').trim().toUpperCase();
    const tipo: TipoContrato = tipoRaw.includes('MANUT') ? 'MANUTENÇÃO PREDIAL' : 'OBRAS';

    // 3. Planilha (coluna AB) -> Sistema (Descrição / Objeto)
    const descricao = (row[idxAB] || '').trim();

    // 4. Planilha (coluna N) -> Sistema (Razão Social da empresa contratada)
    const razaoSocial = (row[idxN] || '').trim() || 'EMPRESA CONTRATADA';

    // 5. Planilha (coluna Z) -> Sistema (Fiscal Titular)
    const fiscal = (row[idxZ] || '').trim() || 'FISCAL DESIGNADO';

    // 6. Planilha (coluna AA) -> Sistema (Fiscal Substituto)
    const substituto = (row[idxAA] || '').trim();

    // 7. Planilha (coluna S) -> Sistema (Valor contratado)
    const valorContratado = parseCurrencyInput(row[idxS]);

    // Reject divider/blank rows that have no real description, no company and zero value
    if (
      (!descricao || descricao === '-' || descricao === '--') &&
      (!row[idxN] || !row[idxN].trim()) &&
      valorContratado === 0
    ) {
      continue;
    }

    // 8. Planilha (coluna AF) -> Sistema (Saldo do contrato)
    let saldoContrato = valorContratado;
    if (row[idxAF] !== undefined && row[idxAF].trim()) {
      saldoContrato = parseCurrencyInput(row[idxAF]);
    }

    // 9. Planilha (coluna I) -> Início da vigência do contrato
    // 10. Planilha (coluna J) -> Fim da vigência do contrato
    const colIIndex = colLetterToIndex('I'); // 8: Coluna I (Início de vigência)
    const colJIndex = colLetterToIndex('J'); // 9: Coluna J (Fim de vigência)

    let rawDataInicio = '';
    let rawDataFim = '';

    // Prioridade absoluta: Coluna I (índice 8) e Coluna J (índice 9) da planilha
    if (colIIndex < row.length && isValidDateOrSerial(row[colIIndex])) {
      rawDataInicio = row[colIIndex];
    } else if (idxI >= 0 && idxI < row.length && isValidDateOrSerial(row[idxI])) {
      rawDataInicio = row[idxI];
    } else if (colIIndex < row.length && (row[colIIndex] || '').trim()) {
      rawDataInicio = row[colIIndex];
    } else if (idxI >= 0 && idxI < row.length && (row[idxI] || '').trim()) {
      rawDataInicio = row[idxI];
    }

    if (colJIndex < row.length && isValidDateOrSerial(row[colJIndex])) {
      rawDataFim = row[colJIndex];
    } else if (idxJ >= 0 && idxJ < row.length && isValidDateOrSerial(row[idxJ])) {
      rawDataFim = row[idxJ];
    } else if (colJIndex < row.length && (row[colJIndex] || '').trim()) {
      rawDataFim = row[colJIndex];
    } else if (idxJ >= 0 && idxJ < row.length && (row[idxJ] || '').trim()) {
      rawDataFim = row[idxJ];
    }

    // Se por ventura a célula de início contiver o período completo (ex: "01/10/2024 A 07/02/2025" ou "14/01/2025 - 10/12/2025")
    if (rawDataInicio && (rawDataInicio.includes(' A ') || rawDataInicio.includes(' a ') || rawDataInicio.includes(' - '))) {
      const parts = rawDataInicio.split(/\s+(?:[aA]|-)\s+/);
      if (parts.length >= 2 && isValidDateOrSerial(parts[0])) {
        if (!rawDataFim || !isValidDateOrSerial(rawDataFim)) {
          rawDataFim = parts[1];
        }
        rawDataInicio = parts[0];
      }
    }

    const dataInicio = normalizeDateStr(rawDataInicio, '01/01/2025');
    const dataFim = normalizeDateStr(rawDataFim, '31/12/2026');

    // Extras
    const cnpj = (row[idxO] || '').trim();

    // Coluna M: Código do Credor (FIPLAN)
    // CRITICAL: Must strictly import the creditor code from Coluna M and NEVER the CNPJ!
    let codigoCredor = '';
    const colMIndex = colLetterToIndex('M'); // 12: Coluna M

    // Check detected idxM column (must not be CNPJ or header text)
    if (idxM >= 0 && idxM < row.length && row[idxM]) {
      const val = (row[idxM] || '').trim();
      if (!isCnpjValue(val) && !val.toUpperCase().includes('CÓDIGO') && !val.toUpperCase().includes('CREDOR')) {
        codigoCredor = val;
      }
    }

    // Check explicit Coluna M (index 12)
    if (!codigoCredor && colMIndex < row.length && row[colMIndex]) {
      const val = (row[colMIndex] || '').trim();
      if (!isCnpjValue(val) && !val.toUpperCase().includes('CÓDIGO') && !val.toUpperCase().includes('CREDOR')) {
        codigoCredor = val;
      }
    }

    // Check column immediately preceding Razão Social (idxN - 1)
    if (!codigoCredor && idxN > 0 && idxN - 1 < row.length && row[idxN - 1]) {
      const val = (row[idxN - 1] || '').trim();
      if (!isCnpjValue(val) && !val.toUpperCase().includes('CÓDIGO') && !val.toUpperCase().includes('CREDOR')) {
        codigoCredor = val;
      }
    }

    // Check if any cell matches the official FIPLAN creditor code format (YYYY.NNNNN-D)
    if (!codigoCredor) {
      const matchCredor = row.find((c) => /\b\d{4}\.\d{4,6}-[\w\d]\b/.test((c || '').trim()));
      if (matchCredor) {
        codigoCredor = matchCredor.trim();
      }
    }

    // Fallback to official FIPLAN creditor map by CNPJ if not present in the pasted row
    if (!codigoCredor && cnpj) {
      const cleanCnpj = cnpj.trim();
      const mapped = FIPLAN_CREDORES_MAP[cleanCnpj] || 
                     FIPLAN_CREDORES_MAP[cleanCnpj.replace(/\D/g, '')] ||
                     FIPLAN_CREDORES_MAP[formatCnpj(cleanCnpj)];
      if (mapped) {
        codigoCredor = mapped;
      }
    }

    // Strict safety check: if somehow codigoCredor is still a CNPJ, discard it!
    if (isCnpjValue(codigoCredor) || (cnpj && codigoCredor === cnpj.trim())) {
      const cleanCnpj = (cnpj || '').trim();
      codigoCredor = FIPLAN_CREDORES_MAP[cleanCnpj] || FIPLAN_CREDORES_MAP[cleanCnpj.replace(/\D/g, '')] || '';
    }

    const processoSigadoc = (row[idxAE] || '').trim();
    const diasVencer = calculateDiasVencer(dataFim);

    // Format to strictly 3 characters before the slash, and year after (ex: 070/2024, 117/2025 - total 8 chars)
    const numeroFormatado = formatContractNumber(numero, dataInicio, processoSigadoc, '2024');

    const finalCodigoCredor = codigoCredor && !isCnpjValue(codigoCredor) 
      ? codigoCredor 
      : (resolveCodigoCredor('', cnpj) || undefined);

    results.push({
      id: `c-${numeroFormatado.replace(/[^0-9/]/g, '')}`,
      numero: numeroFormatado,
      processoSigadoc,
      tipo,
      razaoSocial,
      cnpj,
      codigoCredor: finalCodigoCredor,
      objeto: descricao,
      descricao: descricao,
      valorContratado,
      saldoContrato,
      valorContratadoNaoExecutado: saldoContrato,
      valorEmpenhado: 0,
      valorMedido: 0,
      valorLiquidado: 0,
      valorPago: 0,
      dataInicio,
      dataFim,
      diasVencer,
      execucaoFisica: 0,
      fiscal,
      substituto,
    });
  }

  return results;
}

// ==========================================
// 2. EMP (Planilha do Drive - Aba EMP - Empenhos)
// ==========================================
export const EMP_HEADERS = [
  'Nº DO CONTRATO',
  'CÓDIGO DO EMPENHO (NE)',
  'Nº DO PROCESSO',
  'REGIÃO / UNIDADE',
  'VALOR EMPENHADO (R$)',
  'SALDO DISPONÍVEL (R$)',
  'SALDO DO EMP (COL BM)',
  'DATA DE EMISSÃO',
  'OBSERVAÇÃO / FINALIDADE',
];

export interface FlatEmpenhoRow {
  contratoNumero: string;
  empenho: Empenho;
}

export function getAllEmpenhosFromContracts(contratos: Contrato[]): FlatEmpenhoRow[] {
  const list: FlatEmpenhoRow[] = [];
  contratos.forEach((c) => {
    (c.empenhos || []).forEach((emp) => {
      list.push({
        contratoNumero: c.numero,
        empenho: emp,
      });
    });
  });
  return list;
}

export function generateEmpDriveExport(contratos: Contrato[], delimiter = ';'): string {
  const empenhos = getAllEmpenhosFromContracts(contratos);
  const rows = empenhos.map(({ contratoNumero, empenho }) => [
    contratoNumero,
    empenho.numeroEmp,
    empenho.numeroProcesso || '',
    empenho.regiao || 'GERAL',
    fmtNum(empenho.valorTotal),
    fmtNum(empenho.saldoDisponivel),
    fmtNum(empenho.saldoEmpenho !== undefined ? empenho.saldoEmpenho : empenho.saldoDisponivel),
    empenho.dataEmissao || '',
    empenho.observacao || '',
  ]);

  if (delimiter === '\t') {
    return [EMP_HEADERS.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
  }

  const escaped = rows.map((r) =>
    r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(delimiter)
  );
  return '\uFEFF' + [EMP_HEADERS.map((h) => `"${h}"`).join(delimiter), ...escaped].join('\n');
}

function normalizeEmpHeader(raw: string | undefined): string {
  return (raw || '')
    .toUpperCase()
    .replace(/°/g, 'º')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEmpCodeValue(val: string | undefined): boolean {
  if (!val) return false;
  const s = val.trim();
  return /\b\d{5}\.\d{4}\.\d{2}\.\d{6}-\d\b/.test(s) || /\b\d{4}NE\d+\b/i.test(s);
}

function isDateCellValue(val: string | undefined): boolean {
  if (!val) return false;
  const s = val.trim();
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s);
}

function isProcessCellValue(val: string | undefined): boolean {
  if (!val) return false;
  const s = val.trim().toUpperCase();
  return (
    /^(?:SEJUS|SJUS|SESP)-PRO[-/]\d{4}\/\d+/i.test(s) ||
    /^\d{5,9}\/\d{4}$/.test(s)
  );
}

function extractContractFromEmpCell(val: string | undefined, requireExplicitLabel = false): string {
  if (!val) return '';
  const s = val.trim();
  if (!s || s === '-' || s === '--') return '';
  if (s.includes('R$') || s.includes('%')) return '';
  if (isEmpCodeValue(s)) return '';

  // Reject pure dates (DD/MM/YYYY or DD/MM/YY) unless preceded by CONTRATO label
  if (isDateCellValue(s) && !/CONTRATO/i.test(s)) return '';

  // Check explicit FIPLAN 17-digit contract code (e.g. 18101000000005725 -> 057/2025)
  const fiplanMatch = s.match(/\b18101\d*?(\d{3})(\d{2})\b/);
  if (fiplanMatch) {
    const candidate = `${fiplanMatch[1]}/20${fiplanMatch[2]}`;
    if (!isInvalidContractNumber(candidate)) return candidate;
  }

  if (requireExplicitLabel) {
    const labeled = s.match(/(?:CONTRATO\s*(?:N[º°.]?)?\s*:?\s*|N[º°.]\s*)(\d{1,4}\/\d{2,4})(?!\/\d)/i);
    if (labeled && !isInvalidContractNumber(labeled[1])) {
      return labeled[1];
    }
    return '';
  }

  // Reject process numbers unless explicitly labeled CONTRATO
  if (isProcessCellValue(s) && !/CONTRATO/i.test(s)) return '';

  // Match contract numbers like 057/2025, 35/25, N° 035/2025, 035/2025/SEJUS while avoiding DD/MM/YYYY dates
  const regex = /\b(\d{1,4})[\/\-](\d{2,4})\b(?!\/\d)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(s)) !== null) {
    // Check if the match is actually the MM/YYYY suffix of a DD/MM/YYYY date
    const before = s.slice(0, m.index);
    if (/\d{1,2}\/$/.test(before)) continue;
    const candidate = `${m[1]}/${m[2]}`;
    if (!isInvalidContractNumber(candidate)) {
      return candidate;
    }
  }

  return '';
}

function parseFirstCurrencyLine(raw: string | undefined): number {
  if (!raw) return 0;
  const firstLine = String(raw).split(/\r?\n/)[0]?.trim() || '';
  return parseCurrencyInput(firstLine);
}

function parseSecondCurrencyLine(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const lines = String(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    return parseCurrencyInput(lines[1]);
  }
  return undefined;
}

export function extractSpreadsheetTextFromArrayBuffer(
  buffer: ArrayBuffer,
  subTab: 'CONTRATOS' | 'EMP' | 'LIQ'
): string {
  const wb = XLSX.read(buffer, { type: 'array' });
  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) return '';

  if (subTab === 'EMP') {
    // 1. Check if there is a dedicated consolidated EMP sheet
    const empSheetName = wb.SheetNames.find((name) => {
      const u = name.trim().toUpperCase();
      return (
        u === 'EMP' ||
        u === 'TODOS_EMPENHOS_EMP' ||
        u === 'EMPENHOS' ||
        u.includes('EMP ') ||
        u.includes('EMPENHO')
      );
    });
    if (empSheetName && wb.Sheets[empSheetName]) {
      return XLSX.utils.sheet_to_csv(wb.Sheets[empSheetName], { FS: '\t' });
    }

    // 2. Support "Planilha Completa (.xlsx)" where each contract has its own sheet (e.g. 035-2025)
    const combinedLines: string[] = [
      ['Nº DO CONTRATO', 'Nº EMP', 'PROCESSO', 'REGIÃO', 'VALOR', 'SALDO DISP.'].join('\t'),
    ];
    let extractedAny = false;

    for (const sName of wb.SheetNames) {
      const upperName = sName.trim().toUpperCase();
      if (upperName === 'RESUMO DO CONTRATO' || upperName === 'CONTRATOS' || upperName.includes('LIQUIDAC')) {
        continue;
      }
      const ws = wb.Sheets[sName];
      if (!ws) continue;
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false });
      if (!aoa || aoa.length === 0) continue;

      let sheetContract = '';
      for (let r = 0; r < Math.min(5, aoa.length); r++) {
        const lineText = (aoa[r] || []).map((c) => String(c ?? '')).join(' ');
        const found = extractContractFromEmpCell(lineText, true) || extractContractFromEmpCell(sName.replace('-', '/'));
        if (found) {
          sheetContract = formatContractNumber(found);
          break;
        }
      }
      if (!sheetContract) {
        const fromName = extractContractFromEmpCell(sName.replace('-', '/'));
        if (fromName) sheetContract = formatContractNumber(fromName);
      }

      // Find the NOTAS DE EMPENHO header row inside the contract tab
      let empHdrIdx = -1;
      for (let r = 0; r < aoa.length; r++) {
        const rowCells = (aoa[r] || []).map((c) => normalizeEmpHeader(String(c ?? '')));
        if (
          rowCells.some((c) => c === 'Nº EMP' || c === 'Nº DO EMPENHO' || c === 'Nº EMPENHO') &&
          rowCells.some((c) => c.includes('VALOR') || c.includes('PROCESSO') || c.includes('SALDO'))
        ) {
          empHdrIdx = r;
          break;
        }
      }

      if (empHdrIdx >= 0 && sheetContract) {
        for (let r = empHdrIdx + 1; r < aoa.length; r++) {
          const row = aoa[r] || [];
          const firstCell = normalizeEmpHeader(String(row[0] ?? ''));
          if (
            firstCell.includes('ORDENS DE SERVIÇO') ||
            firstCell.includes('HISTÓRICO DE MEDIÇÕES') ||
            firstCell.startsWith('TOTAL') ||
            firstCell.includes('NENHUM EMPENHO')
          ) {
            break;
          }
          const empCode = String(row[0] ?? '').trim();
          if (!empCode) continue;
          extractedAny = true;
          combinedLines.push(
            [
              sheetContract,
              empCode,
              String(row[1] ?? '').trim(),
              String(row[2] ?? '').trim(),
              String(row[3] ?? '').trim(),
              String(row[4] ?? '').trim(),
            ].join('\t')
          );
        }
      }
    }

    if (extractedAny) {
      return combinedLines.join('\n');
    }
  } else if (subTab === 'CONTRATOS') {
    const matched = wb.SheetNames.find((s) => {
      const u = s.toUpperCase();
      return u.includes('CONTRATO') || u.includes('FIPLAN') || u.includes('CONSULTAR');
    });
    const sheet = wb.Sheets[matched || wb.SheetNames[0]];
    if (sheet) return XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
  } else if (subTab === 'LIQ') {
    const matched = wb.SheetNames.find((s) => {
      const u = s.toUpperCase();
      return u === 'LIQ' || u.includes('PAG') || u.includes('LIQUIDA');
    });
    const sheet = wb.Sheets[matched || wb.SheetNames[0]];
    if (sheet) return XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
  }

  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  return firstSheet ? XLSX.utils.sheet_to_csv(firstSheet, { FS: '\t' }) : '';
}

export function parseEmpFromDriveText(raw: string, defaultRegiao = 'GERAL', targetContratoNumero?: string): FlatEmpenhoRow[] {
  const matrix = parseDelimitedText(raw);
  if (matrix.length === 0) return [];

  // Detect any contract number banner in the top lines (e.g. copied from "CONTRATO 035/2025" contract sheet)
  let bannerContratoNumero = '';
  for (let r = 0; r < Math.min(6, matrix.length); r++) {
    const joined = matrix[r].map((c) => (c || '').trim()).join(' ');
    if (/CONTRATO/i.test(joined) && !joined.toUpperCase().includes('Nº DO CONTRATO')) {
      const found = extractContractFromEmpCell(joined, true);
      if (found) {
        bannerContratoNumero = found;
        break;
      }
    }
  }

  // Locate header row dynamically (within the first 25 rows), guarding strictly against data rows
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(25, matrix.length); r++) {
    const rowCells = matrix[r];
    const hasDataSignals = rowCells.some(
      (c) =>
        isEmpCodeValue(c) ||
        isDateCellValue(c) ||
        /R\$\s*[\d.,]+/i.test((c || '').trim())
    );
    if (hasDataSignals) continue;

    const rowStr = rowCells.map((c) => normalizeEmpHeader(c)).join(' ');
    const hasEmpHeader =
      rowStr.includes('Nº EMP') ||
      rowStr.includes('Nº DE EMP') ||
      rowStr.includes('Nº DO EMP') ||
      rowStr.includes('NUMERO EMP') ||
      rowStr.includes('EMPENHO') ||
      rowStr.includes('NOTA DE EMPENHO');
    const hasSupportingCol =
      rowStr.includes('PROCESSO') ||
      rowStr.includes('VALOR') ||
      rowStr.includes('SALDO') ||
      rowStr.includes('CONTRATO') ||
      rowStr.includes('REGIÃO') ||
      rowStr.includes('REGIAO');

    if (
      rowStr.includes('FALTA LIQUIDAR') ||
      rowStr.includes('SALDO DO EMP') ||
      (rowStr.includes('SALDO EMP') && (rowStr.includes('CONTRATO') || rowStr.includes('VALOR') || rowStr.includes('LIQ'))) ||
      (hasEmpHeader && hasSupportingCol)
    ) {
      headerRowIndex = r;
      break;
    }
  }

  // Exact FIPLAN EMP column positions:
  // Coluna B (1): Nº de EMP
  // Coluna D (3): Nº do Processo
  // Coluna E (4): Data de Emissão
  // Coluna K (10): Histórico
  // Coluna BH (59): Valor Total do Empenho (Valor EMP)
  // Coluna BJ (61): Saldo EMP / Contrato Vinculado
  // Coluna BK (62): Nº Contrato (ex: 057/2025)
  // Coluna BL (63): Valor Liq
  // Coluna BM (64): Falta Liquidar por Emp (Saldo do EMP)
  // Coluna BO (66): Status da Liq no Emp
  // Coluna BP (67): Região
  let idxB = colLetterToIndex('B');       // 1: Nº de EMP
  let idxD = colLetterToIndex('D');       // 3: Nº do Processo
  let idxDataEmissao = 4;                 // 4: Data de Emissão
  let idxHist = colLetterToIndex('K');    // 10: Histórico
  let idxBH = colLetterToIndex('BH');     // 59: Valor Total do Empenho
  let idxBJ = colLetterToIndex('BJ');     // 61: Saldo EMP
  let idxBK = colLetterToIndex('BK');     // 62: Nº Contrato
  let idxBL = colLetterToIndex('BL');     // 63: Valor Liq
  let idxBM = colLetterToIndex('BM');     // 64: Falta Liquidar por Emp (Saldo do EMP)
  let idxBO = colLetterToIndex('BO');     // 66: Status da Liq no Emp
  let idxBP = colLetterToIndex('BP');     // 67: Região

  let contractCandidateCols: number[] = [];
  let primaryContractCol = -1;
  let foundExplicitBHeader = false;
  let foundExplicitDHeader = false;
  let foundExplicitBMHeader = false;
  let foundExplicitBJHeader = false;
  let foundExplicitBHHeader = false;
  let foundExplicitDataHeader = false;

  const maxColLen = matrix.reduce((max, r) => Math.max(max, r.length), 0);
  const isFullFiplanSheet = maxColLen >= 55;

  let startIndex = 0;
  if (headerRowIndex >= 0) {
    startIndex = headerRowIndex + 1;
    const headerRow = matrix[headerRowIndex];

    headerRow.forEach((h, colIdx) => {
      const s = normalizeEmpHeader(h);
      if (!s) return;

      if (
        s.includes('FALTA LIQUIDAR') ||
        s.includes('(SALDO DO EMP)') ||
        s === 'SALDO DO EMP' ||
        s.startsWith('SALDO DO EMP (') ||
        s.includes('SALDO DO EMP (COL') ||
        s === 'SALDO BM' ||
        (s.includes('SALDO') && s.includes('BM'))
      ) {
        idxBM = colIdx;
        foundExplicitBMHeader = true;
      } else if (
        s === 'SALDO EMP' ||
        s === 'SALDO DO EMPENHO' ||
        s === 'SALDO DO EMPENHO (R$)' ||
        s === 'SALDO EMPENHO' ||
        s === 'SALDO DISP.' ||
        s === 'SALDO DISP' ||
        s === 'SALDO DISPONÍVEL' ||
        s === 'SALDO DISPONIVEL' ||
        s.startsWith('SALDO DISPONÍVEL') ||
        s.startsWith('SALDO DISPONIVEL')
      ) {
        idxBJ = colIdx;
        foundExplicitBJHeader = true;
      } else if (
        s === 'Nº EMP' ||
        s === 'Nº DE EMP' ||
        s === 'Nº DO EMP' ||
        s === 'NUMERO EMP' ||
        s === 'NÚMERO EMP' ||
        s === 'Nº EMPENHO' ||
        s === 'Nº DO EMPENHO' ||
        s === 'Nº DO EMPENHO (EMP)' ||
        s === 'NUMERO DO EMPENHO' ||
        s === 'NÚMERO DO EMPENHO' ||
        s === 'NOTA DE EMPENHO' ||
        s === 'EMPENHO' ||
        s === 'EMPENHO (EMP)'
      ) {
        idxB = colIdx;
        foundExplicitBHeader = true;
      } else if (
        s === 'PROCESSO' ||
        s === 'Nº PROCESSO' ||
        s === 'Nº DO PROCESSO' ||
        s === 'NUMERO PROCESSO' ||
        (s.includes('PROCESSO') &&
          (s.includes('ORÇAMENT') || s.includes('ORCAMENT') || s.includes('PAGAMENTO') || s.includes('SIGADOC') || s.includes('Nº')))
      ) {
        idxD = colIdx;
        foundExplicitDHeader = true;
      } else if (s === 'HISTÓRICO' || s === 'HISTORICO' || s.includes('OBSERVAÇ') || s.includes('OBSERVAC') || s.includes('FINALIDADE')) {
        idxHist = colIdx;
      } else if (s === 'DATA DE EMISSÃO' || s === 'DATA DE EMISSAO' || s === 'DATA EMISSÃO' || s === 'DATA EMISSAO' || s === 'EMISSÃO' || s === 'EMISSAO') {
        idxDataEmissao = colIdx;
        foundExplicitDataHeader = true;
      } else if (
        s.includes('BH') ||
        s === 'VALOR BH' ||
        s === 'COLUNA BH' ||
        s === 'COL BH' ||
        s.includes('VALOR DO EMP (BH)') ||
        s.includes('VALOR EMP (BH)') ||
        s.includes('VALOR DO EMPENHO (BH)') ||
        s.includes('VALOR EMPENHO (BH)') ||
        (s.includes('VALOR') && s.includes('BH'))
      ) {
        idxBH = colIdx;
        foundExplicitBHHeader = true;
      } else if (
        colIdx !== colLetterToIndex('N') &&
        colIdx !== 13 &&
        !s.includes('LIQ') &&
        !s.includes('SALDO') &&
        !s.includes('CONTRATO') &&
        (s === 'VALOR' ||
          s === 'VALOR (R$)' ||
          s === 'VALOR EMP' ||
          s === 'VALOR TOTAL' ||
          s === 'VALOR TOTAL (R$)' ||
          s === 'VALOR DO EMPENHO' ||
          s === 'VALOR DO EMPENHO (R$)' ||
          s === 'VALOR DO EMP' ||
          s === 'VALOR EMPENHADO' ||
          s === 'VALOR EMPENHADO (R$)' ||
          s.includes('VALOR DO EMPENHO') ||
          s.includes('VALOR EMPENHADO') ||
          s.includes('VALOR EMP'))
      ) {
        // CRITICAL: NEVER map Column N (index 13) to idxBH in full FIPLAN sheets!
        if (!foundExplicitBHHeader) {
          idxBH = colIdx;
          foundExplicitBHHeader = true;
        }
      } else if (s.includes('VALOR LIQ')) {
        idxBL = colIdx;
      } else if (s.includes('STATUS') && s.includes('LIQ')) {
        idxBO = colIdx;
      } else if (
        s.includes('CONTRATO') &&
        !s.includes('VALOR') &&
        !s.includes('SALDO') &&
        !s.includes('OBJETO') &&
        !s.includes('TIPO') &&
        !s.includes('FISCAL') &&
        !s.includes('VIGÊNC') &&
        !s.includes('VIGENC')
      ) {
        const isPrimaryContractHeader =
          s === 'CONTRATO' ||
          s === 'Nº CONTRATO' ||
          s === 'Nº DO CONTRATO' ||
          s === 'CONTRATO VINCULADO' ||
          s === 'NUMERO CONTRATO' ||
          s === 'CONTRATO Nº';
        if (isPrimaryContractHeader) {
          contractCandidateCols.unshift(colIdx);
          if (primaryContractCol === -1) {
            primaryContractCol = colIdx;
            idxBK = colIdx;
          }
        } else {
          contractCandidateCols.push(colIdx);
          if (primaryContractCol === -1) {
            idxBK = colIdx;
          }
        }
      } else if (s.includes('REGIÃO') || s.includes('REGIAO')) {
        idxBP = colIdx;
      }
    });

    // Enforce FIPLAN Col BH (59) / BM (64) only on full FIPLAN sheets when explicit header wasn't matched
    if (!foundExplicitBHHeader && isFullFiplanSheet && maxColLen > colLetterToIndex('BH')) {
      idxBH = colLetterToIndex('BH');
    }
    if (!foundExplicitBMHeader && isFullFiplanSheet && maxColLen > colLetterToIndex('BM')) {
      idxBM = colLetterToIndex('BM');
    }
  } else {
    // No header row found: inspect sample rows to determine startIndex and column layout
    const row0 = matrix[0] || [];
    const row0HasData = row0.some(
      (cell) =>
        isEmpCodeValue(cell) ||
        isDateCellValue(cell) ||
        /R\$\s*[\d.,]+/i.test(cell || '') ||
        Boolean(extractContractFromEmpCell(cell)) ||
        /\d{5,}/.test((cell || '').replace(/[^\d]/g, ''))
    );
    startIndex = row0HasData ? 0 : 1;

    // Infer column alignment when pasted without header
    const sampleRows = matrix.slice(startIndex, Math.min(matrix.length, startIndex + 15));
    const empColHits = new Map<number, number>();
    const contractColHits = new Map<number, number>();
    const processColHits = new Map<number, number>();
    const currencyColHits = new Map<number, number>();
    const dateColHits = new Map<number, number>();

    for (const r of sampleRows) {
      r.forEach((cell, cIdx) => {
        const s = (cell || '').trim();
        if (!s) return;
        if (isEmpCodeValue(s)) {
          empColHits.set(cIdx, (empColHits.get(cIdx) || 0) + 1);
        } else if (isDateCellValue(s)) {
          dateColHits.set(cIdx, (dateColHits.get(cIdx) || 0) + 1);
        } else if (isProcessCellValue(s)) {
          processColHits.set(cIdx, (processColHits.get(cIdx) || 0) + 1);
        } else if (/^R\$\s*-?[\d.,]+$/i.test(s) || /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(s)) {
          currencyColHits.set(cIdx, (currencyColHits.get(cIdx) || 0) + 1);
        } else if (extractContractFromEmpCell(s)) {
          contractColHits.set(cIdx, (contractColHits.get(cIdx) || 0) + 1);
        }
      });
    }

    const bestCol = (map: Map<number, number>): number => {
      let best = -1;
      let maxH = 0;
      map.forEach((hits, col) => {
        if (hits > maxH) {
          maxH = hits;
          best = col;
        }
      });
      return best;
    };

    const detectedEmpCol = bestCol(empColHits);
    if (isFullFiplanSheet) {
      // Handle full FIPLAN sheet pasted starting from Col B (offset -1) instead of Col A
      const offset = detectedEmpCol >= 0 && detectedEmpCol <= 3 ? detectedEmpCol - 1 : 0;
      if (offset !== 0) {
        idxB = Math.max(0, idxB + offset);
        idxD = Math.max(0, idxD + offset);
        idxDataEmissao = Math.max(0, idxDataEmissao + offset);
        idxHist = Math.max(0, idxHist + offset);
        idxBH = Math.max(0, idxBH + offset);
        idxBJ = Math.max(0, idxBJ + offset);
        idxBK = Math.max(0, idxBK + offset);
        idxBL = Math.max(0, idxBL + offset);
        idxBM = Math.max(0, idxBM + offset);
        idxBO = Math.max(0, idxBO + offset);
        idxBP = Math.max(0, idxBP + offset);
      }
    } else {
      // Compact/system-exported table pasted without header
      if (detectedEmpCol >= 0) {
        idxB = detectedEmpCol;
        foundExplicitBHeader = true;
      }
      const detectedContractCol = bestCol(contractColHits);
      if (detectedContractCol >= 0) {
        idxBK = detectedContractCol;
        contractCandidateCols = [detectedContractCol];
      }
      const detectedProcessCol = bestCol(processColHits);
      if (detectedProcessCol >= 0) {
        idxD = detectedProcessCol;
        foundExplicitDHeader = true;
      }
      const detectedDateCol = bestCol(dateColHits);
      if (detectedDateCol >= 0) {
        idxDataEmissao = detectedDateCol;
        foundExplicitDataHeader = true;
      }
      const sortedCurrencyCols = Array.from(currencyColHits.keys()).sort((a, b) => a - b);
      if (sortedCurrencyCols.length >= 1) {
        idxBH = sortedCurrencyCols[0];
        foundExplicitBHHeader = true;
      }
      if (sortedCurrencyCols.length >= 2) {
        idxBJ = sortedCurrencyCols[1];
        foundExplicitBJHeader = true;
      }
      if (sortedCurrencyCols.length >= 3) {
        idxBM = sortedCurrencyCols[2];
        foundExplicitBMHeader = true;
      }
    }
  }

  const results: FlatEmpenhoRow[] = [];
  let lastValidContratoNumero = bannerContratoNumero || '';

  for (let i = startIndex; i < matrix.length; i++) {
    const row = matrix[i];
    if (row.length < 2) continue;

    // Stop or skip non-EMP summary/section rows when copying whole contract sheets
    const firstNonEmpty = normalizeEmpHeader(row.find((c) => (c || '').trim().length > 0));
    if (!firstNonEmpty) continue;
    if (
      firstNonEmpty.startsWith('TOTAL GERAL') ||
      firstNonEmpty.startsWith('TOTAL DOS EMPENHOS') ||
      firstNonEmpty === 'SUBTOTAL' ||
      firstNonEmpty.includes('NENHUM EMPENHO CADASTRADO')
    ) {
      continue;
    }
    if (
      firstNonEmpty === 'ORDENS DE SERVIÇO (OS)' ||
      firstNonEmpty === 'HISTÓRICO DE MEDIÇÕES LANÇADAS'
    ) {
      break;
    }

    // 1. Identify Contrato Numero
    let contratoNumero = '';
    const hasExplicitContractCol = contractCandidateCols.length > 0;

    // 1.1 Check explicit header-matched contract columns
    for (const cIdx of contractCandidateCols) {
      if (cIdx >= row.length) continue;
      const found = extractContractFromEmpCell(row[cIdx]);
      if (found) {
        contratoNumero = found;
        break;
      }
    }

    // 1.2 Try Column BK and Column BJ directly (when they aren't currency/saldo headers)
    if (!contratoNumero) {
      if (idxBK < row.length) {
        contratoNumero = extractContractFromEmpCell(row[idxBK]);
      }
      if (!contratoNumero && idxBJ < row.length && !foundExplicitBJHeader) {
        contratoNumero = extractContractFromEmpCell(row[idxBJ]);
      }
    }

    // 1.3 Check non-value/non-process/non-date cells ONLY if we don't already have an explicit empty contract col or targetContratoNumero
    if (!contratoNumero && !targetContratoNumero && !hasExplicitContractCol) {
      const skipCols = new Set<number>([idxD, idxB, idxDataEmissao, idxBH, idxBL, idxBM]);
      if (foundExplicitBJHeader) skipCols.add(idxBJ);

      for (let cIdx = 0; cIdx < row.length; cIdx++) {
        if (skipCols.has(cIdx)) continue;
        const found = extractContractFromEmpCell(row[cIdx]);
        if (found) {
          contratoNumero = found;
          break;
        }
      }
    }

    // 1.4 Check histórico for "CONTRATO Nº 035/2025"
    if (!contratoNumero && idxHist < row.length) {
      const foundHist = extractContractFromEmpCell(row[idxHist], true);
      if (foundHist) {
        contratoNumero = foundHist;
      }
    }

    // 1.5 Check banner / target contract / merged-cell carry-over for compact tables
    const rowHasEmpCode = row.some((c) => isEmpCodeValue(c));
    if (!contratoNumero && bannerContratoNumero) {
      contratoNumero = bannerContratoNumero;
    }
    if (!contratoNumero && targetContratoNumero) {
      contratoNumero = targetContratoNumero;
    }
    if (!contratoNumero && !isFullFiplanSheet && lastValidContratoNumero && rowHasEmpCode) {
      contratoNumero = lastValidContratoNumero;
    }

    if (isInvalidContractNumber(contratoNumero) || !contratoNumero) {
      continue;
    }
    lastValidContratoNumero = contratoNumero;

    // 2. Saldo do EMP / Saldo Disponível (Coluna BM & BJ)
    let saldoEmpenho = 0;
    let foundBMVal = false;
    if (idxBM >= 0 && idxBM < row.length && row[idxBM] !== undefined && String(row[idxBM]).trim() !== '') {
      saldoEmpenho = parseFirstCurrencyLine(row[idxBM]);
      foundBMVal = true;
    } else if (isFullFiplanSheet && colLetterToIndex('BM') < row.length && String(row[colLetterToIndex('BM')] || '').trim() !== '') {
      saldoEmpenho = parseFirstCurrencyLine(row[colLetterToIndex('BM')]);
      foundBMVal = true;
    }

    // 3. Valor Total do Empenho (Coluna BH / header VALOR)
    const colBHIndex = colLetterToIndex('BH'); // 59
    let valorTotal = 0;

    if (
      foundExplicitBHHeader &&
      idxBH >= 0 &&
      idxBH < row.length &&
      (!isFullFiplanSheet || (idxBH !== colLetterToIndex('N') && idxBH !== 13)) &&
      String(row[idxBH] || '').trim() !== ''
    ) {
      valorTotal = parseFirstCurrencyLine(row[idxBH]);
    } else if (isFullFiplanSheet && colBHIndex < row.length && String(row[colBHIndex] || '').trim() !== '') {
      valorTotal = parseFirstCurrencyLine(row[colBHIndex]);
    } else if (
      idxBH >= 0 &&
      idxBH < row.length &&
      (!isFullFiplanSheet || (idxBH !== colLetterToIndex('N') && idxBH !== 13)) &&
      String(row[idxBH] || '').trim() !== ''
    ) {
      valorTotal = parseFirstCurrencyLine(row[idxBH]);
    }

    const rawBJ = idxBJ >= 0 && idxBJ < row.length ? row[idxBJ] : undefined;
    const saldoEMP = rawBJ !== undefined ? parseFirstCurrencyLine(rawBJ) : 0;
    const secondLineBJ = rawBJ !== undefined ? parseSecondCurrencyLine(rawBJ) : undefined;
    const valorLiq = idxBL >= 0 && idxBL < row.length ? parseFirstCurrencyLine(row[idxBL]) : 0;

    if (!foundBMVal && secondLineBJ !== undefined) {
      saldoEmpenho = secondLineBJ;
      foundBMVal = true;
    }

    if (valorTotal === 0 && saldoEMP > 0) {
      valorTotal = saldoEMP;
    }
    if (valorTotal === 0 && (valorLiq > 0 || saldoEmpenho > 0)) {
      valorTotal = valorLiq + saldoEmpenho;
    }

    const saldoDisponivel =
      foundExplicitBJHeader && rawBJ !== undefined && String(rawBJ).trim() !== ''
        ? saldoEMP
        : saldoEMP > 0
        ? saldoEMP
        : valorTotal > 0
        ? valorTotal
        : saldoEmpenho;

    if (!foundBMVal) {
      saldoEmpenho = saldoDisponivel;
    }

    // 4. Nº de EMP (Coluna B / explicit EMP header)
    let numeroEmp = (idxB >= 0 && idxB < row.length ? row[idxB] || '' : '').trim();
    const looksInvalidEmpCell =
      !numeroEmp ||
      numeroEmp.toUpperCase().includes('Nº EMP') ||
      numeroEmp.toUpperCase().includes('EXERCÍCIO') ||
      numeroEmp === '-' ||
      (!foundExplicitBHeader && !isEmpCodeValue(numeroEmp) && rowHasEmpCode);

    if (looksInvalidEmpCell) {
      const codeCell = row.find((c) => isEmpCodeValue(c));
      if (codeCell) {
        numeroEmp = codeCell.trim();
      } else if (!numeroEmp || numeroEmp === '-' || numeroEmp.toUpperCase().includes('Nº EMP')) {
        numeroEmp = `18101.0003.26.${String(i).padStart(6, '0')}-1`;
      }
    }

    // Nº do Processo (Coluna D / explicit PROCESSO header)
    let numeroProcesso = '';
    if ((foundExplicitDHeader || isFullFiplanSheet) && idxD >= 0 && idxD < row.length) {
      const cand = (row[idxD] || '').trim();
      if (cand && cand !== '-' && !/R\$\s*[\d.,]+/i.test(cand)) {
        numeroProcesso = cand;
      }
    }
    if (!numeroProcesso) {
      const procCell = row.find((c, cIdx) => cIdx !== idxB && isProcessCellValue(c));
      numeroProcesso = procCell ? procCell.trim() : 'SEJUS-PRO-2026/18234';
    }

    // Região (Coluna BP / explicit REGIÃO header)
    const regiaoCol = idxBP >= 0 && idxBP < row.length ? (row[idxBP] || '').trim() : '';
    const regiao = regiaoCol && !/R\$\s*[\d.,]+/i.test(regiaoCol) ? regiaoCol : defaultRegiao || 'GERAL';

    // Observação (Coluna BO / Histórico)
    let observacao = '';
    if (idxBO >= 0 && idxBO < row.length && row[idxBO]) {
      observacao = row[idxBO].trim();
    } else if (!isFullFiplanSheet && idxHist >= 0 && idxHist < row.length && row[idxHist]) {
      observacao = row[idxHist].trim();
    }

    // Data de Emissão
    let dataEmissao = '';
    if ((foundExplicitDataHeader || isFullFiplanSheet) && idxDataEmissao >= 0 && idxDataEmissao < row.length) {
      const candDate = (row[idxDataEmissao] || '').trim();
      if (isDateCellValue(candDate)) {
        dataEmissao = candDate;
      }
    }
    if (!dataEmissao) {
      const dateCell = row.find((c) => isDateCellValue(c));
      dataEmissao = dateCell ? dateCell.trim() : new Date().toLocaleDateString('pt-BR');
    }

    // Standardize to strictly 3 characters before the slash, and year after (ex: 070/2024, 057/2025, 130/2024)
    const contratoNumeroFormatado = formatContractNumber(contratoNumero, undefined, numeroProcesso, '2025');

    results.push({
      contratoNumero: contratoNumeroFormatado,
      empenho: {
        id: `emp-${numeroEmp.replace(/[^a-zA-Z0-9]/g, '')}-${i}`,
        numeroEmp,
        numeroProcesso,
        regiao,
        valorTotal,
        saldoDisponivel,
        saldoEmpenho,
        dataEmissao,
        observacao,
      },
    });
  }

  return results;
}

// ==========================================
// 3. LIQ (Planilha do Drive - Aba LIQ - Pagamentos e Liquidações)
// ==========================================
export const LIQ_HEADERS = [
  'Nº DO CONTRATO',
  'Nº DA LIQUIDAÇÃO (LIQ)',
  'DATA DO PAGAMENTO',
  'EMPENHO (EMP)',
  'VALOR DO PAGAMENTO (R$)',
];

export interface FlatLiqRow {
  contratoNumero: string;
  pagamento: Pagamento;
  medicao: Medicao;
}

export type FlatMedicaoRow = FlatLiqRow;

export function getAllMedicoesFromContracts(contratos: Contrato[]): FlatLiqRow[] {
  const list: FlatLiqRow[] = [];
  contratos.forEach((c) => {
    (c.pagamentos || []).forEach((pag) => {
      list.push({
        contratoNumero: c.numero,
        pagamento: pag,
        medicao: {
          id: `med-${pag.id}`,
          numeroMed: pag.ordemBancaria,
          periodo: pag.dataPagamento,
          unidadeCidade: '',
          descricao: pag.historico || `LIQUIDAÇÃO Nº ${pag.ordemBancaria}`,
          sigadoc: '',
          empenhoVinculado: pag.medicaoVinculada || '',
          valorMedicao: pag.valorBruto,
          medicaoPendente: false,
          valorPendente: 0,
          percentualFisico: 0,
          dataRegistro: pag.dataPagamento,
          observacao: '',
        },
      });
    });
  });
  return list;
}

export function generateLiqDriveExport(contratos: Contrato[], delimiter = ';'): string {
  const rows: string[][] = [];
  contratos.forEach((c) => {
    (c.pagamentos || []).forEach((p) => {
      rows.push([
        c.numero,
        p.ordemBancaria,
        p.dataPagamento || '',
        p.medicaoVinculada || '',
        fmtNum(p.valorBruto),
      ]);
    });
  });

  if (delimiter === '\t') {
    return [LIQ_HEADERS.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
  }

  const escaped = rows.map((r) =>
    r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(delimiter)
  );
  return '\uFEFF' + [LIQ_HEADERS.map((h) => `"${h}"`).join(delimiter), ...escaped].join('\n');
}

export function parseLiqFromDriveText(raw: string, contratos?: Contrato[]): FlatLiqRow[] {
  const matrix = parseDelimitedText(raw);
  if (matrix.length === 0) return [];

  // Exact Google Sheets guia LIQ columns specified by the user:
  // - Coluna G (index 6): Nº DA LIQUIDAÇÃO (LIQ)
  // - Coluna I (index 8): EMPENHO (Nº EMP)
  // - Coluna T (index 19): HISTÓRICO / CONTRATO
  // - Coluna U (index 20): DATA LIQ (NÃO é a data do pagamento!)
  // - Coluna V (index 21): DATA CRIAÇÃO (timestamp com hora)
  // - Coluna W (index 22): DATA DO PAGAMENTO ("Data p/ Pagtº") -> COLUNA CORRETA
  // - Coluna X (index 23): FORMA PAGAMENTO ("Nota de Ordem")
  // - Coluna AF (index 31): VALOR DO PAGAMENTO (Valor LIQ)
  // - Coluna DT (index 123): Nº DO CONTRATO
  let idxG = colLetterToIndex('G');   // 6: Nº DA LIQUIDAÇÃO (LIQ)
  let idxI = colLetterToIndex('I');   // 8: EMPENHO (Nº EMP)
  let idxT = colLetterToIndex('T');   // 19: HISTÓRICO
  let idxW = colLetterToIndex('W');   // 22: DATA DO PAGAMENTO (Coluna W: Data p/ Pagtº)
  let idxAF = colLetterToIndex('AF'); // 31: VALOR DO PAGAMENTO
  let idxAJ = colLetterToIndex('AJ'); // 35: TIPO DE PAGAMENTO ("P - Credor Principal")
  let idxDT = colLetterToIndex('DT'); // 123: Nº Contrato

  // Header matching helpers specifically designed to distinguish Column W from Column U, V, and X
  const isColWDataPagamentoHeader = (h: string): boolean => {
    const s = h.toUpperCase().trim();
    if (!s) return false;
    // Exclude other date/creation columns or payment method
    if (s.includes('FORMA') || s.includes('CRIA') || s.includes('ESCRIT') || s.includes('CONSIGN') || s.includes('REG')) return false;
    if (s === 'DATA LIQ' || s.startsWith('DATA LIQ') || s.includes('DATA DA LIQ')) return false;

    // Must match Column W header ("Data p/ Pagtº", "Data p/ Pagto", "Data Pagamento", "Data do Pagamento", "Data p/ Pagt")
    return (
      s.includes('DATA P/ PAGT') ||
      s.includes('DATA P/PAGT') ||
      s.includes('DATA P/ PAGTO') ||
      s.includes('DATA P/PAGTO') ||
      s.includes('DATA P/ PAG') ||
      s.includes('DATA DO PAGAMENTO') ||
      s.includes('DATA PAGAMENTO') ||
      s.includes('DATA PAGTO') ||
      s.includes('DATA PAGT') ||
      (s.includes('DATA') && s.includes('PAG')) ||
      (s.includes('DT') && s.includes('PAG'))
    );
  };

  const isColGNumeroLiqHeader = (h: string): boolean => {
    const s = h.toUpperCase().trim();
    if (!s) return false;
    if (s.includes('DATA') || s.includes('VALOR') || s.includes('ESCRIT') || s.includes('PAGT') || s.includes('PAG') || s.includes('CRIA')) return false;
    return (
      s === 'Nº LIQ' ||
      s === 'NO LIQ' ||
      s === 'N° LIQ' ||
      s === 'LIQ' ||
      s.includes('Nº DA LIQUIDAÇÃO') ||
      s.includes('NO DA LIQUIDAÇÃO') ||
      s.includes('NÚMERO DA LIQUIDAÇÃO') ||
      s.includes('NUMERO DA LIQUIDAÇÃO') ||
      s === 'LIQUIDAÇÃO' ||
      s === 'LIQUIDACAO'
    );
  };

  const isColIEmpenhoHeader = (h: string): boolean => {
    const s = h.toUpperCase().trim();
    if (!s) return false;
    if (s.includes('DATA') || s.includes('VALOR') || s.includes('LIQ')) return false;
    return (
      s === 'Nº EMP' ||
      s === 'NO EMP' ||
      s === 'N° EMP' ||
      s === 'EMP' ||
      s.includes('EMPENHO') ||
      s.includes('Nº DE EMP') ||
      s.includes('NO DE EMP')
    );
  };

  const isColTHistoricoHeader = (h: string): boolean => {
    const s = h.toUpperCase().trim();
    if (!s) return false;
    if (s.includes('PROCESSO') || s.includes('EXTRA') || s.includes('EXTRATIDO')) return false;
    return s === 'HISTÓRICO' || s === 'HISTORICO' || s.startsWith('HISTÓRICO') || s.startsWith('HISTORICO');
  };

  const isColAFExactValorHeader = (h: string, colIndex?: number, idxWFound?: number): boolean => {
    const s = h.toUpperCase().trim();
    if (!s) return false;

    // Explicit indicators for Column AF
    if (
      s === 'VALOR LIQ' ||
      s === 'VALOR LIQ.' ||
      s === 'VALOR DA LIQ' ||
      s === 'VALOR DA LIQUIDAÇÃO' ||
      s === 'VALOR DA LIQUIDACAO' ||
      s === 'VALOR LIQUIDAÇÃO' ||
      s === 'VALOR LIQUIDACAO' ||
      s === 'VALOR LIQUIDADO' ||
      s === 'VALOR (LIQ)' ||
      s.startsWith('VALOR LIQ') ||
      s.includes('VALOR LIQ') ||
      s.includes('VALOR DA LIQ') ||
      s === 'COLUNA AF' ||
      s === 'COL AF' ||
      s === 'AF' ||
      s.includes('(AF)') ||
      s.includes('(COLUNA AF)') ||
      s.includes('COLUNA AF')
    ) {
      return true;
    }

    // Exclude other non-payment monetary columns (CPMF, limite, retenções, empenho, saldo, base)
    if (
      s.includes('CPMF') ||
      s.includes('LIMITE') ||
      s.includes('RETEN') ||
      s.includes('SALDO') ||
      s.includes('EMPENHO') ||
      s.includes('BASE')
    ) {
      return false;
    }

    // User's column header "VALOR DO PAGAMENTO" on Column AF:
    if (
      s === 'VALOR DO PAGAMENTO' ||
      s === 'VALOR PAGAMENTO' ||
      s === 'VALOR DO PAGTO' ||
      s === 'VALOR PAGTO' ||
      s === 'VALOR' ||
      s === 'VALOR (R$)' ||
      s === 'VALOR PAGO'
    ) {
      if (colIndex !== undefined) {
        if (colIndex === 31) return true; // Exact column AF in full 0-based table
        if (idxWFound !== undefined && idxWFound >= 0 && colIndex === idxWFound + 9) return true; // Exact column AF (+9 from Column W)
      }
      return true;
    }

    return false;
  };

  const isColAFValorHeader = (h: string, colIndex?: number, idxWFound?: number): boolean => {
    return isColAFExactValorHeader(h, colIndex, idxWFound);
  };

  const isColAJTipoPagamentoHeader = (h: string): boolean => {
    const s = h.toUpperCase().trim();
    if (!s) return false;
    if (s.includes('NOME') || s.includes('CPF') || s.includes('CNPJ') || s.includes('CREDOR')) return false;
    return (
      s === 'TIPO DE PAGAMENTO' ||
      s === 'TIPO PAGAMENTO' ||
      s === 'TIPO DE PAGTO' ||
      s === 'TIPO PAGTO' ||
      (s.includes('TIPO') && s.includes('PAG')) ||
      s === 'COLUNA AJ' ||
      s === 'COL AJ' ||
      s === 'AJ'
    );
  };

  const isCredorPrincipalValue = (val: string): boolean => {
    if (!val) return false;
    const s = val.toUpperCase().trim();
    return (
      s.includes('P - CREDOR PRINCIPAL') ||
      s.includes('CREDOR PRINCIPAL') ||
      s.includes('P-CREDOR PRINCIPAL') ||
      s.startsWith('P - CREDOR') ||
      s === 'P - CREDOR PRINCIPAL' ||
      s === 'P'
    );
  };

  const isCredorConsignacaoValue = (val: string): boolean => {
    if (!val) return false;
    const s = val.toUpperCase().trim();
    return (
      s.includes('CONSIGNAÇÃO') ||
      s.includes('CONSIGNACAO') ||
      s.includes('C - CREDOR') ||
      s.includes('CREDOR CONSIGNAÇÃO') ||
      s.includes('CREDOR CONSIGNACAO') ||
      s.startsWith('C -')
    );
  };

  const isColDTContratoHeader = (h: string, colIndex?: number): boolean => {
    const s = h.toUpperCase().trim();
    if (!s) return false;
    if (s.includes('CONVÊNIO') || s.includes('CONVENIO')) return false;
    if (colIndex !== undefined && colIndex === 51) return false;
    return (
      s === 'Nº CONTRATO' ||
      s === 'NO CONTRATO' ||
      s === 'CONTRATO' ||
      s.includes('Nº DO CONTRATO') ||
      s.includes('NO DO CONTRATO') ||
      s.includes('CONTRATO VINCULADO')
    );
  };

  // Detect header row by finding the row with the best header matches
  let startIndex = 0;
  let isShortTable = false;
  let foundHeaders = false;
  let headerRowIndex = -1;

  for (let r = 0; r < Math.min(matrix.length, 25); r++) {
    const row = matrix[r];
    let matchCount = 0;
    let foundDataPag = false;
    let foundValorLiq = false;

    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] || '').trim();
      if (isColWDataPagamentoHeader(cell)) {
        foundDataPag = true;
        matchCount++;
      } else if (isColAFExactValorHeader(cell)) {
        foundValorLiq = true;
        matchCount++;
      } else if (
        isColGNumeroLiqHeader(cell) ||
        isColIEmpenhoHeader(cell) ||
        isColTHistoricoHeader(cell) ||
        isColDTContratoHeader(cell)
      ) {
        matchCount++;
      }
    }

    if (foundDataPag || foundValorLiq || matchCount >= 2) {
      headerRowIndex = r;
      foundHeaders = true;
      break;
    }
  }

  if (foundHeaders && headerRowIndex >= 0) {
    const headerRow = matrix[headerRowIndex];
    startIndex = headerRowIndex + 1;

    if (headerRow.length <= 18) {
      isShortTable = true;
    }

    let foundExactColAF = false;

    for (let c = 0; c < headerRow.length; c++) {
      const h = headerRow[c] || '';
      if (isColWDataPagamentoHeader(h)) {
        idxW = c; // Column W: Data p/ Pagtº
      } else if (isColGNumeroLiqHeader(h)) {
        idxG = c;
      } else if (isColIEmpenhoHeader(h)) {
        idxI = c;
      } else if (isColTHistoricoHeader(h)) {
        idxT = c;
      } else if (isColAFExactValorHeader(h, c, idxW)) {
        if (!foundExactColAF) {
          idxAF = c; // Coluna AF: strictly "Valor LIQ" / "Valor do Pagamento"
          foundExactColAF = true;
        }
      } else if (isColAJTipoPagamentoHeader(h)) {
        idxAJ = c; // Coluna AJ: Tipo de Pagamento ("P - Credor Principal")
      } else if (isColDTContratoHeader(h, c)) {
        if (c > 55 || idxDT === colLetterToIndex('DT') || c > idxDT) {
          idxDT = c;
        }
      }
    }

    // In Google Sheets LIQ tab, Column AF ("Valor LIQ") is strictly 9 columns after Column W ("Data p/ Pagtº")
    if (!foundExactColAF && idxW >= 0 && (idxW + 9) < headerRow.length) {
      idxAF = idxW + 9;
      foundExactColAF = true;
    }

    // If table has 32 or more columns from Column A, Column AF is at index 31
    if (!foundExactColAF && headerRow.length >= 32) {
      idxAF = colLetterToIndex('AF'); // 31
      foundExactColAF = true;
    }

    // Column AJ is strictly 4 columns after Column AF (35 - 31 = 4)
    if (idxAF >= 0 && (idxAF + 4) < headerRow.length && (idxAJ < 0 || idxAJ === colLetterToIndex('AJ'))) {
      idxAJ = idxAF + 4;
    }
  } else {
    // If no header row found:
    if (matrix[0].length >= 30) {
      idxG = colLetterToIndex('G');   // 6
      idxI = colLetterToIndex('I');   // 8
      idxT = colLetterToIndex('T');   // 19
      idxW = colLetterToIndex('W');   // 22 (Coluna W: Data p/ Pagtº)
      idxAF = colLetterToIndex('AF'); // 31 (Coluna AF: Valor LIQ)
      idxAJ = colLetterToIndex('AJ'); // 35 (Coluna AJ: Tipo de Pagamento)
      idxDT = colLetterToIndex('DT'); // 123
      startIndex = 0;
    } else {
      isShortTable = true;
      startIndex = 0;
    }
  }

  const results: FlatLiqRow[] = [];

  for (let i = startIndex; i < matrix.length; i++) {
    const row = matrix[i];
    if (row.length === 0) continue;

    let rawNumeroLiq = '';
    let rawEmpenho = '';
    let rawData = '';
    let rawValor = '';
    let rawContrato = '';
    let rawHistorico = '';

    // CASE 1: Single column paste (User selected only Column AF "Valor LIQ" directly from the sheet)
    if (row.length === 1) {
      const singleCell = (row[0] || '').trim();
      const num = parseCurrencyInput(singleCell);
      if (num > 0) {
        rawValor = singleCell;
        rawData = '29/05/2026';
        rawHistorico = 'VALOR DO PAGAMENTO - GUIA LIQ (COLUNA AF)';
      } else {
        continue;
      }
    } else if (isShortTable || (row.length <= 18 && row.length >= 2)) {
      // Check if slice starts with Column W (Data p/ Pagtº) as shown in image.png
      const firstCell = (row[0] || '').trim();
      const isFirstCellDate = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(firstCell);
      const isSliceStartingColW = idxW === 0 || (isFirstCellDate && row.length >= 8 && row.length <= 18);

      if (isSliceStartingColW) {
        // Direct mapping for slice starting at Column W (Columns W through AF/AH as in image.png):
        // Col 0: Data p/ Pagtº (Coluna W)
        // Col 1: Forma Pagtº ("Nota de Ordem", Coluna X)
        // Col 6: Situação ("LIQ Normal", Coluna AC)
        // Col 7: Tipo de Despesa ("Compras e Serviços", Coluna AD)
        // Col 9: VALOR LIQ (Coluna AF - EXACT VALUE!)
        rawData = firstCell;
        const targetColAF = (idxAF >= 0 && idxAF < row.length) ? idxAF : 9;
        rawValor = (row[targetColAF] || '').trim();

        // If target was empty or zero, search cells for decimal currency value (must contain comma)
        if (parseCurrencyInput(rawValor) === 0) {
          for (let c = row.length - 1; c >= 0; c--) {
            const cellVal = (row[c] || '').trim();
            if (/\d+,\d{2}$/.test(cellVal)) {
              rawValor = cellVal;
              break;
            }
          }
        }

        const forma = (row[1] || '').trim();
        const situacao = (row[6] || '').trim();
        const tipoDespesa = (row[7] || '').trim();
        rawHistorico = [forma, situacao, tipoDespesa].filter(Boolean).join(' - ') || 'PAGAMENTO - NOTA DE ORDEM';
      } else if (foundHeaders) {
        rawNumeroLiq = (row[idxG < row.length ? idxG : 0] || '').trim();
        rawEmpenho = (row[idxI < row.length ? idxI : 1] || '').trim();
        rawData = (row[idxW < row.length ? idxW : 2] || '').trim();
        rawHistorico = (row[idxT < row.length && idxT >= 0 ? idxT : -1] || '').trim();
        const afColTarget = idxAF < row.length && idxAF >= 0
          ? idxAF
          : (idxW >= 0 && (idxW + 9) < row.length ? (idxW + 9) : 9);
        rawValor = (row[afColTarget] || '').trim();
        rawContrato = (row[idxDT < row.length ? idxDT : 4] || '').trim();
      } else {
        // Smart heuristic for headless slice:
        let datetimeCol = -1;
        let valorCol = -1;
        let empCol = -1;
        let liqCol = -1;
        const pureDateCols: number[] = [];

        for (let c = 0; c < row.length; c++) {
          const val = (row[c] || '').trim();
          if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\s+\d{1,2}:\d{2}/.test(val)) {
            datetimeCol = c;
          } else if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(val)) {
            pureDateCols.push(c);
          } else if (empCol === -1 && (/\b\d{5}\.\d{4}\./.test(val) || val.includes('NE') || /^\d{4}NE\d+/.test(val))) {
            empCol = c;
          } else if (liqCol === -1 && /^\d{5,}\.\d{4}/.test(val)) {
            liqCol = c;
          }
        }

        let targetDateCol = -1;
        if (datetimeCol !== -1 && pureDateCols.some((c) => c === datetimeCol + 1)) {
          targetDateCol = datetimeCol + 1;
        } else if (pureDateCols.length >= 2) {
          targetDateCol = pureDateCols[1];
        } else if (pureDateCols.length === 1) {
          targetDateCol = pureDateCols[0];
        }

        // Column AF ("Valor LIQ") is 9 columns after Column W ("Data p/ Pagtº")
        if (targetDateCol !== -1 && (targetDateCol + 9) < row.length) {
          const candidateVal = (row[targetDateCol + 9] || '').trim();
          if (parseCurrencyInput(candidateVal) > 0) {
            valorCol = targetDateCol + 9;
          }
        }

        if (valorCol === -1) {
          for (let c = 0; c < row.length; c++) {
            const val = (row[c] || '').trim();
            if (/^\d{1,2}[\/\-\.]\d{1,2}/.test(val)) continue;
            if (/^\d{5,}\.\d{4}/.test(val)) continue;
            if (/\b\d{1,4}\/\d{2,4}\b/.test(val)) continue;
            if (/\d+,\d{2}$/.test(val)) {
              if (parseCurrencyInput(val) > 0) {
                valorCol = c;
                break;
              }
            }
          }
        }

        rawNumeroLiq = (row[liqCol !== -1 ? liqCol : -1] || '').trim();
        rawEmpenho = (row[empCol !== -1 ? empCol : -1] || '').trim();
        rawData = (row[targetDateCol !== -1 ? targetDateCol : (idxW < row.length ? idxW : 0)] || '').trim();
        rawValor = (row[valorCol !== -1 ? valorCol : (targetDateCol !== -1 && (targetDateCol + 9) < row.length ? targetDateCol + 9 : 9)] || '').trim();
      }

      if (!rawHistorico) {
        const histCell = row.find(
          (c) =>
            c.toUpperCase().includes('CONTRATO:') ||
            c.toUpperCase().includes('VIGÊNCIA') ||
            c.toUpperCase().includes('VIGENCIA')
        );
        if (histCell) rawHistorico = histCell.trim();
      }
    } else {
      // Full sheet copy (Col G, Col I, Col T, Col W, Col AF, Col DT)
      // Index 6 is strictly Column G (Nº LIQ)
      // Index 8 is strictly Column I (EMP)
      // Index 19 is strictly Column T (Histórico)
      // Index 22 is strictly Column W (Data p/ Pagtº)
      // Index 31 is strictly Column AF (Valor LIQ)
      rawNumeroLiq = (row[idxG] || '').trim();
      rawEmpenho = (row[idxI] || '').trim();
      rawData = (row[idxW] || '').trim();
      rawHistorico = (row[idxT] || '').trim();

      if (!rawHistorico) {
        const histCell = row.find(
          (c) =>
            c.toUpperCase().includes('CONTRATO:') ||
            c.toUpperCase().includes('VIGÊNCIA') ||
            c.toUpperCase().includes('VIGENCIA')
        );
        if (histCell) rawHistorico = histCell.trim();
      }

      // Coluna AF is strictly index 31 (0-based) from Column A
      const colAFIndex = (idxAF >= 0 && idxAF < row.length) ? idxAF : colLetterToIndex('AF');
      if (colAFIndex < row.length && parseCurrencyInput(row[colAFIndex]) > 0) {
        rawValor = (row[colAFIndex] || '').trim();
      } else if (colLetterToIndex('AF') < row.length && parseCurrencyInput(row[colLetterToIndex('AF')]) > 0) {
        rawValor = (row[colLetterToIndex('AF')] || '').trim();
      }
      rawContrato = (row[idxDT < row.length ? idxDT : -1] || '').trim();
    }

    // High-precision fallback for Column AF ("Valor LIQ") if rawValor is 0 or empty
    if (!rawValor || parseCurrencyInput(rawValor) === 0) {
      if (colLetterToIndex('AF') < row.length && parseCurrencyInput(row[colLetterToIndex('AF')]) > 0) {
        rawValor = row[colLetterToIndex('AF')].trim();
      } else if (idxAF >= 0 && idxAF < row.length && parseCurrencyInput(row[idxAF]) > 0) {
        rawValor = row[idxAF].trim();
      } else if (idxW >= 0 && (idxW + 9) < row.length && parseCurrencyInput(row[idxW + 9]) > 0) {
        rawValor = row[idxW + 9].trim();
      } else {
        // Search row for any cell containing a decimal monetary amount with comma (e.g. 242.220,83)
        // Explicitly reject plain integers (like organ/unit code 51)!
        for (let c = 0; c < row.length; c++) {
          const val = (row[c] || '').trim();
          if (/^\d{1,2}[\/\-\.]\d{1,2}/.test(val)) continue;
          if (/^\d{5,}\.\d{4}/.test(val)) continue;
          if (/\b\d{1,4}\/\d{2,4}\b/.test(val)) continue;
          if (/\d+,\d{2}$/.test(val)) {
            const num = parseCurrencyInput(val);
            if (num > 0) {
              rawValor = val;
              break;
            }
          }
        }
      }
    }

    // =========================================================================
    // FILTRO OBRIGATÓRIO DA COLUNA AJ (Tipo de Pagamento):
    // "só alimente o sistema com as informações se na coluna AJ da planilha guia LIQ constar o texto 'P - Credor Principal'."
    // =========================================================================
    let rawTipoPagamento = '';

    // 1. Verificar coluna detectada idxAJ
    if (idxAJ >= 0 && idxAJ < row.length) {
      rawTipoPagamento = (row[idxAJ] || '').trim();
    }
    // 2. Fallback relativo à Coluna AF: Coluna AJ fica estritamente 4 colunas após Coluna AF (35 - 31 = 4)
    if (!rawTipoPagamento && idxAF >= 0 && (idxAF + 4) < row.length) {
      rawTipoPagamento = (row[idxAF + 4] || '').trim();
    }
    // 3. Fallback índice absoluto da Coluna AJ (índice 35 a partir da Coluna A)
    if (!rawTipoPagamento && colLetterToIndex('AJ') < row.length) {
      rawTipoPagamento = (row[colLetterToIndex('AJ')] || '').trim();
    }
    // 4. Fallback: procurar nas células da linha se alguma contém "P - Credor Principal" ou "C - Credor Consignação"
    if (!rawTipoPagamento) {
      const matchCredor = row.find((c) => isCredorPrincipalValue(c) || isCredorConsignacaoValue(c));
      if (matchCredor) {
        rawTipoPagamento = matchCredor.trim();
      }
    }

    // Se o tipo de pagamento estiver presente nos dados da linha:
    if (rawTipoPagamento) {
      // SÓ alimenta o sistema se contiver "P - Credor Principal"
      if (!isCredorPrincipalValue(rawTipoPagamento)) {
        // Ignora linhas de consignação ("C - Credor Consignação") ou outros tipos
        continue;
      }
    } else if (row.length >= 36) {
      // Se a linha tiver largura completa para a Coluna AJ (>= 36 colunas) e tiver valor não principal, ignora
      const valColAJ = (row[colLetterToIndex('AJ')] || '').trim();
      if (valColAJ && !isCredorPrincipalValue(valColAJ)) {
        continue;
      }
    }

    // Skip rows where no payment value could be extracted from Column AF
    const valorPagamento = parseCurrencyInput(rawValor);
    if (valorPagamento <= 0) continue;

    // Resolve Contract Number:
    // 1. Check Coluna DT or detected contract column
    if (isInvalidContractNumber(rawContrato) || !rawContrato.includes('/')) {
      for (let c = row.length - 1; c >= 0; c--) {
        const cell = (row[c] || '').trim();
        const contratoMatch = cell.match(/CONTRATO\s*(?:N[º°.]?)?\s*:?\s*(\d{1,4}\/\d{2,4})/i);
        if (contratoMatch && !isInvalidContractNumber(contratoMatch[1])) {
          rawContrato = contratoMatch[1];
          break;
        }
        const dateRegex = /\d{1,2}\/\d{1,2}\/\d{4}/;
        if (!dateRegex.test(cell)) {
          const match = cell.match(/\b(\d{1,4}\/\d{2,4})\b/);
          if (match && !isInvalidContractNumber(match[1])) {
            rawContrato = match[1];
            break;
          }
        }
      }
    }

    // Skip empty or invalid header rows
    const upperLiq = (rawNumeroLiq || '').toUpperCase();
    if (
      upperLiq === 'Nº LIQ' ||
      upperLiq === 'LIQ' ||
      upperLiq === 'Nº DA LIQUIDAÇÃO' ||
      upperLiq === 'DATA LIQ' ||
      upperLiq.includes('LIQUIDAÇÃO')
    ) {
      continue;
    }

    // 2. Match contract via EMPENHO (Coluna I) against existing contracts
    if ((isInvalidContractNumber(rawContrato) || !rawContrato) && contratos && rawEmpenho) {
      const cleanEmpDigits = rawEmpenho.replace(/\D/g, '');
      if (cleanEmpDigits.length >= 4) {
        const matched = contratos.find((c) =>
          (c.empenhos || []).some((e) => {
            const eDigits = (e.numeroEmp || '').replace(/\D/g, '');
            return eDigits && (eDigits.includes(cleanEmpDigits) || cleanEmpDigits.includes(eDigits));
          })
        );
        if (matched) {
          rawContrato = matched.numero;
        }
      }
    }

    // 3. If still not found and only 1 contract in list, link to it (e.g. from PagamentosTab)
    if ((isInvalidContractNumber(rawContrato) || !rawContrato) && contratos && contratos.length === 1) {
      rawContrato = contratos[0].numero;
    }

    // 4. If still not found and multiple contracts exist in system, assign the first contract
    // so data is never discarded, allowing review and reassignment in SettingsModal
    if ((isInvalidContractNumber(rawContrato) || !rawContrato) && contratos && contratos.length > 0) {
      rawContrato = contratos[0].numero;
    }

    if (isInvalidContractNumber(rawContrato)) {
      rawContrato = '070/2024';
    }

    const contratoNumero = formatContractNumber(rawContrato, undefined, undefined, '2024');
    const dataPagamento = normalizeDateStr(rawData, '29/05/2026');

    // Find linked contract to get primary empenho if none found in slice
    const linkedContract = contratos ? contratos.find((c) => isSameContractNumber(c.numero, contratoNumero)) : undefined;
    let empenhoVinculado = rawEmpenho;
    if (!empenhoVinculado || empenhoVinculado === 'Não' || empenhoVinculado === 'Sim' || empenhoVinculado === '-') {
      empenhoVinculado = linkedContract?.empenhos?.[0]?.numeroEmp || '-';
    }

    // Mask Nº da Liquidação: standard 18 digits (00000.0000.00.000000-0)
    const numeroLiqLimpo = (rawNumeroLiq || '').replace(/[^\d.-]/g, '');
    const ordemBancariaFormatada =
      /\d{5,}/.test(numeroLiqLimpo)
        ? formatNumeroLiquidacaoInput(numeroLiqLimpo)
        : `00000.0000.26.${String(i + 1).padStart(6, '0')}-0`;

    let finalHistorico = (rawHistorico || '').trim();
    if (!finalHistorico) {
      if (linkedContract?.dataInicio && linkedContract?.dataFim) {
        finalHistorico = `CONTRATO: ${contratoNumero}/SESP - VIGÊNCIA: ${linkedContract.dataInicio} A ${linkedContract.dataFim}`;
      } else {
        finalHistorico = `CONTRATO: ${contratoNumero}/SESP`;
      }
    }

    const pagamento: Pagamento = {
      id: `pag-drive-${ordemBancariaFormatada.replace(/[^a-zA-Z0-9]/g, '') || i}-${i}-${Date.now()}`,
      ordemBancaria: ordemBancariaFormatada,
      dataPagamento: dataPagamento,
      medicaoVinculada: empenhoVinculado,
      sigadoc: extractSigadocFromHistorico(finalHistorico) || '',
      valorBruto: valorPagamento,
      retencoes: { inss: 0, irrf: 0, iss: 0 },
      valorLiquido: valorPagamento,
      status: 'PAGO',
      historico: finalHistorico,
    };

    const medicao: Medicao = {
      id: `med-drive-${ordemBancariaFormatada.replace(/[^a-zA-Z0-9]/g, '') || i}-${i}-${Date.now()}`,
      numeroMed: `LIQ ${ordemBancariaFormatada.slice(-8) || ordemBancariaFormatada}`,
      sigadoc: '',
      periodo: dataPagamento,
      unidadeCidade: '',
      descricao: `LIQUIDAÇÃO Nº ${ordemBancariaFormatada}`,
      empenhoVinculado: empenhoVinculado,
      valorMedicao: valorPagamento,
      medicaoPendente: false,
      valorPendente: 0,
      percentualFisico: 0,
      dataRegistro: dataPagamento,
      observacao: `Nº LIQ: ${ordemBancariaFormatada} | EMP: ${empenhoVinculado}`,
    };

    results.push({
      contratoNumero,
      pagamento,
      medicao,
    });
  }

  return results;
}

// Download helper for browser
export function triggerFileDownload(
  content: string | Blob | ArrayBuffer | Uint8Array,
  filename: string,
  mimeType = 'text/csv;charset=utf-8;'
) {
  const blob = content instanceof Blob ? content : new Blob([content as any], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface MultiSheetExportOptions {
  includeIndividualContractSheets?: boolean;
  includeConsolidatedSheets?: boolean;
}

/**
 * Gera uma pasta de trabalho completa (.xlsx) para o Google Drive / Excel contendo:
 * - 1ª Guia: CONTRATOS (Todos os dados cadastrais do contrato semelhantes à página principal do sistema)
 * - 2ª Guia em diante: Cada contrato com seus dados detalhados de empenhos (EMP) e medições/liquidações (LIQ)
 * - Guias consolidadas opcionais: TODOS_EMPENHOS_EMP e TODAS_LIQUIDACOES_LIQ
 */
export function generateMultiSheetWorkbookBlob(
  contratos: Contrato[],
  options: MultiSheetExportOptions = {}
): Blob {
  const {
    includeIndividualContractSheets = true,
    includeConsolidatedSheets = true,
  } = options;

  const wb = XLSX.utils.book_new();

  // =========================================================================
  // 1ª GUIA: CONTRATOS (PAINEL PRINCIPAL)
  // Semelhante à página principal do sistema com todas as colunas
  // =========================================================================
  const contratosHeaders = [
    'Nº DO CONTRATO',
    'PROCESSO SIGADOC',
    'TIPO DE CONTRATO',
    'DESCRIÇÃO / OBJETO',
    'RAZÃO SOCIAL',
    'CNPJ',
    'CÓDIGO CREDOR',
    'FISCAL TITULAR',
    'FISCAL SUBSTITUTO',
    'VALOR CONTRATADO (R$)',
    'SALDO DO CONTRATO (R$)',
    'VALOR EMPENHADO (R$)',
    'VALOR MEDIDO (R$)',
    'VALOR PAGO (R$)',
    'SALDO A EMPENHAR (R$)',
    'SALDO A LIQUIDAR (R$)',
    'DATA INÍCIO (VIGÊNCIA)',
    'DATA FIM (VIGÊNCIA)',
    'DIAS P/ VENCER',
    'EXECUÇÃO FÍSICA (%)',
    'STATUS VIGÊNCIA',
    'QTD EMPENHOS',
    'QTD MEDIÇÕES',
    'QTD PAGAMENTOS',
  ];

  const contratosRows: any[][] = [contratosHeaders];

  let totalContratado = 0;
  let totalSaldo = 0;
  let totalEmpenhado = 0;
  let totalMedido = 0;
  let totalPago = 0;
  let totalSaldoEmpenhar = 0;
  let totalSaldoMedir = 0;

  contratos.forEach((c) => {
    const valContratado = c.valorContratado || 0;
    const valSaldo = c.saldoContrato || 0;
    const valEmpenhado = c.valorEmpenhado || 0;
    const valMedido = c.valorMedido || 0;
    const valPago = c.valorPago || 0;
    const saldoEmp = Math.max(0, valContratado - valEmpenhado);
    const saldoMed = Math.max(0, valContratado - valMedido);

    totalContratado += valContratado;
    totalSaldo += valSaldo;
    totalEmpenhado += valEmpenhado;
    totalMedido += valMedido;
    totalPago += valPago;
    totalSaldoEmpenhar += saldoEmp;
    totalSaldoMedir += saldoMed;

    const statusVigencia = (c.diasVencer || 0) <= 60 ? 'VENCE EM BREVE' : 'REGULAR';

    contratosRows.push([
      c.numero,
      c.processoSigadoc || '',
      c.tipo,
      c.objeto || c.descricao,
      c.razaoSocial,
      c.cnpj,
      c.codigoCredor || '',
      c.fiscal,
      c.substituto || '',
      valContratado,
      valSaldo,
      valEmpenhado,
      valMedido,
      valPago,
      saldoEmp,
      saldoMed,
      c.dataInicio || '',
      c.dataFim || '',
      c.diasVencer || 0,
      c.execucaoFisica || 0,
      statusVigencia,
      (c.empenhos || []).length,
      (c.medicoes || []).length,
      (c.pagamentos || []).length,
    ]);
  });

  // Linha de totalização geral
  contratosRows.push([
    'TOTAL GERAL',
    '',
    '',
    `${contratos.length} CONTRATOS CADASTRADOS`,
    '',
    '',
    '',
    '',
    '',
    totalContratado,
    totalSaldo,
    totalEmpenhado,
    totalMedido,
    totalPago,
    totalSaldoEmpenhar,
    totalSaldoMedir,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  const wsContratos = XLSX.utils.aoa_to_sheet(contratosRows);
  wsContratos['!cols'] = [
    { wch: 16 }, // Nº DO CONTRATO
    { wch: 24 }, // PROCESSO SIGADOC
    { wch: 20 }, // TIPO
    { wch: 45 }, // DESCRIÇÃO
    { wch: 35 }, // RAZÃO SOCIAL
    { wch: 20 }, // CNPJ
    { wch: 16 }, // CÓDIGO CREDOR
    { wch: 32 }, // FISCAL TITULAR
    { wch: 30 }, // FISCAL SUBSTITUTO
    { wch: 22 }, // VALOR CONTRATADO
    { wch: 22 }, // SALDO CONTRATO
    { wch: 22 }, // VALOR EMPENHADO
    { wch: 22 }, // VALOR MEDIDO
    { wch: 22 }, // VALOR PAGO
    { wch: 22 }, // SALDO A EMPENHAR
    { wch: 22 }, // SALDO A MEDIR
    { wch: 16 }, // DATA INÍCIO
    { wch: 16 }, // DATA FIM
    { wch: 16 }, // DIAS P/ VENCER
    { wch: 18 }, // EXECUÇÃO FÍSICA (%)
    { wch: 18 }, // STATUS VIGÊNCIA
    { wch: 16 }, // QTD EMPENHOS
    { wch: 16 }, // QTD MEDIÇÕES
    { wch: 16 }, // QTD PAGAMENTOS
  ];

  XLSX.utils.book_append_sheet(wb, wsContratos, 'CONTRATOS');

  // =========================================================================
  // 2ª GUIA EM DIANTE: CADA CONTRATO COM SEUS DADOS DE EMPENHO E MEDIÇÕES
  // =========================================================================
  if (includeIndividualContractSheets) {
    const usedSheetNames = new Set<string>(['CONTRATOS']);

    contratos.forEach((c, idx) => {
      // Nome seguro para a guia (máx 31 caracteres, sem caracteres inválidos)
      let cleanNumero = (c.numero || `CTR_${idx + 1}`).trim().replace(/[/\\?*[\]:]/g, '-');
      if (cleanNumero.length > 31) cleanNumero = cleanNumero.slice(0, 31);
      let sheetName = cleanNumero;
      let dupCount = 1;
      while (usedSheetNames.has(sheetName)) {
        sheetName = `${cleanNumero.slice(0, 27)}_${dupCount}`;
        dupCount++;
      }
      usedSheetNames.add(sheetName);

      const rows: any[][] = [];

      // Cabeçalho do contrato
      rows.push([`PAINEL DO CONTRATO: ${c.numero}`]);
      rows.push([]);
      rows.push(['DADOS GERAIS DO CONTRATO']);
      rows.push(['Nº DO CONTRATO:', c.numero, 'TIPO:', c.tipo, 'PROCESSO SIGADOC:', c.processoSigadoc || 'NÃO INFORMADO']);
      rows.push(['RAZÃO SOCIAL:', c.razaoSocial, 'CNPJ:', c.cnpj, 'CÓDIGO CREDOR:', c.codigoCredor || '-']);
      rows.push(['FISCAL TITULAR:', c.fiscal, 'FISCAL SUBSTITUTO:', c.substituto || '-', 'STATUS VIGÊNCIA:', `${c.diasVencer || 0} dias p/ vencer`]);
      rows.push(['DATA INÍCIO:', c.dataInicio || '-', 'DATA FIM:', c.dataFim || '-', 'EXECUÇÃO FÍSICA:', `${c.execucaoFisica || 0}%`]);
      rows.push(['OBJETO / DESCRIÇÃO:', c.objeto || c.descricao || '-']);
      rows.push([]);
      rows.push(['RESUMO FINANCEIRO']);
      rows.push([
        'VALOR CONTRATADO:', c.valorContratado || 0,
        'SALDO DO CONTRATO:', c.saldoContrato || 0,
        'VALOR EMPENHADO:', c.valorEmpenhado || 0,
        'VALOR MEDIDO:', c.valorMedido || 0,
        'VALOR PAGO:', c.valorPago || 0
      ]);
      rows.push([]);

      // -----------------------------------------------------------------------
      // SEÇÃO: NOTAS DE EMPENHO (EMP)
      // -----------------------------------------------------------------------
      rows.push(['NOTAS DE EMPENHO VINCULADAS (EMP)']);
      const empHeaders = [
        'Nº DO EMPENHO',
        'PROCESSO',
        'REGIÃO',
        'VALOR TOTAL (R$)',
        'SALDO DISPONÍVEL (R$)',
        'SALDO DO EMPENHO (R$)',
        'DATA DE EMISSÃO',
        'HISTÓRICO / OBSERVAÇÃO'
      ];
      rows.push(empHeaders);

      const empenhos = c.empenhos || [];
      if (empenhos.length === 0) {
        rows.push(['Nenhum empenho cadastrado no sistema para este contrato', '', '', 0, 0, 0, '', '']);
      } else {
        let sumTotalEmp = 0;
        let sumSaldoDisp = 0;
        let sumSaldoEmp = 0;

        empenhos.forEach((e) => {
          const vTotal = e.valorTotal || 0;
          const vSaldoDisp = getSaldoDisponivelAposMedicao(e, c.medicoes);
          const vSaldoEmp = e.saldoEmpenho !== undefined ? e.saldoEmpenho : vSaldoDisp;

          sumTotalEmp += vTotal;
          sumSaldoDisp += vSaldoDisp;
          sumSaldoEmp += vSaldoEmp;

          rows.push([
            e.numeroEmp,
            e.numeroProcesso || '',
            e.regiao || 'GERAL',
            vTotal,
            vSaldoDisp,
            vSaldoEmp,
            e.dataEmissao || '',
            e.observacao || ''
          ]);
        });

        // Subtotal de empenhos
        rows.push([
          'TOTAL DOS EMPENHOS',
          '',
          `${empenhos.length} NOTAS`,
          sumTotalEmp,
          sumSaldoDisp,
          sumSaldoEmp,
          '',
          ''
        ]);
      }

      rows.push([]);

      // -----------------------------------------------------------------------
      // SEÇÃO: MEDIÇÕES E LIQUIDAÇÕES / PAGAMENTOS (LIQ)
      // -----------------------------------------------------------------------
      rows.push(['MEDIÇÕES E LIQUIDAÇÕES / PAGAMENTOS (LIQ)']);
      const medHeaders = [
        'Nº DA MEDIÇÃO',
        'PERÍODO',
        'UNIDADE / CIDADE',
        'EMPENHO VINCULADO',
        'VALOR MEDIÇÃO (R$)',
        '% FÍSICO',
        'DATA REGISTRO',
        'STATUS MEDIÇÃO',
        'ORDEM BANCÁRIA / Nº LIQ',
        'DATA PAGAMENTO',
        'VALOR BRUTO PAGO (R$)',
        'RETENÇÕES (R$)',
        'VALOR LÍQUIDO PAGO (R$)',
        'STATUS PAGAMENTO',
        'DESCRIÇÃO / OBSERVAÇÕES'
      ];
      rows.push(medHeaders);

      const medicoes = getExpandedMedicoes(c);
      const pagamentos = c.pagamentos || [];

      if (medicoes.length === 0 && pagamentos.length === 0) {
        rows.push(['Nenhuma medição ou liquidação cadastrada no sistema para este contrato', '', '', '', 0, 0, '', '', '', '', 0, 0, 0, '', '']);
      } else {
        let sumValorMed = 0;
        let sumBruto = 0;
        let sumRetencoes = 0;
        let sumLiquido = 0;

        const mappedPagIds = new Set<string>();

        medicoes.forEach((m, mIdx) => {
          const vMed = m.valorMedicao || 0;
          sumValorMed += vMed;

          const isContRow = Boolean(
            m.isContinuation ||
            m.parentMedicaoId ||
            (m.numeroMed && m.numeroMed.toUpperCase().includes('(CONT'))
          );

          const nextM = medicoes[mIdx + 1];
          const hasContinuationBelow = Boolean(
            nextM && (
              nextM.parentMedicaoId === m.id ||
              nextM.isContinuation ||
              (nextM.numeroMed && nextM.numeroMed.toUpperCase().includes('(CONT'))
            )
          );

          const isLinked = Boolean(
            m.empenhoVinculado &&
            m.empenhoVinculado.trim() !== '' &&
            m.empenhoVinculado.toUpperCase() !== 'SEM EMPENHO' &&
            m.empenhoVinculado !== '-' &&
            !m.empenhoVinculado.includes('R$') &&
            !/^\s*R?\$?\s*[\d.,]+\s*$/.test(m.empenhoVinculado)
          );

          const isContinuing =
            hasContinuationBelow ||
            (isLinked &&
              m.valorDescontadoEmpenho !== undefined &&
              m.valorDescontadoEmpenho > 0 &&
              m.valorMedicao - m.valorDescontadoEmpenho > 0.01);

          let empDisplay = m.empenhoVinculado || '';
          if (isContRow && empDisplay && !empDisplay.startsWith('↳')) {
            empDisplay = `↳ ${empDisplay}`;
          }

          const matchingPag = pagamentos.find((p) => isPagamentoOfMedicao(p, m));

          if (matchingPag) {
            mappedPagIds.add(matchingPag.id);
            const vBruto = matchingPag.valorBruto || 0;
            const ret = matchingPag.retencoes
              ? (matchingPag.retencoes.inss || 0) + (matchingPag.retencoes.irrf || 0) + (matchingPag.retencoes.iss || 0)
              : 0;
            const vLiq = matchingPag.valorLiquido || 0;

            sumBruto += vBruto;
            sumRetencoes += ret;
            sumLiquido += vLiq;

            rows.push([
              isContRow ? '' : m.numeroMed,
              isContRow ? '' : (m.periodo || ''),
              isContRow ? '' : (m.unidadeCidade || ''),
              empDisplay,
              vMed,
              m.percentualFisico || 0,
              isContRow ? '' : (m.dataRegistro || ''),
              isContinuing ? '-' : m.medicaoPendente ? 'PENDENTE' : 'PROCESSADA',
              matchingPag.ordemBancaria || '-',
              matchingPag.dataPagamento || '-',
              vBruto,
              ret,
              vLiq,
              matchingPag.status || 'PAGO',
              isContRow ? '' : (m.descricao || m.observacao || matchingPag.historico || '')
            ]);
          } else {
            rows.push([
              isContRow ? '' : m.numeroMed,
              isContRow ? '' : (m.periodo || ''),
              isContRow ? '' : (m.unidadeCidade || ''),
              empDisplay,
              vMed,
              m.percentualFisico || 0,
              isContRow ? '' : (m.dataRegistro || ''),
              isContinuing ? '-' : m.medicaoPendente ? 'PENDENTE' : 'PROCESSADA',
              '-',
              '-',
              0,
              0,
              0,
              isContinuing ? '-' : m.medicaoPendente ? 'PENDENTE' : 'SEM PAGAMENTO VINCULADO',
              isContRow ? '' : (m.descricao || m.observacao || '')
            ]);
          }
        });

        // Pagamentos avulsos/não vinculados à medição específica
        const unlinkedPags = pagamentos.filter((p) => !mappedPagIds.has(p.id));
        unlinkedPags.forEach((p) => {
          const vBruto = p.valorBruto || 0;
          const ret = p.retencoes
            ? (p.retencoes.inss || 0) + (p.retencoes.irrf || 0) + (p.retencoes.iss || 0)
            : 0;
          const vLiq = p.valorLiquido || 0;

          sumBruto += vBruto;
          sumRetencoes += ret;
          sumLiquido += vLiq;

          rows.push([
            p.medicaoVinculada || 'PAGTO DIRETO',
            '-',
            '-',
            '-',
            0,
            0,
            p.dataPagamento || '',
            'PAGAMENTO',
            p.ordemBancaria || '-',
            p.dataPagamento || '-',
            vBruto,
            ret,
            vLiq,
            p.status || 'PAGO',
            p.historico || ''
          ]);
        });

        // Subtotal de medições e pagamentos
        rows.push([
          'TOTAL DE MEDIÇÕES E PAGAMENTOS',
          '',
          '',
          '',
          sumValorMed,
          '',
          '',
          '',
          '',
          '',
          sumBruto,
          sumRetencoes,
          sumLiquido,
          '',
          ''
        ]);
      }

      const wsContract = XLSX.utils.aoa_to_sheet(rows);
      wsContract['!cols'] = [
        { wch: 22 },
        { wch: 35 }, // PROCESSO ampliado horizontalmente para exibir número completo
        { wch: 24 },
        { wch: 20 },
        { wch: 18 },
        { wch: 14 },
        { wch: 16 },
        { wch: 20 },
        { wch: 24 },
        { wch: 16 },
        { wch: 18 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 35 },
      ];

      XLSX.utils.book_append_sheet(wb, wsContract, sheetName);
    });
  }

  // =========================================================================
  // GUIAS CONSOLIDADAS: TODOS_EMPENHOS_EMP e TODAS_LIQUIDACOES_LIQ
  // =========================================================================
  if (includeConsolidatedSheets) {
    // Guia Consolidada 1: TODOS OS EMPENHOS
    const empFlat = getAllEmpenhosFromContracts(contratos);
    const empFlatRows: any[][] = [
      [
        'Nº DO CONTRATO',
        'RAZÃO SOCIAL DA EMPRESA',
        'Nº DO EMPENHO (EMP)',
        'Nº DO PROCESSO',
        'REGIÃO',
        'VALOR TOTAL (R$)',
        'SALDO DISPONÍVEL (R$)',
        'SALDO DO EMPENHO (R$)',
        'DATA DE EMISSÃO',
        'OBSERVAÇÃO / HISTÓRICO'
      ]
    ];

    let sumEmpTotal = 0;
    let sumEmpSaldoDisp = 0;
    let sumEmpSaldo = 0;

    empFlat.forEach(({ contratoNumero, empenho }) => {
      const parent = contratos.find((c) => isSameContractNumber(c.numero, contratoNumero));
      const vTot = empenho.valorTotal || 0;
      const vDisp = getSaldoDisponivelAposMedicao(empenho, parent?.medicoes);
      const vSaldo = empenho.saldoEmpenho !== undefined ? empenho.saldoEmpenho : vDisp;

      sumEmpTotal += vTot;
      sumEmpSaldoDisp += vDisp;
      sumEmpSaldo += vSaldo;

      empFlatRows.push([
        contratoNumero,
        parent?.razaoSocial || '',
        empenho.numeroEmp,
        empenho.numeroProcesso || '',
        empenho.regiao || 'GERAL',
        vTot,
        vDisp,
        vSaldo,
        empenho.dataEmissao || '',
        empenho.observacao || ''
      ]);
    });

    empFlatRows.push([
      'TOTAL GERAL',
      `${empFlat.length} NOTAS DE EMPENHO`,
      '',
      '',
      '',
      sumEmpTotal,
      sumEmpSaldoDisp,
      sumEmpSaldo,
      '',
      ''
    ]);

    const wsEmpFlat = XLSX.utils.aoa_to_sheet(empFlatRows);
    wsEmpFlat['!cols'] = [
      { wch: 18 },
      { wch: 35 },
      { wch: 20 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 16 },
      { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, wsEmpFlat, 'TODOS_EMPENHOS_EMP');

    // Guia Consolidada 2: TODAS AS MEDIÇÕES E LIQUIDAÇÕES
    const medFlat = getAllMedicoesFromContracts(contratos);
    const medFlatRows: any[][] = [
      [
        'Nº DO CONTRATO',
        'RAZÃO SOCIAL',
        'ORDEM BANCÁRIA / Nº LIQ',
        'DATA DO PAGAMENTO',
        'VALOR BRUTO (R$)',
        'VALOR RETENÇÕES (R$)',
        'VALOR LÍQUIDO (R$)',
        'STATUS',
        'HISTÓRICO DA LIQUIDAÇÃO'
      ]
    ];

    let sumLiqBruto = 0;
    let sumLiqRet = 0;
    let sumLiqLiq = 0;

    medFlat.forEach(({ contratoNumero, pagamento }) => {
      const parent = contratos.find((c) => isSameContractNumber(c.numero, contratoNumero));
      const vB = pagamento.valorBruto || 0;
      const vR = (pagamento.retencoes?.inss || 0) + (pagamento.retencoes?.irrf || 0) + (pagamento.retencoes?.iss || 0);
      const vL = pagamento.valorLiquido || 0;

      sumLiqBruto += vB;
      sumLiqRet += vR;
      sumLiqLiq += vL;

      medFlatRows.push([
        contratoNumero,
        parent?.razaoSocial || '',
        pagamento.ordemBancaria,
        pagamento.dataPagamento,
        vB,
        vR,
        vL,
        pagamento.status,
        pagamento.historico || ''
      ]);
    });

    medFlatRows.push([
      'TOTAL GERAL',
      `${medFlat.length} LIQUIDAÇÕES/PAGAMENTOS`,
      '',
      '',
      sumLiqBruto,
      sumLiqRet,
      sumLiqLiq,
      '',
      ''
    ]);

    const wsMedFlat = XLSX.utils.aoa_to_sheet(medFlatRows);
    wsMedFlat['!cols'] = [
      { wch: 18 },
      { wch: 35 },
      { wch: 24 },
      { wch: 18 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 16 },
      { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, wsMedFlat, 'TODAS_LIQUIDACOES_LIQ');
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export { generateFullExcelBlob, exportFullExcelWorkbook } from './fullExcelExport';
import { exportFullExcelWorkbook } from './fullExcelExport';

export function exportMultiSheetWorkbook(
  contratos: Contrato[],
  filename?: string,
  _options?: MultiSheetExportOptions
): void {
  exportFullExcelWorkbook(contratos, filename).catch((err) => {
    console.error('Erro ao exportar planilha completa:', err);
  });
}

