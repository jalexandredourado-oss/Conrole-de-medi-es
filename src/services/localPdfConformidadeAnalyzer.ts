// @ts-expect-error pdfjs-dist legacy build does not ship typed declarations for worker bundle
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  AnalyzeProcessResult,
  CertidaoVencidaInfo,
  ChecklistItemInput,
  ExtractedDocumentoFolhas,
} from './processConformidadeExtraction';

if (typeof globalThis !== 'undefined' && !(globalThis as any).pdfjsWorker) {
  (globalThis as any).pdfjsWorker = pdfjsWorker;
}

type DocCategory =
  | 'OFICIO_MEDICAO'
  | 'TAC'
  | 'DECISAO_TCE'
  | 'PARECER_PGE'
  | 'RELATORIO_FOTOGRAFICO'
  | 'RELATORIO_LABORATORIAL'
  | 'NOTA_FISCAL'
  | 'ATESTO_NF'
  | 'RELATORIO_ACOMPANHAMENTO'
  | 'RELACAO_FGTS_INSS'
  | 'GRF'
  | 'GPS'
  | 'CERTIDAO_FGTS'
  | 'CERTIDAO_MUNICIPAL'
  | 'CERTIDAO_ESTADUAL'
  | 'CERTIDAO_FEDERAL'
  | 'CERTIDAO_TRABALHISTA'
  | 'EMPENHO_CONTRATO'
  | 'EMPENHO_PAGAMENTO'
  | 'CNPJ'
  | 'CONTRATO'
  | 'EXTRATO_CONTRATO'
  | 'CREA_EMPRESA'
  | 'ART_EXECUCAO'
  | 'CNO'
  | 'CRONOGRAMA_CONTRATO'
  | 'CRONOGRAMA_MEDICAO'
  | 'PORTARIA_FISCAL'
  | 'ART_FISCAL'
  | 'ORDEM_SERVICO'
  | 'PARECER_TECNICO'
  | 'DIARIO_OBRAS'
  | 'FOLHA_IDENTIFICACAO'
  | 'MEDICAO_ACUMULADA'
  | 'PLANILHA_MEDICAO'
  | 'PLUVIOMETRIA'
  | 'FIPLAN_GFO'
  | 'SIAG'
  | 'GEO_OBRAS'
  | 'AQS'
  | 'TERMO_RECEBIMENTO'
  | 'BAIXA_ART'
  | 'AS_BUILT'
  | 'BAIXA_CEI'
  | 'HABITE_SE';

const MULTI_PAGE_CATEGORIES = new Set<DocCategory>([
  'TAC',
  'DECISAO_TCE',
  'PARECER_PGE',
  'RELATORIO_FOTOGRAFICO',
  'RELATORIO_LABORATORIAL',
  'RELATORIO_ACOMPANHAMENTO',
  'RELACAO_FGTS_INSS',
  'CONTRATO',
  'CRONOGRAMA_CONTRATO',
  'CRONOGRAMA_MEDICAO',
  'PARECER_TECNICO',
  'DIARIO_OBRAS',
  'MEDICAO_ACUMULADA',
  'PLANILHA_MEDICAO',
  'AS_BUILT',
  'OFICIO_MEDICAO',
]);

const CERT_CATEGORIES = new Set<DocCategory>([
  'CERTIDAO_FGTS',
  'CERTIDAO_MUNICIPAL',
  'CERTIDAO_ESTADUAL',
  'CERTIDAO_FEDERAL',
  'CERTIDAO_TRABALHISTA',
]);

const MONTHS_PT: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

function normalizeText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function toYmd(year: number, month: number, day: number): number | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return year * 10000 + month * 100 + day;
}

function parseBrDateToYmd(dateStr?: string): number | null {
  if (!dateStr) return null;
  const match = String(dateStr).trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return toYmd(Number(match[3]), Number(match[2]), Number(match[1]));
}

function addDaysToBrDate(dateStr: string, daysToAdd: number): { dateStr: string; ymd: number } | null {
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() + daysToAdd);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return {
    dateStr: `${dd}/${mm}/${yyyy}`,
    ymd: yyyy * 10000 + Number(mm) * 100 + Number(dd),
  };
}

