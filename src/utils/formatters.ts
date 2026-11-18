import { Contrato, Empenho, Medicao, Pagamento } from '../types/contract';

export function formatCurrency(value: number, includeSymbol = true): string {
  if (value === undefined || value === null || isNaN(value)) {
    return includeSymbol ? 'R$ 0,00' : '0,00';
  }
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return includeSymbol ? `R$ ${formatted}` : formatted;
}

export function formatPercent(value: number): string {
  if (value === undefined || value === null || isNaN(value)) return '0,0%';
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export function formatHistoricoDisplay(historico?: string): string {
  if (!historico) return '-';
  const trimmed = historico.trim();
  if (!trimmed) return '-';

  // If it's legacy boilerplate with duplicate fields
  if (trimmed.includes('Nº DA LIQUIDAÇÃO (LIQ):') && trimmed.includes('DATA DO PAGAMENTO:')) {
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    const contractLine = lines.find((l) => l.startsWith('CONTRATO:'));
    return contractLine ? contractLine : lines[0] || '-';
  }

  // Replace multiple newlines with single separator for clean column display
  return trimmed.replace(/\r?\n\s*/g, ' | ');
}

export function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
}

export function formatNumeroContrato(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 7);
  if (digits.length <= 3) {
    return digits;
  }
  return `${digits.slice(0, 3)}/${digits.slice(3, 7)}`;
}

export function formatCnpjInput(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export function formatDateInput(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/**
 * Mask for Nota de Empenho in standard format: 00000.0000.00.000000-0 (18 digits)
 * E.g., 18101.0001.26.000142-3
 */
export function formatNumeroEmpenhoInput(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 18);
  if (digits.length <= 5) return digits;
  if (digits.length <= 9) return `${digits.slice(0, 5)}.${digits.slice(5)}`;
  if (digits.length <= 11) return `${digits.slice(0, 5)}.${digits.slice(5, 9)}.${digits.slice(9)}`;
  if (digits.length <= 17) {
    return `${digits.slice(0, 5)}.${digits.slice(5, 9)}.${digits.slice(9, 11)}.${digits.slice(11)}`;
  }
  return `${digits.slice(0, 5)}.${digits.slice(5, 9)}.${digits.slice(9, 11)}.${digits.slice(11, 17)}-${digits.slice(17, 18)}`;
}

/**
 * Mask for Nº da Liquidação (LIQ) in standard format: 00000.0000.00.000000-0 (18 digits)
 * E.g., 18101.0002.26.002539-5
 */
export function formatNumeroLiquidacaoInput(val: string): string {
  return formatNumeroEmpenhoInput(val);
}

/**
 * Currency input mask for Brazilian Real (R$).
 * Formats user typing with 'R$ ' prefix and thousands separators,
 * supporting decimal cents when comma is typed.
 * E.g., user typing 1000 -> 'R$ 1.000'
 * E.g., user typing 1000,5 -> 'R$ 1.000,5'
 * E.g., user typing 1000,50 -> 'R$ 1.000,50'
 */
export function formatCurrencyInput(val: string): string {
  if (!val) return '';
  const clean = val.replace(/^R\$\s?/, '').trim();
  if (!clean) return '';

  // If user entered comma (decimal separator in Brazilian notation)
  if (clean.includes(',')) {
    const [intPart, decPart] = clean.split(',');
    const digitsInt = intPart.replace(/\D/g, '');
    const cleanDec = (decPart || '').replace(/\D/g, '').slice(0, 2);

    if (!digitsInt) {
      return `R$ 0,${cleanDec}`;
    }

    const num = Number(digitsInt.slice(0, 15));
    const formattedInt = new Intl.NumberFormat('pt-BR').format(num);
    return `R$ ${formattedInt},${cleanDec}`;
  }

  // If user entered a trailing dot e.g. "1000.", treat as "1000,"
  if (clean.endsWith('.')) {
    const digitsInt = clean.slice(0, -1).replace(/\D/g, '');
    if (!digitsInt) return '';
    const num = Number(digitsInt.slice(0, 15));
    const formattedInt = new Intl.NumberFormat('pt-BR').format(num);
    return `R$ ${formattedInt},`;
  }

  // Pure digits or string with existing dots
  const digits = clean.replace(/\D/g, '');
  if (!digits) return '';

  const num = Number(digits.slice(0, 15));
  if (isNaN(num)) return '';

  const formattedInt = new Intl.NumberFormat('pt-BR').format(num);
  return `R$ ${formattedInt}`;
}

/**
 * Ensures currency string is fully formatted with 'R$ ' and ',00' decimal places
 * when the user finishes editing (onBlur) or saves.
 * E.g.:
 * '1000' -> 'R$ 1.000,00'
 * 'R$ 1.000' -> 'R$ 1.000,00'
 * '10000000' -> 'R$ 10.000.000,00'
 */
export function formatCurrencyBlur(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const num = parseFlexibleNumber(val);
  if (num <= 0) return '';
  return formatCurrency(num, true);
}


export function suggestSigla(razao: string): string {
  if (!razao.trim()) return '';
  const stopWords = new Set([
    'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM', 'PARA', 'COM', 'LTDA', 'ME', 'EPP', 'S/A', 'SA', 'EIRELI', 'SS', 'MEI', 'CIA'
  ]);
  const words = razao
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !stopWords.has(w));

  if (words.length >= 4) {
    return words.slice(0, 4).map((w) => w[0]).join('');
  }
  if (words.length === 3) {
    return (words[0].slice(0, 2) + words[1][0] + words[2][0]).slice(0, 4);
  }
  if (words.length === 2) {
    return (words[0].slice(0, 2) + words[1].slice(0, 2)).slice(0, 4);
  }
  if (words.length === 1) {
    return words[0].slice(0, 4);
  }
  return '';
}


