import React, { useState, useEffect } from 'react';
import {
  X,
  ClipboardList,
  Plus,
  Trash2,
  FileCheck,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clipboard,
  Image as ImageIcon,
} from 'lucide-react';
import { Contrato, Medicao, OrdemServico } from '../../types/contract';
import {
  formatCurrency,
  formatCurrencyInput,
  formatCurrencyBlur,
  parseFlexibleNumber,
  formatNumeroMedicao,
  formatDateInput,
  calculateOsSaldo,
  formatOsShortNumber,
} from '../../utils/formatters';
import { QuickAddOsModal } from './QuickAddOsModal';
import { NewOrdemServicoModal } from './NewOrdemServicoModal';
import { extractMedicaoFromImage, fileToBase64 } from '../../services/medicaoExtraction';

interface NewMedicaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    medicao: Medicao,
    empenhoDeduction?: { empenhoNumero: string; amount: number }
  ) => void;
  contrato: Contrato;
  onAddNewOs?: (os: OrdemServico) => void;
}

export function getLastProcessoSigadoc(contrato: Contrato): string {
  // 1. Check previous medições of this contract in reverse order
  if (contrato.medicoes && contrato.medicoes.length > 0) {
    for (let i = contrato.medicoes.length - 1; i >= 0; i--) {
      const s = (contrato.medicoes[i].sigadoc || '').trim();
      if (
        s &&
        s !== '-' &&
        s !== '--' &&
        s.toUpperCase() !== 'NÃO INFORMADO' &&
        s.toUpperCase() !== 'NAO INFORMADO'
      ) {
        return s;
      }
    }
  }

  // 2. Check the contract's own processoSigadoc
  const cProcesso = (contrato.processoSigadoc || '').trim();
  if (
    cProcesso &&
    cProcesso !== '-' &&
    cProcesso !== '--' &&
    cProcesso.toUpperCase() !== 'NÃO INFORMADO' &&
    cProcesso.toUpperCase() !== 'NAO INFORMADO'
  ) {
    return cProcesso;
  }

  // 3. If there is no previous process/contract, leave blank
  return '';
}

