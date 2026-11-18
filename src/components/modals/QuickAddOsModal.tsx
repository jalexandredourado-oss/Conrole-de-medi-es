import React, { useState, useEffect } from 'react';
import {
  X,
  FileCheck,
  Plus,
  DollarSign,
  Calendar,
  Hash,
  Loader2,
  CheckCircle2,
  Clipboard,
} from 'lucide-react';
import { Contrato, OrdemServico, ItemOrdemServico } from '../../types/contract';
import {
  formatCurrency,
  formatCurrencyInput,
  formatCurrencyBlur,
  parseFlexibleNumber,
  formatDateInput,
} from '../../utils/formatters';
import { extractOsFromImage, fileToBase64 } from '../../services/osExtraction';

interface QuickAddOsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newOs: OrdemServico) => void;
  contrato: Contrato;
}

export const QuickAddOsModal: React.FC<QuickAddOsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contrato,
}) => {
  const [numeroOs, setNumeroOs] = useState('');
  const [valorTotalInput, setValorTotalInput] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [extractedItens, setExtractedItens] = useState<ItemOrdemServico[] | null>(null);

  // States for Image extraction
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [extractSuccess, setExtractSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const nextNum = (contrato.ordensServico || []).length + 1;
      const year = contrato.numero?.split('/')?.[1] || new Date().getFullYear();
      setNumeroOs(`${String(nextNum).padStart(3, '0')}/${year}/SOENG/SAAS/SEJUS/MT`);

      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      setDataEmissao(`${dd}/${mm}/${yyyy}`);

      setDescricao(contrato.objeto || contrato.descricao || '');
      setValorTotalInput('');
      setErrorMsg('');
      setExtractSuccess(null);
      setExtractedItens(null);
    }
  }, [isOpen, contrato]);

  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor, cole um print de imagem válido (.png, .jpg ou .webp).');
      return;
    }

    try {
      setIsProcessingImage(true);
      setErrorMsg('');
      setExtractSuccess(null);

      const base64Data = await fileToBase64(file);
      const result = await extractOsFromImage(base64Data, file.type);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Não foi possível extrair os dados da Ordem de Serviço.');
      }

      const {
        numeroOs: extNum,
        descricao: extDesc,
        valor: extValor,
        dataEmissao: extData,
        itens: extItens,
      } = result.data;

      if (extNum) {
        setNumeroOs(extNum.trim().toUpperCase());
      }
      if (extDesc) {
        setDescricao(extDesc.trim().toUpperCase());
      }
      if (extData) {
        setDataEmissao(extData.trim());
      }
      if (typeof extValor === 'number' && !isNaN(extValor) && extValor > 0) {
        setValorTotalInput(formatCurrency(extValor, true));
      }

      if (extItens && Array.isArray(extItens) && extItens.length > 0) {
        const mapped: ItemOrdemServico[] = extItens.map((it, idx) => ({
          id: `it-${Date.now()}-${idx + 1}`,
          item: (it.item || String(idx + 1).padStart(2, '0')).trim().toUpperCase(),
          lote: (it.lote || '01').trim().toUpperCase(),
          qtd: Number(it.qtd) || 1,
          unidade: (it.unidade || 'UN').trim().toUpperCase(),
          especificacao: (it.especificacao || extDesc || '').trim().toUpperCase(),
          valorItem: Number(it.valorItem) || 0,
        }));
        setExtractedItens(mapped);
      }

      const count = extItens && extItens.length > 0 ? extItens.length : 1;
      setExtractSuccess(
        `Print carregado: OS nº ${extNum} • ${count > 1 ? `${count} itens discriminados` : '1 item'} • ${formatCurrency(extValor)}`
      );
      setTimeout(() => {
        setExtractSuccess(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro na extração:', err);
      setErrorMsg(err?.message || 'Falha ao processar o print colado da OS.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const file = new File([blob], 'print_os.png', { type: imageType });
            await processImageFile(file);
            return;
          }
        }
      }
      setErrorMsg('Nenhuma imagem encontrada na área de transferência. Copie o print da OS e use Ctrl+V.');
    } catch (err: any) {
      setErrorMsg('Pressione Ctrl+V no teclado dentro desta janela para colar o print da OS.');
    }
  };

  // Clipboard paste support (Ctrl+V) anywhere while modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      // 1. Check clipboard files
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        for (let i = 0; i < e.clipboardData.files.length; i++) {
          const file = e.clipboardData.files[i];
          if (file.type && file.type.startsWith('image/')) {
            e.preventDefault();
            e.stopPropagation();
            processImageFile(file);
            return;
          }
        }
      }

      // 2. Check clipboard items
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            e.stopPropagation();
            processImageFile(blob);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste, { capture: true });
    return () => {
      window.removeEventListener('paste', handlePaste, { capture: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = numeroOs.trim().toUpperCase();
    if (!cleanNum) {
      setErrorMsg('Informe o número da Ordem de Serviço.');
      return;
    }

    const valParsed = parseFlexibleNumber(valorTotalInput);
    if (valParsed <= 0) {
      setErrorMsg('Informe um valor válido maior que zero para a Ordem de Serviço.');
      return;
    }

    const newOs: OrdemServico = {
      id: `os-${Date.now()}`,
      numeroOs: cleanNum,
      descricao: descricao.trim().toUpperCase() || `OS Nº ${cleanNum}`,
      valorTotal: valParsed,
      dataEmissao: dataEmissao.trim() || `${new Date().toLocaleDateString('pt-BR')}`,
      itens:
        extractedItens && extractedItens.length > 0
          ? extractedItens
          : [
              {
                id: `it-${Date.now()}`,
                item: '01',
                qtd: 1,
                unidade: 'UN',
                especificacao: descricao.trim().toUpperCase() || 'SERVIÇOS MEDIDOS',
                valorItem: valParsed,
              },
            ],
    };

    onSave(newOs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-[#1e3a8a] text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-200" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider leading-tight">
                ADICIONAR NOVA ORDEM DE SERVIÇO (OS)
              </h3>
              <p className="text-[10px] text-blue-200 font-medium leading-tight">
                CONTRATO Nº {contrato.numero}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {/* Botão de Colar Print da OS */}
          <div className="bg-blue-50/80 border border-dashed border-blue-300 rounded-lg p-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clipboard className="w-4 h-4 text-blue-700 shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-blue-900 block truncate">
                  Colar Print da OS (Ctrl+V)
                </span>
                <span className="text-[10px] text-slate-500 block truncate">
                  Preenche nº, descrição, valor e itens
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              disabled={isProcessingImage}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold shrink-0 cursor-pointer disabled:opacity-50"
            >
              Colar Print
            </button>
          </div>

          {/* Status when user pastes print (Ctrl+V) */}
          {isProcessingImage && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-blue-900 text-xs font-medium flex items-center gap-2 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700 shrink-0" />
              <span>Processando print colado... Preenchendo campos da OS.</span>
            </div>
          )}

          {extractSuccess && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs font-medium flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{extractSuccess}</span>
              </div>
              <button
                type="button"
                onClick={() => setExtractSuccess(null)}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded font-medium">
              {errorMsg}
            </div>
          )}

          {/* Nº da OS */}
          <div>
            <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
              Nº DA ORDEM DE SERVIÇO (OS) *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                <Hash className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                placeholder="ex: 003/2026/SOENG/SAAS/SEJUS/MT"
                value={numeroOs}
                onChange={(e) => setNumeroOs(e.target.value.toUpperCase())}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded font-mono font-bold uppercase focus:ring-1 focus:ring-blue-600 outline-none text-slate-800"
                required
              />
            </div>
          </div>

          {/* Valor Total da OS & Data de Emissão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                VALOR TOTAL DA OS (R$) *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  placeholder="R$ 0,00"
                  value={valorTotalInput}
                  onChange={(e) => setValorTotalInput(formatCurrencyInput(e.target.value))}
                  onBlur={() => setValorTotalInput(formatCurrencyBlur(valorTotalInput))}
                  className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded font-bold font-mono text-blue-800 focus:ring-1 focus:ring-blue-600 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                DATA DE EMISSÃO *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={dataEmissao}
                  onChange={(e) => setDataEmissao(formatDateInput(e.target.value))}
                  className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
              DESCRIÇÃO DOS SERVIÇOS / OBJETO DA OS
            </label>
            <textarea
              rows={2}
              placeholder="ex: SERVIÇOS DE MANUTENÇÃO PREDIAL NAS UNIDADES..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value.toUpperCase())}
              className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded uppercase focus:ring-1 focus:ring-blue-600 outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1e3a8a] hover:bg-blue-900 active:scale-95 text-white text-xs font-bold uppercase rounded shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>SALVAR E VINCULAR OS</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
