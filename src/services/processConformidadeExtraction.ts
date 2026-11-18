import { isStandaloneApp } from '../utils/isStandalone';
import { analyzeProcessPdfLocally } from './localPdfConformidadeAnalyzer';

export interface ChecklistItemInput {
  codigo: string;
  descricao: string;
  baseLegal?: string;
}

export interface ExtractedDocumentoFolhas {
  codigo: string;
  paginaInicial: number;
  paginaFinal: number;
  folhasFormatado: string;
  observacao?: string;
}

export interface CertidaoVencidaInfo {
  codigo: string;
  nomeCertidao: string;
  dataValidade?: string;
  folhas?: string;
  motivo?: string;
}

export interface AnalyzeProcessResponseData {
  totalPaginas?: number;
  documentosEncontrados: ExtractedDocumentoFolhas[];
  certidoesVencidas?: CertidaoVencidaInfo[];
}

export interface AnalyzeProcessResult {
  success: boolean;
  data?: AnalyzeProcessResponseData;
  error?: string;
}

const CHUNK_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB per chunk (fast upload, safe under proxy limits)

async function extractResponseError(resp: Response, fallbackMsg: string): Promise<string> {
  try {
    const text = await resp.text();
    if (!text) return fallbackMsg;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) return String(parsed.error);
    } catch {
      // Non-JSON response (e.g. HTML proxy error)
    }
    if (text.trim().startsWith('<')) {
      return `${fallbackMsg} (HTTP ${resp.status})`;
    }
    return text.slice(0, 220);
  } catch {
    return fallbackMsg;
  }
}

declare global {
  interface Window {
    __API_BASE_URL__?: string;
  }
}