export function parseFlexibleNumber(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim().replace(/^R\$\s?/, '').trim();
  if (!str) return 0;

  // If Brazilian format with comma decimal (e.g. "1.234.567,89", "500,00", "100,5")
  if (str.includes(',')) {
    const clean = str.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }

  // If no comma:
  // If multiple dots, e.g. "1.500.000" -> Brazilian thousands notation
  const dotCount = (str.match(/\./g) || []).length;
  if (dotCount > 1) {
    const clean = str.replace(/\./g, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }

  if (dotCount === 1) {
    const parts = str.split('.');
    // If exactly 3 digits after the single dot e.g. "50.000" or "1.500", treat as thousand separator
    if (parts[1].length === 3) {
      const clean = str.replace(/\./g, '');
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? 0 : parsed;
    }
    // Otherwise standard decimal e.g. "50.5" or "100.25"
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Pure integer / digits e.g. "50000"
  const clean = str.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatDateBR(dateString: string): string {
  if (!dateString) return '-';
  // If already in dd/mm/yyyy
  if (dateString.includes('/')) return dateString;
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}

export function formatDateISO(dateString?: string): string {
  if (!dateString) return '';
  const trimmed = dateString.trim();
  if (!trimmed || trimmed === '-') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // If DD/MM/YYYY
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return '';
}

export function calculateDaysRemaining(endDateStr: string): number {
  try {
    let targetDate: Date;
    if (endDateStr.includes('/')) {
      const [day, month, year] = endDateStr.split('/').map(Number);
      targetDate = new Date(year, month - 1, day);
    } else {
      targetDate = new Date(endDateStr);
    }
    // Using reference date: 2026-09-30 as shown in header
    const refDate = new Date(2026, 8, 30);
    const diffTime = targetDate.getTime() - refDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return 0;
  }
}

/**
 * Formats measurement numbers to have ONLY the number with ordinal indicator,
 * without the word "Medição" (e.g. "14ª Medição" -> "14ª", "3" -> "3ª", "3 E 4" -> "3ª e 4ª").
 * E.g., "14ª Medição" -> "14ª"
 * E.g., "07º MEDIÇÃO" -> "7ª"
 * E.g., "3" -> "3ª"
 * E.g., "03ª" -> "3ª"
 * E.g., "4 (CONT.)" -> "4ª (CONT.)"
 * E.g., "3 E 4" -> "3ª e 4ª"
 */
export function formatNumeroMedicao(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // If it's a liquidation reference like LIQ 005522-9, keep as is
  if (/^LIQ\b/i.test(str)) {
    return str;
  }

  // Preserve continuation suffix e.g. (CONT.)
  let contSuffix = '';
  const contMatch = str.match(/\s*(\(CONT\.?\))/i);
  if (contMatch) {
    contSuffix = ` ${contMatch[1].toUpperCase()}`;
    str = str.replace(/\s*\(CONT\.?\)/i, '').trim();
  }

  // Check multiple measurements like "3 E 4" or "3 e 4"
  if (/^\d+\s*(?:[Ee]|&)\s*\d+/.test(str)) {
    const multiMatch = str.match(/^0*(\d+)\s*(?:[Ee]|&)\s*0*(\d+)/);
    if (multiMatch) {
      return `${multiMatch[1]}ª e ${multiMatch[2]}ª${contSuffix}`.trim();
    }
  }

  // Check pattern: "07º MEDIÇÃO" or "07ª MEDIÇÃO" or "7ª MEDIÇÃO" or "07 MEDIÇÃO" or "07" or "7ª" or "7"
  const medMatch = str.match(/^0*(\d+)\s*([ªº°])?\s*(?:MED(?:IÇÃO|ICAO|\.)?)?$/i);
  if (medMatch) {
    const num = medMatch[1];
    return `${num}ª${contSuffix}`.trim();
  }

  // Remove any word MEDIÇÃO / MEDICAO / MED / MED.
  let cleaned = str.replace(/\b(?:MEDIÇÃO|MEDICAO|MED\.?)\b/gi, '').trim();
  cleaned = cleaned.replace(/[º°]/g, 'ª');
  cleaned = cleaned.replace(/\b0+(\d+)/g, '$1');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (/^\d+ª?$/.test(cleaned)) {
    const num = cleaned.replace(/\D/g, '');
    return `${num}ª${contSuffix}`.trim();
  }

  if (cleaned) {
    return `${cleaned}${contSuffix}`.trim();
  }

  return (str ? `${str}${contSuffix}` : '').trim();
}

/**
 * Splits SIGADOC after the slash (/) for a clean line break.
 * E.g. "SESP-PRO-2025/07144.07" -> { prefix: "SESP-PRO-2025/", suffix: "07144.07" }
 */
export function splitSigadocSlash(val?: string): { prefix: string; suffix: string } | null {
  if (!val || val.trim() === '-' || !val.trim()) return null;
  const clean = val.trim();
  const slashIdx = clean.indexOf('/');
  if (slashIdx === -1) return null;
  return {
    prefix: clean.slice(0, slashIdx + 1).trim(),
    suffix: clean.slice(slashIdx + 1).trim(),
  };
}

function centenasParaExtenso(num: number): string {
  if (num === 0) return '';
  if (num === 100) return 'cem';
  const c = Math.floor(num / 100);
  const d = Math.floor((num % 100) / 10);
  const u = num % 10;
  const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const DEZENAS = ['', 'dez', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const ESPECIAIS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];

  const parts: string[] = [];
  if (c > 0) parts.push(CENTENAS[c]);
  if (d === 1) {
    parts.push(ESPECIAIS[u]);
  } else {
    if (d > 1) parts.push(DEZENAS[d]);
    if (u > 0) parts.push(UNIDADES[u]);
  }
  return parts.join(' e ');
}

/**
 * Converte valor numérico monetário em reais para texto por extenso.
 * Exemplo: 750000 -> "setecentos e cinquenta mil reais"
 * Exemplo: 2000000 -> "dois milhões de reais"
 */
export function valorPorExtenso(valor: number): string {
  if (valor === undefined || valor === null || isNaN(valor) || valor === 0) {
    return 'zero reais';
  }

  const inteiro = Math.floor(Math.abs(valor));
  const centavos = Math.round((Math.abs(valor) - inteiro) * 100);

  const bilhoes = Math.floor(inteiro / 1_000_000_000);
  const milhoes = Math.floor((inteiro % 1_000_000_000) / 1_000_000);
  const milhares = Math.floor((inteiro % 1_000_000) / 1_000);
  const unidades = inteiro % 1_000;

  const partes: string[] = [];

  if (bilhoes > 0) {
    partes.push(centenasParaExtenso(bilhoes) + (bilhoes === 1 ? ' bilhão' : ' bilhões'));
  }
  if (milhoes > 0) {
    partes.push(centenasParaExtenso(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'));
  }
  if (milhares > 0) {
    partes.push(centenasParaExtenso(milhares) + ' mil');
  }
  if (unidades > 0) {
    partes.push(centenasParaExtenso(unidades));
  }

  let textoReais = '';
  if (inteiro === 0) {
    textoReais = '';
  } else if (inteiro === 1) {
    textoReais = 'um real';
  } else {
    const isExatoMilhaoOuBilhao = (milhoes > 0 || bilhoes > 0) && milhares === 0 && unidades === 0;
    textoReais = partes.join(' e ') + (isExatoMilhaoOuBilhao ? ' de reais' : ' reais');
  }

  let textoCentavos = '';
  if (centavos > 0) {
    const extensoCentavos = centenasParaExtenso(centavos);
    textoCentavos = `${extensoCentavos} ${centavos === 1 ? 'centavo' : 'centavos'}`;
  }

  if (textoReais && textoCentavos) {
    return `${textoReais} e ${textoCentavos}`;
  }
  if (textoReais) {
    return textoReais;
  }
  if (textoCentavos) {
    return textoCentavos;
  }
  return 'zero reais';
}

/**
 * Calculates total measured amount and remaining balance for an Ordem de Serviço (OS).
 */
export function calculateOsSaldo(
  os: { id: string; numeroOs?: string; valorTotal: number },
  medicoes: Array<{
    id?: string;
    numeroMed?: string;
    valorMedicao?: number;
    osId?: string;
    numeroOs?: string;
    osId2?: string;
    numeroOs2?: string;
    valorAbatidoOs1?: number;
    valorAbatidoOs2?: number;
    osIds?: string[];
    numerosOs?: string[];
    isContinuation?: boolean;
    parentMedicaoId?: string;
    descricao?: string;
  }>,
  totalOrdensServicoCount: number = 1
): { totalMedido: number; saldo: number } {
  const cleanOsNum = (os.numeroOs || '').trim().toUpperCase();

  const isOriginalMedicao = (med: (typeof medicoes)[0]) => {
    if (med.isContinuation) return false;
    if (med.parentMedicaoId) return false;
    const num = (med.numeroMed || '').toUpperCase();
    if (num.includes('(CONT') || num.includes('CONT.') || num.includes('CONTINUA')) return false;
    const desc = (med.descricao || '').toUpperCase();
    if (desc.includes('(CONT') || desc.includes('CONT.')) return false;
    return true;
  };

  const originalMedicoes = medicoes.filter(isOriginalMedicao);
  let totalMedido = 0;

  const hasMultipleOrExplicit =
    totalOrdensServicoCount > 1 ||
    originalMedicoes.some(
      (m) =>
        Boolean(m.osId2 || m.numeroOs2 || (m.osIds && m.osIds.length > 1) || m.valorAbatidoOs1 !== undefined || m.valorAbatidoOs2 !== undefined) ||
        (Boolean(m.osId || m.numeroOs) && (m.osId !== os.id || (m.numeroOs && m.numeroOs.trim().toUpperCase() !== cleanOsNum)))
    );

  if (!hasMultipleOrExplicit && totalOrdensServicoCount <= 1) {
    totalMedido = originalMedicoes.reduce((acc, med) => acc + (med.valorMedicao || 0), 0);
  } else {
    for (const med of originalMedicoes) {
      const isMatch1 =
        Boolean(med.osId && med.osId === os.id) ||
        Boolean(
          med.numeroOs &&
            (med.numeroOs.trim().toUpperCase() === cleanOsNum ||
              med.numeroOs.trim().toUpperCase().includes(cleanOsNum))
        );

      const isMatch2 =
        Boolean(med.osId2 && med.osId2 === os.id) ||
        Boolean(
          med.numeroOs2 &&
            (med.numeroOs2.trim().toUpperCase() === cleanOsNum ||
              med.numeroOs2.trim().toUpperCase().includes(cleanOsNum))
        );

      const isMatchList =
        Boolean(med.osIds?.includes(os.id)) ||
        Boolean(
          med.numerosOs?.some(
            (n) => n.trim().toUpperCase() === cleanOsNum || n.trim().toUpperCase().includes(cleanOsNum)
          )
        );

      if (isMatch1 && isMatch2) {
        // Ambas as opções apontam para esta OS
        const v1 = med.valorAbatidoOs1 ?? (med.valorMedicao || 0);
        const v2 = med.valorAbatidoOs2 ?? 0;
        totalMedido += v1 + v2;
      } else if (isMatch1) {
        if (med.osId2 || med.numeroOs2 || (med.osIds && med.osIds.length > 1)) {
          const v1 =
            med.valorAbatidoOs1 !== undefined && med.valorAbatidoOs1 !== null
              ? med.valorAbatidoOs1
              : med.valorAbatidoOs2 !== undefined && med.valorAbatidoOs2 !== null
              ? Math.max(0, (med.valorMedicao || 0) - med.valorAbatidoOs2)
              : (med.valorMedicao || 0);
          totalMedido += v1;
        } else {
          totalMedido += (med.valorMedicao || 0);
        }
      } else if (isMatch2) {
        const v2 =
          med.valorAbatidoOs2 !== undefined && med.valorAbatidoOs2 !== null
            ? med.valorAbatidoOs2
            : med.valorAbatidoOs1 !== undefined && med.valorAbatidoOs1 !== null
            ? Math.max(0, (med.valorMedicao || 0) - med.valorAbatidoOs1)
            : 0;
        totalMedido += v2;
      } else if (isMatchList) {
        // Vinculada como 3ª ou posterior OS na lista
        totalMedido += 0;
      }
    }
  }

  const saldo = os.valorTotal - totalMedido;
  return { totalMedido, saldo };
}

/**
 * Normaliza termos de busca removendo acentuação e convertendo para minúsculas
 */
export function normalizeSearchTerm(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Verifica se um contrato corresponde ao termo de busca, com suporte completo a:
 * - Municípios/Cidades nas Regiões (ex: "NOVA UBIRATÃ", "SINOP", "SORRISO")
 * - Nome da Região / Polo
 * - Unidade/Cidade das Medições (ex: "CUIABÁ", "TANGARÁ DA SERRA")
 * - Região dos Empenhos
 * - Ordens de Serviço
 * - Número do contrato, Razão social, CNPJ, Sigla, Fiscais, Objeto, Descrição e SIGADOC
 * - Busca insensível a acentuação e maiúsculas/minúsculas
 */
export function matchesContractSearch(c: Contrato, search: string): boolean {
  const term = normalizeSearchTerm(search);
  if (!term) return true;

  // 1. Número do contrato, processo sigadoc, credor, CNPJ, razão social, sigla
  if (normalizeSearchTerm(c.numero).includes(term)) return true;
  if (normalizeSearchTerm(c.descricao).includes(term)) return true;
  if (normalizeSearchTerm(c.objeto).includes(term)) return true;
  if (normalizeSearchTerm(c.razaoSocial).includes(term)) return true;
  if (normalizeSearchTerm(c.siglaEmpresa).includes(term)) return true;
  if (normalizeSearchTerm(c.cnpj).includes(term)) return true;
  if (normalizeSearchTerm(c.codigoCredor).includes(term)) return true;
  if (normalizeSearchTerm(c.fiscal).includes(term)) return true;
  if (normalizeSearchTerm(c.substituto).includes(term)) return true;
  if (normalizeSearchTerm(c.processoSigadoc).includes(term)) return true;
  if (normalizeSearchTerm(c.tipo).includes(term)) return true;

  // 2. Municípios e Regiões contratadas (ex: NOVA UBIRATÃ, SORRISO, POLO SINOP, etc.)
  if (c.regioes && c.regioes.length > 0) {
    for (const r of c.regioes) {
      if (r.cidades && normalizeSearchTerm(r.cidades).includes(term)) return true;
      if (r.nome && normalizeSearchTerm(r.nome).includes(term)) return true;
    }
  }

  // 3. Medições - Unidade/Cidade (ex: local do serviço / comarca / município)
  if (c.medicoes && c.medicoes.length > 0) {
    for (const m of c.medicoes) {
      if (m.unidadeCidade && normalizeSearchTerm(m.unidadeCidade).includes(term)) return true;
      if (m.descricao && normalizeSearchTerm(m.descricao).includes(term)) return true;
      if (m.sigadoc && normalizeSearchTerm(m.sigadoc).includes(term)) return true;
      if (m.numeroOs && normalizeSearchTerm(m.numeroOs).includes(term)) return true;
      if (m.numeroOs2 && normalizeSearchTerm(m.numeroOs2).includes(term)) return true;
      if (m.numeroMed && normalizeSearchTerm(m.numeroMed).includes(term)) return true;
    }
  }

  // 4. Empenhos - Região ou comarca
  if (c.empenhos && c.empenhos.length > 0) {
    for (const e of c.empenhos) {
      if (e.regiao && normalizeSearchTerm(e.regiao).includes(term)) return true;
      if (e.numeroEmp && normalizeSearchTerm(e.numeroEmp).includes(term)) return true;
      if (e.numeroProcesso && normalizeSearchTerm(e.numeroProcesso).includes(term)) return true;
    }
  }

  // 5. Ordens de Serviço
  if (c.ordensServico && c.ordensServico.length > 0) {
    for (const os of c.ordensServico) {
      if (os.numeroOs && normalizeSearchTerm(os.numeroOs).includes(term)) return true;
      if (os.descricao && normalizeSearchTerm(os.descricao).includes(term)) return true;
    }
  }

  return false;
}

/**
 * Formats the current date in full Brazilian Portuguese, e.g. "SEXTA-FEIRA, 09 DE OUTUBRO DE 2026"
 */
export function formatDataHojePorExtenso(): string {
  const agora = new Date();
  const diasDaSemana = [
    'DOMINGO',
    'SEGUNDA-FEIRA',
    'TERÇA-FEIRA',
    'QUARTA-FEIRA',
    'QUINTA-FEIRA',
    'SEXTA-FEIRA',
    'SÁBADO',
  ];
  const meses = [
    'JANEIRO',
    'FEVEREIRO',
    'MARÇO',
    'ABRIL',
    'MAIO',
    'JUNHO',
    'JULHO',
    'AGOSTO',
    'SETEMBRO',
    'OUTUBRO',
    'NOVEMBRO',
    'DEZEMBRO',
  ];

  const diaSemana = diasDaSemana[agora.getDay()];
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = meses[agora.getMonth()];
  const ano = agora.getFullYear();

  return `${diaSemana}, ${dia} DE ${mes} DE ${ano}`;
}

/**
 * Formats the current date in DD/MM/YYYY
 */
export function formatDataHojeBR(): string {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const ano = agora.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

export function formatOsShortNumber(raw?: string): string {
  if (!raw) return '';
  const cleaned = raw.replace(/^OS:?\s*(?:N[º°]?\s*)?/i, '').trim();
  const match = cleaned.match(/^(\d{1,4}\/\d{4})/);
  if (match) return match[1];
  const matchSlash = cleaned.match(/^([^\/\s]+\/\d+)/);
  if (matchSlash) return matchSlash[1];
  return cleaned;
}

/**
 * Calculates the available balance of an empenho after deducting all linked measurements.
 * Matches the exact logic used in the system's "Saldo disp." column.
 */
export function getSaldoDisponivelAposMedicao(emp: Empenho, medicoes?: Medicao[]): number {
  if (!emp) return 0;
  const cleanEmp = (emp.numeroEmp || '').trim();
  const digitsEmp = cleanEmp.replace(/[^\d]/g, '');
  const rawMedicoes = medicoes || [];

  const matchingMeds = rawMedicoes.filter((med) => {
    if (!med.empenhoVinculado) return false;
    const cleanVinculado = med.empenhoVinculado.trim();
    if (
      cleanVinculado === '-' ||
      cleanVinculado.toUpperCase() === 'SEM EMPENHO' ||
      cleanVinculado.toUpperCase().includes('PAGO PELA UO')
    ) {
      return false;
    }
    const digitsVinculado = cleanVinculado.replace(/[^\d]/g, '');
    return (
      cleanVinculado === cleanEmp ||
      cleanVinculado.includes(cleanEmp) ||
      (digitsEmp.length > 5 && (digitsVinculado === digitsEmp || digitsVinculado.includes(digitsEmp)))
    );
  });

  const sumDescontado = matchingMeds.reduce((acc, med) => {
    const val =
      med.valorDescontadoEmpenho !== undefined && med.valorDescontadoEmpenho !== null
        ? med.valorDescontadoEmpenho
        : med.valorMedicao;
    return acc + (val || 0);
  }, 0);

  const baseValor = emp.valorTotal > 0 ? emp.valorTotal : (emp.saldoDisponivel ?? 0);
  return Math.max(0, baseValor - sumDescontado);
}

/**
 * Expande as medições do contrato para exibição e exportação idênticas à tela do sistema:
 * Se uma medição tem saldo pendente e está vinculada a empenho, mas ainda não possui
 * linha de continuação materializada, projeta a linha de continuação complementar logo abaixo.
 */
export function getExpandedMedicoes(c: Contrato): Medicao[] {
  const rawMedicoes = c.medicoes || [];
  const list: Medicao[] = [];

  for (let i = 0; i < rawMedicoes.length; i++) {
    const med = rawMedicoes[i];
    const isLinked = Boolean(
      med.empenhoVinculado &&
        med.empenhoVinculado.trim() !== '' &&
        med.empenhoVinculado.toUpperCase() !== 'SEM EMPENHO' &&
        med.empenhoVinculado !== '-' &&
        !med.empenhoVinculado.includes('R$') &&
        !/^\s*R?\$?\s*[\d.,]+\s*$/.test(med.empenhoVinculado)
    );

    const cleanNum = (med.numeroMed || '').replace(/\s*\(CONT\.?\)/gi, '').trim().toUpperCase();
    const nextMed = rawMedicoes[i + 1];
    const nextCleanNum = nextMed ? (nextMed.numeroMed || '').replace(/\s*\(CONT\.?\)/gi, '').trim().toUpperCase() : '';

    const isNextContinuation = Boolean(
      nextMed && (
        nextMed.isContinuation ||
        Boolean(nextMed.parentMedicaoId && (nextMed.parentMedicaoId === med.id || (med.parentMedicaoId && nextMed.parentMedicaoId === med.parentMedicaoId))) ||
        (cleanNum && cleanNum === nextCleanNum && (nextMed.numeroMed.toUpperCase().includes('(CONT') || nextMed.isContinuation))
      )
    );

    const hasContinuationBelow = rawMedicoes.slice(i + 1).some((m) =>
      m.parentMedicaoId === med.id ||
      (med.parentMedicaoId && m.parentMedicaoId === med.parentMedicaoId)
    );

    if (isLinked && med.valorPendente && med.valorPendente > 0 && !isNextContinuation && !hasContinuationBelow) {
      list.push({
        ...med,
        valorPendente: 0,
        medicaoPendente: false,
      });
      list.push({
        id: `${med.id}-cont`,
        numeroMed: med.numeroMed.includes('(CONT')
          ? `${med.numeroMed}`
          : `${med.numeroMed} (CONT.)`,
        periodo: med.periodo,
        unidadeCidade: med.unidadeCidade,
        descricao: med.descricao,
        sigadoc: med.sigadoc,
        empenhoVinculado: 'SEM EMPENHO',
        valorDescontadoEmpenho: 0,
        valorMedicao: med.valorPendente,
        medicaoPendente: true,
        valorPendente: med.valorPendente,
        percentualFisico: med.percentualFisico,
        dataRegistro: med.dataRegistro || '30/09/2026',
        observacao: med.observacao || '',
        numeroNf: med.numeroNf,
        dataEmissaoNf: med.dataEmissaoNf,
        dataAtesto: med.dataAtesto,
        parentMedicaoId: med.parentMedicaoId || med.id,
        isContinuation: true,
      });
    } else {
      list.push(med);
    }
  }

  return list;
}

/**
 * Normaliza número de SIGADOC / Processo para comparação segura.
 * Remove prefixos como 'PROTOCOLO:', 'SIGADOC:', 'PROCESSO:' e ignora valores vazios / placeholders.
 */
export function normalizeSigadoc(val: string | undefined | null): string {
  if (!val) return '';
  const trimmed = String(val).trim().toUpperCase();
  if (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed === '--' ||
    trimmed === 'NÃO INFORMADO' ||
    trimmed === 'NAO INFORMADO' ||
    trimmed === 'SEM SIGADOC' ||
    trimmed === 'NÃO' ||
    trimmed === 'NAO'
  ) {
    return '';
  }
  return trimmed.replace(/^(?:PROTOCOLO|SIGADOC|PROCESSO)\s*:\s*/i, '').trim();
}

/**
 * Extrai o número do SIGADOC / Protocolo contido no texto do histórico do pagamento
 * (ex: "... PROTOCOLO: SEJUS-PRO-2026/18234.02" -> "SEJUS-PRO-2026/18234.02")
 */
export function extractSigadocFromHistorico(historico?: string | null): string {
  if (!historico) return '';
  const trimmed = String(historico).trim();
  if (!trimmed) return '';

  // 1. Procura por marcador explícito: PROTOCOLO:, SIGADOC: ou PROCESSO:
  const matchExplicit = trimmed.match(/(?:PROTOCOLO|SIGADOC|PROCESSO)\s*:\s*([A-Za-z0-9_.\-\/]+)/i);
  if (matchExplicit && matchExplicit[1]) {
    const val = normalizeSigadoc(matchExplicit[1]);
    if (val) return val;
  }

  // 2. Procura formato padrão de processo do Estado (ex: SEJUS-PRO-2026/18234.02 ou SESP-PRO-2025/03206.01)
  const matchOrgan = trimmed.match(/\b([A-Za-z0-9]+-(?:PRO|DOC|ADM)-\d{4}\/[\d.]+)\b/i);
  if (matchOrgan && matchOrgan[1]) {
    const val = normalizeSigadoc(matchOrgan[1]);
    if (val) return val;
  }

  // 3. Procura núcleo com ano, barra e sufixo de medição (ex: 2026/18234.02)
  const matchCoreWithDot = trimmed.match(/\b(\d{4}\/\d{4,}\.\d+)\b/);
  if (matchCoreWithDot && matchCoreWithDot[1]) {
    const val = normalizeSigadoc(matchCoreWithDot[1]);
    if (val) return val;
  }

  return '';
}

/**
 * Obtém o SIGADOC / Protocolo associado a um Pagamento
 */
export function getSigadocFromPagamento(pag: Pagamento): string {
  if (pag.sigadoc) {
    const s = normalizeSigadoc(pag.sigadoc);
    if (s) return s;
  }
  if ((pag as any).protocolo) {
    const p = normalizeSigadoc((pag as any).protocolo);
    if (p) return p;
  }
  if (pag.historico) {
    const fromHist = extractSigadocFromHistorico(pag.historico);
    if (fromHist) return fromHist;
  }
  if (pag.medicaoVinculada) {
    const fromVinc = extractSigadocFromHistorico(pag.medicaoVinculada);
    if (fromVinc) return fromVinc;
  }
  return '';
}

/**
 * Compara dois números de SIGADOC / Protocolo verificando igualdade exata ou de núcleo com sufixo.
 * Garante que medições com sufixos diferentes (ex: .01 vs .02 vs .03) NUNCA se misturem.
 */
export function isSameSigadoc(sigA?: string | null, sigB?: string | null): boolean {
  const a = normalizeSigadoc(sigA);
  const b = normalizeSigadoc(sigB);
  if (!a || !b) return false;
  if (a === b) return true;

  // Extrai núcleo: ano/número.subnúmero (ex: "2026/18234.02")
  const coreA = a.match(/\d{4}\/[\d.]+/)?.[0];
  const coreB = b.match(/\d{4}\/[\d.]+/)?.[0];
  if (coreA && coreB) {
    return coreA === coreB;
  }

  // Comparação alfanumérica estrita (mínimo de 6 caracteres)
  const alphaA = a.replace(/[^A-Z0-9]/g, '');
  const alphaB = b.replace(/[^A-Z0-9]/g, '');
  if (alphaA.length >= 6 && alphaB.length >= 6) {
    if (alphaA === alphaB) return true;
    if (alphaA.endsWith(alphaB) || alphaB.endsWith(alphaA)) {
      // Se um termina no outro, certifique-se de que os últimos 2 dígitos (ex: sufixo 01, 02, 03) coincidem
      return alphaA.slice(-2) === alphaB.slice(-2);
    }
  }

  return false;
}

/**
 * Verifica se um Pagamento corresponde a uma Medição.
 * REGRA ESSENCIAL: O pagamento só pertence à medição quando o SIGADOC / Protocolo
 * de ambos for estritamente igual.
 * Empenho compartilhado não vincula medições diferentes.
 */
export function isPagamentoOfMedicao(pag: Pagamento, med: Medicao): boolean {
  const medSig = normalizeSigadoc(med.sigadoc);
  const pagSig = getSigadocFromPagamento(pag);

  // 1. Se a medição possui SIGADOC:
  if (medSig) {
    // Se o pagamento possui SIGADOC identificado, eles DEVEM ser iguais!
    if (pagSig) {
      return isSameSigadoc(medSig, pagSig);
    }
    // Se o pagamento não tem PROTOCOLO explícito no histórico, mas o histórico contém exatamente o SIGADOC
    if (pag.historico) {
      const histExtracted = extractSigadocFromHistorico(pag.historico);
      if (histExtracted && isSameSigadoc(medSig, histExtracted)) {
        return true;
      }
      if (pag.historico.toUpperCase().includes(medSig)) {
        return true;
      }
    }
    // Se o pagamento tiver link direto por ID da medição
    if (pag.medicaoVinculada && pag.medicaoVinculada === med.id) {
      return true;
    }
    // Caso contrário, NÃO pertence a esta medição
    return false;
  }

  // 2. Se a medição NÃO possui SIGADOC:
  // Se o pagamento possui um SIGADOC específico, ele NÃO pertence a esta medição que não tem SIGADOC
  if (pagSig) {
    return false;
  }

  // 3. Se NENHUM dos dois possui SIGADOC (casos legados sem processo):
  // Link direto por ID
  if (pag.medicaoVinculada && pag.medicaoVinculada === med.id) {
    return true;
  }

  // Link por número da medição (ex: "1ª", "1ª MEDIÇÃO") apenas se pag.medicaoVinculada NÃO for um empenho
  const isLikelyEmpenho = /^\d{5}\.\d{4}/.test(pag.medicaoVinculada || '');
  if (!isLikelyEmpenho && pag.medicaoVinculada && med.numeroMed) {
    const cleanMedNum = med.numeroMed.replace(/[^\d]/g, '');
    const cleanVincNum = (pag.medicaoVinculada || '').replace(/[^\d]/g, '');
    if (cleanMedNum && cleanVincNum && cleanMedNum === cleanVincNum) {
      return true;
    }
  }

  return false;
}

