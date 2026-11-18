import React, { useState, useEffect } from 'react';
import {
  X,
  FileCheck,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clipboard,
  Image as ImageIcon,
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

interface NewOrdemServicoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (os: OrdemServico) => void;
  contrato: Contrato;
  osToEdit?: OrdemServico | null;
}

export const NewOrdemServicoModal: React.FC<NewOrdemServicoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contrato,
  osToEdit,
}) => {
  const [numeroOs, setNumeroOs] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [itens, setItens] = useState<
    Array<{
      id: string;
      item: string;
      lote: string;
      qtd: string;
      unidade: string;
      especificacao: string;
      valorItem: string;
    }>
  >([
    {
      id: 'item-1',
      item: '01',
      lote: '01',
      qtd: '1',
      unidade: 'UN',
      especificacao: '',
      valorItem: '',
    },
  ]);
  const [valorTotalManual, setValorTotalManual] = useState<string | null>(null);

  // States for Image / Print OS Extraction
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [extractSuccess, setExtractSuccess] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showImagePreviewModal, setShowImagePreviewModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setExtractSuccess(null);
      setExtractError(null);
      setImagePreview(null);
      setShowImagePreviewModal(false);
      if (osToEdit) {
        setNumeroOs(osToEdit.numeroOs || '');
        setDataEmissao(osToEdit.dataEmissao || '');
        setDescricao(osToEdit.descricao || '');
        if (osToEdit.itens && osToEdit.itens.length > 0) {
          setItens(
            osToEdit.itens.map((it, idx) => ({
              id: it.id || `item-${Math.random()}`,
              item: it.item || String(idx + 1).padStart(2, '0'),
              lote: it.lote || osToEdit.lote || '01',
              qtd: String(it.qtd ?? 1),
              unidade: it.unidade || 'UN',
              especificacao: it.especificacao || '',
              valorItem: it.valorItem ? formatCurrency(it.valorItem, true) : '',
            }))
          );
        } else {
          setItens([
            {
              id: 'item-1',
              item: '01',
              lote: osToEdit.lote || '01',
              qtd: '1',
              unidade: 'UN',
              especificacao: '',
              valorItem: osToEdit.valorTotal ? formatCurrency(osToEdit.valorTotal, true) : '',
            },
          ]);
        }
        setValorTotalManual(
          osToEdit.valorTotal !== undefined ? formatCurrency(osToEdit.valorTotal, true) : null
        );
      } else {
        const nextNum = (contrato.ordensServico || []).length + 1;
        const year = contrato.numero?.split('/')?.[1] || new Date().getFullYear();
        setNumeroOs(`${String(nextNum).padStart(3, '0')}/${year}/SOENG/SAAS/SEJUS/MT`);
        
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        setDataEmissao(`${dd}/${mm}/${yyyy}`);
        
        setDescricao(contrato.objeto || contrato.descricao || '');
        setItens([
          {
            id: `item-${Date.now()}-1`,
            item: '01',
            lote: '01',
            qtd: '1',
            unidade: 'UN',
            especificacao: '',
            valorItem: '',
          },
        ]);
        setValorTotalManual(null);
      }
    }
  }, [isOpen, osToEdit, contrato]);

  // Calculate sum of item values
  const sumItens = itens.reduce((acc, it) => acc + parseFlexibleNumber(it.valorItem), 0);
  const currentTotal = valorTotalManual !== null ? parseFlexibleNumber(valorTotalManual) : sumItens;

  // Process print/image of Ordem de Serviço
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setExtractError('Por favor, cole um print de imagem válido (.png, .jpg ou .webp).');
      return;
    }

    try {
      setIsProcessingImage(true);
      setExtractError(null);
      setExtractSuccess(null);

      const base64Data = await fileToBase64(file);
      setImagePreview(base64Data);

      const result = await extractOsFromImage(base64Data, file.type);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Não foi possível extrair os dados da Ordem de Serviço do print.');
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

      // Preenchimento dos itens: se houver múltiplos itens discriminados no print, preenche todos eles!
      if (extItens && Array.isArray(extItens) && extItens.length > 0) {
        const mappedItens = extItens.map((it, idx) => {
          const itemVal = typeof it.valorItem === 'number' && !isNaN(it.valorItem) ? it.valorItem : 0;
          return {
            id: `item-${Date.now()}-${idx + 1}`,
            item: (it.item || String(idx + 1).padStart(2, '0')).trim().toUpperCase(),
            lote: (it.lote || '01').trim().toUpperCase(),
            qtd: String(it.qtd !== undefined && it.qtd !== null && it.qtd > 0 ? it.qtd : '1'),
            unidade: (it.unidade || 'UN').trim().toUpperCase(),
            especificacao: (it.especificacao || extDesc || '').trim().toUpperCase(),
            valorItem: itemVal > 0 ? formatCurrency(itemVal, true) : '',
          };
        });
        setItens(mappedItens);
      } else {
        // Se a OS tiver apenas um item geral
        const formattedVal =
          typeof extValor === 'number' && !isNaN(extValor) && extValor > 0
            ? formatCurrency(extValor, true)
            : '';
        setItens([
          {
            id: `item-${Date.now()}-1`,
            item: '01',
            lote: '01',
            qtd: '1',
            unidade: 'UN',
            especificacao: (extDesc || '').trim().toUpperCase(),
            valorItem: formattedVal,
          },
        ]);
      }

      if (typeof extValor === 'number' && !isNaN(extValor) && extValor > 0) {
        setValorTotalManual(formatCurrency(extValor, true));
      }

      const count = extItens && extItens.length > 0 ? extItens.length : 1;
      setExtractSuccess(
        `Print carregado com sucesso! Nº da OS: ${extNum} • ${count > 1 ? `${count} itens preenchidos` : '1 item preenchido'} • Total: ${formatCurrency(extValor)}`
      );
      setTimeout(() => {
        setExtractSuccess(null);
      }, 6000);
    } catch (err: any) {
      console.error('Erro na extração do print:', err);
      setExtractError(err?.message || 'Falha ao processar o print colado da Ordem de Serviço.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Pasting via button click using Clipboard API
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
      setExtractError(
        'Nenhuma imagem encontrada na área de transferência. Tire um print da OS e pressione Ctrl+V nesta janela.'
      );
    } catch (err: any) {
      console.warn('Clipboard read permission/error:', err);
      setExtractError('Para colar o print da OS, use o atalho Ctrl+V no teclado dentro desta janela.');
    }
  };

  // Listen for paste (Ctrl+V / Cmd+V) of screenshots anywhere while modal is open
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

  const handleAddItem = () => {
    const nextIdx = itens.length + 1;
    const lastLote = itens[itens.length - 1]?.lote || '01';
    setItens([
      ...itens,
      {
        id: `item-${Date.now()}-${nextIdx}`,
        item: String(nextIdx).padStart(2, '0'),
        lote: lastLote,
        qtd: '1',
        unidade: 'UN',
        especificacao: '',
        valorItem: '',
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (itens.length <= 1) return;
    setItens(itens.filter((it) => it.id !== id));
  };

  const handleItemFieldChange = (
    id: string,
    field: 'item' | 'lote' | 'qtd' | 'unidade' | 'especificacao' | 'valorItem',
    val: string
  ) => {
    setItens((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (field === 'valorItem') {
          return { ...it, valorItem: formatCurrencyInput(val) };
        }
        return { ...it, [field]: val };
      })
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedItens: ItemOrdemServico[] = itens.map((it, idx) => ({
      id: it.id || `item-${Date.now()}-${idx}`,
      item: it.item.trim().toUpperCase() || String(idx + 1).padStart(2, '0'),
      lote: it.lote.trim().toUpperCase() || undefined,
      qtd: Number(it.qtd) || 1,
      unidade: it.unidade.trim().toUpperCase() || 'UN',
      especificacao: it.especificacao.trim().toUpperCase(),
      valorItem: parseFlexibleNumber(it.valorItem),
    }));

    const finalValorTotal = valorTotalManual !== null && parseFlexibleNumber(valorTotalManual) > 0
      ? parseFlexibleNumber(valorTotalManual)
      : sumItens;

    const lotesList = Array.from(new Set(parsedItens.map((it) => it.lote).filter(Boolean)));
    const osLote = lotesList.join(', ');

    const savedOs: OrdemServico = {
      id: osToEdit?.id || `os-${Date.now()}`,
      numeroOs: numeroOs.trim().toUpperCase(),
      dataEmissao: dataEmissao.trim(),
      lote: osLote || undefined,
      descricao: descricao.trim().toUpperCase(),
      itens: parsedItens,
      valorTotal: finalValorTotal,
    };

    onSave(savedOs);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-[#1e3a8a] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1 bg-white/10 rounded">
              <FileCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {osToEdit ? 'EDITAR ORDEM DE SERVIÇO (OS)' : 'LANÇAR ORDEM DE SERVIÇO (OS)'}
              </h3>
              <p className="text-[10px] text-blue-200 uppercase font-medium">
                CONTRATO Nº {contrato.numero} • {contrato.razaoSocial}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Row 1: Nº da OS, Data de Emissão (Lote moved beside item) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Nº DA OS *
              </label>
              <input
                type="text"
                placeholder="ex: 005/2025/SOENG/SAAS/SEJUS/MT"
                value={numeroOs}
                onChange={(e) => setNumeroOs(e.target.value.toUpperCase())}
                className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded font-mono font-bold uppercase focus:ring-1 focus:ring-blue-600 outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                DATA DA EMISSÃO *
              </label>
              <input
                type="text"
                placeholder="DD/MM/AAAA"
                value={dataEmissao}
                onChange={(e) => setDataEmissao(formatDateInput(e.target.value))}
                className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 outline-none"
                required
              />
            </div>
          </div>

          {/* Row 2: Descrição da OS */}
          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
              DESCRIÇÃO DA ORDEM DE SERVIÇO *
            </label>
            <input
              type="text"
              placeholder="ex: REFORMA E ADEQUAÇÃO DAS INSTALAÇÕES ELÉTRICAS E HIDRÁULICAS..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value.toUpperCase())}
              className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded uppercase focus:ring-1 focus:ring-blue-600 outline-none"
              required
            />
          </div>

          {/* SECTION: Itens da OS */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
            <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                ITENS DA ORDEM DE SERVIÇO ({itens.length})
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold uppercase transition-colors cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3" />
                <span>Adicionar Item</span>
              </button>
            </div>

            <div className="p-3 space-y-2.5 max-h-64 overflow-y-auto">
              {itens.map((it) => (
                <div
                  key={it.id}
                  className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex flex-wrap sm:flex-nowrap gap-2.5 items-center"
                >
                  {/* Item number */}
                  <div className="w-14 shrink-0">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5 text-center">
                      ITEM
                    </label>
                    <input
                      type="text"
                      placeholder="01"
                      value={it.item}
                      onChange={(e) => handleItemFieldChange(it.id, 'item', e.target.value.toUpperCase())}
                      className="w-full text-xs px-2 py-1 border border-slate-200 rounded text-center font-bold uppercase focus:ring-1 focus:ring-blue-600 outline-none"
                    />
                  </div>

                  {/* Qtd */}
                  <div className="w-14 shrink-0">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5 text-center">
                      QTD
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="1"
                      value={it.qtd}
                      onChange={(e) => handleItemFieldChange(it.id, 'qtd', e.target.value)}
                      className="w-full text-xs px-2 py-1 border border-slate-200 rounded text-center focus:ring-1 focus:ring-blue-600 outline-none"
                    />
                  </div>

                  {/* Unidade */}
                  <div className="w-16 shrink-0">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5 text-center">
                      UNID
                    </label>
                    <input
                      type="text"
                      placeholder="UN"
                      value={it.unidade}
                      onChange={(e) => handleItemFieldChange(it.id, 'unidade', e.target.value.toUpperCase())}
                      className="w-full text-xs px-2 py-1 border border-slate-200 rounded text-center uppercase focus:ring-1 focus:ring-blue-600 outline-none"
                    />
                  </div>

                  {/* Discriminação / Especificação */}
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5">
                      DISCRIMINAÇÃO / ESPECIFICAÇÃO
                    </label>
                    <input
                      type="text"
                      placeholder="ex: Pintura geral acrílica fosca..."
                      value={it.especificacao}
                      onChange={(e) => handleItemFieldChange(it.id, 'especificacao', e.target.value.toUpperCase())}
                      className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded uppercase focus:ring-1 focus:ring-blue-600 outline-none"
                    />
                  </div>

                  {/* Valor do Item */}
                  <div className="w-36 sm:w-40 shrink-0">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-0.5 text-right">
                      VALOR DO ITEM (R$)
                    </label>
                    <input
                      type="text"
                      placeholder="R$ 0,00"
                      value={it.valorItem}
                      onChange={(e) => handleItemFieldChange(it.id, 'valorItem', e.target.value)}
                      onBlur={() => {
                        const blur = formatCurrencyBlur(it.valorItem);
                        handleItemFieldChange(it.id, 'valorItem', blur);
                      }}
                      className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded font-bold text-blue-900 text-right focus:ring-1 focus:ring-blue-600 outline-none"
                    />
                  </div>

                  {/* Delete Item button */}
                  <div className="shrink-0 self-end sm:self-center pt-2 sm:pt-3">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(it.id)}
                      disabled={itens.length <= 1}
                      title="Excluir item"
                      className={`p-1.5 rounded transition-colors ${
                        itens.length <= 1
                          ? 'text-slate-300 cursor-not-allowed'
                          : 'text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 4: Valor Total da OS */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-blue-900 uppercase block">
                VALOR TOTAL DA OS (R$)
              </span>
              <span className="text-[10px] text-blue-600">
                Soma automática dos itens: {formatCurrency(sumItens)}
              </span>
            </div>

            <div className="w-full sm:w-60">
              <input
                type="text"
                placeholder="R$ 0,00"
                value={
                  valorTotalManual !== null
                    ? valorTotalManual
                    : sumItens > 0
                    ? formatCurrency(sumItens, true)
                    : ''
                }
                onChange={(e) => {
                  const val = formatCurrencyInput(e.target.value);
                  setValorTotalManual(val);
                }}
                onBlur={() => {
                  if (valorTotalManual !== null) {
                    setValorTotalManual(formatCurrencyBlur(valorTotalManual));
                  }
                }}
                className="w-full text-sm px-3 py-1.5 border border-blue-300 rounded font-bold text-blue-900 bg-white focus:ring-1 focus:ring-blue-600 outline-none text-right"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-300 text-xs font-semibold rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1e3a8a] hover:bg-blue-900 active:scale-95 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>{osToEdit ? 'Atualizar Ordem de Serviço' : 'Salvar Ordem de Serviço'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Modal de visualização do Print da OS colado */}
      {showImagePreviewModal && imagePreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-[#1e3a8a] text-white px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-blue-200" />
                Print da Ordem de Serviço Colado
              </span>
              <button
                type="button"
                onClick={() => setShowImagePreviewModal(false)}
                className="text-white hover:bg-white/20 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 overflow-auto max-h-[80vh] flex items-center justify-center bg-slate-900/10">
              <img
                src={imagePreview}
                alt="Print da OS colado"
                className="max-h-[75vh] w-auto object-contain rounded shadow-md"
              />
            </div>
            <div className="px-4 py-2.5 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600">
              <span>Número da OS: <strong>{numeroOs || 'Não detectado'}</strong></span>
              <button
                type="button"
                onClick={() => setShowImagePreviewModal(false)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-800 font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
