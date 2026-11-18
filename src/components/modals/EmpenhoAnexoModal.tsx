import React, { useEffect, useRef, useState } from 'react';
// @ts-expect-error pdfjs-dist legacy build does not ship typed declarations for worker bundle
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  X,
  FileText,
  Download,
  Paperclip,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Empenho } from '../../types/contract';
import {
  buildEmpenhoAnexoId,
  formatAttachmentSize,
  loadEmpenhoAttachment,
  StoredEmpenhoAttachment,
  triggerBlobDownload,
} from '../../utils/empenhoAttachmentStorage';

if (typeof globalThis !== 'undefined' && !(globalThis as any).pdfjsWorker) {
  (globalThis as any).pdfjsWorker = pdfjsWorker;
}

interface EmpenhoAnexoModalProps {
  isOpen: boolean;
  onClose: () => void;
  empenho: Empenho | null;
  contratoNumero: string;
  onReplaceFile: (empenho: Empenho, file: File) => Promise<void>;
  onRemoveAttachment: (empenho: Empenho) => Promise<void>;
}

interface PdfCanvasPreviewProps {
  blob: Blob;
  zoom: number;
  onNumPagesLoaded?: (total: number) => void;
}

const PdfCanvasPreview: React.FC<PdfCanvasPreviewProps> = ({
  blob,
  zoom,
  onNumPagesLoaded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: any = null;

    const renderPdf = async () => {
      setRendering(true);
      setRenderError(null);

      try {
        const arrayBuffer = await blob.arrayBuffer();
        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          useWorkerFetch: false,
          verbosity: 0,
        });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }

        const totalPages = pdfDoc.numPages;
        onNumPagesLoaded?.(totalPages);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) break;

          const baseViewport = page.getViewport({ scale: 1 });
          const targetWidth = Math.min(820, Math.max(320, container.clientWidth - 16)) * zoom;
          const cssScale = targetWidth / baseViewport.width;
          const renderViewport = page.getViewport({ scale: cssScale * dpr });

          const pageWrapper = document.createElement('div');
          pageWrapper.className =
            'bg-white rounded-md shadow-md border border-slate-300 overflow-hidden mb-4 flex flex-col items-center';

          const pageBadge = document.createElement('div');
          pageBadge.className =
            'w-full px-3 py-1 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 flex items-center justify-between';
          pageBadge.textContent = `Página ${pageNum} de ${totalPages}`;
          pageWrapper.appendChild(pageBadge);

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);
          canvas.style.width = `${Math.floor(renderViewport.width / dpr)}px`;
          canvas.style.height = `${Math.floor(renderViewport.height / dpr)}px`;
          canvas.className = 'block bg-white';

          await page.render({
            canvas,
            viewport: renderViewport,
          }).promise;
          page.cleanup?.();

          pageWrapper.appendChild(canvas);
          if (!cancelled && containerRef.current) {
            containerRef.current.appendChild(pageWrapper);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Erro ao renderizar PDF do empenho:', err);
          setRenderError(
            err?.message || 'Não foi possível renderizar a visualização deste PDF.'
          );
        }
      } finally {
        if (loadingTask) {
          loadingTask.destroy().catch(() => {});
        }
        if (!cancelled) {
          setRendering(false);
        }
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
    };
  }, [blob, zoom]);

  return (
    <div className="w-full flex flex-col items-center">
      {rendering && (
        <div className="flex items-center gap-2 text-slate-600 py-6">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-xs font-medium">Renderizando páginas do PDF...</span>
        </div>
      )}
      {renderError && (
        <div className="max-w-md bg-white border border-amber-200 rounded-lg p-4 text-center shadow-2xs my-4">
          <AlertCircle className="w-5 h-5 text-amber-600 mx-auto mb-1.5" />
          <p className="text-xs text-slate-700">{renderError}</p>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full flex flex-col items-center overflow-x-auto py-1"
      />
    </div>
  );
};

export const EmpenhoAnexoModal: React.FC<EmpenhoAnexoModalProps> = ({
  isOpen,
  onClose,
  empenho,
  contratoNumero,
  onReplaceFile,
  onRemoveAttachment,
}) => {
  const [attachment, setAttachment] = useState<StoredEmpenhoAttachment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !empenho) {
      setAttachment((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return null;
      });
      setConfirmRemove(false);
      setErrorMsg(null);
      setZoom(1);
      setPdfNumPages(null);
      return;
    }

    let cancelled = false;
    let activeUrl: string | null = null;

    const loadDoc = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      setConfirmRemove(false);
      setPdfNumPages(null);

      const anexoId = empenho.anexoId || buildEmpenhoAnexoId(contratoNumero, empenho.id);
      const loaded = await loadEmpenhoAttachment(anexoId, {
        fileName: empenho.anexoNome,
        mimeType: empenho.anexoTipo,
        size: empenho.anexoTamanho,
        updatedAt: empenho.anexoAtualizadoEm,
      });

      if (cancelled) {
        if (loaded?.objectUrl) URL.revokeObjectURL(loaded.objectUrl);
        return;
      }

      if (loaded) {
        activeUrl = loaded.objectUrl;
        setAttachment((prev) => {
          if (prev?.objectUrl && prev.objectUrl !== loaded.objectUrl) {
            URL.revokeObjectURL(prev.objectUrl);
          }
          return loaded;
        });
      } else {
        setAttachment(null);
        if (empenho.anexoNome) {
          setErrorMsg(
            'Arquivo não encontrado no armazenamento local deste navegador. Anexe o documento novamente para visualizá-lo e baixá-lo aqui.'
          );
        }
      }
      setIsLoading(false);
    };

    loadDoc();

    return () => {
      cancelled = true;
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [
    isOpen,
    empenho?.id,
    empenho?.anexoId,
    empenho?.anexoAtualizadoEm,
    empenho?.anexoNome,
    contratoNumero,
  ]);

  if (!isOpen || !empenho) return null;

  const displayName = attachment?.fileName || empenho.anexoNome || `${empenho.numeroEmp}.pdf`;
  const displaySize = formatAttachmentSize(attachment?.size ?? empenho.anexoTamanho);
  const mime = (attachment?.mimeType || empenho.anexoTipo || '').toLowerCase();
  const isPdf = mime.includes('pdf') || displayName.toLowerCase().endsWith('.pdf');
  const isImage =
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(displayName);

  const handleDownload = () => {
    if (!attachment) return;
    triggerBlobDownload(attachment.objectUrl, displayName);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsMutating(true);
    setErrorMsg(null);
    try {
      await onReplaceFile(empenho, file);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível anexar este documento.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleConfirmRemove = async () => {
    setIsMutating(true);
    setErrorMsg(null);
    try {
      await onRemoveAttachment(empenho);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao remover o anexo do empenho.');
    } finally {
      setIsMutating(false);
      setConfirmRemove(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1e3a8a] text-white px-5 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-white/10 rounded-lg shrink-0">
              <FileText className="w-4 h-4 text-blue-200" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wide truncate">
                DOCUMENTO DO EMPENHO {empenho.numeroEmp}
              </h3>
              <p className="text-[10.5px] text-blue-100 truncate">
                Contrato Nº {contratoNumero} • {displayName}
                {displaySize ? ` (${displaySize})` : ''}
                {pdfNumPages ? ` • ${pdfNumPages} pág${pdfNumPages > 1 ? 's' : ''}.` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Fechar visualização"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {attachment && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[11px] font-bold uppercase rounded shadow-2xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Empenho</span>
              </button>
            )}

            <button
              type="button"
              disabled={isMutating}
              onClick={() => replaceInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 active:scale-95 text-white text-[11px] font-bold uppercase rounded shadow-2xs transition-all cursor-pointer"
            >
              {isMutating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Paperclip className="w-3.5 h-3.5" />
              )}
              <span>{attachment || empenho.anexoNome ? 'Substituir Anexo' : 'Anexar Empenho'}</span>
            </button>
            <input
              ref={replaceInputRef}
              type="file"
              accept=".pdf,application/pdf,image/*"
              className="hidden"
              onChange={handleFileSelected}
            />

            {attachment && isPdf && (
              <div className="flex items-center gap-1 ml-1 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
                  title="Diminuir zoom"
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10.5px] font-mono font-bold text-slate-700 min-w-[40px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))))}
                  title="Aumentar zoom"
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {(attachment || empenho.anexoNome) && (
            <div className="flex items-center gap-1.5">
              {!confirmRemove ? (
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => setConfirmRemove(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 text-[11px] font-bold uppercase rounded transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover Anexo</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={handleConfirmRemove}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold uppercase rounded transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 text-[11px] font-semibold uppercase rounded cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Viewer Body */}
        <div className="flex-1 overflow-auto bg-slate-200/80 p-4 flex flex-col items-center min-h-[380px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <span className="text-xs font-medium">Carregando documento do empenho...</span>
            </div>
          ) : errorMsg ? (
            <div className="max-w-md my-auto bg-white border border-amber-200 rounded-lg p-5 text-center shadow-2xs space-y-3">
              <div className="mx-auto w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{errorMsg}</p>
              <button
                type="button"
                onClick={() => replaceInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold uppercase rounded cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>Anexar Documento Agora</span>
              </button>
            </div>
          ) : !attachment ? (
            <div className="max-w-md my-auto bg-white border border-slate-200 rounded-lg p-6 text-center shadow-2xs space-y-3">
              <div className="mx-auto w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <Paperclip className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-600">
                Nenhum documento anexado para o empenho{' '}
                <strong className="font-mono text-slate-800">{empenho.numeroEmp}</strong>.
              </p>
              <button
                type="button"
                onClick={() => replaceInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold uppercase rounded cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>Selecionar PDF ou Imagem</span>
              </button>
            </div>
          ) : isPdf ? (
            <PdfCanvasPreview
              blob={attachment.blob}
              zoom={zoom}
              onNumPagesLoaded={setPdfNumPages}
            />
          ) : isImage ? (
            <div className="flex items-center justify-center w-full my-auto">
              <img
                src={attachment.objectUrl}
                alt={displayName}
                className="max-h-[70vh] max-w-full object-contain rounded-lg border border-slate-300 bg-white shadow-sm"
              />
            </div>
          ) : (
            <div className="max-w-md my-auto bg-white border border-slate-200 rounded-lg p-6 text-center shadow-2xs space-y-3">
              <FileText className="w-8 h-8 text-blue-600 mx-auto" />
              <p className="text-xs text-slate-700 font-semibold">{displayName}</p>
              <p className="text-[11px] text-slate-500">
                Este formato não possui pré-visualização embutida. Clique abaixo para baixar o
                arquivo.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Arquivo</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