function getTodayYmd(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function extractCertExpiration(rawText: string): { dateStr?: string; ymd: number | null } {
  const norm = normalizeText(rawText);

  // 1. Intervalo explícito (ex: "Validade: 01/11/2026 a 30/11/2026" ou "01/11/2026 - 30/11/2026") -> pega a 2ª data!
  const rangeRegex =
    /(?:VALIDADE|VIGENCIA|PERIODO)[:\s-]*(\d{2}\/\d{2}\/\d{4})\s*(?:A|ATE|-|–)\s*(\d{2}\/\d{2}\/\d{4})/i;
  const rangeMatch = norm.match(rangeRegex);
  if (rangeMatch?.[2]) {
    const ymd = parseBrDateToYmd(rangeMatch[2]);
    if (ymd) return { dateStr: rangeMatch[2], ymd };
  }

  // 2. Data de validade explícita com "até o dia", ":", "-" etc.
  const explicitPatterns: RegExp[] = [
    /(?:VALIDA\s+ATE(?:\s+O\s+DIA)?|VALIDADE\s+ATE(?:\s+O\s+DIA)?|VIGENCIA\s+ATE(?:\s+O\s+DIA)?|DATA\s+DE\s+VALIDADE|VALIDO\s+ATE(?:\s+O\s+DIA)?|VENCIMENTO|EXPIRA\s+EM)[:\s-]*(\d{2}\/\d{2}\/\d{4})/i,
    /VALIDADE[:\s-]+(\d{2}\/\d{2}\/\d{4})/i,
  ];

  for (const regex of explicitPatterns) {
    const m = norm.match(regex);
    if (m?.[1]) {
      const ymd = parseBrDateToYmd(m[1]);
      if (ymd) return { dateStr: m[1], ymd };
    }
  }

  // 3. Data por extenso ("válida até 15 de março de 2026")
  const textMonthMatch = norm.match(
    /(?:VALIDA\s+ATE(?:\s+O\s+DIA)?|VALIDADE[:\s-]*)(\d{1,2})\s+DE\s+(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s+DE\s+(\d{4})/i
  );
  if (textMonthMatch) {
    const day = Number(textMonthMatch[1]);
    const month = MONTHS_PT[textMonthMatch[2].toUpperCase()];
    const year = Number(textMonthMatch[3]);
    const ymd = month ? toYmd(year, month, day) : null;
    if (ymd) {
      return {
        dateStr: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        ymd,
      };
    }
  }

  // 4. Prazo em dias a contar da emissão (comum em certidões municipais e estaduais)
  const validDaysMatch = norm.match(
    /(?:VALIDA\s+POR|PRAZO\s+DE\s+VALIDADE[:\s]*|VALIDADE\s+DE)\s*(\d{1,3})\s*(?:\([^)]+\)\s*)?DIAS/i
  );
  if (validDaysMatch?.[1]) {
    const validDays = Number(validDaysMatch[1]);
    const issueMatch =
      norm.match(
        /(?:EMITIDA\s+EM|DATA\s+DE\s+EMISSAO|EXPEDICAO|EXPEDIDA\s+EM|DATA)[:\s-]*(\d{2}\/\d{2}\/\d{4})/i
      ) || norm.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (validDays > 0 && validDays <= 365 && issueMatch?.[1]) {
      const computed = addDaysToBrDate(issueMatch[1], validDays);
      if (computed) return computed;
    }
  }

  return { ymd: null };
}

function mapChecklistItemToCategory(
  item: ChecklistItemInput,
  isIndenizacao: boolean
): DocCategory | null {
  const codigo = (item.codigo || '').trim();
  const desc = normalizeText(item.descricao);

  if (desc.includes('OFICIO') && (desc.includes('MEDICAO') || desc.includes('ENTREGA'))) {
    return 'OFICIO_MEDICAO';
  }
  if (desc === 'TAC' || desc.includes('AJUSTAMENTO DE CONDUTA')) return 'TAC';
  if (desc.includes('DECISOES DO TCE') || desc.includes('DECISAO DO TCE')) return 'DECISAO_TCE';
  if (desc.includes('PARECER REFERENCIAL') || (desc.includes('PGE') && !desc.includes('CERTIDAO'))) {
    return 'PARECER_PGE';
  }
  if (desc.includes('RELATORIO FOTOGRAFICO') || desc.includes('REGISTRO FOTOGRAFICO')) {
    return 'RELATORIO_FOTOGRAFICO';
  }
  if (desc.includes('ANALISES LABORATORIAL') || desc.includes('ANALISE LABORATORIAL')) {
    return 'RELATORIO_LABORATORIAL';
  }
  if (desc.includes('ATESTO DA NOTA FISCAL')) return 'ATESTO_NF';
  if (desc === 'NOTA FISCAL' || desc.includes('NOTA FISCAL')) return 'NOTA_FISCAL';
  if (desc.includes('RELATORIO DE ACOMPANHAMENTO')) return 'RELATORIO_ACOMPANHAMENTO';
  if (desc.includes('RELACAO DE ENVIO FGTS')) return 'RELACAO_FGTS_INSS';
  if (desc.includes('GRF') || desc.includes('GUIA DE RECOLHIMENTO DO FGTS')) return 'GRF';
  if (desc.includes('GPS') || desc.includes('GUIA DA PREVIDENCIA SOCIAL')) return 'GPS';
  if (desc.includes('CERTIDAO NEGATIVA DO FGTS') || (desc.includes('CERTIDAO') && desc.includes('FGTS'))) {
    return 'CERTIDAO_FGTS';
  }
  if (desc.includes('PREFEITURA MUNICIPAL') || desc.includes('MUNICIPAL')) {
    return 'CERTIDAO_MUNICIPAL';
  }
  if (desc.includes('SEFAZ') || desc.includes('ESTADO DE MATO GROSSO')) {
    return 'CERTIDAO_ESTADUAL';
  }
  if (desc.includes('DIVIDA ATIVA DA UNIAO') || desc.includes('CREDITOS TRIBUTARIOS FEDERAIS')) {
    return 'CERTIDAO_FEDERAL';
  }
  if (desc.includes('TRABALHISTAS') || desc.includes('TST')) {
    return 'CERTIDAO_TRABALHISTA';
  }
  if (desc === 'NOTA DE EMPENHO' || (codigo === '1.10' && desc.includes('EMPENHO'))) {
    return isIndenizacao ? 'EMPENHO_PAGAMENTO' : 'EMPENHO_CONTRATO';
  }
  if (desc === 'EMPENHO' || desc.includes('EMPENHO')) {
    return 'EMPENHO_PAGAMENTO';
  }
  if (desc === 'CNPJ') return 'CNPJ';

  if (!isIndenizacao) {
    if (desc.includes('INSTRUMENTO CONTRATUAL')) return 'CONTRATO';
    if (desc.includes('PUBLICACAO EXTRATO')) return 'EXTRATO_CONTRATO';
    if (desc.includes('REGISTRO DA EMPRESA NO CREA')) return 'CREA_EMPRESA';
    if (desc.includes('ART DO RESPONSAVEL TECNICO')) return 'ART_EXECUCAO';
    if (desc.includes('MATRICULA DA OBRA NO CNO')) return 'CNO';
    if (desc.includes('CRONOGRAMA FISICO-FINANCEIRO')) {
      return codigo.startsWith('1.') ? 'CRONOGRAMA_CONTRATO' : 'CRONOGRAMA_MEDICAO';
    }
    if (desc.includes('PORTARIA DE NOMEACAO DO FISCAL')) return 'PORTARIA_FISCAL';
    if (desc.includes('ART DO FISCAL')) return 'ART_FISCAL';
    if (desc.includes('ORDEM DE SERVICO')) return 'ORDEM_SERVICO';
    if (desc.includes('PARECER TECNICO')) return 'PARECER_TECNICO';
    if (desc.includes('DIARIO DE OBRAS')) return 'DIARIO_OBRAS';
    if (desc.includes('FOLHA DE IDENTIFICACAO')) return 'FOLHA_IDENTIFICACAO';
    if (desc.includes('MEDICAO ACUMULADA')) return 'MEDICAO_ACUMULADA';
    if (desc.includes('PLANILHA DE MEDICAO')) return 'PLANILHA_MEDICAO';
    if (desc.includes('PLUVIOMETRICOS') || desc.includes('PLUVIOMETRIA')) return 'PLUVIOMETRIA';
    if (desc.includes('FIPLAN')) return 'FIPLAN_GFO';
    if (desc.includes('SIAG')) return 'SIAG';
    if (desc.includes('GEO-OBRAS')) return 'GEO_OBRAS';
    if (desc === 'AQS') return 'AQS';
    if (desc.includes('TERMO DE RECEBIMENTO')) return 'TERMO_RECEBIMENTO';
    if (desc.includes('BAIXA DA ART')) return 'BAIXA_ART';
    if (desc.includes('AS BUILT') || desc.includes('COMO CONSTRUIDO')) return 'AS_BUILT';
    if (desc.includes('BAIXA DO CEI')) return 'BAIXA_CEI';
    if (desc.includes('HABITE-SE') || desc.includes('AUTORIZACAO DE USO')) return 'HABITE_SE';
  }

  return null;
}

interface PageData {
  pdfPageNum: number;
  effectivePageNum: number;
  stampedFolio: number | null;
  rawText: string;
  lines: string[];
  sidebarText: string;
  norm: string;
  titleNorm: string;
  topNorm: string;
  bottomNorm: string;
  docPageNum: number | null;
  docTotalPages: number | null;
}

function reconstructVisualLines(items: any[]): { lines: string[]; sidebarLines: string[] } {
  const mainTokens: Array<{ str: string; x: number; y: number }> = [];
  const sidebarTokens: Array<{ str: string; x: number; y: number }> = [];

  for (const it of items) {
    const str = typeof it?.str === 'string' ? it.str.trim() : '';
    if (!str) continue;
    const tr = Array.isArray(it?.transform) ? it.transform : [1, 0, 0, 1, 0, 0];
    const a = Number(tr[0]) || 0;
    const b = Number(tr[1]) || 0;
    const c = Number(tr[2]) || 0;
    const d = Number(tr[3]) || 0;
    const x = Number(tr[4]) || 0;
    const y = Number(tr[5]) || 0;

    // Detecta texto rotacionado ~90 graus típico da faixa lateral do SIGADOC / marca d'água
    const isRotated90 =
      (Math.abs(b) > Math.abs(a) * 2 && Math.abs(b) > 0.4) ||
      (Math.abs(c) > Math.abs(d) * 2 && Math.abs(c) > 0.4);

    if (isRotated90) {
      sidebarTokens.push({ str, x, y });
    } else {
      mainTokens.push({ str, x, y });
    }
  }

  const buildLines = (tokens: Array<{ str: string; x: number; y: number }>): string[] => {
    if (tokens.length === 0) return [];
    tokens.sort((t1, t2) => {
      if (Math.abs(t2.y - t1.y) > 5) return t2.y - t1.y;
      return t1.x - t2.x;
    });
    const out: string[] = [];
    let currentY = tokens[0].y;
    let currentLine: Array<{ str: string; x: number }> = [];

    for (const t of tokens) {
      if (Math.abs(t.y - currentY) > 5) {
        currentLine.sort((l1, l2) => l1.x - l2.x);
        const joined = currentLine.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim();
        if (joined) out.push(joined);
        currentY = t.y;
        currentLine = [{ str: t.str, x: t.x }];
      } else {
        currentLine.push({ str: t.str, x: t.x });
      }
    }
    if (currentLine.length > 0) {
      currentLine.sort((l1, l2) => l1.x - l2.x);
      const joined = currentLine.map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim();
      if (joined) out.push(joined);
    }
    return out;
  };

  const mainLines = buildLines(mainTokens);
  const sidebarLines = buildLines(sidebarTokens);

  // Caso raríssimo em que a página inteira esteja rotacionada 90 graus (sem linhas horizontais)
  if (mainLines.length === 0 && sidebarLines.length > 0) {
    return { lines: sidebarLines, sidebarLines: [] };
  }

  return { lines: mainLines, sidebarLines };
}

function extractCornerFolio(lines: string[], sidebarLines: string[]): number | null {
  const candidates = [...lines.slice(0, 4), ...lines.slice(-4), ...sidebarLines];
  for (const line of candidates) {
    const clean = normalizeText(line);
    const m = clean.match(/(?:^|\b)(?:FLS?\.?|FOLHA)\s*(?:N[Oº°.]?\s*)?[:.]?\s*0*(\d{1,5})\b/i);
    if (m?.[1]) {
      // Só aceita se for linha curta de carimbo de folha (não frase citando "conforme fls. 12")
      if (clean.length <= 42) {
        const n = Number(m[1]);
        if (n > 0 && n < 50000) return n;
      }
    }
  }
  return null;
}

function extractDocPagination(lines: string[]): { docPageNum: number | null; docTotalPages: number | null } {
  const edgeLines = [...lines.slice(0, 5), ...lines.slice(-5)];
  for (const line of edgeLines) {
    const clean = normalizeText(line);
    const m = clean.match(/(?:PAGINA|PAG\.?|PAGE)\s*(\d{1,4})\s*(?:DE|OF|\/)\s*(\d{1,4})\b/);
    if (m) {
      const cur = Number(m[1]);
      const tot = Number(m[2]);
      if (cur >= 1 && tot >= cur && tot <= 500) {
        return { docPageNum: cur, docTotalPages: tot };
      }
    }
  }
  return { docPageNum: null, docTotalPages: null };
}

function detectAdministrativeWrapperPage(page: PageData): boolean {
  const { titleNorm, topNorm, norm } = page;

  // Planilha de checklist / conformidade anexada dentro do PDF lista todos os nomes de documentos!
  if (
    titleNorm.includes('CONFORMIDADE DOCUMENTAL') ||
    titleNorm.includes('LISTA DE VERIFICACAO') ||
    titleNorm.includes('CHECKLIST') ||
    (norm.includes('DOCUMENTOS DA MEDICAO') &&
      norm.includes('REGULARIDADE FISCAL') &&
      norm.includes('FUNDAMENTO JURIDICO'))
  ) {
    return true;
  }

  // Capa, autuação, termo de abertura, espelho de tramitação SIGADOC
  if (
    titleNorm.includes('CAPA DO PROCESSO') ||
    titleNorm.includes('ESPELHO DO PROCESSO') ||
    titleNorm.includes('TERMO DE ABERTURA') ||
    titleNorm.includes('CERTIDAO DE JUNTADA') ||
    titleNorm.includes('HISTORICO DE TRAMITACAO') ||
    titleNorm.includes('MOVIMENTACAO DO PROCESSO') ||
    (titleNorm.includes('PROTOCOLO:') && titleNorm.includes('AUTUACAO'))
  ) {
    return true;
  }

  // Despachos e encaminhamentos internos (DESPACHO Nº..., DESPACHO DE PAGAMENTO, DESPACHO NGER)
  if (
    /\bDESPACHO\b/.test(titleNorm) ||
    /\bINFORMACAO\s+N[Oº°.]?\s*\d+/.test(titleNorm) ||
    /\bCI\s+N[Oº°.]?\s*\d+/.test(titleNorm) ||
    (/\bMEMORANDO\b/.test(titleNorm) && !topNorm.includes('MEDICAO') && !topNorm.includes('ENTREGA'))
  ) {
    // Evita confundir Parecer Técnico ou Atesto formal com Despacho
    if (
      !titleNorm.includes('TERMO DE ATESTO') &&
      !titleNorm.includes('CERTIDAO DE ATESTO') &&
      !titleNorm.includes('PARECER TECNICO') &&
      !titleNorm.includes('PARECER REFERENCIAL')
    ) {
      return true;
    }
  }

  return false;
}

function classifyPage(
  page: PageData,
  prevCategory: DocCategory | null,
  prevDocEnded: boolean,
  prevDocTotalPages: number | null,
  availableCategories: Set<DocCategory>,
  empenhoCat: DocCategory,
  cronogramaCat: DocCategory
): { category: DocCategory | null; isStrongMatch: boolean; hasInlineAtesto: boolean } {
  const { norm, titleNorm, topNorm, docPageNum, docTotalPages } = page;
  const scores = new Map<DocCategory, number>();

  const addScore = (cat: DocCategory, pts: number) => {
    if (!availableCategories.has(cat)) return;
    scores.set(cat, (scores.get(cat) || 0) + pts);
  };

  // Página administrativa de capa, despacho, tramitação ou checklist prévio
  const isWrapperPage = detectAdministrativeWrapperPage(page);
  if (isWrapperPage) {
    return { category: null, isStrongMatch: false, hasInlineAtesto: false };
  }

  // Peça discursiva jurídica / cláusulas longas / acórdão (NÃO inclui mero cabeçalho "CONTRATO Nº ...")
  const isNarrativeLegalOrTechnicalDoc =
    titleNorm.includes('PARECER REFERENCIAL') ||
    titleNorm.includes('ACORDAO') ||
    titleNorm.includes('TERMO DE AJUSTAMENTO') ||
    norm.includes('VISTOS, RELATADOS E DISCUTIDOS') ||
    norm.includes('E O RELATORIO. PASSO A OPINAR') ||
    norm.includes('CLAUSULA PRIMEIRA') ||
    norm.includes('CLAUSULA SEGUNDA');

  // --- 1. CERTIDÕES (exigem estrutura real de certidão; jamais citação em parecer) ---
  const hasCertStructure =
    !isNarrativeLegalOrTechnicalDoc &&
    (topNorm.includes('CERTIDAO') ||
      topNorm.includes('CERTIFICADO DE REGULARIDADE') ||
      norm.includes('CODIGO DE CONTROLE') ||
      norm.includes('AUTENTICIDADE') ||
      norm.includes('CERTIFICA-SE') ||
      norm.includes('CERTIFICAMOS') ||
      (norm.includes('CERTIDAO') && (norm.includes('VALIDA') || norm.includes('VALIDADE') || norm.includes('EXPEDIDA'))));

  if (hasCertStructure) {
    if (
      topNorm.includes('CERTIFICADO DE REGULARIDADE DO FGTS') ||
      (norm.includes('CERTIFICADO DE REGULARIDADE DO FGTS') && norm.includes('CAIXA'))
    ) {
      addScore('CERTIDAO_FGTS', 145);
    }
    if (
      !norm.includes('CREA') &&
      !norm.includes('CAU') &&
      !norm.includes('BOMBEIROS') &&
      ((topNorm.includes('CERTIDAO') && (topNorm.includes('MUNICIP') || topNorm.includes('PREFEITURA'))) ||
        (norm.includes('PREFEITURA MUNICIPAL') &&
          norm.includes('CERTIDAO') &&
          (norm.includes('TRIBUTOS') || norm.includes('DIVIDA ATIVA') || norm.includes('ISS') || norm.includes('FAZENDA'))))
    ) {
      addScore('CERTIDAO_MUNICIPAL', 140);
    }
    if (
      (topNorm.includes('CERTIDAO') &&
        (topNorm.includes('SEFAZ') ||
          topNorm.includes('PENDENCIAS TRIBUTARIAS') ||
          topNorm.includes('SECRETARIA DE ESTADO DE FAZENDA'))) ||
      ((norm.includes('SEFAZ') || norm.includes('SECRETARIA DE ESTADO DE FAZENDA')) &&
        (norm.includes('PGE') || norm.includes('PROCURADORIA GERAL DO ESTADO') || norm.includes('PENDENCIAS TRIBUTARIAS')) &&
        norm.includes('CERTIDAO'))
    ) {
      addScore('CERTIDAO_ESTADUAL', 140);
    }
    if (
      (topNorm.includes('CERTIDAO') &&
        (topNorm.includes('DIVIDA ATIVA DA UNIAO') ||
          topNorm.includes('RECEITA FEDERAL') ||
          topNorm.includes('CREDITOS TRIBUTARIOS FEDERAIS'))) ||
      (norm.includes('RECEITA FEDERAL') &&
        /PROCURADORIA.?GERAL DA FAZENDA NACIONAL/.test(norm) &&
        norm.includes('DIVIDA ATIVA DA UNIAO'))
    ) {
      addScore('CERTIDAO_FEDERAL', 140);
    }
    if (
      topNorm.includes('CERTIDAO NEGATIVA DE DEBITOS TRABALHISTAS') ||
      (norm.includes('JUSTICA DO TRABALHO') && (norm.includes('DEBITOS TRABALHISTAS') || norm.includes('CNDT')))
    ) {
      addScore('CERTIDAO_TRABALHISTA', 145);
    }
  }

  // --- 2. GUIAS, COMPROVANTES E RELAÇÕES FGTS/INSS/EMPENHO/CNPJ ---
  if (!isNarrativeLegalOrTechnicalDoc) {
    const isPaymentReceipt =
      topNorm.includes('COMPROVANTE DE PAGAMENTO') ||
      topNorm.includes('AUTENTICACAO BANCARIA') ||
      topNorm.includes('COMPROVANTE DE TRANSFERENCIA') ||
      topNorm.includes('COMPROVANTE PIX') ||
      norm.includes('PAGAMENTO EFETUADO COM SUCESSO');

    // GRF / FGTS Digital / Comprovante FGTS
    if (
      topNorm.includes('GUIA DE RECOLHIMENTO DO FGTS') ||
      topNorm.includes('GUIA DO FGTS DIGITAL') ||
      /\bGRF\b/.test(titleNorm) ||
      /\bGFD\b/.test(titleNorm) ||
      (isPaymentReceipt && (norm.includes('FGTS') || norm.includes('GFD') || norm.includes('GRF'))) ||
      (norm.includes('GUIA DE RECOLHIMENTO DO FGTS') &&
        (norm.includes('CAIXA') || norm.includes('AUTENTICACAO') || norm.includes('CODIGO DE BARRAS')))
    ) {
      addScore('GRF', 130);
    }

    // GPS / DARF Previdenciário / Comprovante DARF-GPS
    if (
      topNorm.includes('GUIA DA PREVIDENCIA SOCIAL') ||
      /\bGPS\b/.test(titleNorm) ||
      topNorm.includes('DARF PREVIDENCIARIO') ||
      (norm.includes('DOCUMENTO DE ARRECADACAO DE RECEITAS FEDERAIS') &&
        (norm.includes('DARF') || norm.includes('PREVIDENCI') || norm.includes('CP PATRONAL') || norm.includes('CP SEGURADOS') || norm.includes('1082') || norm.includes('1138') || norm.includes('1162'))) ||
      (isPaymentReceipt && (norm.includes('DARF') || norm.includes('GPS') || norm.includes('PREVIDENCIA') || norm.includes('RECEITA FEDERAL'))) ||
      (norm.includes('GUIA DA PREVIDENCIA SOCIAL') && (norm.includes('CODIGO DE PAGAMENTO') || norm.includes('INSS')))
    ) {
      addScore('GPS', 130);
    }

    // Relação de envio FGTS/INSS (GFIP, SEFIP, DCTFWeb Declaração/Recibo — sem ser o DARF ou Guia)
    const isGuideOrDarf =
      norm.includes('DOCUMENTO DE ARRECADACAO DE RECEITAS FEDERAIS') ||
      topNorm.includes('GUIA DE RECOLHIMENTO') ||
      topNorm.includes('GUIA DO FGTS DIGITAL');

    if (
      !isGuideOrDarf &&
      !isPaymentReceipt &&
      (topNorm.includes('RELACAO DE ENVIO') ||
        topNorm.includes('CONECTIVIDADE SOCIAL') ||
        topNorm.includes('PROTOCOLO DE ENVIO') ||
        topNorm.includes('RESUMO DO FECHAMENTO') ||
        topNorm.includes('RELACAO DOS TRABALHADORES') ||
        (topNorm.includes('DCTFWEB') && (norm.includes('RECIBO') || norm.includes('DECLARACAO') || norm.includes('DEBITOS'))) ||
        (norm.includes('SEFIP') && norm.includes('RELACAO DOS TRABALHADORES')) ||
        (norm.includes('GFIP') && norm.includes('CONECTIVIDADE SOCIAL')))
    ) {
      addScore('RELACAO_FGTS_INSS', 125);
    }

    // CNPJ
    if (
      /CADASTRO NACIONAL D[AE] PESSOA JURIDICA/.test(norm) &&
      (norm.includes('COMPROVANTE DE INSCRICAO') || norm.includes('SITUACAO CADASTRAL') || norm.includes('ATIVIDADE ECONOMICA'))
    ) {
      addScore('CNPJ', 135);
    }

    // Nota de Empenho / PED / Empenho
    if (
      titleNorm.includes('NOTA DE EMPENHO') ||
      titleNorm.includes('PEDIDO DE EMPENHO') ||
      (topNorm.includes('NOTA DE EMPENHO') && (norm.includes('DOTACAO') || norm.includes('CREDOR') || norm.includes('ELEMENTO'))) ||
      (norm.includes('FIPLAN') && norm.includes('EMPENHO') && (norm.includes('DOTACAO') || norm.includes('CREDOR')))
    ) {
      addScore(empenhoCat, 125);
    }
  }

  // --- 3. NOTA FISCAL vs ATESTO DA NOTA FISCAL ---
  const hasAtestoHeadingLine = page.lines
    .slice(0, 8)
    .some((l) => /^ATESTO\b|^TERMO\s+DE\s+ATESTO\b|^CERTIDAO\s+DE\s+ATESTO\b|^DECLARACAO\s+DE\s+ATESTO\b/.test(normalizeText(l)));

  const isExplicitSeparateAtesto =
    !isNarrativeLegalOrTechnicalDoc &&
    (hasAtestoHeadingLine ||
      topNorm.includes('ATESTO DA NOTA FISCAL') ||
      topNorm.includes('TERMO DE ATESTO') ||
      topNorm.includes('CERTIDAO DE ATESTO') ||
      topNorm.includes('DECLARACAO DE ATESTO') ||
      topNorm.includes('ATESTADO DE EXECUCAO'));

  const isRealNotaFiscal =
    !isNarrativeLegalOrTechnicalDoc &&
    !isExplicitSeparateAtesto &&
    (titleNorm.includes('NOTA FISCAL') ||
      titleNorm.includes('NFS-E') ||
      titleNorm.includes('DANFE') ||
      (norm.includes('NOTA FISCAL DE SERVICOS ELETRONICA') && (norm.includes('TOMADOR') || norm.includes('PRESTADOR'))) ||
      (norm.includes('DANFE') && norm.includes('CHAVE DE ACESSO')));

  const hasAtestoBodySignal =
    !isNarrativeLegalOrTechnicalDoc &&
    (isExplicitSeparateAtesto ||
      norm.includes('ATESTAMOS QUE OS SERVICOS') ||
      norm.includes('ATESTO QUE OS SERVICOS') ||
      norm.includes('ATESTO O RECEBIMENTO') ||
      norm.includes('ATESTAMOS PARA OS DEVIDOS FINS'));

  if (isExplicitSeparateAtesto) {
    addScore('ATESTO_NF', 135);
  } else {
    if (isRealNotaFiscal) {
      addScore('NOTA_FISCAL', 130);
    }
    if (hasAtestoBodySignal && !isRealNotaFiscal) {
      addScore('ATESTO_NF', 130);
    }
  }

  // --- 4. DOCUMENTOS JURÍDICOS E RELATÓRIOS ---
  if (
    titleNorm.includes('TERMO DE AJUSTAMENTO DE CONDUTA') ||
    (/\bTAC\b/.test(titleNorm) && norm.includes('AJUSTAMENTO')) ||
    (topNorm.includes('TERMO DE AJUSTAMENTO DE CONDUTA') && norm.includes('COMPROMISSARIO'))
  ) {
    addScore('TAC', 130);
  }
  if (
    titleNorm.includes('TRIBUNAL DE CONTAS') ||
    titleNorm.includes('ACORDAO') ||
    (norm.includes('TRIBUNAL DE CONTAS DO ESTADO') &&
      (norm.includes('VISTOS, RELATADOS') || norm.includes('ACORDAO') || norm.includes('RELATORIO DE CONFORMIDADE')))
  ) {
    addScore('DECISAO_TCE', 130);
  }
  if (
    titleNorm.includes('PARECER REFERENCIAL') ||
    (topNorm.includes('PARECER REFERENCIAL') && !topNorm.includes('CONFORME PARECER')) ||
    (topNorm.includes('PROCURADORIA GERAL DO ESTADO') && titleNorm.includes('PARECER'))
  ) {
    addScore('PARECER_PGE', 135);
  }

  // Laboratorial vs Fotográfico vs Acompanhamento
  const isLabSignal =
    titleNorm.includes('RELATORIO DE ANALISE') ||
    titleNorm.includes('ANALISES LABORATORIA') ||
    titleNorm.includes('LAUDO LABORATORIAL') ||
    titleNorm.includes('BOLETIM DE ANALISE') ||
    norm.includes('CONCLUSAO E PARECER DO ANALISTA') ||
    (!isNarrativeLegalOrTechnicalDoc &&
      ((norm.includes('DBO') && norm.includes('DQO') && norm.includes('CONAMA')) ||
        (norm.includes('PARAMETROS FISICO-QUIMICOS') && norm.includes('EFLUENTE'))));

  if (isLabSignal) {
    addScore('RELATORIO_LABORATORIAL', 140);
  } else if (
    titleNorm.includes('RELATORIO FOTOGRAFICO') ||
    titleNorm.includes('REGISTRO FOTOGRAFICO') ||
    titleNorm.includes('ANEXO FOTOGRAFICO') ||
    topNorm.includes('RELATORIO FOTOGRAFICO') ||
    topNorm.includes('REGISTRO FOTOGRAFICO')
  ) {
    addScore('RELATORIO_FOTOGRAFICO', 130);
  }

  if (
    titleNorm.includes('RELATORIO DE ACOMPANHAMENTO') ||
    titleNorm.includes('RELATORIO DE FISCALIZACAO') ||
    norm.includes('IN 005/2018/SESP') ||
    norm.includes('INSTRUCAO NORMATIVA 005/2018') ||
    (topNorm.includes('ACOMPANHAMENTO') && norm.includes('IN 005/2018'))
  ) {
    addScore('RELATORIO_ACOMPANHAMENTO', 135);
  }

  // Ofício solicitando medição / entrega [E-MAIL]
  const looksLikeEmailMessage =
    (topNorm.includes('DE:') && (topNorm.includes('PARA:') || topNorm.includes('ENVIAD'))) ||
    (topNorm.includes('REMETENTE:') && topNorm.includes('ASSUNTO:')) ||
    (/\bE-MAIL\b/.test(topNorm) && norm.includes('MEDICAO'));

  const looksLikeOficioHeader =
    !norm.includes('RESPOSTA AO OFICIO') &&
    (/\bOFICIO\s*(?:N[Oº°.]?|CIRCULAR|\d+)/.test(titleNorm) ||
      titleNorm.includes('REQUERIMENTO DE MEDICAO') ||
      (titleNorm.includes('SOLICITACAO DE MEDICAO') && !hasCertStructure));

  if (!isNarrativeLegalOrTechnicalDoc && !isRealNotaFiscal && !hasCertStructure && !isLabSignal) {
    if (looksLikeEmailMessage && (norm.includes('MEDICAO') || norm.includes('ENTREGA') || norm.includes('NOTA FISCAL') || norm.includes('SERVICO'))) {
      addScore('OFICIO_MEDICAO', 115);
    } else if (looksLikeOficioHeader && (norm.includes('MEDICAO') || norm.includes('ENTREGA') || norm.includes('SOLICIT') || norm.includes('ENCAMINH'))) {
      addScore('OFICIO_MEDICAO', 110);
    }
  }

  // --- 5. ITENS DE PAGAMENTO COMUM ---
  if (
    (titleNorm.includes('CONTRATO N') || titleNorm.includes('TERMO DE CONTRATO') || titleNorm.includes('TERMO ADITIVO')) &&
    (norm.includes('CLAUSULA') || (norm.includes('CONTRATANTE') && norm.includes('CONTRATADA')))
  ) {
    addScore('CONTRATO', 130);
  }
  if (
    titleNorm.includes('EXTRATO DO CONTRATO') ||
    titleNorm.includes('EXTRATO DE CONTRATO') ||
    titleNorm.includes('EXTRATO DE TERMO ADITIVO') ||
    (norm.includes('DIARIO OFICIAL') && norm.includes('EXTRATO') && (norm.includes('CONTRATO') || norm.includes('ADITIVO')))
  ) {
    addScore('EXTRATO_CONTRATO', 125);
  }
  if (
    (topNorm.includes('CERTIDAO DE REGISTRO') || topNorm.includes('REGISTRO DE PESSOA JURIDICA')) &&
    (norm.includes('CREA') || norm.includes('CAU')) &&
    !norm.includes('ANOTACAO DE RESPONSABILIDADE')
  ) {
    addScore('CREA_EMPRESA', 125);
  }

  // ART: nunca confundir com "Art. 62", "Art. 27" etc. de textos legais!
  const isRealArtDoc =
    topNorm.includes('ANOTACAO DE RESPONSABILIDADE TECNICA') ||
    topNorm.includes('REGISTRO DE RESPONSABILIDADE TECNICA') ||
    (/\b(?:ART|RRT)\s*(?:N[Oº°.]?|CREA|CAU)?\s*[:.]?\s*[A-Z]*\d{5,}/.test(topNorm) && (norm.includes('CREA') || norm.includes('CAU')));
  if (isRealArtDoc) {
    if (norm.includes('FISCALIZACAO') || norm.includes('FISCAL DO CONTRATO') || norm.includes('FISCAL DA OBRA')) {
      addScore('ART_FISCAL', 125);
    } else {
      addScore('ART_EXECUCAO', 120);
    }
  }

  if (
    topNorm.includes('CADASTRO NACIONAL DE OBRAS') ||
    (/\bCNO\b/.test(titleNorm) && (norm.includes('OBRA') || norm.includes('RECEITA FEDERAL')))
  ) {
    if (norm.includes('BAIXA')) addScore('BAIXA_CEI', 120);
    else addScore('CNO', 120);
  }

  if (
    titleNorm.includes('CRONOGRAMA FISICO') ||
    topNorm.includes('CRONOGRAMA FISICO-FINANCEIRO') ||
    topNorm.includes('CRONOGRAMA FISICO FINANCEIRO') ||
    (titleNorm.includes('CRONOGRAMA') && norm.includes('ETAPA'))
  ) {
    addScore(cronogramaCat, 120);
  }

  if (
    titleNorm.includes('PORTARIA') &&
    (norm.includes('FISCAL') || norm.includes('GESTOR') || norm.includes('DESIGN'))
  ) {
    addScore('PORTARIA_FISCAL', 125);
  }

  if (
    titleNorm.includes('ORDEM DE SERVICO') ||
    titleNorm.includes('ORDEM DE PARALISACAO') ||
    titleNorm.includes('ORDEM DE REINICIO') ||
    (topNorm.includes('ORDEM DE SERVICO') && (norm.includes('AUTORIZ') || norm.includes('CONTRATADA') || norm.includes('PRAZO')))
  ) {
    addScore('ORDEM_SERVICO', 125);
  }

  if (
    (titleNorm.includes('PARECER TECNICO') || topNorm.includes('PARECER TECNICO')) &&
    !norm.includes('ANALISTA') &&
    !norm.includes('PARECER REFERENCIAL')
  ) {
    addScore('PARECER_TECNICO', 115);
  }

  if (
    titleNorm.includes('DIARIO DE OBRA') ||
    titleNorm.includes('RELATORIO DIARIO DE OBRA') ||
    /\bRDO\b/.test(titleNorm) ||
    topNorm.includes('DIARIO DE OBRAS')
  ) {
    addScore('DIARIO_OBRAS', 125);
  }

  if (
    titleNorm.includes('FOLHA DE IDENTIFICACAO') ||
    topNorm.includes('FOLHA DE IDENTIFICACAO') ||
    titleNorm.includes('IDENTIFICACAO DO CONTRATO')
  ) {
    addScore('FOLHA_IDENTIFICACAO', 125);
  }

  if (
    titleNorm.includes('MEDICAO ACUMULADA') ||
    topNorm.includes('MEDICAO ACUMULADA') ||
    titleNorm.includes('RESUMO DA MEDICAO')
  ) {
    addScore('MEDICAO_ACUMULADA', 125);
  }

  if (
    titleNorm.includes('PLANILHA DE MEDICAO') ||
    titleNorm.includes('BOLETIM DE MEDICAO') ||
    topNorm.includes('PLANILHA DE MEDICAO') ||
    topNorm.includes('BOLETIM DE MEDICAO')
  ) {
    addScore('PLANILHA_MEDICAO', 125);
  }

  if (
    !topNorm.includes('DIARIO DE OBRA') &&
    (titleNorm.includes('PLUVIOMETR') ||
      topNorm.includes('FICHA DE INDICES PLUVIOMETRICOS') ||
      topNorm.includes('BOLETIM PLUVIOMETRICO'))
  ) {
    addScore('PLUVIOMETRIA', 125);
  }

  if (
    !isNarrativeLegalOrTechnicalDoc &&
    norm.includes('FIPLAN') &&
    (norm.includes('GFO') || topNorm.includes('GFO'))
  ) {
    addScore('FIPLAN_GFO', 120);
  }

  if (
    !isNarrativeLegalOrTechnicalDoc &&
    topNorm.includes('SIAG') &&
    (norm.includes('ATUALIZACAO') || norm.includes('CONTRATO') || norm.includes('SISTEMA'))
  ) {
    addScore('SIAG', 115);
  }

  if (
    !isNarrativeLegalOrTechnicalDoc &&
    (norm.includes('GEO-OBRAS') || norm.includes('GEOOBRAS')) &&
    (norm.includes('TCE') || norm.includes('MEDICAO') || norm.includes('OBRA'))
  ) {
    addScore('GEO_OBRAS', 120);
  }

  if (
    /\bAQS\b/.test(titleNorm) ||
    topNorm.includes('AUTORIZACAO PARA QUITACAO')
  ) {
    addScore('AQS', 125);
  }

  if (
    titleNorm.includes('TERMO DE RECEBIMENTO PROVISORIO') ||
    titleNorm.includes('TERMO DE RECEBIMENTO DEFINITIVO') ||
    topNorm.includes('TERMO DE RECEBIMENTO')
  ) {
    addScore('TERMO_RECEBIMENTO', 130);
  }

  if (topNorm.includes('BAIXA DA ART') || (norm.includes('BAIXA') && norm.includes('ART') && norm.includes('FISCAL'))) {
    addScore('BAIXA_ART', 125);
  }

  if (titleNorm.includes('AS BUILT') || titleNorm.includes('COMO CONSTRUIDO') || topNorm.includes('AS BUILT')) {
    addScore('AS_BUILT', 125);
  }

  if (topNorm.includes('BAIXA DO CEI') || (topNorm.includes('BAIXA') && norm.includes('CNO'))) {
    addScore('BAIXA_CEI', 125);
  }

  if (
    titleNorm.includes('HABITE-SE') ||
    topNorm.includes('CORPO DE BOMBEIROS') ||
    topNorm.includes('LICENCA DE INSTALACAO') ||
    topNorm.includes('AUTORIZACAO DE USO')
  ) {
    addScore('HABITE_SE', 125);
  }

  let bestCat: DocCategory | null = null;
  let bestScore = 0;
  for (const [cat, score] of scores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  if (bestCat && bestScore >= 100) {
    return {
      category: bestCat,
      isStrongMatch: true,
      hasInlineAtesto: bestCat === 'NOTA_FISCAL' && hasAtestoBodySignal,
    };
  }

  // --- Continuação de documentos multipágina (com parada exata no fim do documento ou início de novo doc) ---
  const startsNewPagedDoc = docPageNum === 1 && docTotalPages !== null && docTotalPages >= 1;
  if (!prevDocEnded && !startsNewPagedDoc && prevCategory && MULTI_PAGE_CATEGORIES.has(prevCategory)) {
    const continuesPagedSequence =
      docPageNum !== null &&
      docPageNum > 1 &&
      (prevDocTotalPages === null || docTotalPages === prevDocTotalPages);

    if (continuesPagedSequence) {
      return { category: prevCategory, isStrongMatch: false, hasInlineAtesto: false };
    }

    // Relatório fotográfico frequentemente contém páginas só com imagens ou legendas curtas/longas
    if (prevCategory === 'RELATORIO_FOTOGRAFICO') {
      const looksLikeDistinctTextHeader =
        norm.length > 900 &&
        !norm.includes('FOTO') &&
        !norm.includes('IMAGEM') &&
        !norm.includes('FIGURA') &&
        !norm.includes('REGISTRO FOTO');
      if (!looksLikeDistinctTextHeader) {
        return { category: 'RELATORIO_FOTOGRAFICO', isStrongMatch: false, hasInlineAtesto: false };
      }
    }

    // Continuação de documentos com texto (sem Página X de Y explícito):
    if (norm.length >= 25) {
      const looksLikeNewOtherHeader =
        titleNorm.includes('TERMO DE') ||
        titleNorm.includes('CERTIDAO') ||
        titleNorm.includes('PORTARIA') ||
        titleNorm.includes('RESOLUCAO') ||
        titleNorm.includes('NOTA FISCAL') ||
        titleNorm.includes('GUIA DE') ||
        titleNorm.includes('ORDEM DE SERVICO');

      if (!looksLikeNewOtherHeader) {
        return { category: prevCategory, isStrongMatch: false, hasInlineAtesto: false };
      }
    }
  }

  // Certidões de 2 páginas (ex: pág 1 certidão + pág 2 validação/autenticidade "Página 2 de 2")
  if (
    !prevDocEnded &&
    !startsNewPagedDoc &&
    prevCategory &&
    CERT_CATEGORIES.has(prevCategory) &&
    docPageNum !== null &&
    docPageNum > 1 &&
    (prevDocTotalPages === null || docTotalPages === prevDocTotalPages)
  ) {
    return { category: prevCategory, isStrongMatch: false, hasInlineAtesto: false };
  }

  return { category: null, isStrongMatch: false, hasInlineAtesto: false };
}

function formatPagesToRanges(
  pages: number[],
  bridgeSmallEmptyGaps: boolean,
  emptyPagesSet: Set<number>
): string {
  if (pages.length === 0) return '';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    let canBridge = next === end + 1;
    if (!canBridge && bridgeSmallEmptyGaps && next - end <= 3) {
      canBridge = true;
      for (let gap = end + 1; gap < next; gap++) {
        if (!emptyPagesSet.has(gap)) {
          canBridge = false;
          break;
        }
      }
    }
    if (canBridge) {
      end = next;
    } else {
      ranges.push([start, end]);
      start = next;
      end = next;
    }
  }
  ranges.push([start, end]);

  return ranges.map(([s, e]) => (s === e ? `${s}` : `${s}/${e}`)).join(', ');
}

export async function analyzeProcessPdfLocally(
  file: File,
  itens: ChecklistItemInput[],
  isIndenizacao: boolean,
  onProgress?: (statusText: string) => void
): Promise<AnalyzeProcessResult> {
  try {
    onProgress?.('Lendo páginas do PDF localmente...');
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      verbosity: 0,
    });
    const pdfDoc = await loadingTask.promise;
    const totalPaginas = pdfDoc.numPages;

    const rawPages: Array<Omit<PageData, 'effectivePageNum'>> = [];
    const emptyPagesSet = new Set<number>();

    for (let p = 1; p <= totalPaginas; p++) {
      if (p === 1 || p % 15 === 0 || p === totalPaginas) {
        onProgress?.(`Analisando página ${p} de ${totalPaginas}...`);
      }
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const { lines, sidebarLines } = reconstructVisualLines(textContent.items as any[]);
      const rawText = lines.join('\n');
      const sidebarText = sidebarLines.join(' ');
      const norm = normalizeText(rawText);
      const titleNorm = normalizeText(lines.slice(0, 6).join(' '));
      const topNorm = normalizeText(lines.slice(0, 11).join(' '));
      const bottomNorm = normalizeText(lines.slice(-6).join(' '));
      const stampedFolio = extractCornerFolio(lines, sidebarLines);
      const { docPageNum, docTotalPages } = extractDocPagination(lines);

      rawPages.push({
        pdfPageNum: p,
        stampedFolio,
        rawText,
        lines,
        sidebarText,
        norm,
        titleNorm,
        topNorm,
        bottomNorm,
        docPageNum,
        docTotalPages,
      });
    }

    // Só adota carimbo "Fls. N" diferente se houver deslocamento consistente em >= 70% das páginas
    const stampedEntries = rawPages.filter((rp) => rp.stampedFolio !== null);
    let consistentOffset: number | null = null;
    if (stampedEntries.length >= Math.max(4, Math.floor(totalPaginas * 0.7))) {
      const offsetCounts = new Map<number, number>();
      for (const entry of stampedEntries) {
        const diff = (entry.stampedFolio || 0) - entry.pdfPageNum;
        offsetCounts.set(diff, (offsetCounts.get(diff) || 0) + 1);
      }
      let bestOffset = 0;
      let bestCount = 0;
      for (const [diff, count] of offsetCounts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestOffset = diff;
        }
      }
      if (bestOffset !== 0 && bestCount >= Math.floor(stampedEntries.length * 0.85)) {
        consistentOffset = bestOffset;
      }
    }

    const pages: PageData[] = rawPages.map((rp) => {
      const effectivePageNum =
        consistentOffset !== null ? rp.pdfPageNum + consistentOffset : rp.pdfPageNum;
      if (rp.norm.length < 25) {
        emptyPagesSet.add(effectivePageNum);
      }
      return { ...rp, effectivePageNum };
    });

    // Detecta se este PDF contém Contrato ou Medição para direcionar corretamente Empenho (1.10 vs 3.9) e Cronograma (1.6 vs 2.12)
    let hasContractBody = false;
    let hasMeasurementBody = false;
    for (const pg of pages) {
      if (pg.norm.includes('CLAUSULA PRIMEIRA') || pg.titleNorm.includes('EXTRATO DO CONTRATO')) {
        hasContractBody = true;
      }
      if (
        pg.titleNorm.includes('NOTA FISCAL') ||
        pg.titleNorm.includes('PLANILHA DE MEDICAO') ||
        pg.titleNorm.includes('BOLETIM DE MEDICAO') ||
        pg.titleNorm.includes('FOLHA DE IDENTIFICACAO')
      ) {
        hasMeasurementBody = true;
      }
    }

    const catToItems = new Map<DocCategory, ChecklistItemInput[]>();
    for (const item of itens) {
      const cat = mapChecklistItemToCategory(item, isIndenizacao);
      if (cat) {
        const list = catToItems.get(cat) || [];
        list.push(item);
        catToItems.set(cat, list);
      }
    }

    const empenhoCat: DocCategory =
      !isIndenizacao && hasContractBody && !hasMeasurementBody && catToItems.has('EMPENHO_CONTRATO')
        ? 'EMPENHO_CONTRATO'
        : catToItems.has('EMPENHO_PAGAMENTO')
          ? 'EMPENHO_PAGAMENTO'
          : 'EMPENHO_CONTRATO';

    const cronogramaCat: DocCategory =
      !isIndenizacao && hasContractBody && !hasMeasurementBody && catToItems.has('CRONOGRAMA_CONTRATO')
        ? 'CRONOGRAMA_CONTRATO'
        : catToItems.has('CRONOGRAMA_MEDICAO')
          ? 'CRONOGRAMA_MEDICAO'
          : 'CRONOGRAMA_CONTRATO';

    const availableCategories = new Set(catToItems.keys());

    const pagesByCategory = new Map<DocCategory, number[]>();
    const certMatchesByCategory = new Map<
      DocCategory,
      Array<{ pageNum: number; dateStr?: string; ymd: number | null }>
    >();
    const inlineAtestoPages: number[] = [];

    let prevCategory: DocCategory | null = null;
    let prevDocEnded = false;
    let prevDocTotalPages: number | null = null;
    let prevCertExpiration: { dateStr?: string; ymd: number | null } | null = null;

    for (const page of pages) {
      const { category, isStrongMatch, hasInlineAtesto } = classifyPage(
        page,
        prevCategory,
        prevDocEnded,
        prevDocTotalPages,
        availableCategories,
        empenhoCat,
        cronogramaCat
      );

      if (hasInlineAtesto) {
        inlineAtestoPages.push(page.effectivePageNum);
      }

      if (category) {
        if (CERT_CATEGORIES.has(category)) {
          let exp = extractCertExpiration(page.rawText);
          if (exp.ymd === null && !isStrongMatch && prevCategory === category && prevCertExpiration) {
            exp = prevCertExpiration;
          }
          const arr = certMatchesByCategory.get(category) || [];
          arr.push({ pageNum: page.effectivePageNum, dateStr: exp.dateStr, ymd: exp.ymd });
          certMatchesByCategory.set(category, arr);
          prevCertExpiration = exp;
        } else {
          const arr = pagesByCategory.get(category) || [];
          arr.push(page.effectivePageNum);
          pagesByCategory.set(category, arr);
          prevCertExpiration = null;
        }

        if (isStrongMatch) {
          prevDocTotalPages = page.docTotalPages;
        } else if (page.docTotalPages !== null && prevDocTotalPages === null) {
          prevDocTotalPages = page.docTotalPages;
        }
        prevDocEnded =
          page.docPageNum !== null &&
          page.docTotalPages !== null &&
          page.docPageNum >= page.docTotalPages;
        prevCategory = category;
      } else {
        prevCategory = null;
        prevDocEnded = false;
        prevDocTotalPages = null;
        prevCertExpiration = null;
      }
    }

    // Se não houve termo de atesto separado, mas o atesto estava carimbado na própria Nota Fiscal
    if (!pagesByCategory.has('ATESTO_NF') && inlineAtestoPages.length > 0 && availableCategories.has('ATESTO_NF')) {
      pagesByCategory.set('ATESTO_NF', inlineAtestoPages);
    }

    const todayYmd = getTodayYmd();
    const documentosEncontrados: ExtractedDocumentoFolhas[] = [];
    const certidoesVencidas: CertidaoVencidaInfo[] = [];

    for (const [cat, pageNums] of pagesByCategory.entries()) {
      const matchedItems = catToItems.get(cat) || [];
      if (matchedItems.length === 0 || pageNums.length === 0) continue;
      const bridgeGaps = MULTI_PAGE_CATEGORIES.has(cat);
      const folhasFormatado = formatPagesToRanges(pageNums, bridgeGaps, emptyPagesSet);
      if (!folhasFormatado) continue;
      for (const item of matchedItems) {
        documentosEncontrados.push({
          codigo: item.codigo,
          paginaInicial: Math.min(...pageNums),
          paginaFinal: Math.max(...pageNums),
          folhasFormatado,
        });
      }
    }

    for (const [cat, entries] of certMatchesByCategory.entries()) {
      const matchedItems = catToItems.get(cat) || [];
      if (matchedItems.length === 0 || entries.length === 0) continue;

      const explicitVigentes = entries.filter((e) => e.ymd !== null && e.ymd >= todayYmd);
      const vencidas = entries.filter((e) => e.ymd !== null && e.ymd < todayYmd);
      const undated = entries.filter((e) => e.ymd === null);

      const chosenVigentes =
        explicitVigentes.length > 0
          ? explicitVigentes
          : vencidas.length === 0
            ? undated
            : [];

      if (chosenVigentes.length > 0) {
        const nums = chosenVigentes.map((v) => v.pageNum);
        const folhasVigentes = formatPagesToRanges(nums, false, emptyPagesSet);
        for (const item of matchedItems) {
          documentosEncontrados.push({
            codigo: item.codigo,
            paginaInicial: Math.min(...nums),
            paginaFinal: Math.max(...nums),
            folhasFormatado: folhasVigentes,
          });
        }
      } else if (vencidas.length > 0) {
        const lastExpired = vencidas[vencidas.length - 1];
        const folhasVencidas = formatPagesToRanges(
          vencidas.map((v) => v.pageNum),
          false,
          emptyPagesSet
        );
        for (const item of matchedItems) {
          certidoesVencidas.push({
            codigo: item.codigo,
            nomeCertidao: item.descricao,
            dataValidade: lastExpired.dateStr,
            folhas: folhasVencidas,
            motivo: 'Validade expirada antes da data atual',
          });
        }
      }
    }

    await loadingTask.destroy();

    if (documentosEncontrados.length === 0 && certidoesVencidas.length === 0) {
      const totalChars = pages.reduce((acc, p) => acc + p.norm.length, 0);
      if (totalChars < 100 && totalPaginas > 0) {
        return {
          success: false,
          error:
            'Este PDF contém apenas imagens digitalizadas sem texto selecionável. Para ler PDFs apenas de imagem, utilize o sistema conectado ao servidor.',
        };
      }
    }

    return {
      success: true,
      data: {
        totalPaginas,
        documentosEncontrados,
        certidoesVencidas,
      },
    };
  } catch (err: any) {
    console.warn('Falha na análise local do PDF:', err?.message || err);
    return {
      success: false,
      error: err?.message || 'Não foi possível ler este arquivo PDF.',
    };
  }
}