export const NewMedicaoModal: React.FC<NewMedicaoModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contrato,
  onAddNewOs,
}) => {
  const isIndenizacao = Boolean(contrato.pgtoIndenizacao);
  const [numeroMed, setNumeroMed] = useState('');
  const [periodo, setPeriodo] = useState('01 A 30/08/2026');
  const [unidadeCidade, setUnidadeCidade] = useState('');
  const [descricao, setDescricao] = useState('');
  const [sigadoc, setSigadoc] = useState('');
  const [numeroNf, setNumeroNf] = useState('');
  const [dataEmissaoNf, setDataEmissaoNf] = useState('');
  const [dataAtesto, setDataAtesto] = useState('');
  const [valorMedicao, setValorMedicao] = useState('');
  const [numeroTac, setNumeroTac] = useState('');
  const [valorTac, setValorTac] = useState('');
  const [periodoTac, setPeriodoTac] = useState('');

  // Ordem de Serviço state & modal
  const [selectedOsIds, setSelectedOsIds] = useState<string[]>(['']);
  const [isAddOsModalOpen, setIsAddOsModalOpen] = useState(false);
  const [localOrdensServico, setLocalOrdensServico] = useState<OrdemServico[]>([]);
  const [targetOsSlotForAdd, setTargetOsSlotForAdd] = useState<number>(0);

  // Empenho vinculação
  const [selectedEmpenhoNumero, setSelectedEmpenhoNumero] = useState('SEM EMPENHO');
  const [valorDescontadoEmpenhoInput, setValorDescontadoEmpenhoInput] = useState('');

  // States for Image / Print Medição Extraction
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

      setNumeroMed(
        isIndenizacao ? '' : `${String((contrato.medicoes || []).length + 1).padStart(2, '0')}ª MEDIÇÃO`
      );
      setPeriodo(isIndenizacao ? '' : '01 A 30/08/2026');
      setUnidadeCidade(contrato.regioes?.[0]?.nome || contrato.regioes?.[0]?.cidades || 'SINOP');
      setDescricao('');
      setSigadoc(getLastProcessoSigadoc(contrato));
      setNumeroNf('');
      setDataEmissaoNf('');
      setDataAtesto('');
      setValorMedicao('');
      setValorDescontadoEmpenhoInput('');
      setNumeroTac('');
      setValorTac('');
      setPeriodoTac('');

      setSelectedEmpenhoNumero('SEM EMPENHO');
      
      const osList = contrato.ordensServico || [];
      setLocalOrdensServico(osList);
      if (osList.length === 1) {
        setSelectedOsIds([osList[0].id]);
      } else {
        setSelectedOsIds(['']);
      }
      setIsAddOsModalOpen(false);
    }
  }, [isOpen, contrato]);

  const totalMedVal = parseFlexibleNumber(valorMedicao);
  const isUOSesp = selectedEmpenhoNumero === 'Pago pela UO da SESP';
  const activeEmpenho = (contrato.empenhos || []).find((e) => e.numeroEmp === selectedEmpenhoNumero);
  const isSemEmpenho =
    !isUOSesp &&
    (!selectedEmpenhoNumero ||
      selectedEmpenhoNumero === 'SEM EMPENHO' ||
      selectedEmpenhoNumero === 'Sem empenho' ||
      !activeEmpenho);

  const handleMedicaoValueChange = (valStr: string) => {
    setValorMedicao(valStr);
    const parsed = parseFlexibleNumber(valStr);
    if (!isSemEmpenho && activeEmpenho) {
      const sug = Math.min(parsed, activeEmpenho.saldoDisponivel);
      setValorDescontadoEmpenhoInput(formatCurrency(sug, true));
    }
  };

  // Process print/image of Medição
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

      const result = await extractMedicaoFromImage(base64Data, file.type);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Não foi possível extrair os dados da Medição do print.');
      }

      const {
        sigadoc: extSigadoc,
        cidade: extCidade,
        descricao: extDescricao,
        numeroMedicao: extNumeroMed,
        valorMedicao: extValorMed,
        periodo: extPeriodo,
        numeroNf: extNf,
        dataEmissaoNf: extDataNf,
        dataAtesto: extDataAtesto,
      } = result.data;

      if (extSigadoc) {
        setSigadoc(extSigadoc.trim().toUpperCase());
      }
      if (extCidade) {
        setUnidadeCidade(extCidade.trim().toUpperCase());
      }
      if (extDescricao) {
        setDescricao(extDescricao.trim().toUpperCase());
      }
      if (extNumeroMed) {
        const formatted = formatNumeroMedicao(extNumeroMed) || extNumeroMed.trim().toUpperCase();
        setNumeroMed(formatted);
      }
      if (typeof extValorMed === 'number' && !isNaN(extValorMed) && extValorMed > 0) {
        handleMedicaoValueChange(formatCurrency(extValorMed, true));
      }
      if (extPeriodo) {
        setPeriodo(extPeriodo.trim().toUpperCase());
      }
      if (extNf) {
        setNumeroNf(extNf.trim().toUpperCase());
      }
      if (extDataNf) {
        setDataEmissaoNf(extDataNf.trim());
      }
      if (extDataAtesto) {
        setDataAtesto(extDataAtesto.trim());
      }

      const summaryParts = [
        extSigadoc ? `Sigadoc: ${extSigadoc}` : null,
        extCidade ? `Cidade: ${extCidade}` : null,
        extNumeroMed ? `Nº: ${extNumeroMed}` : null,
        typeof extValorMed === 'number' && extValorMed > 0 ? `Valor: ${formatCurrency(extValorMed)}` : null,
      ].filter(Boolean);

      setExtractSuccess(
        `Print da medição processado com sucesso! ${summaryParts.join(' • ') || 'Dados carregados no formulário.'}`
      );
      setTimeout(() => {
        setExtractSuccess(null);
      }, 7000);
    } catch (err: any) {
      console.error('Erro na extração do print da medição:', err);
      setExtractError(err?.message || 'Falha ao processar o print colado da Medição.');
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
            const file = new File([blob], 'print_medicao.png', { type: imageType });
            await processImageFile(file);
            return;
          }
        }
      }
      setExtractError(
        'Nenhuma imagem encontrada na área de transferência. Tire um print da medição e pressione Ctrl+V nesta janela.'
      );
    } catch (err: any) {
      console.warn('Clipboard read permission/error:', err);
      setExtractError('Para colar o print da medição, use o atalho Ctrl+V no teclado dentro desta janela.');
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

  if (!isOpen) return null;

  const handleEmpenhoChange = (empNum: string) => {
    setSelectedEmpenhoNumero(empNum);
    const chosen = (contrato.empenhos || []).find((e) => e.numeroEmp === empNum);
    if (chosen && totalMedVal > 0) {
      const sug = Math.min(totalMedVal, chosen.saldoDisponivel);
      setValorDescontadoEmpenhoInput(formatCurrency(sug, true));
    } else {
      setValorDescontadoEmpenhoInput('');
    }
  };

  // Automatically compute empenho deduction and remaining pending
  const parsedDescInput = parseFlexibleNumber(valorDescontadoEmpenhoInput);
  const descVal = isSemEmpenho || !activeEmpenho
    ? 0
    : Math.min(
        parsedDescInput > 0 ? parsedDescInput : totalMedVal,
        activeEmpenho.saldoDisponivel
      );

  const remainingPending = isUOSesp
    ? 0
    : isSemEmpenho
    ? totalMedVal
    : Math.max(0, totalMedVal - descVal);

  const allOs = localOrdensServico.length > 0 ? localOrdensServico : (contrato.ordensServico || []);

  const getEffectiveOsSaldo = (os: OrdemServico) => {
    return calculateOsSaldo(os, contrato.medicoes || [], allOs.length).saldo;
  };

  const handleAddOsSlot = () => {
    const availableCandidate = allOs.find((o) => !selectedOsIds.includes(o.id));
    setSelectedOsIds((prev) => [...prev, availableCandidate ? availableCandidate.id : '']);
  };

  const handleRemoveOsSlot = (indexToRemove: number) => {
    setSelectedOsIds((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      return next.length > 0 ? next : [''];
    });
  };

  const handleOsSlotChange = (index: number, newOsId: string) => {
    setSelectedOsIds((prev) => {
      const next = [...prev];
      next[index] = newOsId;
      return next;
    });
  };

  const handleSaveQuickOs = (newOs: OrdemServico) => {
    setLocalOrdensServico((prev) => {
      const exists = prev.some((o) => o.id === newOs.id);
      return exists ? prev.map((o) => (o.id === newOs.id ? newOs : o)) : [...prev, newOs];
    });
    setSelectedOsIds((prev) => {
      const next = [...prev];
      if (targetOsSlotForAdd < next.length) {
        next[targetOsSlotForAdd] = newOs.id;
      } else {
        next.push(newOs.id);
      }
      return next;
    });
    onAddNewOs?.(newOs);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pct =
      contrato.valorContratado > 0
        ? Number(((totalMedVal / contrato.valorContratado) * 100).toFixed(1))
        : 0;

    const chosenOsList = isIndenizacao
      ? []
      : selectedOsIds
          .map((id) => allOs.find((o) => o.id === id))
          .filter((o): o is OrdemServico => Boolean(o));

    const primaryOs = chosenOsList[0];
    const secondaryOs = chosenOsList[1];

    let remainingVal = totalMedVal;
    const osDeductions: Record<string, number> = {};
    for (const os of chosenOsList) {
      const avail = Math.max(0, getEffectiveOsSaldo(os));
      const deduct = Math.min(remainingVal, avail);
      osDeductions[os.id] = deduct;
      remainingVal = Math.max(0, remainingVal - deduct);
    }
    if (remainingVal > 0 && chosenOsList.length > 0) {
      const lastOs = chosenOsList[chosenOsList.length - 1];
      osDeductions[lastOs.id] = (osDeductions[lastOs.id] || 0) + remainingVal;
    }

    const newMed: Medicao = {
      id: `med-${Date.now()}`,
      numeroMed: isIndenizacao
        ? numeroNf.trim()
          ? `NF ${numeroNf.trim().toUpperCase()}`
          : 'NF'
        : formatNumeroMedicao(numeroMed) || numeroMed.trim().toUpperCase(),
      periodo: periodo.trim().toUpperCase(),
      unidadeCidade: unidadeCidade.trim().toUpperCase(),
      descricao: descricao.trim().toUpperCase(),
      sigadoc: sigadoc.trim().toUpperCase(),
      numeroNf: numeroNf.trim().toUpperCase() || undefined,
      dataEmissaoNf: dataEmissaoNf.trim() || undefined,
      dataAtesto: dataAtesto.trim() || undefined,
      empenhoVinculado: isUOSesp ? 'Pago pela UO da SESP' : isSemEmpenho ? 'SEM EMPENHO' : selectedEmpenhoNumero,
      valorDescontadoEmpenho: isUOSesp || isSemEmpenho ? 0 : descVal,
      valorMedicao: totalMedVal,
      medicaoPendente: !isUOSesp && remainingPending > 0,
      valorPendente: isUOSesp ? 0 : remainingPending,
      percentualFisico: pct,
      dataRegistro: '30/09/2026',
      observacao: '',
      numeroOs: primaryOs?.numeroOs,
      valorOs: primaryOs?.valorTotal,
      dataEmissaoOs: primaryOs?.dataEmissao,
      osId: primaryOs?.id,
      numeroOs2: secondaryOs?.numeroOs,
      valorOs2: secondaryOs?.valorTotal,
      dataEmissaoOs2: secondaryOs?.dataEmissao,
      osId2: secondaryOs?.id,
      valorAbatidoOs1: primaryOs ? osDeductions[primaryOs.id] : undefined,
      valorAbatidoOs2: secondaryOs ? osDeductions[secondaryOs.id] : undefined,
      osIds: chosenOsList.map((o) => o.id),
      numerosOs: chosenOsList.map((o) => o.numeroOs),
      numeroTac: isIndenizacao ? numeroTac.trim().toUpperCase() || undefined : undefined,
      valorTac: isIndenizacao && valorTac.trim() ? parseFlexibleNumber(valorTac) : undefined,
      periodoTac: isIndenizacao ? periodoTac.trim().toUpperCase() || undefined : undefined,
    };

    onSave(
      newMed,
      !isUOSesp && !isSemEmpenho && descVal > 0
        ? { empenhoNumero: selectedEmpenhoNumero, amount: descVal }
        : undefined
    );
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
          {/* Header */}
          <div className="bg-[#dc2626] text-white px-5 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {isIndenizacao ? 'LANÇAR NF' : 'LANÇAR MEDIÇÃO'} - CONTRATO Nº {contrato.numero}
              </h3>
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
            {/* SEÇÃO 1: TAC (Indenização) OU ORDEM DE SERVIÇO (OS) VINCULADA */}
            {isIndenizacao ? (
            <div className="bg-slate-50/90 border border-slate-200 rounded-lg p-2.5 space-y-2">
              <label className="text-[10px] font-bold text-slate-700 uppercase flex items-center gap-1.5 tracking-wide">
                <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>TERMO DE AJUSTE DE CONTAS (TAC)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                    Nº DO TAC
                  </label>
                  <input
                    type="text"
                    placeholder="ex: 001/2026"
                    value={numeroTac}
                    onChange={(e) => setNumeroTac(e.target.value.toUpperCase())}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-bold uppercase bg-white focus:ring-1 focus:ring-red-600 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                    VALOR DO TAC
                  </label>
                  <input
                    type="text"
                    placeholder="R$ 0,00"
                    value={valorTac}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setValorTac(formatted);
                      handleMedicaoValueChange(formatted);
                    }}
                    onBlur={() => {
                      const blurred = formatCurrencyBlur(valorTac);
                      setValorTac(blurred);
                      handleMedicaoValueChange(blurred);
                    }}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-bold font-mono text-slate-800 bg-white focus:ring-1 focus:ring-red-600 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                    PERÍODO DO TAC
                  </label>
                  <input
                    type="text"
                    placeholder="ex: 01 A 31/05/2026"
                    value={periodoTac}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setPeriodoTac(val);
                      setPeriodo(val);
                    }}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded uppercase bg-white focus:ring-1 focus:ring-red-600 outline-none"
                  />
                </div>
              </div>
            </div>
            ) : (
            <div className="bg-slate-50/90 border border-slate-200 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-700 uppercase flex items-center gap-1.5 tracking-wide">
                  <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>ORDEM DE SERVIÇO (OS) VINCULADA</span>
                </label>
                {selectedOsIds.length > 1 && (
                  <span className="text-[9.5px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {selectedOsIds.filter(Boolean).length} OS(s) vinculada(s)
                  </span>
                )}
              </div>

              {/* Lista de Caixas de Seleção de OS */}
              <div className="space-y-1.5">
                {selectedOsIds.map((currentOsId, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 animate-in fade-in duration-100">
                    {/* Caixa de seleção */}
                    <select
                      value={currentOsId}
                      onChange={(e) => {
                        if (e.target.value === '__NEW_OS__') {
                          setTargetOsSlotForAdd(idx);
                          setIsAddOsModalOpen(true);
                          return;
                        }
                        handleOsSlotChange(idx, e.target.value);
                      }}
                      className="flex-1 text-[11px] px-2.5 py-1 border border-slate-300 rounded font-medium text-slate-800 bg-white focus:ring-1 focus:ring-blue-600 outline-none cursor-pointer h-7"
                    >
                      {allOs.length === 0 ? (
                        <>
                          <option value="">Nenhuma OS cadastrada no contrato</option>
                          <option value="__NEW_OS__" className="font-bold text-blue-700 bg-blue-50">
                            Adicionar Nova OS
                          </option>
                        </>
                      ) : (
                        <>
                          <option value="">
                            {idx === 0 ? 'Selecione a OS...' : `Selecione a ${idx + 1}ª OS vinculada...`}
                          </option>
                          <option value="__NEW_OS__" className="font-bold text-blue-700 bg-blue-50">
                            Adicionar Nova OS
                          </option>
                          {allOs.map((os) => {
                            const shortNum = formatOsShortNumber(os.numeroOs);
                            const osSaldo = getEffectiveOsSaldo(os);
                            const isAlreadyChosen = selectedOsIds.some((id, oIdx) => oIdx !== idx && id === os.id);
                            return (
                              <option key={os.id} value={os.id} disabled={isAlreadyChosen}>
                                {shortNum} | Saldo: {formatCurrency(osSaldo)} (Total: {formatCurrency(os.valorTotal)})
                                {isAlreadyChosen ? ' (Já selecionada)' : ''}
                              </option>
                            );
                          })}
                        </>
                      )}
                    </select>

                    {/* Na primeira linha: botão '+' para adicionar outra caixa de seleção quantas vezes clicar */}
                    {idx === 0 ? (
                      <button
                        type="button"
                        onClick={handleAddOsSlot}
                        className="inline-flex items-center justify-center w-7 h-7 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded font-bold text-sm transition-all cursor-pointer shadow-xs shrink-0"
                        title="Adicionar mais uma caixa de seleção de OS"
                      >
                        <Plus className="w-4 h-4 stroke-[3]" />
                      </button>
                    ) : (
                      /* Nas linhas seguintes: botão com lixeira para remover */
                      <button
                        type="button"
                        onClick={() => handleRemoveOsSlot(idx)}
                        className="inline-flex items-center justify-center w-7 h-7 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded font-bold transition-all cursor-pointer shadow-xs shrink-0"
                        title="Remover esta OS"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* SEÇÃO 2: DADOS DA MEDIÇÃO (Nº DA MEDIÇÃO, VALOR TOTAL E PERÍODO) */}
            <div className={`grid grid-cols-1 ${isIndenizacao ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
              {!isIndenizacao && (
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  Nº DA MEDIÇÃO *
                </label>
                <input
                  type="text"
                  placeholder="ex: 14ª ou 4ª (CONT.)"
                  value={numeroMed}
                  onChange={(e) => setNumeroMed(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded font-bold uppercase focus:ring-1 focus:ring-red-600 outline-none"
                  required
                />
              </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  {isIndenizacao ? 'VALOR TOTAL DA NF' : 'VALOR TOTAL DA MEDIÇÃO (R$) *'}
                </label>
                <input
                  type="text"
                  placeholder="R$ 0,00"
                  value={valorMedicao}
                  onChange={(e) => handleMedicaoValueChange(formatCurrencyInput(e.target.value))}
                  onBlur={() => {
                    const blurVal = formatCurrencyBlur(valorMedicao);
                    handleMedicaoValueChange(blurVal);
                  }}
                  className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded font-bold font-mono text-red-700 focus:ring-1 focus:ring-red-600 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  {isIndenizacao ? 'PERÍODO APURADO' : 'PERÍODO DA MEDIÇÃO *'}
                </label>
                <input
                  type="text"
                  placeholder="ex: 01 A 30/08/2026"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded uppercase focus:ring-1 focus:ring-red-600 outline-none"
                  required
                />
              </div>
            </div>

            {/* Row: Unidade / Cidade & Processo SIGADOC */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  UNIDADE / CIDADE *
                </label>
                <input
                  type="text"
                  placeholder="ex: SINOP"
                  value={unidadeCidade}
                  onChange={(e) => setUnidadeCidade(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded uppercase focus:ring-1 focus:ring-red-600 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  PROCESSO SIGADOC
                </label>
                <input
                  type="text"
                  placeholder="ex: SEJUS-PRO-2025/03206"
                  value={sigadoc}
                  onChange={(e) => setSigadoc(e.target.value.toUpperCase())}
                  className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded font-mono uppercase focus:ring-1 focus:ring-red-600 outline-none"
                />
              </div>
            </div>

            {/* Row: Descrição */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                DESCRIÇÃO DOS SERVIÇOS MEDIDOS *
              </label>
              <input
                type="text"
                placeholder="ex: REPARO DAS ALAS ANTIGAS DO BLOCO ADMINISTRATIVO"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded uppercase focus:ring-1 focus:ring-red-600 outline-none"
                required
              />
            </div>

            {/* Row: NOTA FISCAL E DATA DO ATESTO */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  Nº DA NF
                </label>
                <input
                  type="text"
                  placeholder="ex: 12345"
                  value={numeroNf}
                  onChange={(e) => setNumeroNf(e.target.value.toUpperCase())}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-mono uppercase bg-white focus:ring-1 focus:ring-red-600 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  EMISSÃO DA NF
                </label>
                <input
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={dataEmissaoNf}
                  onChange={(e) => setDataEmissaoNf(formatDateInput(e.target.value))}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-red-600 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  DATA DO ATESTO
                </label>
                <input
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={dataAtesto}
                  onChange={(e) => setDataAtesto(formatDateInput(e.target.value))}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-red-600 outline-none"
                />
              </div>
            </div>

            {/* SELECIONAR EMPENHO PARA ATENDER A DEMANDA */}
            {!isIndenizacao && (
            <>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                SELECIONAR EMPENHO PARA ATENDER A DEMANDA
              </label>
              <select
                value={selectedEmpenhoNumero}
                onChange={(e) => handleEmpenhoChange(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-600 outline-none cursor-pointer"
              >
                <option value="SEM EMPENHO">sem empenho</option>
                <option value="Pago pela UO da SESP" className="font-bold text-emerald-800">
                  Pago pela UO da SESP
                </option>
                {contrato.empenhos
                  .filter((emp) => (emp.saldoDisponivel ?? 0) > 0)
                  .map((emp) => (
                    <option key={emp.id} value={emp.numeroEmp}>
                      {emp.numeroEmp} - {emp.regiao} (Saldo Disponível: {formatCurrency(emp.saldoDisponivel)})
                    </option>
                  ))}
              </select>
            </div>

            {/* If an empenho is chosen */}
            {!isSemEmpenho && activeEmpenho && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-medium">Saldo disponível no empenho:</span>
                  <span className="font-mono font-bold text-blue-900">
                    {formatCurrency(activeEmpenho.saldoDisponivel)}
                  </span>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                    VALOR DESCONTADO DESTE EMPENHO (R$) *
                  </label>
                  <input
                    type="text"
                    placeholder="R$ 0,00"
                    value={valorDescontadoEmpenhoInput}
                    onChange={(e) =>
                      setValorDescontadoEmpenhoInput(formatCurrencyInput(e.target.value))
                    }
                    onBlur={() =>
                      setValorDescontadoEmpenhoInput(
                        formatCurrencyBlur(valorDescontadoEmpenhoInput)
                      )
                    }
                    className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded font-bold text-blue-800 focus:ring-1 focus:ring-blue-600 outline-none"
                    required
                  />
                </div>
              </div>
            )}
            </>
            )}

            {/* Footer Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-slate-300 text-xs font-semibold rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#dc2626] hover:bg-red-700 text-white text-xs font-bold uppercase rounded shadow-sm transition-colors cursor-pointer"
              >
                {isIndenizacao ? '+ LANÇAR NF' : '+ LANÇAR MEDIÇÃO'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal completa de Lançar Ordem de Serviço (OS) */}
      <NewOrdemServicoModal
        isOpen={isAddOsModalOpen}
        onClose={() => setIsAddOsModalOpen(false)}
        onSave={(newOs) => {
          handleSaveQuickOs(newOs);
          setIsAddOsModalOpen(false);
        }}
        contrato={contrato}
      />

      {/* Modal de visualização do Print da Medição colado */}
      {showImagePreviewModal && imagePreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-red-400" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Visualizar Print da Medição
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowImagePreviewModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 bg-slate-100 overflow-auto flex items-center justify-center max-h-[75vh]">
              <img
                src={imagePreview}
                alt="Print da Medição colado"
                className="max-w-full max-h-[70vh] object-contain rounded border border-slate-300 shadow-xs bg-white"
              />
            </div>
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowImagePreviewModal(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