async function resolveReachableApiBase(): Promise<string | null> {
  if (!isStandaloneApp()) {
    return '';
  }

  const candidates: string[] = [];
  if (typeof window !== 'undefined') {
    const injected = typeof window.__API_BASE_URL__ === 'string' ? window.__API_BASE_URL__.trim() : '';
    if (injected && /^https?:\/\//i.test(injected)) {
      candidates.push(injected.replace(/\/+$/, ''));
    }
    const proto = window.location?.protocol || '';
    if (proto === 'http:' || proto === 'https:') {
      candidates.push('');
    }
  }

  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const resp = await fetch(`${base}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (resp.ok && ct.includes('application/json')) {
        const json = await resp.json();
        if (json?.status === 'ok') {
          return base;
        }
      }
    } catch {
      // Server unreachable or blocked by CORS/auth
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/**
 * Envia o PDF do processo inteiro em partes (chunks) com retentativas e acompanha
 * a análise assíncrona no servidor até mapear as páginas/folhas na coluna FLS.
 * No index.html baixado, tenta conectar ao servidor do sistema primeiro (mesma IA);
 * se estiver offline/bloqueado, usa o analisador local aprimorado.
 */
export async function analyzeProcessPdfForConformidade(
  file: File,
  itens: ChecklistItemInput[],
  isIndenizacao: boolean,
  onProgress?: (statusText: string) => void
): Promise<AnalyzeProcessResult> {
  try {
    if (!file || file.size <= 0) {
      throw new Error('O arquivo PDF selecionado está vazio ou não pôde ser lido.');
    }
    if (file.size > 250 * 1024 * 1024) {
      throw new Error('O arquivo PDF excede o limite máximo de 250 MB.');
    }

    const standalone = isStandaloneApp();
    onProgress?.(
      standalone
        ? 'Verificando conexão com a IA do sistema...'
        : 'Iniciando envio do processo...'
    );

    const apiBase = await resolveReachableApiBase();
    if (apiBase === null) {
      return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
    }

    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));

    onProgress?.('Iniciando envio do processo...');

    let initResp: Response;
    try {
      initResp = await fetch(`${apiBase}/api/conformidade/processo/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name || 'processo.pdf',
          mimeType: file.type || 'application/pdf',
          fileSize: file.size,
          totalChunks,
        }),
      });
    } catch {
      return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
    }

    const initCt = (initResp.headers.get('content-type') || '').toLowerCase();
    if (standalone && (!initResp.ok || !initCt.includes('application/json'))) {
      return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
    }

    if (!initResp.ok) {
      const msg = await extractResponseError(
        initResp,
        `Erro HTTP ${initResp.status} ao iniciar envio do PDF.`
      );
      throw new Error(msg);
    }

    const initJson = await initResp.json();
    const uploadId = initJson?.uploadId as string;
    if (!uploadId) {
      if (standalone) {
        return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
      }
      throw new Error('Servidor não retornou identificador de envio.');
    }

    for (let index = 0; index < totalChunks; index++) {
      const start = index * CHUNK_SIZE_BYTES;
      const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
      const chunkBuffer = await file.slice(start, end).arrayBuffer();

      const pct = Math.round(((index + 1) / totalChunks) * 100);
      onProgress?.(
        totalChunks > 1
          ? `Enviando PDF do processo (${pct}%)...`
          : 'Enviando PDF do processo...'
      );

      let uploadedChunk = false;
      let lastChunkErr = '';

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const chunkResp = await fetch(
            `${apiBase}/api/conformidade/processo/chunk?uploadId=${encodeURIComponent(uploadId)}&index=${index}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: chunkBuffer,
            }
          );

          if (chunkResp.ok) {
            uploadedChunk = true;
            break;
          }

          lastChunkErr = await extractResponseError(
            chunkResp,
            `Erro HTTP ${chunkResp.status} ao enviar parte ${index + 1} do PDF.`
          );

          if (chunkResp.status < 500 && chunkResp.status !== 429) {
            break;
          }
        } catch (err: any) {
          lastChunkErr = err?.message || `Falha de rede ao enviar parte ${index + 1} do PDF.`;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }

      if (!uploadedChunk) {
        if (standalone) {
          return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
        }
        throw new Error(
          lastChunkErr || `Falha ao enviar parte ${index + 1} de ${totalChunks} do PDF.`
        );
      }
    }

    onProgress?.('Iniciando leitura documental pela IA...');

    const now = new Date();
    const referenceDateBr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    let startResp: Response;
    try {
      startResp = await fetch(`${apiBase}/api/conformidade/processo/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          itens,
          isIndenizacao,
          referenceDateBr,
        }),
      });
    } catch (startErr) {
      if (standalone) {
        return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
      }
      throw startErr;
    }

    if (!startResp.ok) {
      if (standalone) {
        return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
      }
      const msg = await extractResponseError(
        startResp,
        `Erro HTTP ${startResp.status} ao iniciar análise do PDF.`
      );
      throw new Error(msg);
    }

    const startJson = await startResp.json();
    const jobId = startJson?.jobId as string;
    if (!jobId) {
      if (standalone) {
        return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
      }
      throw new Error('Servidor não retornou identificador da tarefa de análise.');
    }

    // Poll until done or error (max ~15 minutes, tolerating transient proxy errors)
    const maxPolls = 900;
    let consecutivePollErrors = 0;

    for (let poll = 0; poll < maxPolls; poll++) {
      await new Promise((resolve) => setTimeout(resolve, poll === 0 ? 600 : 1000));

      let statusResp: Response;
      try {
        statusResp = await fetch(
          `${apiBase}/api/conformidade/processo/status/${encodeURIComponent(jobId)}`
        );
      } catch (netErr: any) {
        consecutivePollErrors++;
        if (consecutivePollErrors >= 5) {
          if (standalone) {
            return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
          }
          throw new Error(
            netErr?.message || 'Perda de conexão ao consultar andamento da análise.'
          );
        }
        continue;
      }

      if (!statusResp.ok) {
        const isTransient =
          statusResp.status === 502 ||
          statusResp.status === 503 ||
          statusResp.status === 504 ||
          statusResp.status === 429;
        if (isTransient && consecutivePollErrors < 5) {
          consecutivePollErrors++;
          continue;
        }
        if (standalone) {
          return await analyzeProcessPdfLocally(file, itens, isIndenizacao, onProgress);
        }
        const msg = await extractResponseError(
          statusResp,
          `Erro HTTP ${statusResp.status} ao consultar andamento da análise.`
        );
        throw new Error(msg);
      }

      consecutivePollErrors = 0;
      const statusJson = await statusResp.json();

      if (statusJson.stage) {
        onProgress?.(statusJson.stage);
      }

      if (statusJson.status === 'done') {
        if (!statusJson.data) {
          throw new Error('A análise terminou sem retornar dados.');
        }
        return {
          success: true,
          data: statusJson.data,
        };
      }

      if (statusJson.status === 'error') {
        throw new Error(
          statusJson.error || 'Falha ao analisar o arquivo PDF do processo.'
        );
      }
    }

    throw new Error('Tempo limite excedido ao aguardar a análise do processo.');
  } catch (err: any) {
    console.warn('Falha na análise do processo em PDF:', err?.message || err);
    return {
      success: false,
      error:
        err?.message ||
        'Erro inesperado ao enviar ou analisar o PDF do processo.',
    };
  }
}
