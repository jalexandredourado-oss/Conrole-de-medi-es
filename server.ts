import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel, createPartFromUri, FileState } from '@google/genai';
import * as XLSX from 'xlsx';
import multer from 'multer';
import os from 'os';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractGoogleDriveId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const sheetMatch = trimmed.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9-_]+)/i);
  if (sheetMatch) return sheetMatch[1];
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/i);
  if (fileMatch) return fileMatch[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/i);
  if (idParamMatch) return idParamMatch[1];
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/i);
  if (dMatch) return dMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

function extractGoogleDriveGid(url: string): string | null {
  if (!url) return null;
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/i);
  return gidMatch ? gidMatch[1] : null;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  // Favicon handler to prevent 404 console errors
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  // Accept JSON payload up to 25MB for image uploads
  app.use(express.json({ limit: '25mb' }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Allow standalone index.html or external origins to query conformidade and empenho APIs if reachable
  app.use(['/api/health', '/api/conformidade', '/api/empenhos'], (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-File-Name');
    res.setHeader('Access-Control-Expose-Headers', 'X-File-Name');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    return next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const processUploadDir = path.join(os.tmpdir(), 'process-pdf-uploads');
  if (!fs.existsSync(processUploadDir)) {
    fs.mkdirSync(processUploadDir, { recursive: true });
  }

  const uploadProcessPdf = multer({
    dest: processUploadDir,
    limits: {
      fileSize: 200 * 1024 * 1024, // 200MB
    },
    fileFilter: (_req, file, cb) => {
      if (
        file.mimetype === 'application/pdf' ||
        file.originalname.toLowerCase().endsWith('.pdf')
      ) {
        cb(null, true);
      } else {
        cb(new Error('Envie apenas arquivos em formato PDF (.pdf).'));
      }
    },
  });

  // Extract OS data from uploaded image/screenshot (JPG, PNG, etc.)
  app.post('/api/os/extract-from-image', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
      }

      // Format/clean base64
      let cleanBase64 = (imageBase64 || '').trim();
      let cleanMime = mimeType || 'image/png';

      if (cleanBase64.startsWith('data:')) {
        const commaIdx = cleanBase64.indexOf(',');
        if (commaIdx !== -1) {
          const prefix = cleanBase64.substring(0, commaIdx);
          cleanBase64 = cleanBase64.substring(commaIdx + 1);
          const mimeMatch = prefix.match(/data:(.*?);/);
          if (mimeMatch && mimeMatch[1]) {
            cleanMime = mimeMatch[1];
          }
        }
      } else if (cleanBase64.includes('base64,')) {
        const parts = cleanBase64.split('base64,');
        const header = parts[0];
        cleanBase64 = parts[1];
        const match = header.match(/data:(.*?);/);
        if (match && match[1]) {
          cleanMime = match[1];
        }
      }

      // Remove any whitespace, newlines, and stray quotes
      cleanBase64 = cleanBase64.replace(/^["']|["']$/g, '').replace(/\s+/g, '');

      const prompt = `Você é um assistente especialista em leitura e digitação de documentos oficiais de órgãos públicos e engenharia (SEJUS/MT, SOENG, SAAS, contratos e ordens de serviço).
Analise com extrema precisão a imagem deste documento ou print de Ordem de Serviço (OS) e extraia com exatidão as seguintes informações:
1. "numeroOs": O número oficial da Ordem de Serviço (por exemplo: "005/2025/SOENG/SAAS/SEJUS/MT", "012/2024", "01/2025", "OS 003/2026/SOENG", etc).
2. "descricao": O objeto, descrição dos serviços ou finalidade geral da Ordem de Serviço. Seja completo e fiel ao texto.
3. "valor": O valor total da Ordem de Serviço em reais, retornado estritamente como um número decimal (por exemplo: 154200.50). Remova qualquer símbolo R$ ou formatação de moeda.
4. "dataEmissao": A data de emissão ou assinatura da Ordem de Serviço presente no documento no formato DD/MM/AAAA, se constar na imagem.
5. "itens": Se a imagem/print contiver uma tabela, planilha ou lista de itens/serviços discriminados (ex: Item 01, Item 02, etc.), extraia TODOS os itens:
   - "item": O número ou código do item (ex: "01", "02", "1", "2").
   - "lote": O lote correspondente, se houver (ex: "01", "02"), ou "01".
   - "qtd": A quantidade numérica (ex: 1, 2, 10.5).
   - "unidade": A unidade de medida (ex: "UN", "M²", "VB", "SERV", "M³", "KG", "HORA", "MES").
   - "especificacao": A descrição ou especificação detalhada daquele item de serviço ou material.
   - "valorItem": O valor total daquele item específico em reais como número decimal (ex: 12500.00).
Caso o print tenha mais de um item discriminado, inclua obrigatoriamente todos os itens na lista.`;

      // Try primary model and fallback to gemini-flash-latest on temporary spike
      let response;
      const modelCandidates = ['gemini-3.8-flash', 'gemini-flash-latest'];
      let lastErr: any = null;

      for (const modelName of modelCandidates) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: cleanBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  numeroOs: {
                    type: Type.STRING,
                    description: 'Número da Ordem de Serviço extraído da imagem',
                  },
                  descricao: {
                    type: Type.STRING,
                    description: 'Descrição ou objeto do serviço da Ordem de Serviço',
                  },
                  valor: {
                    type: Type.NUMBER,
                    description: 'Valor total da Ordem de Serviço em reais (número decimal)',
                  },
                  dataEmissao: {
                    type: Type.STRING,
                    description: 'Data de emissão no formato DD/MM/AAAA (opcional)',
                  },
                  itens: {
                    type: Type.ARRAY,
                    description: 'Lista de itens discriminados da Ordem de Serviço extraídos da tabela/documento',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        item: {
                          type: Type.STRING,
                          description: 'Número ou código do item (ex: "01", "02")',
                        },
                        lote: {
                          type: Type.STRING,
                          description: 'Lote do item (ex: "01")',
                        },
                        qtd: {
                          type: Type.NUMBER,
                          description: 'Quantidade numérica do item',
                        },
                        unidade: {
                          type: Type.STRING,
                          description: 'Unidade de medida (ex: "UN", "M²", "VB", "SERV")',
                        },
                        especificacao: {
                          type: Type.STRING,
                          description: 'Especificação ou descrição detalhada do item',
                        },
                        valorItem: {
                          type: Type.NUMBER,
                          description: 'Valor total do item em reais (número decimal)',
                        },
                      },
                      required: ['item', 'especificacao', 'valorItem'],
                    },
                  },
                },
                required: ['numeroOs', 'descricao', 'valor'],
              },
            },
          });
          if (response?.text) break;
        } catch (err: any) {
          lastErr = err;
          console.warn(`Tentativa com ${modelName} falhou:`, err?.message);
        }
      }

      if (!response || !response.text) {
        throw lastErr || new Error('Nenhum dado retornado pela IA.');
      }

      const responseText = response.text;

      const parsedData = JSON.parse(responseText);
      return res.json({
        success: true,
        data: parsedData,
      });
    } catch (err: any) {
      console.error('Erro na extração de dados da OS:', err);
      return res.status(500).json({
        error: err?.message || 'Falha ao processar a imagem da Ordem de Serviço com IA.',
      });
    }
  });

  // Endpoint to extract Medição details from pasted print/image using Gemini
  app.post('/api/medicao/extract-from-image', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
      }

      // Format/clean base64
      let cleanBase64 = (imageBase64 || '').trim();
      let cleanMime = mimeType || 'image/png';

      if (cleanBase64.startsWith('data:')) {
        const commaIdx = cleanBase64.indexOf(',');
        if (commaIdx !== -1) {
          const prefix = cleanBase64.substring(0, commaIdx);
          cleanBase64 = cleanBase64.substring(commaIdx + 1);
          const mimeMatch = prefix.match(/data:(.*?);/);
          if (mimeMatch && mimeMatch[1]) {
            cleanMime = mimeMatch[1];
          }
        }
      } else if (cleanBase64.includes('base64,')) {
        const parts = cleanBase64.split('base64,');
        const header = parts[0];
        cleanBase64 = parts[1];
        const match = header.match(/data:(.*?);/);
        if (match && match[1]) {
          cleanMime = match[1];
        }
      }

      // Remove any whitespace, newlines, and stray quotes
      cleanBase64 = cleanBase64.replace(/^["']|["']$/g, '').replace(/\s+/g, '');

      const prompt = `Você é um assistente especialista em leitura e digitação de documentos oficiais de órgãos públicos e engenharia (SEJUS/MT, SESP, SOENG, SAAS, boletins de medição, relatórios e processos).
Analise com extrema precisão a imagem deste documento, relatório ou print de Medição e extraia com exatidão as seguintes informações:
1. "sigadoc": O número do processo SIGADOC ou protocolo oficial (por exemplo: "SJUS-PRO-2026/07935", "SEJUS-PRO-2026/07935", "SEJUS-PRO-2025/03206", etc.). Remova prefixos como "PROCESSO:", "SIGADOC:", "PROC:".
2. "cidade": A cidade, município ou unidade de lotação da obra/serviço (por exemplo: "BARRA DO GARÇAS", "SINOP", "CUIABÁ", "RONDONÓPOLIS", etc.).
3. "descricao": O objeto, descrição dos serviços medidos ou finalidade da medição (por exemplo: "SERVIÇO DE ENGENHARIA PARA A CONSTRUÇÃO DE NOVO RAIO PRISIONAL NO CENTRO DE RESSOCIALIZAÇÃO REGIONAL DE BARRA DO GARÇAS").
4. "numeroMedicao": O número da medição (por exemplo: "1ª MEDIÇÃO", "01ª MEDIÇÃO", "1ª", "2ª MEDIÇÃO", "14ª MEDIÇÃO", "4ª (CONT.)", etc.).
5. "valorMedicao": O valor total da medição em reais, retornado estritamente como um número decimal (por exemplo: 1117746.14 para R$ 1.117.746,14). Remova qualquer símbolo R$ ou pontuação de milhar.
6. "periodo": O período da medição presente no documento (por exemplo: "01/07/26 A 31/07/26", "01/07/2026 A 31/07/2026", "01 A 30/08/2026").
7. "numeroNf": O número da nota fiscal se presente na imagem (por exemplo: "12345").
8. "dataEmissaoNf": A data de emissão da nota fiscal no formato DD/MM/AAAA se constar na imagem.
9. "dataAtesto": A data do atesto ou recebimento no formato DD/MM/AAAA se constar na imagem.`;

      // Try primary model and fallback to gemini-flash-latest
      let response;
      const modelCandidates = ['gemini-3.8-flash', 'gemini-flash-latest'];
      let lastErr: any = null;

      for (const modelName of modelCandidates) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime,
                    data: cleanBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  sigadoc: {
                    type: Type.STRING,
                    description: 'Número do processo SIGADOC (ex: "SJUS-PRO-2026/07935")',
                  },
                  cidade: {
                    type: Type.STRING,
                    description: 'Cidade ou unidade da obra/serviço (ex: "BARRA DO GARÇAS")',
                  },
                  descricao: {
                    type: Type.STRING,
                    description: 'Descrição ou objeto dos serviços medidos',
                  },
                  numeroMedicao: {
                    type: Type.STRING,
                    description: 'Número da medição (ex: "1ª MEDIÇÃO")',
                  },
                  valorMedicao: {
                    type: Type.NUMBER,
                    description: 'Valor total da medição em reais (número decimal)',
                  },
                  periodo: {
                    type: Type.STRING,
                    description: 'Período da medição (ex: "01/07/26 A 31/07/26")',
                  },
                  numeroNf: {
                    type: Type.STRING,
                    description: 'Número da NF (opcional)',
                  },
                  dataEmissaoNf: {
                    type: Type.STRING,
                    description: 'Data de emissão da NF no formato DD/MM/AAAA (opcional)',
                  },
                  dataAtesto: {
                    type: Type.STRING,
                    description: 'Data de atesto no formato DD/MM/AAAA (opcional)',
                  },
                },
              },
            },
          });
          if (response?.text) break;
        } catch (err: any) {
          lastErr = err;
          console.warn(`Tentativa de extração de medição com ${modelName} falhou:`, err?.message);
        }
      }

      if (!response || !response.text) {
        throw lastErr || new Error('Nenhum dado retornado pela IA para a medição.');
      }

      const responseText = response.text;
      const parsedData = JSON.parse(responseText);
      return res.json({
        success: true,
        data: parsedData,
      });
    } catch (err: any) {
      console.error('Erro na extração de dados da Medição:', err);
      return res.status(500).json({
        error: err?.message || 'Falha ao processar a imagem da Medição com IA.',
      });
    }
  });

  type ChecklistItemPayload = { codigo: string; descricao: string; baseLegal?: string };
  type CertidaoVencidaPayload = {
    codigo: string;
    nomeCertidao: string;
    dataValidade?: string;
    folhas?: string;
    motivo?: string;
  };
  type ProcessAnalysisData = {
    totalPaginas?: number;
    documentosEncontrados: Array<{
      codigo: string;
      paginaInicial: number;
      paginaFinal: number;
      folhasFormatado: string;
      observacao?: string;
    }>;
    certidoesVencidas?: CertidaoVencidaPayload[];
  };

  interface UploadSession {
    uploadId: string;
    fileName: string;
    fileSize: number;
    totalChunks: number;
    receivedChunks: number;
    filePath: string;
    createdAt: number;
  }

  interface ProcessAnalysisJob {
    jobId: string;
    status: 'processing' | 'done' | 'error';
    stage: string;
    data?: ProcessAnalysisData;
    error?: string;
    createdAt: number;
  }

  const uploadSessions = new Map<string, UploadSession>();
  const processAnalysisJobs = new Map<string, ProcessAnalysisJob>();

  function cleanupExpiredProcessData() {
    const now = Date.now();
    const maxAgeMs = 30 * 60 * 1000;
    for (const [id, session] of uploadSessions.entries()) {
      if (now - session.createdAt > maxAgeMs) {
        uploadSessions.delete(id);
        fs.promises.unlink(session.filePath).catch(() => {});
      }
    }
    for (const [id, job] of processAnalysisJobs.entries()) {
      if (now - job.createdAt > maxAgeMs) {
        processAnalysisJobs.delete(id);
      }
    }
  }

  function isTransientNetworkOrServerError(err: any): boolean {
    const text = [
      err?.message,
      err?.code,
      err?.cause?.message,
      err?.cause?.code,
      String(err?.status || ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (
      text.includes('fetch failed') ||
      text.includes('etimedout') ||
      text.includes('econnreset') ||
      text.includes('econnrefused') ||
      text.includes('epipe') ||
      text.includes('und_err') ||
      text.includes('network') ||
      text.includes('socket') ||
      text.includes('429') ||
      text.includes('500') ||
      text.includes('502') ||
      text.includes('503') ||
      text.includes('504')
    );
  }

  async function withRetry<T>(
    fn: (attempt: number) => Promise<T>,
    maxAttempts = 3,
    baseDelayMs = 2000,
    onRetry?: (attempt: number, err: any) => void
  ): Promise<T> {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(attempt);
      } catch (err: any) {
        lastErr = err;
        if (attempt >= maxAttempts || !isTransientNetworkOrServerError(err)) {
          throw err;
        }
        onRetry?.(attempt, err);
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
      }
    }
    throw lastErr;
  }

  function formatCurrentDateBr(): string {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Cuiaba',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date());
    } catch {
      const now = new Date();
      return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    }
  }

  function parseBrDateToYmd(dateStr?: string): number | null {
    if (!dateStr) return null;
    const match = String(dateStr).trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return year * 10000 + month * 100 + day;
  }

  async function analyzeProcessPdfFile(params: {
    filePath: string;
    originalName: string;
    fileSize: number;
    checklistItems: ChecklistItemPayload[];
    isIndenizacao: boolean;
    referenceDateBr?: string;
    onStage?: (stage: string) => void;
  }): Promise<ProcessAnalysisData> {
    const {
      filePath,
      originalName,
      fileSize,
      checklistItems,
      isIndenizacao,
      referenceDateBr,
      onStage,
    } = params;
    const effectiveReferenceDateBr =
      referenceDateBr && /^\d{2}\/\d{2}\/\d{4}$/.test(referenceDateBr.trim())
        ? referenceDateBr.trim()
        : formatCurrentDateBr();
    let geminiUploadedFileName: string | null = null;

    try {
      const checklistText = checklistItems
        .map(
          (it) =>
            `- Código "${it.codigo}": ${it.descricao}${
              it.baseLegal && it.baseLegal !== '-' ? ` (Base Legal: ${it.baseLegal})` : ''
            }`
        )
        .join('\n');

      const prompt = `Você é um auditor e especialista em análise documental de processos administrativos públicos de obras e serviços de engenharia (SEJUS/MT, SIGADOC, SESP, CGE-MT).

DATA ATUAL DE REFERÊNCIA (HOJE): ${effectiveReferenceDateBr}

Analise o arquivo PDF anexo contendo o processo administrativo inteiro${
        isIndenizacao ? ' (modo Pagamento por Indenização)' : ''
      } e identifique em quais páginas (folhas) se encontra cada documento listado no checklist abaixo.

CHECKLIST DE DOCUMENTOS DO PROCESSO:
${checklistText}

REGRAS ESTRITAS PARA IDENTIFICAÇÃO E NUMERAÇÃO DAS FOLHAS:
1. Analise todo o PDF do início ao fim, página por página, verificando títulos, cabeçalhos, timbres, rodapés, carimbos, assinaturas digitais e conteúdo de cada documento.
2. Como determinar o número da página/folha:
   - Se o processo possuir numeração oficial de folhas carimbada ou impressa pelo sistema de protocolo (por exemplo: "Fls. 5", "Fl. 005", "Folha 5", "Página 5 de 153") consistente nas páginas, utilize essa numeração de folha.
   - Caso não haja numeração de folhas distinta ou ela coincida com a ordem física do PDF, utilize o número exato da página do PDF (contando a partir da página 1).
3. Como determinar página inicial e final de cada documento:
   - Inclua todas as páginas contínuas que pertencem ao mesmo documento (inclusive capa, seções numeradas, tabelas, laudos anexos, recomendações técnicas, conclusão/parecer final e a página onde constam as assinaturas eletrônicas/manuscritas de encerramento daquele documento).
   - NÃO interrompa um relatório técnico ou laudo na metade (ex.: após tabelas ou gráficos) se as páginas seguintes ainda forem continuação numerada do mesmo documento (ex.: seções de recomendações, "CONCLUSÃO", "CONCLUSÃO E PARECER DO ANALISTA", "CONSIDERAÇÕES FINAIS") até o bloco de assinaturas finais que o encerra.
   - Se um documento for um único arquivo/folha (ex.: página 83), paginaInicial = 83 e paginaFinal = 83, e folhasFormatado = "83".
   - Se um documento começar na página 5 e terminar na página 7 (ex.: TAC nas páginas 5, 6 e 7), paginaInicial = 5, paginaFinal = 7, e folhasFormatado = "5/7" (use SEMPRE a barra "/", nunca hífen ou "a").
   - Se um mesmo item do checklist aparecer em blocos de páginas separados (ex.: páginas 10/12 e página 45), informe paginaInicial e paginaFinal do bloco principal e coloque todos os intervalos em folhasFormatado (ex.: "10/12, 45").
4. REGRA OBRIGATÓRIA PARA CERTIDÕES (FGTS, MUNICIPAL, ESTADUAL SEFAZ/PGE, FEDERAL/PGFN, TRABALHISTA CNDT/TST):
   - Verifique rigorosamente a data de validade de cada certidão ("Válida até", "Validade", "Data de validade", "Vigência até" ou prazo a partir da emissão) comparando com a DATA ATUAL DE REFERÊNCIA (${effectiveReferenceDateBr}).
   - Uma certidão só está VIGENTE se a sua data de validade for IGUAL OU POSTERIOR a ${effectiveReferenceDateBr}. Se a data de validade for ANTERIOR a ${effectiveReferenceDateBr}, ela está VENCIDA.
   - Em "documentosEncontrados" (que preenche a coluna FLS), informe SOMENTE certidões que estiverem VIGENTES!
   - Se houver mais de uma cópia da mesma certidão no PDF (por exemplo, uma antiga vencida e outra mais nova vigente), coloque em "documentosEncontrados" APENAS a página da certidão VIGENTE.
   - Se uma certidão aparecer SOMENTE VENCIDA no PDF (sem nenhuma cópia vigente para aquele mesmo tipo de certidão), NÃO a inclua em "documentosEncontrados" e informe-a obrigatoriamente em "certidoesVencidas" com o código do checklist, nome da certidão, data de validade (DD/MM/AAAA) e número da folha/página.
5. Diferenciação importante entre documentos parecidos:
   - NOTA FISCAL vs ATESTO DA NOTA FISCAL: a Nota Fiscal (NFS-e/DANFE) e o Termo/Certidão de Atesto da Nota Fiscal podem estar em páginas diferentes; se o atesto estiver em documento próprio separado, preencha cada um com suas páginas exatas. Se o atesto estiver carimbado/assinado na própria Nota Fiscal, indique a página correspondente.
   - ART DO RESPONSÁVEL TÉCNICO vs ART DO FISCAL: verifique quem é o profissional/função (execução/obra pela contratada vs fiscalização pela SEJUS/estado).
   - RELAÇÃO DE ENVIO FGTS E INSS (SEFIP/GFIP/DCTFWeb/RE) vs GRF (Guia do FGTS) vs GPS (Guia do INSS/DARF Previdenciário) vs CERTIDÃO NEGATIVA DO FGTS (CRF Caixa).
   - CERTIDÕES: diferencie Municipal (Prefeitura), Estadual (SEFAZ/PGE-MT), Federal (Receita Federal/PGFN) e Trabalhista (CNDT/TST).
   - RELATÓRIO FOTOGRÁFICO vs RELATÓRIO DE ANÁLISES LABORATORIAL vs RELATÓRIO DE ACOMPANHAMENTO DA EXECUÇÃO:
     * RELATÓRIO FOTOGRÁFICO: abrange as páginas do registro/relatório fotográfico com fotos e legendas; encerra-se antes do início do relatório laboratorial (não estenda o relatório fotográfico por cima das páginas finais exclusivas de análises laboratoriais).
     * RELATÓRIO DE ANÁLISES LABORATORIAL: inicia-se na capa/título do relatório ou laudo de análises laboratoriais (parâmetros físico-químicos/biológicos, DBO, DQO, CONAMA, ensaios, resultados de laboratório) e vai continuamente até a página final que contém a seção de encerramento ("CONCLUSÃO", "CONCLUSÃO E PARECER DO ANALISTA" ou equivalente) seguida pelas assinaturas finais dos responsáveis técnicos/analista.
     * RELATÓRIO DE ACOMPANHAMENTO DA EXECUÇÃO: documento específico de fiscalização/acompanhamento da execução contratual (ex.: IN 005/2018/SESP/MT).
   - TAC (Termo de Ajustamento de Conduta), DECISÕES DO TCE (Acórdãos/Decisões do Tribunal de Contas), PARECER REFERENCIAL PGE, OFÍCIO SOLICITANDO MEDIÇÃO E/OU ENTREGA DA OBRA [E-MAIL] (ofício ou e-mail solicitando medição/entrega).
6. Só inclua em "documentosEncontrados" os documentos que você realmente localizou com segurança no PDF (e, no caso de certidões, apenas se estiverem vigentes). NÃO invente números de páginas e NÃO inclua itens ausentes.`;

      let pdfPart: any;

      if (fileSize <= 12 * 1024 * 1024) {
        onStage?.('Enviando PDF para leitura pela IA...');
        const fileBuffer = await fs.promises.readFile(filePath);
        pdfPart = {
          inlineData: {
            mimeType: 'application/pdf',
            data: fileBuffer.toString('base64'),
          },
        };
      } else {
        onStage?.('Transferindo processo completo para análise...');
        const uploaded = await withRetry(
          async () =>
            ai.files.upload({
              file: filePath,
              config: {
                mimeType: 'application/pdf',
                displayName: originalName || 'processo.pdf',
                httpOptions: { timeout: 600000 },
              },
            }),
          3,
          2000,
          (attempt) => {
            onStage?.(`Reconectando envio do processo (${attempt}/3)...`);
          }
        );
        geminiUploadedFileName = uploaded.name || null;

        let fileRecord = uploaded;
        let attempts = 0;
        let consecutiveGetErrors = 0;
        while (
          (fileRecord.state === FileState.PROCESSING || String(fileRecord.state) === 'PROCESSING') &&
          attempts < 300
        ) {
          onStage?.(`Processando arquivo PDF na nuvem (${attempts}s)...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (!fileRecord.name) break;
          try {
            fileRecord = await ai.files.get({
              name: fileRecord.name,
              config: { httpOptions: { timeout: 60000 } },
            });
            consecutiveGetErrors = 0;
          } catch (getErr: any) {
            consecutiveGetErrors++;
            if (consecutiveGetErrors >= 5 || !isTransientNetworkOrServerError(getErr)) {
              throw getErr;
            }
          }
          attempts++;
        }

        if (fileRecord.state === FileState.FAILED || String(fileRecord.state) === 'FAILED') {
          throw new Error('O processamento do PDF falhou na API de arquivos.');
        }
        if (fileRecord.state === FileState.PROCESSING || String(fileRecord.state) === 'PROCESSING') {
          throw new Error('O processamento do PDF na API de arquivos excedeu o tempo limite.');
        }
        if (!fileRecord.uri) {
          throw new Error('Não foi possível obter a URI do arquivo PDF enviado.');
        }

        pdfPart = createPartFromUri(
          fileRecord.uri,
          fileRecord.mimeType || 'application/pdf'
        );
      }

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          totalPaginas: {
            type: Type.INTEGER,
            description: 'Quantidade total de páginas do PDF analisado.',
          },
          documentosEncontrados: {
            type: Type.ARRAY,
            description:
              'Lista apenas dos documentos do checklist localizados e vigentes no processo (excluir certidões vencidas sem cópia vigente).',
            items: {
              type: Type.OBJECT,
              properties: {
                codigo: {
                  type: Type.STRING,
                  description:
                    'Código exato do item no checklist (ex: "1.1", "1.2", "2.9", "3.4").',
                },
                paginaInicial: {
                  type: Type.INTEGER,
                  description: 'Página/folha inicial do documento (inteiro >= 1).',
                },
                paginaFinal: {
                  type: Type.INTEGER,
                  description:
                    'Página/folha final do documento (igual a paginaInicial se for página única).',
                },
                folhasFormatado: {
                  type: Type.STRING,
                  description:
                    'Texto para a coluna FLS: "X" para página única (ex: "83"), "X/Y" para intervalo contínuo (ex: "5/7"), ou "X/Y, Z" se houver blocos separados.',
                },
              },
              required: ['codigo', 'paginaInicial', 'paginaFinal', 'folhasFormatado'],
            },
          },
          certidoesVencidas: {
            type: Type.ARRAY,
            description:
              'Lista apenas das certidões que constam no PDF com data de validade vencida em relação à data atual de referência e sem nenhuma cópia vigente correspondente.',
            items: {
              type: Type.OBJECT,
              properties: {
                codigo: {
                  type: Type.STRING,
                  description:
                    'Código exato da certidão no checklist (ex: "2.4", "2.5", "3.4", "3.6").',
                },
                nomeCertidao: {
                  type: Type.STRING,
                  description: 'Nome da certidão vencida.',
                },
                dataValidade: {
                  type: Type.STRING,
                  description:
                    'Data de vencimento/validade impressa na certidão no formato DD/MM/AAAA, se visível.',
                },
                folhas: {
                  type: Type.STRING,
                  description: 'Página/folha onde a certidão vencida se encontra no PDF.',
                },
                motivo: {
                  type: Type.STRING,
                  description: 'Breve observação (ex: "Validade expirada antes da data atual").',
                },
              },
              required: ['codigo', 'nomeCertidao'],
            },
          },
        },
        required: ['documentosEncontrados'],
      };

      const analysisAttempts: Array<{ model: string; thinkingLevel?: ThinkingLevel }> = [
        { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.LOW },
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.MEDIUM },
        { model: 'gemini-flash-latest' },
      ];

      let responseText = '';
      let lastModelError: any = null;

      for (let idx = 0; idx < analysisAttempts.length; idx++) {
        const attempt = analysisAttempts[idx];
        const attemptStart = Date.now();
        onStage?.(
          idx === 0
            ? 'Identificando documentos e páginas do processo...'
            : `Reanalisando documentos e páginas do processo (tentativa ${idx + 1}/${analysisAttempts.length})...`
        );
        try {
          const stream = await ai.models.generateContentStream({
            model: attempt.model,
            contents: {
              parts: [pdfPart, { text: prompt }],
            },
            config: {
              systemInstruction:
                'Você analisa processos administrativos brasileiros em PDF com máxima precisão na identificação documental e contagem exata de páginas/folhas.',
              ...(attempt.thinkingLevel
                ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } }
                : {}),
              responseMimeType: 'application/json',
              responseSchema,
              httpOptions: { timeout: 600000 },
            },
          });

          let streamedText = '';
          let chunkCount = 0;
          for await (const chunk of stream) {
            if (chunk?.text) {
              streamedText += chunk.text;
              chunkCount++;
              if (chunkCount % 5 === 0) {
                onStage?.('Extraindo folhas e conferindo validade das certidões...');
              }
            }
          }

          if (streamedText.trim()) {
            console.log(
              `Análise PDF concluída com ${attempt.model} (${attempt.thinkingLevel || 'default'}) em ${Date.now() - attemptStart}ms`
            );
            responseText = streamedText;
            break;
          }
        } catch (err: any) {
          lastModelError = err;
          console.warn(
            `Tentativa de análise do processo (${attempt.model} / ${attempt.thinkingLevel || 'default'}) falhou em ${Date.now() - attemptStart}ms:`,
            err?.message || err
          );
          if (idx < analysisAttempts.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      }

      if (!responseText) {
        if (isTransientNetworkOrServerError(lastModelError)) {
          throw new Error(
            'Tempo limite de rede ao comunicar com a IA. Verifique a conexão e tente anexar o processo novamente.'
          );
        }
        throw lastModelError || new Error('A análise não retornou dados do processo.');
      }

      const cleanedJsonText = String(responseText)
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(cleanedJsonText);
      const validCodigos = new Set(checklistItems.map((it) => it.codigo.trim()));
      const checklistDescByCode = new Map(
        checklistItems.map((it) => [it.codigo.trim(), it.descricao])
      );
      const refYmd = parseBrDateToYmd(effectiveReferenceDateBr);

      const rawExpired = Array.isArray(parsed?.certidoesVencidas)
        ? parsed.certidoesVencidas
        : [];
      const expiredByCodigo = new Map<string, CertidaoVencidaPayload>();

      for (const exp of rawExpired) {
        const codigo = String(exp?.codigo || '').trim();
        if (!codigo || !validCodigos.has(codigo)) continue;
        const dataValidade = exp?.dataValidade ? String(exp.dataValidade).trim() : undefined;
        const expYmd = parseBrDateToYmd(dataValidade);
        // Se a própria data extraída indicar que ainda está vigente (>= hoje), não marca como vencida
        if (refYmd !== null && expYmd !== null && expYmd >= refYmd) {
          continue;
        }
        const nomeCertidao =
          checklistDescByCode.get(codigo) ||
          String(exp?.nomeCertidao || '').trim() ||
          `Certidão ${codigo}`;
        const folhas = exp?.folhas ? String(exp.folhas).trim() : undefined;
        const motivo = exp?.motivo ? String(exp.motivo).trim() : undefined;
        expiredByCodigo.set(codigo, {
          codigo,
          nomeCertidao,
          dataValidade,
          folhas,
          motivo,
        });
      }

      const rawDocs = Array.isArray(parsed?.documentosEncontrados)
        ? parsed.documentosEncontrados
        : [];

      const deduped = new Map<
        string,
        {
          codigo: string;
          paginaInicial: number;
          paginaFinal: number;
          folhasFormatado: string;
          observacao?: string;
        }
      >();

      for (const doc of rawDocs) {
        const codigo = String(doc?.codigo || '').trim();
        if (!codigo || !validCodigos.has(codigo)) continue;
        // Garante que nenhuma certidão marcada como vencida preencha a coluna FLS
        if (expiredByCodigo.has(codigo)) continue;

        const pIni = Number(doc?.paginaInicial);
        const pFim = Number(doc?.paginaFinal);
        let folhas = String(doc?.folhasFormatado || '').trim();

        folhas = folhas
          .replace(/(\d+)\s*(?:-|–|—|\ba\b|\bat[eé]\b)\s*(\d+)/gi, '$1/$2')
          .replace(/\s+/g, ' ')
          .trim();

        if (!folhas && Number.isFinite(pIni) && pIni > 0) {
          folhas =
            Number.isFinite(pFim) && pFim > pIni
              ? `${Math.trunc(pIni)}/${Math.trunc(pFim)}`
              : `${Math.trunc(pIni)}`;
        }

        folhas = folhas.replace(/\b(\d+)\/\1\b/g, '$1');

        if (!folhas) continue;

        deduped.set(codigo, {
          codigo,
          paginaInicial: Number.isFinite(pIni) && pIni > 0 ? Math.trunc(pIni) : 0,
          paginaFinal: Number.isFinite(pFim) && pFim > 0 ? Math.trunc(pFim) : 0,
          folhasFormatado: folhas,
          observacao: doc?.observacao ? String(doc.observacao).trim() : undefined,
        });
      }

      return {
        totalPaginas:
          typeof parsed?.totalPaginas === 'number' ? parsed.totalPaginas : undefined,
        documentosEncontrados: Array.from(deduped.values()),
        certidoesVencidas: Array.from(expiredByCodigo.values()),
      };
    } finally {
      if (geminiUploadedFileName) {
        ai.files.delete({ name: geminiUploadedFileName }).catch(() => {});
      }
    }
  }

  // Step 1: Initialize chunked upload session for process PDF (avoids HTTP 413 on Cloud Run)
  app.post('/api/conformidade/processo/init', (req, res) => {
    cleanupExpiredProcessData();
    if (!fs.existsSync(processUploadDir)) {
      fs.mkdirSync(processUploadDir, { recursive: true });
    }
    const { fileName, mimeType, fileSize, totalChunks } = req.body || {};
    const safeName = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'processo.pdf';
    const isPdfFile =
      safeName.toLowerCase().endsWith('.pdf') ||
      String(mimeType || '').toLowerCase().includes('pdf');

    if (!isPdfFile) {
      return res.status(400).json({ error: 'Envie apenas arquivos em formato PDF (.pdf).' });
    }
    const parsedSize = Number(fileSize);
    const parsedChunks = Number(totalChunks);
    if (!Number.isFinite(parsedSize) || parsedSize <= 0 || parsedSize > 250 * 1024 * 1024) {
      return res.status(400).json({ error: 'Tamanho de arquivo inválido (máximo 250 MB).' });
    }
    if (!Number.isInteger(parsedChunks) || parsedChunks <= 0) {
      return res.status(400).json({ error: 'Quantidade de partes do envio inválida.' });
    }

    const uploadId = crypto.randomUUID();
    const filePath = path.join(processUploadDir, `${uploadId}.pdf`);
    uploadSessions.set(uploadId, {
      uploadId,
      fileName: safeName,
      fileSize: parsedSize,
      totalChunks: parsedChunks,
      receivedChunks: 0,
      filePath,
      createdAt: Date.now(),
    });

    return res.json({ success: true, uploadId });
  });

  // Step 2: Receive a single binary chunk (<= 4MB per request)
  app.post(
    '/api/conformidade/processo/chunk',
    express.raw({ type: '*/*', limit: '8mb' }),
    async (req, res) => {
      try {
        const uploadId = String(req.query?.uploadId || '');
        const chunkIndex = Number(req.query?.index);
        const session = uploadSessions.get(uploadId);

        if (!session) {
          return res.status(404).json({ error: 'Sessão de envio não encontrada ou expirada.' });
        }
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
          return res.status(400).json({ error: 'Índice da parte do arquivo inválido.' });
        }
        // Idempotent handling if a client retries a chunk that already succeeded
        if (chunkIndex < session.receivedChunks) {
          return res.json({
            success: true,
            receivedChunks: session.receivedChunks,
            totalChunks: session.totalChunks,
          });
        }
        if (chunkIndex !== session.receivedChunks) {
          return res.status(400).json({ error: 'Ordem de envio do arquivo inválida.' });
        }
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ error: 'Parte do arquivo vazia ou inválida.' });
        }

        await fs.promises.appendFile(session.filePath, req.body);
        session.receivedChunks += 1;
        session.createdAt = Date.now();

        return res.json({
          success: true,
          receivedChunks: session.receivedChunks,
          totalChunks: session.totalChunks,
        });
      } catch (err: any) {
        console.error('Erro ao gravar parte do PDF:', err);
        return res.status(500).json({
          error: err?.message || 'Erro ao receber parte do arquivo PDF.',
        });
      }
    }
  );

  // Step 3: Start async analysis job on the reassembled PDF
  app.post('/api/conformidade/processo/start', (req, res) => {
    try {
      const { uploadId, itens, isIndenizacao, referenceDateBr } = req.body || {};
      const session = uploadSessions.get(String(uploadId || ''));

      if (!session) {
        return res.status(404).json({ error: 'Sessão de envio não encontrada ou expirada.' });
      }
      if (session.receivedChunks !== session.totalChunks || !fs.existsSync(session.filePath)) {
        return res.status(400).json({ error: 'Upload do arquivo PDF ainda não foi concluído.' });
      }
      if (!process.env.GEMINI_API_KEY) {
        uploadSessions.delete(session.uploadId);
        fs.promises.unlink(session.filePath).catch(() => {});
        return res.status(500).json({
          error: 'Chave GEMINI_API_KEY não configurada no servidor.',
        });
      }

      const checklistItems: ChecklistItemPayload[] = Array.isArray(itens)
        ? itens.filter(
            (it: any) => it && typeof it.codigo === 'string' && typeof it.descricao === 'string'
          )
        : [];
      if (checklistItems.length === 0) {
        return res.status(400).json({ error: 'Nenhum item de conformidade foi informado.' });
      }

      uploadSessions.delete(session.uploadId);
      const jobId = crypto.randomUUID();
      const job: ProcessAnalysisJob = {
        jobId,
        status: 'processing',
        stage: 'Preparando arquivo PDF para análise...',
        createdAt: Date.now(),
      };
      processAnalysisJobs.set(jobId, job);

      void (async () => {
        try {
          const stat = await fs.promises.stat(session.filePath);
          const data = await analyzeProcessPdfFile({
            filePath: session.filePath,
            originalName: session.fileName,
            fileSize: stat.size,
            checklistItems,
            isIndenizacao: Boolean(isIndenizacao),
            referenceDateBr: typeof referenceDateBr === 'string' ? referenceDateBr : undefined,
            onStage: (stage) => {
              job.stage = stage;
              job.createdAt = Date.now();
            },
          });
          job.status = 'done';
          job.stage = 'Concluído';
          job.data = data;
          job.createdAt = Date.now();
        } catch (err: any) {
          console.warn('Erro no processamento assíncrono do PDF:', err?.message || err);
          job.status = 'error';
          job.error = isTransientNetworkOrServerError(err)
            ? 'Tempo limite de rede ao analisar o PDF do processo. Tente novamente.'
            : err?.message || 'Falha ao analisar o arquivo PDF do processo.';
          job.createdAt = Date.now();
        } finally {
          fs.promises.unlink(session.filePath).catch(() => {});
        }
      })();

      return res.json({ success: true, jobId });
    } catch (err: any) {
      console.error('Erro ao iniciar análise do processo:', err);
      return res.status(500).json({
        error: err?.message || 'Falha ao iniciar a análise do PDF.',
      });
    }
  });

  // Step 4: Poll job status
  app.get('/api/conformidade/processo/status/:jobId', (req, res) => {
    const job = processAnalysisJobs.get(String(req.params.jobId || ''));
    if (!job) {
      return res.status(404).json({ error: 'Tarefa de análise não encontrada ou expirada.' });
    }
    return res.json({
      success: true,
      status: job.status,
      stage: job.stage,
      data: job.data,
      error: job.error,
    });
  });

  // Direct multipart endpoint (kept for smaller files / compatibility)
  app.post('/api/conformidade/analisar-processo', (req, res) => {
    uploadProcessPdf.single('file')(req, res, async (uploadErr: any) => {
      if (uploadErr) {
        return res.status(400).json({
          error: uploadErr?.message || 'Falha ao receber o arquivo PDF do processo.',
        });
      }

      const uploadedLocalFile = req.file;

      try {
        req.setTimeout(300000);
        res.setTimeout(300000);

        if (!uploadedLocalFile) {
          return res.status(400).json({ error: 'Nenhum arquivo PDF foi enviado.' });
        }
        if (!process.env.GEMINI_API_KEY) {
          return res.status(500).json({
            error: 'Chave GEMINI_API_KEY não configurada no servidor.',
          });
        }

        let checklistItems: ChecklistItemPayload[] = [];
        try {
          const parsedItens = JSON.parse(req.body?.itens || '[]');
          if (Array.isArray(parsedItens)) {
            checklistItems = parsedItens.filter(
              (it) => it && typeof it.codigo === 'string' && typeof it.descricao === 'string'
            );
          }
        } catch {
          return res.status(400).json({ error: 'Lista de itens da conformidade inválida.' });
        }

        if (checklistItems.length === 0) {
          return res.status(400).json({ error: 'Nenhum item de conformidade foi informado.' });
        }

        const isIndenizacao = String(req.body?.isIndenizacao) === 'true';
        const data = await analyzeProcessPdfFile({
          filePath: uploadedLocalFile.path,
          originalName: uploadedLocalFile.originalname || 'processo.pdf',
          fileSize: uploadedLocalFile.size,
          checklistItems,
          isIndenizacao,
        });

        return res.json({ success: true, data });
      } catch (err: any) {
        console.error('Erro ao analisar PDF do processo:', err);
        return res.status(500).json({
          error: err?.message || 'Falha ao analisar o arquivo PDF do processo.',
        });
      } finally {
        if (uploadedLocalFile?.path) {
          fs.promises.unlink(uploadedLocalFile.path).catch(() => {});
        }
      }
    });
  });

  // Endpoint to fetch Google Sheets or Excel workbook from Google Drive
  app.post('/api/drive/fetch-sheet', async (req, res) => {
    try {
      const { url, sheetTabName, subTab } = req.body || {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL da planilha não fornecida.' });
      }

      const cleanUrl = url.trim();
      const docId = extractGoogleDriveId(cleanUrl);
      if (!docId) {
        return res.status(400).json({
          error: 'Link inválido. Insira o link do Google Drive ou Google Sheets.',
        });
      }

      const gid = extractGoogleDriveGid(cleanUrl);
      const effectiveTab = (sheetTabName || '').trim();

      // Strategy 1: Google Sheets GViz CSV export (direct & very fast for public sheets)
      const gvizUrlsToTry: string[] = [];
      if (effectiveTab && !/^\d+$/.test(effectiveTab)) {
        gvizUrlsToTry.push(
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(effectiveTab)}`
        );
      }
      if (gid) {
        gvizUrlsToTry.push(
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${gid}`
        );
      }
      // Also default sheet tab name based on subTab
      if (subTab === 'CONTRATOS') {
        gvizUrlsToTry.push(
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('CONSULTAR CONTRATO(FIPLAN)')}`,
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('CONTRATOS')}`,
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=0`
        );
      } else if (subTab === 'EMP') {
        gvizUrlsToTry.push(
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('EMP')}`,
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('EMPENHOS')}`
        );
      } else if (subTab === 'LIQ') {
        gvizUrlsToTry.push(
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('LIQ')}`,
          `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('PAGAMENTOS')}`
        );
      }
      gvizUrlsToTry.push(
        `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv`,
        `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid || '0'}`
      );

      for (const testUrl of gvizUrlsToTry) {
        try {
          const resp = await fetch(testUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/csv,text/plain,*/*',
            },
            redirect: 'follow',
          });
          if (resp.ok) {
            const text = await resp.text();
            const clean = text.trim();
            if (
              clean &&
              !clean.startsWith('<!DOCTYPE') &&
              !clean.startsWith('<html') &&
              !clean.includes('<title>') &&
              clean.length > 20
            ) {
              return res.json({ success: true, csvData: clean, source: 'gviz' });
            }
          }
        } catch {
          // Continue to next strategy
        }
      }

      // Strategy 2: Download as XLSX workbook (works for both native Google Sheets & Excel files on Drive!)
      const xlsxUrlsToTry = [
        `https://docs.google.com/spreadsheets/d/${docId}/export?format=xlsx`,
        `https://drive.google.com/uc?export=download&id=${docId}`,
      ];

      for (const xlsxUrl of xlsxUrlsToTry) {
        try {
          const resp = await fetch(xlsxUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            redirect: 'follow',
          });
          if (resp.ok) {
            const arrayBuffer = await resp.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const sample = buffer.slice(0, 100).toString('utf-8');
            if (sample.includes('<!DOCTYPE') || sample.includes('<html')) {
              continue;
            }

            const wb = XLSX.read(buffer, { type: 'buffer' });
            if (wb && wb.SheetNames && wb.SheetNames.length > 0) {
              let targetSheetName = wb.SheetNames[0];

              if (effectiveTab) {
                const matched = wb.SheetNames.find(
                  (s) => s.trim().toUpperCase() === effectiveTab.toUpperCase()
                );
                if (matched) targetSheetName = matched;
              } else if (subTab === 'CONTRATOS') {
                const matched = wb.SheetNames.find((s) => {
                  const u = s.toUpperCase();
                  return u.includes('CONTRATO') || u.includes('FIPLAN') || u.includes('CONSULTAR');
                });
                if (matched) targetSheetName = matched;
              } else if (subTab === 'EMP') {
                const matched = wb.SheetNames.find((s) => {
                  const u = s.toUpperCase();
                  return u === 'EMP' || u.includes('EMPENHO') || u.includes('EMP ');
                });
                if (matched) targetSheetName = matched;
              } else if (subTab === 'LIQ') {
                const matched = wb.SheetNames.find((s) => {
                  const u = s.toUpperCase();
                  return u === 'LIQ' || u.includes('PAG') || u.includes('LIQUIDA');
                });
                if (matched) targetSheetName = matched;
              }

              const sheet = wb.Sheets[targetSheetName];
              if (sheet) {
                const csvData = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
                return res.json({
                  success: true,
                  csvData,
                  sheetName: targetSheetName,
                  availableSheets: wb.SheetNames,
                  source: 'xlsx',
                });
              }
            }
          }
        } catch {
          // Continue
        }
      }

      return res.status(403).json({
        error:
          'Não foi possível acessar a planilha diretamente. Verifique se o link possui permissão pública de visualização no Google Drive ("Qualquer pessoa com o link pode ver"). Caso a planilha seja institucional ou privada, utilize a opção "COLAR CÉLULAS DA PLANILHA".',
      });
    } catch (err: any) {
      console.error('Erro ao buscar planilha do Drive:', err);
      return res.status(500).json({
        error: err?.message || 'Falha ao buscar planilha do Google Drive.',
      });
    }
  });

  const empenhoAnexosDir = path.join(os.tmpdir(), 'empenho-anexos');
  if (!fs.existsSync(empenhoAnexosDir)) {
    fs.mkdirSync(empenhoAnexosDir, { recursive: true });
  }

  const sanitizeAnexoId = (raw: string): string | null => {
    const clean = String(raw || '').trim();
    if (!clean || clean.length > 200 || !/^[a-zA-Z0-9_.-]+$/.test(clean)) {
      return null;
    }
    return clean;
  };

  app.post(
    '/api/empenhos/anexos/:anexoId',
    express.raw({ type: '*/*', limit: '50mb' }),
    async (req, res) => {
      try {
        const anexoId = sanitizeAnexoId(req.params.anexoId);
        if (!anexoId) {
          return res.status(400).json({ error: 'Identificador de anexo inválido.' });
        }
        const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
        if (!buf.length) {
          return res.status(400).json({ error: 'Arquivo vazio.' });
        }
        if (!fs.existsSync(empenhoAnexosDir)) {
          fs.mkdirSync(empenhoAnexosDir, { recursive: true });
        }
        const rawHeaderName = req.headers['x-file-name'];
        const fileName =
          typeof rawHeaderName === 'string' && rawHeaderName.trim()
            ? decodeURIComponent(rawHeaderName.trim())
            : `${anexoId}.pdf`;
        const mimeType =
          typeof req.headers['content-type'] === 'string' && req.headers['content-type'].trim()
            ? req.headers['content-type'].trim()
            : 'application/pdf';

        await fs.promises.writeFile(path.join(empenhoAnexosDir, `${anexoId}.bin`), buf);
        await fs.promises.writeFile(
          path.join(empenhoAnexosDir, `${anexoId}.meta.json`),
          JSON.stringify({
            fileName,
            mimeType,
            size: buf.length,
            updatedAt: new Date().toISOString(),
          }),
          'utf-8'
        );

        return res.json({ success: true, anexoId, size: buf.length });
      } catch (err: any) {
        console.error('Erro ao salvar anexo de empenho:', err);
        return res.status(500).json({ error: 'Falha ao salvar anexo de empenho.' });
      }
    }
  );

  app.get('/api/empenhos/anexos/:anexoId', async (req, res) => {
    try {
      const anexoId = sanitizeAnexoId(req.params.anexoId);
      if (!anexoId) {
        return res.status(400).json({ error: 'Identificador de anexo inválido.' });
      }
      const binPath = path.join(empenhoAnexosDir, `${anexoId}.bin`);
      const metaPath = path.join(empenhoAnexosDir, `${anexoId}.meta.json`);
      if (!fs.existsSync(binPath)) {
        return res.status(404).json({ error: 'Anexo não encontrado.' });
      }

      let meta: { fileName?: string; mimeType?: string } = {};
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
        } catch {
          // ignore
        }
      }

      const fileName = meta.fileName || `${anexoId}.pdf`;
      const mimeType = meta.mimeType || 'application/pdf';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('X-File-Name', encodeURIComponent(fileName));
      res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/["\r\n]/g, '_')}"`);
      return res.sendFile(binPath);
    } catch (err: any) {
      console.error('Erro ao ler anexo de empenho:', err);
      return res.status(500).json({ error: 'Falha ao ler anexo de empenho.' });
    }
  });

  app.delete('/api/empenhos/anexos/:anexoId', async (req, res) => {
    try {
      const anexoId = sanitizeAnexoId(req.params.anexoId);
      if (!anexoId) {
        return res.status(400).json({ error: 'Identificador de anexo inválido.' });
      }
      const binPath = path.join(empenhoAnexosDir, `${anexoId}.bin`);
      const metaPath = path.join(empenhoAnexosDir, `${anexoId}.meta.json`);
      if (fs.existsSync(binPath)) await fs.promises.unlink(binPath);
      if (fs.existsSync(metaPath)) await fs.promises.unlink(metaPath);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Erro ao excluir anexo de empenho:', err);
      return res.status(500).json({ error: 'Falha ao excluir anexo de empenho.' });
    }
  });

  // Rota explícita para entrega do arquivo index.html autônomo offline com garantia de no-cache
  app.get(['/standalone-system.html', '/index-offline.html', '/index-standalone.html', '/standalone.html'], (_req, res) => {
    const candidates = [
      path.resolve(__dirname, 'public/standalone-system.html'),
      path.resolve(__dirname, 'dist/standalone-system.html'),
      path.resolve(__dirname, 'dist-single/index.html'),
    ];
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.sendFile(filePath);
      }
    }
    return res.status(404).send('Arquivo standalone não encontrado.');
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
