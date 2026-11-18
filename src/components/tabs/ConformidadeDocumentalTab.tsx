import React, { useState, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Check,
  Printer,
  MessageSquare,
  FileCheck2,
  Download,
  Loader2,
  FileText,
  Paperclip,
  X,
  Eraser,
} from 'lucide-react';
import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  Contrato,
  ItemConformidade,
  StatusConformidade,
  ConformidadeDocumentalData,
} from '../../types/contract';
import { formatCurrency, formatNumeroMedicao } from '../../utils/formatters';
import {
  ensureFullConformidadeItems,
  clearConformidadeItensForMedicao,
} from '../../data/masterConformidadeItems';
import { CobrarFiscalModal } from '../modals/CobrarFiscalModal';
import { DespachoPagamentoModal } from '../modals/DespachoPagamentoModal';
import { DespachoNgerModal } from '../modals/DespachoNgerModal';
import { useSignerConfig } from '../../utils/signerConfig';
import {
  analyzeProcessPdfForConformidade,
  ExtractedDocumentoFolhas,
  CertidaoVencidaInfo,
} from '../../services/processConformidadeExtraction';

interface ConformidadeDocumentalTabProps {
  contrato: Contrato;
  onUpdateContract: (updated: Contrato) => void;
  onPrintConformidade: () => void;
  onNavigateToEmpenhosMedicoes?: () => void;
}

export const ConformidadeDocumentalTab: React.FC<ConformidadeDocumentalTabProps> = ({
  contrato,
  onUpdateContract,
  onPrintConformidade,
  onNavigateToEmpenhosMedicoes,
}) => {
  const { signer, updateSigner } = useSignerConfig();
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [savedMedicaoFeedback, setSavedMedicaoFeedback] = useState<{ medicaoNome: string } | null>(null);
  const [isCobrarFiscalOpen, setIsCobrarFiscalOpen] = useState(false);
  const [isDespachoModalOpen, setIsDespachoModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const processPdfInputRef = useRef<HTMLInputElement | null>(null);
  const [isAnalyzingProcess, setIsAnalyzingProcess] = useState(false);
  const [analyzingFileName, setAnalyzingFileName] = useState('');
  const [analyzingStage, setAnalyzingStage] = useState('');
  const [processAnalyzeError, setProcessAnalyzeError] = useState<string | null>(null);
  const [expiredCertsModal, setExpiredCertsModal] = useState<CertidaoVencidaInfo[] | null>(null);

  // Filter out any continuation (CONT.) entries so they don't pollute the conformity analysis
  const medicoesSemContinuacao = useMemo(() => {
    return (contrato.medicoes || []).filter(
      (m) =>
        m &&
        m.id &&
        !m.numeroMed.toUpperCase().includes('(CONT') &&
        !m.numeroMed.toUpperCase().includes('CONT.') &&
        !m.descricao.toUpperCase().includes('(CONT')
    );
  }, [contrato.medicoes]);

  // The last medicao without continuation (e.g. 01ª MED com R$ 2.000.000,00)
  const ultimaMedicaoSemCont = useMemo(() => {
    if (medicoesSemContinuacao.length > 0) {
      return medicoesSemContinuacao[medicoesSemContinuacao.length - 1];
    }
    return null;
  }, [medicoesSemContinuacao]);

  // Selected medicao for conformity context
  const [selectedMedicaoId, setSelectedMedicaoId] = useState<string>(
    ultimaMedicaoSemCont ? ultimaMedicaoSemCont.id : ''
  );

  React.useEffect(() => {
    if (medicoesSemContinuacao.length > 0) {
      const exists = medicoesSemContinuacao.some((m) => m.id === selectedMedicaoId);
      if (!exists && ultimaMedicaoSemCont) {
        setSelectedMedicaoId(ultimaMedicaoSemCont.id);
      }
    } else {
      setSelectedMedicaoId('');
    }
  }, [medicoesSemContinuacao, selectedMedicaoId, ultimaMedicaoSemCont]);

  const selectedMedicao = useMemo(() => {
    return (
      medicoesSemContinuacao.find((m) => m.id === selectedMedicaoId) ||
      ultimaMedicaoSemCont ||
      undefined
    );
  }, [medicoesSemContinuacao, selectedMedicaoId, ultimaMedicaoSemCont]);

  const isIndenizacao = Boolean(contrato.pgtoIndenizacao);
  const storagePrefix = isIndenizacao ? 'conformidade_ind_' : 'conformidade_';

  const isCompatibleConformidade = (data?: ConformidadeDocumentalData): boolean => {
    if (!data?.itens?.length) return false;
    return data.itens.some((it) => Boolean(it.id?.startsWith('conf-ind-')) === isIndenizacao);
  };

  const hasAnyFilledConformidade = (itens?: ItemConformidade[]): boolean => {
    if (!itens || itens.length === 0) return false;
    return itens.some((it) => it.status !== 'IRREGULAR' || (it.folhas && it.folhas.trim() !== ''));
  };

  const getSavedConformidadeForMedicao = (
    med?: (typeof medicoesSemContinuacao)[number]
  ): ConformidadeDocumentalData | undefined => {
    if (!med) return undefined;
    const targetId = med.id;
    const targetMedNumero = med.numeroMed;
    const candidates: (ConformidadeDocumentalData | undefined)[] = [
      contrato.conformidadePorMedicao?.[targetId],
      targetMedNumero ? contrato.conformidadePorMedicao?.[targetMedNumero] : undefined,
      med.conformidade,
    ];

    if (contrato.numero && typeof window !== 'undefined' && window.localStorage) {
      try {
        const rawFull =
          localStorage.getItem(`${storagePrefix}med_${contrato.numero}_${targetId}`) ||
          (targetMedNumero ? localStorage.getItem(`${storagePrefix}med_${contrato.numero}_${targetMedNumero}`) : null);
        if (rawFull) {
          candidates.push(JSON.parse(rawFull));
        }
        const rawItens =
          localStorage.getItem(`${storagePrefix}itens_${contrato.numero}_${targetId}`) ||
          (targetMedNumero ? localStorage.getItem(`${storagePrefix}itens_${contrato.numero}_${targetMedNumero}`) : null);
        if (rawItens) {
          const parsedItens = JSON.parse(rawItens);
          if (Array.isArray(parsedItens) && parsedItens.length > 0) {
            candidates.push({
              ...(contrato.conformidade || { observacoes: '', data: '', valorEncaminhado: 0 }),
              itens: parsedItens,
            });
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    }

    const compatible = candidates.filter((c): c is ConformidadeDocumentalData => isCompatibleConformidade(c));
    return compatible.find((c) => hasAnyFilledConformidade(c.itens)) || compatible[0];
  };

  const savedConformidadeForSelectedMed = useMemo(() => {
    return getSavedConformidadeForMedicao(selectedMedicao);
  }, [
    selectedMedicao,
    contrato.conformidadePorMedicao,
    contrato.medicoes,
    contrato.numero,
    isIndenizacao,
  ]);

  // Ensure all items from the official master PDF (normal or indenização) are loaded and preserved specifically for this contract
  const allItens: ItemConformidade[] = useMemo(() => {
    const activeConfItems = isCompatibleConformidade(contrato.conformidade)
      ? contrato.conformidade?.itens
      : undefined;
    const savedMedItems = savedConformidadeForSelectedMed?.itens;

    if (selectedMedicao) {
      if (savedMedItems && savedMedItems.length > 0) {
        const isActiveForSelected = contrato.conformidade?.medicaoId === selectedMedicao.id;
        const preferredItems =
          isActiveForSelected &&
          activeConfItems &&
          (hasAnyFilledConformidade(activeConfItems) || !hasAnyFilledConformidade(savedMedItems))
            ? activeConfItems
            : savedMedItems;
        return ensureFullConformidadeItems(
          preferredItems,
          contrato.numero,
          selectedMedicao.id,
          isIndenizacao
        );
      }

      const hasExplicitOtherMedicaoId =
        Boolean(contrato.conformidade?.medicaoId) &&
        contrato.conformidade?.medicaoId !== selectedMedicao.id;
      const isLegacyCrossMedicao =
        !contrato.conformidade?.medicaoId && medicoesSemContinuacao.length > 1;

      if (isIndenizacao && (hasExplicitOtherMedicaoId || isLegacyCrossMedicao)) {
        return clearConformidadeItensForMedicao(
          activeConfItems,
          contrato.numero,
          isIndenizacao
        );
      }
    }

    return ensureFullConformidadeItems(
      activeConfItems,
      contrato.numero,
      selectedMedicao?.id,
      isIndenizacao
    );
  }, [
    contrato.conformidade,
    savedConformidadeForSelectedMed,
    contrato.numero,
    selectedMedicao,
    medicoesSemContinuacao.length,
    isIndenizacao,
  ]);

  const todayBR = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }, []);

  const cleanLegacyObservacao = (val?: string): string => {
    const raw = val || '';
    const upper = raw.trim().toUpperCase();
    if (
      upper === 'A NOTA DE EMPENHO SE ENCONTRA NO PROCESSO PAI.' ||
      upper === 'A NOTA DE EMPENHO SE ENCONTRA NO PROCESSO PAI'
    ) {
      return '';
    }
    return raw;
  };

  const isActiveConfForSelectedMed =
    !isIndenizacao ||
    !selectedMedicao ||
    contrato.conformidade?.medicaoId === selectedMedicao.id ||
    (!contrato.conformidade?.medicaoId && medicoesSemContinuacao.length <= 1);
  const observacaoAtual = cleanLegacyObservacao(
    selectedMedicao?.conformidade?.observacoes ??
      savedConformidadeForSelectedMed?.observacoes ??
      (isActiveConfForSelectedMed ? contrato.conformidade?.observacoes : '')
  );
  const dataAtual = todayBR;

  // Valor da medição selecionada
  const currentMedicaoValor = selectedMedicao?.valorMedicao ?? 0;

  // O valor encaminhado na parte de baixo é exatamente o mesmo valor da medição
  const valorEncaminhadoAtual =
    currentMedicaoValor > 0
      ? currentMedicaoValor
      : (contrato.conformidade?.valorEncaminhado || 0);

  const rawAssinanteNome = contrato.conformidade?.assinante?.nome;
  const rawAssinanteCargo = contrato.conformidade?.assinante?.cargo;

  const assinanteNome =
    rawAssinanteNome && !rawAssinanteNome.toUpperCase().includes('BENNY')
      ? rawAssinanteNome
      : signer.nome;
  const assinanteCargo =
    rawAssinanteCargo &&
    !rawAssinanteCargo.toUpperCase().includes('RESIDENTE') &&
    !rawAssinanteCargo.toUpperCase().includes('COORDENADORIA DE INFRAESTRUTURA')
      ? rawAssinanteCargo
      : signer.cargo;
  const assinanteSetor =
    contrato.conformidade?.assinante?.setor || signer.setor;

  const conformidade = {
    ...(contrato.conformidade || {}),
    processo: selectedMedicao?.sigadoc || contrato.conformidade?.processo || (contrato.processoSigadoc && contrato.processoSigadoc !== 'NÃO INFORMADO' ? contrato.processoSigadoc : '') || '',
    periodo: selectedMedicao?.periodo || contrato.conformidade?.periodo || '',
    data: dataAtual,
    valorEncaminhado: valorEncaminhadoAtual,
    observacoes: observacaoAtual,
    itens: allItens,
    assinante: {
      nome: assinanteNome,
      cargo: assinanteCargo,
      setor: assinanteSetor,
    },
  };

  // Rule a, b, c for FLS changes:
  // a) se digitar número da página -> SIM (REGULAR)
  // b) se digitar "-" -> N/A (DISPENSADO)
  // c) se não ocorrer nenhuma das duas (em branco ou vazio) -> NÃO (IRREGULAR)
  const computeStatusFromFls = (flsVal: string): StatusConformidade => {
    const trimmed = flsVal.trim();
    if (!trimmed || trimmed.toUpperCase() === 'NÃO' || trimmed.toUpperCase() === 'NAO') {
      return 'IRREGULAR'; // c) NAO
    }
    if (trimmed === '-' || trimmed === '--' || trimmed.toUpperCase() === 'N/A') {
      return 'DISPENSADO'; // b) N/A
    }
    return 'REGULAR'; // a) SIM (página digitada)
  };

  const persistUpdatedItens = (updatedItens: ItemConformidade[]) => {
    const targetMedId = selectedMedicao?.id || contrato.conformidade?.medicaoId;
    const targetMedNum = selectedMedicao?.numeroMed || contrato.conformidade?.medicaoNumero;
    const alreadySaved = targetMedId ? hasSavedConformidade(targetMedId) : false;

    const nextConformidade: ConformidadeDocumentalData = {
      ...conformidade,
      itens: updatedItens,
      medicaoId: targetMedId,
      medicaoNumero: targetMedNum,
    };

    if (contrato.numero && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(
          `${storagePrefix}doc_contrato_${contrato.numero}`,
          JSON.stringify(updatedItens)
        );
        if (alreadySaved && targetMedId) {
          localStorage.setItem(
            `${storagePrefix}itens_${contrato.numero}_${targetMedId}`,
            JSON.stringify(updatedItens)
          );
          localStorage.setItem(
            `${storagePrefix}med_${contrato.numero}_${targetMedId}`,
            JSON.stringify(nextConformidade)
          );
          if (targetMedNum) {
            localStorage.setItem(
              `${storagePrefix}itens_${contrato.numero}_${targetMedNum}`,
              JSON.stringify(updatedItens)
            );
            localStorage.setItem(
              `${storagePrefix}med_${contrato.numero}_${targetMedNum}`,
              JSON.stringify(nextConformidade)
            );
          }
        }
      } catch {
        // Ignore
      }
    }

    if (alreadySaved && targetMedId) {
      const updatedPorMed = {
        ...(contrato.conformidadePorMedicao || {}),
        [targetMedId]: {
          ...(contrato.conformidadePorMedicao?.[targetMedId] || nextConformidade),
          ...nextConformidade,
          itens: updatedItens,
        },
      };
      if (targetMedNum) {
        updatedPorMed[targetMedNum] = updatedPorMed[targetMedId];
      }
      const updatedMeds = (contrato.medicoes || []).map((m) =>
        m.id === targetMedId
          ? {
              ...m,
              conformidade: {
                ...(m.conformidade || nextConformidade),
                ...nextConformidade,
                itens: updatedItens,
              },
            }
          : m
      );
      onUpdateContract({
        ...contrato,
        medicoes: updatedMeds,
        conformidadePorMedicao: updatedPorMed,
        conformidade: nextConformidade,
      });
      return;
    }

    onUpdateContract({
      ...contrato,
      conformidade: nextConformidade,
    });
  };

  const handleUpdateItemFls = (id: string, newFls: string) => {
    const newStatus = computeStatusFromFls(newFls);
    const updatedItens = allItens.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          folhas: newFls,
          status: newStatus,
          irregularMotivo: newStatus === 'IRREGULAR' ? 'IRREGULAR' : undefined,
        };
      }
      return item;
    });

    persistUpdatedItens(updatedItens);
  };

  const handleSetStatusDirectly = (id: string, newStatus: StatusConformidade) => {
    const updatedItens = allItens.map((item) => {
      if (item.id === id) {
        let newFls = item.folhas;
        if (newStatus === 'DISPENSADO') {
          newFls = '-';
        } else if (newStatus === 'IRREGULAR') {
          newFls = '';
        } else if (newStatus === 'REGULAR' && (item.folhas === '-' || !item.folhas)) {
          newFls = '1';
        }
        return {
          ...item,
          status: newStatus,
          folhas: newFls,
          irregularMotivo: newStatus === 'IRREGULAR' ? 'IRREGULAR' : undefined,
        };
      }
      return item;
    });

    persistUpdatedItens(updatedItens);
  };

  const handleClearAllPaginacoes = () => {
    if (!isIndenizacao) return;
    const clearedItens: ItemConformidade[] = allItens.map((item) => ({
      ...item,
      folhas: '',
      status: 'IRREGULAR' as StatusConformidade,
      irregularMotivo: 'IRREGULAR',
    }));
    setProcessAnalyzeError(null);
    setExpiredCertsModal(null);
    persistUpdatedItens(clearedItens);
  };

  const handleProcessPdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    const validPdfs = selectedFiles.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (validPdfs.length === 0) {
      setProcessAnalyzeError('Por favor, selecione arquivo(s) em formato PDF (.pdf).');
      return;
    }

    setProcessAnalyzeError(null);
    setIsAnalyzingProcess(true);
    setAnalyzingFileName(
      validPdfs.length > 1
        ? `${validPdfs.length} processos`
        : validPdfs[0].name
    );
    setAnalyzingStage('Preparando envio do arquivo...');

    let workingItens = allItens.map((it) => ({ ...it }));
    const collectedExpiredByCodigo = new Map<string, CertidaoVencidaInfo>();
    const errorsList: string[] = [];
    let anyDocOrExpiredFound = false;

    try {
      const checklistPayload = workingItens.map((it) => ({
        codigo: it.codigo,
        descricao: it.descricao,
        baseLegal: it.baseLegal,
      }));

      let completedCount = 0;
      if (validPdfs.length > 1) {
        setAnalyzingStage(
          `Analisando ${validPdfs.length} processos em paralelo (0/${validPdfs.length} concluídos)...`
        );
      }

      const results = await Promise.all(
        validPdfs.map(async (file) => {
          const res = await analyzeProcessPdfForConformidade(
            file,
            checklistPayload,
            isIndenizacao,
            (stageText) => {
              if (validPdfs.length === 1) {
                setAnalyzingStage(stageText);
              }
            }
          );
          completedCount++;
          if (validPdfs.length > 1) {
            setAnalyzingStage(
              `Analisando ${validPdfs.length} processos em paralelo (${completedCount}/${validPdfs.length} concluídos)...`
            );
          }
          return { file, res };
        })
      );

      for (const { file, res } of results) {
        if (!res.success || !res.data) {
          errorsList.push(
            `${file.name}: ${res.error || 'Não foi possível analisar o arquivo PDF do processo.'}`
          );
          continue;
        }

        const docs = res.data.documentosEncontrados || [];
        const expiredCerts = res.data.certidoesVencidas || [];

        if (docs.length === 0 && expiredCerts.length === 0) {
          continue;
        }

        anyDocOrExpiredFound = true;

        const alreadyFilledCodes = new Set(
          workingItens
            .filter((it) => {
              const fls = (it.folhas || '').trim();
              return Boolean(fls) && fls !== '-' && it.status === 'REGULAR';
            })
            .map((it) => it.codigo)
        );

        const expiredCodes = new Set(
          expiredCerts
            .filter((c) => !alreadyFilledCodes.has(c.codigo))
            .map((c) => c.codigo)
        );

        for (const cert of expiredCerts) {
          if (!alreadyFilledCodes.has(cert.codigo) && !collectedExpiredByCodigo.has(cert.codigo)) {
            collectedExpiredByCodigo.set(cert.codigo, cert);
          }
        }

        const matchedByCodigo = new Map<string, ExtractedDocumentoFolhas>();
        for (const doc of docs) {
          if (!expiredCodes.has(doc.codigo)) {
            matchedByCodigo.set(doc.codigo, doc);
          }
        }

        workingItens = workingItens.map((item) => {
          const existingFls = (item.folhas || '').trim();
          const alreadyHasPagination =
            Boolean(existingFls) && existingFls !== '-' && item.status === 'REGULAR';

          // Nunca sobrescreve ou apaga paginação que já estava preenchida por processo anterior
          if (alreadyHasPagination) {
            return { ...item };
          }

          if (expiredCodes.has(item.codigo)) {
            return {
              ...item,
              folhas: '',
              status: 'IRREGULAR' as StatusConformidade,
              irregularMotivo: 'IRREGULAR',
            };
          }

          const match = matchedByCodigo.get(item.codigo);
          if (!match || !match.folhasFormatado) {
            return { ...item };
          }
          const newFls = match.folhasFormatado;
          const newStatus = computeStatusFromFls(newFls);
          return {
            ...item,
            folhas: newFls,
            status: newStatus,
            irregularMotivo: newStatus === 'IRREGULAR' ? 'IRREGULAR' : undefined,
          };
        });
      }

      if (anyDocOrExpiredFound) {
        persistUpdatedItens(workingItens);
      }

      if (errorsList.length > 0) {
        setProcessAnalyzeError(errorsList.join(' | '));
      } else if (!anyDocOrExpiredFound) {
        setProcessAnalyzeError(
          'Nenhum documento do checklist foi identificado neste PDF. Verifique se o arquivo contém as peças do processo.'
        );
      }

      if (collectedExpiredByCodigo.size > 0) {
        setExpiredCertsModal(Array.from(collectedExpiredByCodigo.values()));
      }
    } catch (err: any) {
      setProcessAnalyzeError(
        err?.message || 'Erro inesperado ao processar o PDF do processo.'
      );
    } finally {
      setIsAnalyzingProcess(false);
      setAnalyzingFileName('');
      setAnalyzingStage('');
    }
  };

  const handleUpdateValor = (novoValorStr: string) => {
    const val = parseFloat(novoValorStr.replace(/\./g, '').replace(',', '.')) || 0;
    let updatedMedicoes = contrato.medicoes;
    if (selectedMedicao) {
      updatedMedicoes = contrato.medicoes.map((m) =>
        m.id === selectedMedicao.id ? { ...m, valorMedicao: val } : m
      );
    } else if (ultimaMedicaoSemCont) {
      updatedMedicoes = contrato.medicoes.map((m) =>
        m.id === ultimaMedicaoSemCont.id ? { ...m, valorMedicao: val } : m
      );
    }
    onUpdateContract({
      ...contrato,
      medicoes: updatedMedicoes,
      conformidade: {
        ...conformidade,
        itens: allItens,
        valorEncaminhado: val,
      },
    });
  };

  const handleUpdateAssinante = (field: 'nome' | 'cargo' | 'setor', val: string) => {
    updateSigner({ [field]: val });
    onUpdateContract({
      ...contrato,
      conformidade: {
        ...conformidade,
        itens: allItens,
        assinante: {
          nome: field === 'nome' ? val : assinanteNome,
          cargo: field === 'cargo' ? val : assinanteCargo,
          setor: field === 'setor' ? val : assinanteSetor,
        },
      },
    });
  };

  const handleUpdateObservacoes = (novaObs: string) => {
    const targetMedId = selectedMedicao?.id || ultimaMedicaoSemCont?.id;
    let updatedMedicoes = contrato.medicoes || [];
    if (targetMedId) {
      updatedMedicoes = updatedMedicoes.map((m) =>
        m.id === targetMedId && m.conformidade
          ? {
              ...m,
              conformidade: {
                ...m.conformidade,
                observacoes: novaObs,
              },
            }
          : m
      );
    }

    onUpdateContract({
      ...contrato,
      medicoes: updatedMedicoes,
      conformidade: {
        ...conformidade,
        itens: allItens,
        observacoes: novaObs,
      },
    });
  };

  const handleUpdateHeaderField = (field: 'processo' | 'periodo', val: string) => {
    onUpdateContract({
      ...contrato,
      conformidade: {
        ...conformidade,
        itens: allItens,
        [field]: val,
      },
    });
  };

  const handleOpenDespacho = () => {
    setIsDespachoModalOpen(true);
  };

  // Group items by category / section
  const section1Items = allItens.filter((i) => i.codigo.startsWith('1.'));
  const section2Items = allItens.filter((i) => i.codigo.startsWith('2.'));
  const section3Items = allItens.filter((i) => i.codigo.startsWith('3.'));
  const section4Items = allItens.filter((i) => i.codigo.startsWith('4.'));
  const section5Items = allItens.filter((i) => i.codigo.startsWith('5.'));

  const irregularItens = allItens.filter((i) => i.status === 'IRREGULAR');
  const irregularCount = irregularItens.length;

  const formatNomeMedicaoCompleto = (val?: string): string => {
    if (!val) return '1ª Medição';
    const formatted = formatNumeroMedicao(val);
    if (formatted) {
      return formatted.toLowerCase().includes('medição') ? formatted : `${formatted} Medição`;
    }
    if (!val.toUpperCase().includes('MEDIÇÃO') && !val.toUpperCase().includes('MEDICAO')) {
      return `${val} Medição`.replace(/\s+/g, ' ').trim();
    }
    return val;
  };

  const rawMedicaoNome = selectedMedicao?.numeroMed || ultimaMedicaoSemCont?.numeroMed || '';
  const currentMedicaoNome = rawMedicaoNome ? formatNomeMedicaoCompleto(rawMedicaoNome) : '';
  const currentSigadoc =
    selectedMedicao?.sigadoc ||
    contrato.conformidade?.processo ||
    (contrato.processoSigadoc && contrato.processoSigadoc !== 'NÃO INFORMADO' ? contrato.processoSigadoc : '') ||
    '';
  const currentPeriodo = selectedMedicao?.periodo || conformidade.periodo || '';

  // Processo Pai é o número antes do ponto (.) do subprocesso
  // (ex: Subprocesso: SEJUS-PRO-2026/01764.08 -> Processo Pai: SEJUS-PRO-2026/01764)
  const processoPai = useMemo(() => {
    if (currentSigadoc && currentSigadoc !== 'NÃO INFORMADO' && currentSigadoc !== '-') {
      if (currentSigadoc.includes('.')) {
        return currentSigadoc.split('.')[0].trim();
      }
    }
    if (contrato.processoSigadoc && contrato.processoSigadoc !== 'NÃO INFORMADO' && contrato.processoSigadoc !== '-') {
      if (contrato.processoSigadoc.includes('.')) {
        return contrato.processoSigadoc.split('.')[0].trim();
      }
      return contrato.processoSigadoc.trim();
    }
    if (currentSigadoc && currentSigadoc !== 'NÃO INFORMADO' && currentSigadoc !== '-') {
      return currentSigadoc.trim();
    }
    return '';
  }, [currentSigadoc, contrato.processoSigadoc]);

  // A descrição da medição referente ao processo (deve ser exatamente a mesma descrição da medição selecionada na aba Empenhos e Medições)
  const descricaoServicosAtual = useMemo(() => {
    // 1. Sempre prioriza a descrição da medição atualmente selecionada na aba Empenhos e Medições (Imagem 1)
    if (selectedMedicao?.descricao && selectedMedicao.descricao.trim() !== '') {
      return selectedMedicao.descricao;
    }
    // 2. Se a medição tiver conformidade salva específica com descrição
    if (
      selectedMedicao?.conformidade?.descricaoServicosMedidos &&
      selectedMedicao.conformidade.descricaoServicosMedidos.trim() !== ''
    ) {
      return selectedMedicao.conformidade.descricaoServicosMedidos;
    }
    // 3. Fallback para última medição
    if (ultimaMedicaoSemCont?.descricao && ultimaMedicaoSemCont.descricao.trim() !== '') {
      return ultimaMedicaoSemCont.descricao;
    }
    // 4. Casos especiais conhecidos
    if (currentSigadoc.includes('16131.09') || currentSigadoc.includes('16131.10')) {
      return 'PINTURA SEDE ANTIGA SEJUS';
    }
    // 5. Fallback para o campo geral do contrato apenas se a medição não tiver descrição
    return contrato.conformidade?.descricaoServicosMedidos || '';
  }, [
    selectedMedicao?.descricao,
    selectedMedicao?.conformidade?.descricaoServicosMedidos,
    ultimaMedicaoSemCont?.descricao,
    currentSigadoc,
    contrato.conformidade?.descricaoServicosMedidos,
  ]);

  const handleUpdateDescricaoServicos = (novaDesc: string) => {
    let updatedMedicoes = contrato.medicoes || [];
    const targetMedId = selectedMedicao?.id || ultimaMedicaoSemCont?.id;
    if (targetMedId) {
      updatedMedicoes = updatedMedicoes.map((m) =>
        m.id === targetMedId
          ? {
              ...m,
              descricao: novaDesc,
              conformidade: m.conformidade
                ? {
                    ...m.conformidade,
                    descricaoServicosMedidos: novaDesc,
                  }
                : undefined,
            }
          : m
      );
    }

    onUpdateContract({
      ...contrato,
      medicoes: updatedMedicoes,
      conformidade: {
        ...conformidade,
        descricaoServicosMedidos: novaDesc,
      },
    });
  };

  const hasSavedConformidade = (medId: string): boolean => {
    if (!medId) return false;
    const m = (contrato.medicoes || []).find((x) => x.id === medId);
    const medNum = m?.numeroMed;
    if (contrato.conformidadePorMedicao) {
      if (isCompatibleConformidade(contrato.conformidadePorMedicao[medId])) return true;
      if (medNum && isCompatibleConformidade(contrato.conformidadePorMedicao[medNum])) return true;
    }
    if (isCompatibleConformidade(m?.conformidade)) return true;
    if (contrato.numero && typeof window !== 'undefined' && window.localStorage) {
      if (localStorage.getItem(`${storagePrefix}med_${contrato.numero}_${medId}`)) return true;
      if (localStorage.getItem(`${storagePrefix}itens_${contrato.numero}_${medId}`)) return true;
      if (medNum && localStorage.getItem(`${storagePrefix}med_${contrato.numero}_${medNum}`)) return true;
      if (medNum && localStorage.getItem(`${storagePrefix}itens_${contrato.numero}_${medNum}`)) return true;
    }
    return false;
  };

  const isCurrentMedicaoSaved = useMemo(() => {
    const medId = selectedMedicao?.id || selectedMedicaoId;
    return hasSavedConformidade(medId);
  }, [
    selectedMedicao?.id,
    selectedMedicaoId,
    contrato.conformidadePorMedicao,
    contrato.medicoes,
    isIndenizacao,
  ]);

  // Salva automaticamente o que foi lançado na conformidade para esta medição
  const saveConformidadeCurrentState = () => {
    const medId = selectedMedicao?.id || selectedMedicaoId || 'default_med';
    const medNumero = selectedMedicao?.numeroMed || currentMedicaoNome;

    // Snapshot da conformidade lançada para esta medição com todos os itens preenchidos
    const conformidadeSalva: ConformidadeDocumentalData = {
      ...conformidade,
      itens: allItens.map((i) => ({ ...i })),
      observacoes: observacaoAtual.toUpperCase(),
      descricaoServicosMedidos: descricaoServicosAtual.toUpperCase(),
      data: dataAtual,
      valorEncaminhado: valorEncaminhadoAtual,
      periodo: currentPeriodo,
      processo: currentSigadoc,
      medicaoId: medId,
      medicaoNumero: medNumero,
      salvoEm: new Date().toISOString(),
      assinante: {
        nome: assinanteNome,
        cargo: assinanteCargo,
        setor: assinanteSetor,
      },
    };

    // Persistência local individualizada por medição
    if (contrato.numero && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(
          `${storagePrefix}med_${contrato.numero}_${medId}`,
          JSON.stringify(conformidadeSalva)
        );
        localStorage.setItem(
          `${storagePrefix}itens_${contrato.numero}_${medId}`,
          JSON.stringify(allItens)
        );
        if (medNumero) {
          localStorage.setItem(
            `${storagePrefix}med_${contrato.numero}_${medNumero}`,
            JSON.stringify(conformidadeSalva)
          );
          localStorage.setItem(
            `${storagePrefix}itens_${contrato.numero}_${medNumero}`,
            JSON.stringify(allItens)
          );
        }
        localStorage.setItem(
          `${storagePrefix}doc_contrato_${contrato.numero}`,
          JSON.stringify(allItens)
        );
      } catch {
        // Ignore
      }
    }

    const updatedConformidadePorMedicao: Record<string, ConformidadeDocumentalData> = {
      ...(contrato.conformidadePorMedicao || {}),
      [medId]: conformidadeSalva,
    };
    if (medNumero) {
      updatedConformidadePorMedicao[medNumero] = conformidadeSalva;
    }

    const updatedMedicoes = (contrato.medicoes || []).map((m) =>
      m.id === medId ? { ...m, conformidade: conformidadeSalva } : m
    );

    onUpdateContract({
      ...contrato,
      medicoes: updatedMedicoes,
      conformidadePorMedicao: updatedConformidadePorMedicao,
      conformidade: conformidadeSalva,
    });

    return { medId, medNumero, conformidadeSalva };
  };

  // Helper: apaga todas as paginações do item 2 em diante (itens 2 e 3),
  // sem mexer nos itens 1, 4 e 5 no modo padrão. No modo indenização (seções 1 e 2), limpa ambas.
  const getItensSemPaginacaoMedicao = (itensBase: ItemConformidade[]): ItemConformidade[] => {
    return clearConformidadeItensForMedicao(itensBase, contrato.numero, isIndenizacao);
  };

  // Ao clicar em Exportar PDF: salva as paginações na validação da medição atual antes de
  // limpar os itens 2 e 3 (mantendo intactos os itens 1, 4 e 5) e gera o PDF oficial.
  const handleExportPdfAutomatically = async () => {
    const medId = selectedMedicao?.id || selectedMedicaoId || 'default_med';
    const medNumero = selectedMedicao?.numeroMed || currentMedicaoNome;

    // Elemento oficial para captura
    const element = document.getElementById('documento-conformidade-oficial');
    if (!element) {
      return;
    }

    // Garante captura fiel de todas as paginações preenchidas antes de limpar
    const domFlsByCode = new Map<string, string>();
    element.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
      const code = row.querySelector('td:first-child')?.textContent?.trim() || '';
      const flsInput = row.querySelector<HTMLInputElement>('td:nth-child(6) input');
      if (code && flsInput) {
        domFlsByCode.set(code, flsInput.value);
      }
    });

    const savedItensSnapshot: ItemConformidade[] = allItens.map((item) => {
      const domVal = domFlsByCode.get(item.codigo);
      if (domVal !== undefined && domVal !== (item.folhas || '')) {
        const st = computeStatusFromFls(domVal);
        return {
          ...item,
          folhas: domVal,
          status: st,
          irregularMotivo: st === 'IRREGULAR' ? 'IRREGULAR' : undefined,
        };
      }
      return { ...item };
    });

    // Snapshot completo da conformidade lançada para esta medição com todas as paginações preenchidas
    const conformidadeSalva: ConformidadeDocumentalData = {
      ...conformidade,
      itens: savedItensSnapshot,
      observacoes: observacaoAtual.toUpperCase(),
      descricaoServicosMedidos: descricaoServicosAtual,
      data: dataAtual,
      valorEncaminhado: valorEncaminhadoAtual,
      periodo: currentPeriodo,
      processo: currentSigadoc,
      medicaoId: medId,
      medicaoNumero: medNumero,
      salvoEm: new Date().toISOString(),
      assinante: {
        nome: assinanteNome,
        cargo: assinanteCargo,
        setor: assinanteSetor,
      },
    };

    // Preserva os dados da medição junto da conformidade salva (sem apagar a descrição do serviço)
    const updatedMedicoes = (contrato.medicoes || []).map((m) =>
      m.id === medId ? { ...m, conformidade: conformidadeSalva } : m
    );

    // Persistência local: preserva as paginações da medição exportada na tela ativa e no histórico da medição
    if (contrato.numero && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(
          `${storagePrefix}med_${contrato.numero}_${medId}`,
          JSON.stringify(conformidadeSalva)
        );
        localStorage.setItem(
          `${storagePrefix}itens_${contrato.numero}_${medId}`,
          JSON.stringify(savedItensSnapshot)
        );
        if (medNumero) {
          localStorage.setItem(
            `${storagePrefix}med_${contrato.numero}_${medNumero}`,
            JSON.stringify(conformidadeSalva)
          );
          localStorage.setItem(
            `${storagePrefix}itens_${contrato.numero}_${medNumero}`,
            JSON.stringify(savedItensSnapshot)
          );
        }
        localStorage.setItem(
          `${storagePrefix}doc_contrato_${contrato.numero}`,
          JSON.stringify(savedItensSnapshot)
        );
      } catch {
        // Ignore
      }
    }

    const updatedConformidadePorMedicao: Record<string, ConformidadeDocumentalData> = {
      ...(contrato.conformidadePorMedicao || {}),
      [medId]: conformidadeSalva,
    };
    if (medNumero) {
      updatedConformidadePorMedicao[medNumero] = conformidadeSalva;
    }

    const EXPORT_WIDTH = 1100;

    // Criamos um container isolado (staging) anexado diretamente ao body com 1100px de largura
    // Isso desacopla 100% a renderização do PDF dos limites de tamanho do modal, iframe ou janela
    const stage = document.createElement('div');
    stage.id = 'pdf-export-stage';
    stage.setAttribute(
      'style',
      `position: fixed; left: 0; top: 0; width: ${EXPORT_WIDTH}px; min-width: ${EXPORT_WIDTH}px; max-width: ${EXPORT_WIDTH}px; z-index: -99999; pointer-events: none; overflow: visible; background-color: #ffffff; margin: 0; padding: 0;`
    );

    // Deep clone do elemento oficial para gerar o PDF com os dados preenchidos
    const clone = element.cloneNode(true) as HTMLElement;
    clone.id = 'documento-conformidade-oficial-export';
    clone.classList.add('pdf-export-mode');
    clone.style.width = `${EXPORT_WIDTH}px`;
    clone.style.minWidth = `${EXPORT_WIDTH}px`;
    clone.style.maxWidth = `${EXPORT_WIDTH}px`;
    clone.style.boxSizing = 'border-box';
    clone.style.overflow = 'visible';
    clone.style.backgroundColor = '#ffffff';

    // Sincroniza todos os valores de inputs do elemento original para o clone antes de gerar o PDF
    const origInputs = element.querySelectorAll<HTMLInputElement>('input');
    const cloneInputs = clone.querySelectorAll<HTMLInputElement>('input');
    origInputs.forEach((origInput, idx) => {
      const cloneInput = cloneInputs[idx];
      if (cloneInput) {
        cloneInput.value = origInput.value;
        cloneInput.setAttribute('value', origInput.value);
      }
    });

    // Mantém a conformidade preenchida carregada na medição exportada e no estado ativo do contrato
    onUpdateContract({
      ...contrato,
      medicoes: updatedMedicoes,
      conformidadePorMedicao: updatedConformidadePorMedicao,
      conformidade: conformidadeSalva,
    });

    // Preserva e renderiza perfeitamente a descrição da medição referente ao processo com fonte reduzida para caber no quadro (Imagem 3)
    const cloneDescInput = clone.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'textarea[title="Descrição da medição referente ao processo"], input[title="Descrição da medição referente ao processo"], [data-desc-servicos-input="true"]'
    );
    if (cloneDescInput) {
      const descVal = descricaoServicosAtual || cloneDescInput.value || '';
      cloneDescInput.value = descVal;
      cloneDescInput.setAttribute('value', descVal);
      if (descVal) {
        const textDiv = document.createElement('div');
        textDiv.className = 'pdf-desc-medicao desc-servicos-container font-mono font-semibold text-slate-700 uppercase';
        textDiv.setAttribute('data-desc-medicao-pdf', 'true');
        textDiv.style.fontSize = '10px';
        textDiv.style.lineHeight = '1.3';
        textDiv.style.fontWeight = '600';
        textDiv.style.color = '#334155';
        textDiv.style.display = 'block';
        textDiv.style.width = '100%';
        textDiv.style.marginTop = '2px';
        textDiv.style.whiteSpace = 'normal';
        textDiv.style.wordBreak = 'break-word';
        textDiv.textContent = descVal;
        const parent = cloneDescInput.closest('.desc-servicos-container') || cloneDescInput.closest('.relative') || cloneDescInput.parentElement;
        if (parent && parent.parentElement) {
          parent.parentElement.replaceChild(textDiv, parent);
        }
      } else {
        const parent = cloneDescInput.closest('.desc-servicos-container') || cloneDescInput.closest('.relative') || cloneDescInput.parentElement;
        if (parent && parent.parentElement) {
          parent.remove();
        }
      }
    }

    // Converte inputs do cabeçalho (quando sem medição no modo indenização) em spans nítidos no PDF
    clone.querySelectorAll<HTMLInputElement>('[data-header-text-input="true"]').forEach((hdrInput) => {
      const val = (hdrInput.value || '').toUpperCase();
      const textSpan = document.createElement('span');
      textSpan.className = 'font-mono font-normal text-slate-800 text-[15px] uppercase';
      textSpan.textContent = val;
      if (hdrInput.parentElement) {
        hdrInput.parentElement.replaceChild(textSpan, hdrInput);
      }
    });

    // Converte o campo editável de OBSERVAÇÕES em texto limpo para o PDF
    const cloneObsInput = clone.querySelector<HTMLTextAreaElement>('[data-observacoes-input="true"]');
    if (cloneObsInput) {
      const obsVal = (observacaoAtual || cloneObsInput.value || '').toUpperCase();
      const obsSpan = document.createElement('span');
      obsSpan.className = 'text-slate-800 text-[15px] font-normal uppercase whitespace-pre-wrap break-words flex-1';
      obsSpan.style.fontSize = '15px';
      obsSpan.style.color = '#0f172a';
      obsSpan.style.whiteSpace = 'pre-wrap';
      obsSpan.style.wordBreak = 'break-word';
      obsSpan.textContent = obsVal;
      if (cloneObsInput.parentElement) {
        cloneObsInput.parentElement.replaceChild(obsSpan, cloneObsInput);
      }
    }

    // Garante que os campos de FLS no clone apareçam nítidos como texto no PDF
    const cloneFlsInputs = clone.querySelectorAll<HTMLInputElement>('tbody td:nth-child(6) input');
    cloneFlsInputs.forEach((flsInput) => {
      const val = flsInput.value || flsInput.getAttribute('value') || '';
      const textSpan = document.createElement('span');
      textSpan.className = 'font-bold font-mono text-[14px] text-slate-900 block text-center';
      textSpan.textContent = val || '-';
      if (flsInput.parentElement) {
        flsInput.parentElement.replaceChild(textSpan, flsInput);
      }
    });

    // Garante que o valor encaminhado no rodapé permaneça estritamente inline (conforme Imagem 2)
    const cloneValorInput = clone.querySelector<HTMLInputElement>(
      '#documento-conformidade-oficial-export > div:last-child strong input'
    );
    if (cloneValorInput) {
      const val = cloneValorInput.value || formatCurrency(valorEncaminhadoAtual, false);
      const textSpan = document.createElement('span');
      textSpan.className = 'font-mono font-bold text-slate-950 inline';
      textSpan.style.display = 'inline';
      textSpan.style.whiteSpace = 'nowrap';
      textSpan.textContent = val;
      if (cloneValorInput.parentElement) {
        cloneValorInput.parentElement.replaceChild(textSpan, cloneValorInput);
      }
    }

    // Apenas os campos da assinatura no rodapé aparecem como blocos centralizados
    const cloneSignatureInputs = clone.querySelectorAll<HTMLInputElement>(
      '#documento-conformidade-oficial-export > div:last-child .max-w-xl input'
    );
    cloneSignatureInputs.forEach((sigInput) => {
      const val = sigInput.value || sigInput.placeholder || '';
      const textSpan = document.createElement('span');
      textSpan.className = sigInput.className;
      textSpan.style.display = 'block';
      textSpan.textContent = val;
      if (sigInput.parentElement) {
        sigInput.parentElement.replaceChild(textSpan, sigInput);
      }
    });

    // Remove qualquer restrição de scroll ou overflow no clone
    clone.querySelectorAll('.overflow-x-auto, .overflow-y-auto, .overflow-hidden').forEach((el) => {
      const hEl = el as HTMLElement;
      hEl.style.overflow = 'visible';
      hEl.style.width = '100%';
      hEl.style.maxWidth = 'none';
    });

    const cloneTable = clone.querySelector('table');
    if (cloneTable) {
      cloneTable.style.width = '1096px';
      cloneTable.style.minWidth = '1096px';
      cloneTable.style.maxWidth = '1096px';
      cloneTable.style.tableLayout = 'fixed';
      cloneTable.style.borderCollapse = 'collapse';
      cloneTable.style.boxSizing = 'border-box';
    }

    stage.appendChild(clone);
    document.body.appendChild(stage);

    try {
      setIsExportingPdf(true);

      // Aguarda fontes e layout para renderização completa sem desvios métricos
      if (document.fonts) {
        try {
          await document.fonts.ready;
        } catch {
          // Ignore
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 150));

      const exportHeight = Math.ceil(
        Math.max(clone.scrollHeight || 0, clone.offsetHeight || 0, clone.getBoundingClientRect().height || 0)
      );

      // Renderiza o canvas a partir do clone isolado com 100% da largura calibrada em 1100px
      const canvas = await toCanvas(clone, {
        quality: 0.98,
        pixelRatio: 2,
        width: EXPORT_WIDTH,
        height: exportHeight,
        backgroundColor: '#ffffff',
        skipFonts: true,
      });

      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
      const marginX = 8; // Margem lateral proporcional de 8mm em cada lado
      const marginY = 8; // Margem superior/inferior de 8mm
      const contentWidth = pageWidth - 2 * marginX; // 194mm (enquadra 100% da largura do documento com bordas completas)
      const contentHeight = pageHeight - 2 * marginY; // 281mm

      // Escala exata para enquadrar 100% da largura do documento dentro da margem útil da folha
      const scale = contentWidth / canvas.width;
      const totalPdfHeight = canvas.height * scale;

      if (totalPdfHeight <= contentHeight) {
        // Cabe em uma única página perfeitamente
        const singlePageCanvas = document.createElement('canvas');
        singlePageCanvas.width = canvas.width;
        singlePageCanvas.height = canvas.height;
        const sCtx = singlePageCanvas.getContext('2d');
        if (sCtx) {
          sCtx.fillStyle = '#ffffff';
          sCtx.fillRect(0, 0, singlePageCanvas.width, singlePageCanvas.height);
          sCtx.drawImage(canvas, 0, 0);
          // Borda fechada em volta de todo o documento (imagem 1)
          sCtx.strokeStyle = '#0f172a';
          sCtx.lineWidth = 4; // 2px CSS * pixelRatio 2
          sCtx.strokeRect(2, 2, singlePageCanvas.width - 4, singlePageCanvas.height - 4);
        }
        // Compressão JPEG a 0.88 para garantir tamanho de arquivo bem menor que 25MB mantendo máxima nitidez
        const imgData = singlePageCanvas.toDataURL('image/jpeg', 0.88);
        pdf.addImage(imgData, 'JPEG', marginX, marginY, contentWidth, totalPdfHeight, undefined, 'FAST');
      } else {
        // Multi-page slicing inteligente: corta exatamente entre linhas de tabela, sem cortar texto ao meio
        const pageHeightPixels = Math.floor(contentHeight / scale);

        // Coleta os pontos ideais de corte (base de cada linha 'tr' e divisões de seção no clone)
        const cloneTop = clone.getBoundingClientRect().top;
        const rowElements = Array.from(clone.querySelectorAll('tbody tr, .border-t-2'));
        const cleanBreaks = rowElements
          .map((r) => {
            const rRect = r.getBoundingClientRect();
            return Math.round((rRect.bottom - cloneTop) * (canvas.height / clone.offsetHeight));
          })
          .filter((y) => y > 0 && y < canvas.height);

        let heightLeft = canvas.height;
        let position = 0;
        let pageIndex = 0;

        while (heightLeft > 0) {
          let sliceHeight = Math.min(heightLeft, pageHeightPixels);

          // Se resta mais que uma página, encontra a última linha inteira que cabe
          if (heightLeft > pageHeightPixels) {
            const maxCut = position + pageHeightPixels;
            const candidates = cleanBreaks.filter(
              (b) => b <= maxCut && b >= position + pageHeightPixels * 0.55
            );
            if (candidates.length > 0) {
              const bestBreak = Math.max(...candidates);
              sliceHeight = bestBreak - position;
            }
          }

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;

          const ctx = pageCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            ctx.drawImage(
              canvas,
              0,
              position,
              canvas.width,
              sliceHeight,
              0,
              0,
              canvas.width,
              sliceHeight
            );

            // Garante borda fechada de 2px em volta de todo o documento em cada página (imagem 1)
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 4; // 2px CSS * pixelRatio 2
            ctx.strokeRect(2, 2, pageCanvas.width - 4, pageCanvas.height - 4);
          }

          // Compressão JPEG a 0.88 para garantir tamanho de arquivo bem menor que 25MB mantendo máxima nitidez
          const imgData = pageCanvas.toDataURL('image/jpeg', 0.88);
          if (pageIndex > 0) {
            pdf.addPage('a4', 'portrait');
          }

          const slicePdfHeight = sliceHeight * scale;
          pdf.addImage(imgData, 'JPEG', marginX, marginY, contentWidth, slicePdfHeight, undefined, 'FAST');

          position += sliceHeight;
          heightLeft -= sliceHeight;
          pageIndex++;
        }
      }

      const contractClean = (contrato.numero || '142-2024').replace(/[^a-zA-Z0-9]/g, '_');
      const medClean = (currentMedicaoNome || (isIndenizacao ? 'Indenizacao' : '01_MED')).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Conformidade_Documental_Contrato_${contractClean}_${medClean}.pdf`;

      pdf.save(filename);

      setSavedMedicaoFeedback({
        medicaoNome: medNumero ? formatNomeMedicaoCompleto(medNumero) : (isIndenizacao ? 'Pagamento por Indenização' : '1ª Medição'),
      });
      setTimeout(() => {
        setSavedMedicaoFeedback(null);
      }, 5000);
    } catch (err) {
      console.error('Erro ao gerar PDF automaticamente:', err);
    } finally {
      // Remove o container de staging do DOM
      if (stage && stage.parentNode) {
        stage.parentNode.removeChild(stage);
      }
      setIsExportingPdf(false);
    }
  };

  // Carrega automaticamente a conformidade para a medição selecionada
  const handleSelectMedicao = (targetId: string) => {
    setSelectedMedicaoId(targetId);
    const targetMed = medicoesSemContinuacao.find((m) => m.id === targetId);
    const targetMedNumero = targetMed?.numeroMed || '';

    // Verifica se há dados de conformidade salvos compatíveis para esta medição (priorizando itens preenchidos)
    const savedData = getSavedConformidadeForMedicao(targetMed);

    if (savedData && savedData.itens && savedData.itens.length > 0) {
      // Carrega os dados exportados para esta medição
      const restoredItens = ensureFullConformidadeItems(savedData.itens, contrato.numero, targetId, isIndenizacao);

      if (contrato.numero && typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(
            `${storagePrefix}doc_contrato_${contrato.numero}`,
            JSON.stringify(restoredItens)
          );
        } catch {
          // Ignore
        }
      }

      const val = targetMed?.valorMedicao ?? (savedData.valorEncaminhado || 0);
      const desc = (targetMed?.descricao && targetMed.descricao.trim() !== '') ? targetMed.descricao : (savedData.descricaoServicosMedidos || '');
      const proc = targetMed?.sigadoc || savedData.processo || contrato.processoSigadoc || '';
      const per = targetMed?.periodo || savedData.periodo || '';
      const obs = cleanLegacyObservacao(savedData.observacoes);

      onUpdateContract({
        ...contrato,
        conformidade: {
          ...conformidade,
          ...savedData,
          medicaoId: targetId,
          medicaoNumero: targetMedNumero,
          observacoes: obs,
          itens: restoredItens,
          processo: proc,
          periodo: per,
          valorEncaminhado: val,
          descricaoServicosMedidos: desc,
        },
      });
    } else {
      // Se não há dados salvos prévios para esta medição, limpa partes de medição para preenchimento
      const freshItens: ItemConformidade[] = getItensSemPaginacaoMedicao(allItens);

      if (contrato.numero && typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(
            `${storagePrefix}doc_contrato_${contrato.numero}`,
            JSON.stringify(freshItens)
          );
        } catch {
          // Ignore
        }
      }

      const val = targetMed?.valorMedicao ?? 0;
      const desc = targetMed?.descricao || '';
      const proc = targetMed?.sigadoc || contrato.processoSigadoc || '';
      const per = targetMed?.periodo || '';

      onUpdateContract({
        ...contrato,
        conformidade: {
          ...conformidade,
          medicaoId: targetId,
          medicaoNumero: targetMedNumero,
          itens: freshItens,
          processo: proc,
          periodo: per,
          valorEncaminhado: val,
          descricaoServicosMedidos: desc,
        },
      });
    }
  };

  const renderItemRow = (item: ItemConformidade) => {
    const isIrregular = item.status === 'IRREGULAR';
    const isRegular = item.status === 'REGULAR';
    const isDispensado = item.status === 'DISPENSADO';

    return (
      <tr
        key={item.id}
        className={`transition-colors border-b ${
          isIrregular
            ? 'bg-[#fef2f2] hover:bg-[#fee2e2]/60 border-red-200'
            : 'bg-white hover:bg-slate-50 border-slate-300'
        }`}
      >
        {/* Nº */}
        <td className="py-2.5 px-1.5 text-center font-bold text-slate-800 border-r border-slate-300 text-[13px] sm:text-[14px] whitespace-nowrap min-w-[65px]">
          {item.codigo}
        </td>

        {/* DOCUMENTO */}
        <td className="py-2.5 px-3 border-r border-slate-300 uppercase leading-snug">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[13px] sm:text-[14px] ${
                isIrregular
                  ? 'font-black text-red-900'
                  : 'font-semibold text-slate-800'
              }`}
            >
              {item.descricao}
            </span>

            {/* Red Irregular pill badge matching Image 1 */}
            {isIrregular && (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#fca5a5] bg-[#fee2e2] text-[#b91c1c] text-[11px] font-black uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 text-[#b91c1c]" />
                IRREGULAR
              </span>
            )}
          </div>
        </td>

        {/* SIM */}
        <td
          onClick={() => handleSetStatusDirectly(item.id, 'REGULAR')}
          className="py-2 px-2 text-center border-r border-slate-300 cursor-pointer select-none hover:bg-emerald-50/40"
          title="Marcar SIM (Conforme)"
        >
          {isRegular ? (
            <span className="font-black text-slate-900 text-base">X</span>
          ) : null}
        </td>

        {/* NÃO (Red box with white X when irregular - Image 1) */}
        <td
          onClick={() => handleSetStatusDirectly(item.id, 'IRREGULAR')}
          className="py-2 px-2 text-center border-r border-slate-300 cursor-pointer select-none hover:bg-red-50/40"
          title="Marcar NÃO (Irregular / Pendente)"
        >
          {isIrregular ? (
            <div className="w-6 h-6 bg-[#dc2626] text-white font-black text-xs flex items-center justify-center rounded-xs shadow-2xs mx-auto">
              X
            </div>
          ) : null}
        </td>

        {/* N/A */}
        <td
          onClick={() => handleSetStatusDirectly(item.id, 'DISPENSADO')}
          className="py-2 px-2 text-center border-r border-slate-300 cursor-pointer select-none hover:bg-amber-50/40"
          title="Marcar N/A (Dispensado / Não Aplicável)"
        >
          {isDispensado ? (
            <span className="font-black text-slate-900 text-base">X</span>
          ) : null}
        </td>

        {/* FLS (No box / borderless clean input matching official print) */}
        <td className="py-1.5 px-2 text-center border-r border-slate-300 w-28">
          <input
            type="text"
            value={item.folhas || ''}
            onChange={(e) => handleUpdateItemFls(item.id, e.target.value)}
            placeholder="-"
            title="Digite a(s) página(s) para SIM, '-' para N/A, ou deixe vazio para NÃO"
            className={`w-full text-center text-[13px] sm:text-[14px] py-1 px-1 bg-transparent hover:bg-slate-100/70 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded uppercase font-bold outline-none border-0 transition-colors ${
              isIrregular
                ? 'text-red-700 placeholder-red-300 font-black'
                : 'text-slate-800'
            }`}
          />
        </td>

        {/* FUNDAMENTO JURÍDICO */}
        <td className="py-2.5 px-3 text-[13px] sm:text-[13.5px] text-slate-700 uppercase font-medium leading-snug">
          {item.baseLegal || '-'}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {!isIndenizacao && medicoesSemContinuacao.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
            <FileCheck2 className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Nenhuma Medição Lançada na Tabela de Medição
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed uppercase">
              A seleção da conformidade documental aparecerá aqui somente quando você inserir as informações da medição na tabela de medição (aba &ldquo;Empenhos e Medições&rdquo;).
            </p>
          </div>
          {onNavigateToEmpenhosMedicoes && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onNavigateToEmpenhosMedicoes}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e40af] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold uppercase transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <FileText className="w-4 h-4" />
                <span>Ir para Tabela de Medições</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Top Header Card matching Screenshot 2 */}
          <div className="print:hidden bg-white rounded-lg border border-slate-200 p-4 shadow-2xs space-y-3.5">
            {/* Left Information */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg shrink-0 mt-0.5">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    CONFORMIDADE DOCUMENTAL – OBRAS E SERVIÇOS
                  </h2>
                </div>

                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-slate-600 whitespace-nowrap">
                    VALOR DA MEDIÇÃO:{' '}
                    <strong className="text-emerald-700 font-mono font-bold">
                      {formatCurrency(valorEncaminhadoAtual)}
                    </strong>
                  </span>

                  {irregularCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-red-300 bg-red-50 text-red-700 text-[10.5px] font-black uppercase tracking-wide whitespace-nowrap">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      {irregularCount} IRREGULARIDADE(S) IDENTIFICADA(S)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Controls - Posicionados mais à esquerda e alinhados perfeitamente dentro da parte retangular branca */}
            <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-start gap-2">
              {/* MEDIÇÃO DROPDOWN (Sem considerar continuações) */}
              {medicoesSemContinuacao.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs mr-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">
                    MEDIÇÃO:
                  </span>
                  <select
                    value={selectedMedicao?.id || selectedMedicaoId}
                    onChange={(e) => handleSelectMedicao(e.target.value)}
                    className="text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-blue-600 outline-none max-w-[280px] truncate cursor-pointer shadow-2xs"
                    title="Selecione a medição para a conformidade documental"
                  >
                    {medicoesSemContinuacao.map((med) => {
                      const isExported = hasSavedConformidade(med.id);
                      return (
                        <option key={med.id} value={med.id}>
                          {formatNomeMedicaoCompleto(med.numeroMed)} ({med.sigadoc || contrato.numero}) {isExported ? '— Exportado em PDF ✓' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

          {/* COBRAR FISCAL BUTTON (Apenas se houver alguma linha irregular) */}
          {irregularCount > 0 && (
            <button
              type="button"
              onClick={() => setIsCobrarFiscalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#059669] hover:bg-[#047857] active:scale-95 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs whitespace-nowrap"
              title="Cobrar Fiscal do Contrato sobre as irregularidades"
            >
              <MessageSquare className="w-4 h-4 stroke-[2.5]" />
              <span>COBRAR FISCAL ({irregularCount})</span>
            </button>
          )}

          {/* DESPACHO DE PAGTO / DESPACHO NGER (Indenização) */}
          <button
            type="button"
            onClick={handleOpenDespacho}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 active:scale-95 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs whitespace-nowrap ${
              isIndenizacao
                ? 'bg-[#d97706] hover:bg-[#b45309]'
                : 'bg-[#1d4ed8] hover:bg-[#1e40af]'
            }`}
            title={isIndenizacao ? 'Gerar Despacho NGER com as informações para o NGER' : 'Gerar despacho de pagamento'}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isIndenizacao ? 'Despacho NGER' : 'Despacho de pagto'}</span>
          </button>

          {/* LIMPAR PAGINAÇÕES (Somente Indenização) */}
          {isIndenizacao && (
            <button
              type="button"
              onClick={handleClearAllPaginacoes}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs whitespace-nowrap"
              title="Limpar todas as paginações da conformidade"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          )}

          {/* EXPORTAR PDF (Salva automaticamente e gera o PDF) */}
          <button
            type="button"
            onClick={handleExportPdfAutomatically}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1e293b] hover:bg-[#0f172a] active:scale-95 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs disabled:opacity-75 disabled:cursor-not-allowed whitespace-nowrap"
            title="Salvar alterações e exportar PDF automaticamente"
          >
            {isExportingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>SALVANDO E GERANDO PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>EXPORTAR PDF</span>
              </>
            )}
          </button>

          {/* ANEXAR PROCESSO */}
          <input
            ref={processPdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={handleProcessPdfFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => processPdfInputRef.current?.click()}
            disabled={isAnalyzingProcess}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-700 hover:bg-slate-800 active:scale-95 text-white rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs disabled:opacity-75 disabled:cursor-not-allowed whitespace-nowrap"
            title="Fazer upload do PDF do processo inteiro para preencher automaticamente as páginas na coluna FLS"
          >
            {isAnalyzingProcess ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>ANALISANDO PROCESSO...</span>
              </>
            ) : (
              <>
                <Paperclip className="w-3.5 h-3.5" />
                <span>Anexar Processo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isAnalyzingProcess && (
        <div className="print:hidden bg-blue-50 border border-blue-300 text-blue-900 px-4 py-3 rounded-lg text-xs font-semibold flex items-center gap-3 shadow-xs">
          <Loader2 className="w-4 h-4 text-blue-700 animate-spin shrink-0" />
          <div>
            <span>
              Processo <strong>{analyzingFileName}</strong>:{' '}
              {analyzingStage || 'Analisando e identificando as páginas de cada documento para preencher a coluna FLS...'}
            </span>
          </div>
        </div>
      )}

      {processAnalyzeError && (
        <div className="print:hidden bg-red-50 border border-red-300 text-red-900 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{processAnalyzeError}</span>
          </div>
          <button
            type="button"
            onClick={() => setProcessAnalyzeError(null)}
            className="p-1 text-red-700 hover:text-red-900 cursor-pointer"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {savedMedicaoFeedback && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Conformidade da <strong>{savedMedicaoFeedback.medicaoNome}</strong> salva e exportada em PDF com sucesso!
          </span>
        </div>
      )}

      {feedbackSaved && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-2 rounded text-xs font-bold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          Conformidade documental salva com sucesso!
        </div>
      )}

      {/* Estilos exclusivos para o PDF gerado (texto maior e linhas mais fortes somente no arquivo baixado, calibrado em 1100px para não cortar colunas) */}
      <style>{`
        #documento-conformidade-oficial.pdf-export-mode,
        #documento-conformidade-oficial-export.pdf-export-mode {
          width: 1100px !important;
          max-width: 1100px !important;
          min-width: 1100px !important;
          margin: 0 auto !important;
          color: #0f172a !important;
          background-color: #ffffff !important;
          box-sizing: border-box !important;
          overflow: visible !important;
          border: 2px solid #0f172a !important;
        }
        #documento-conformidade-oficial.pdf-export-mode .overflow-x-auto,
        #documento-conformidade-oficial-export.pdf-export-mode .overflow-x-auto {
          overflow: visible !important;
          width: 100% !important;
        }
        #documento-conformidade-oficial.pdf-export-mode table,
        #documento-conformidade-oficial-export.pdf-export-mode table {
          width: 1096px !important;
          max-width: 1096px !important;
          min-width: 1096px !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
          box-sizing: border-box !important;
        }
        #documento-conformidade-oficial.pdf-export-mode th,
        #documento-conformidade-oficial.pdf-export-mode td,
        #documento-conformidade-oficial-export.pdf-export-mode th,
        #documento-conformidade-oficial-export.pdf-export-mode td {
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          box-sizing: border-box !important;
        }
        #documento-conformidade-oficial.pdf-export-mode th:nth-child(1),
        #documento-conformidade-oficial.pdf-export-mode td:nth-child(1),
        #documento-conformidade-oficial-export.pdf-export-mode th:nth-child(1),
        #documento-conformidade-oficial-export.pdf-export-mode td:nth-child(1) {
          width: 65px !important;
          min-width: 65px !important;
          max-width: 65px !important;
          text-align: center !important;
          white-space: nowrap !important;
          word-break: keep-all !important;
          overflow-wrap: normal !important;
          padding-left: 2px !important;
          padding-right: 2px !important;
        }
        #documento-conformidade-oficial.pdf-export-mode th:nth-child(2),
        #documento-conformidade-oficial.pdf-export-mode td:nth-child(2),
        #documento-conformidade-oficial-export.pdf-export-mode th:nth-child(2),
        #documento-conformidade-oficial-export.pdf-export-mode td:nth-child(2) {
          width: 415px !important;
          min-width: 415px !important;
          max-width: 415px !important;
        }
        #documento-conformidade-oficial.pdf-export-mode th:nth-child(3),
        #documento-conformidade-oficial.pdf-export-mode td:nth-child(3),
        #documento-conformidade-oficial-export.pdf-export-mode th:nth-child(3),
        #documento-conformidade-oficial-export.pdf-export-mode td:nth-child(3) {
          width: 50px !important;
          min-width: 50px !important;
          max-width: 50px !important;
          text-align: center !important;
          white-space: nowrap !important;
        }
        #documento-conformidade-oficial.pdf-export-mode th:nth-child(4),
        #documento-conformidade-oficial.pdf-export-mode td:nth-child(4),
        #documento-conformidade-oficial-export.pdf-export-mode th:nth-child(4),
        #documento-conformidade-oficial-export.pdf-export-mode td:nth-child(4) {
          width: 54px !important;
          min-width: 54px !important;
          max-width: 54px !important;
          text-align: center !important;
          white-space: nowrap !important;
        }
        #documento-conformidade-oficial.pdf-export-mode th:nth-child(5),
        #documento-conformidade-oficial.pdf-export-mode td:nth-child(5),
        #documento-conformidade-oficial-export.pdf-export-mode th:nth-child(5),
        #documento-conformidade-oficial-export.pdf-export-mode td:nth-child(5) {
          width: 50px !important;
          min-width: 50px !important;
          max-width: 50px !important;
          text-align: center !important;
          white-space: nowrap !important;
        }
        #documento-conformidade-oficial.pdf-export-mode th:nth-child(6),
        #documento-conformidade-oficial.pdf-export-mode td:nth-child(6),
        #documento-conformidade-oficial-export.pdf-export-mode th:nth-child(6),
        #documento-conformidade-oficial-export.pdf-export-mode td:nth-child(6) {
          width: 72px !important;
          min-width: 72px !important;
          max-width: 72px !important;
          text-align: center !important;
          white-space: nowrap !important;
        }
        #documento-conformidade-oficial.pdf-export-mode th:nth-child(7),
        #documento-conformidade-oficial.pdf-export-mode td:nth-child(7),
        #documento-conformidade-oficial-export.pdf-export-mode th:nth-child(7),
        #documento-conformidade-oficial-export.pdf-export-mode td:nth-child(7) {
          width: 390px !important;
          min-width: 390px !important;
          max-width: 390px !important;
        }
        #documento-conformidade-oficial.pdf-export-mode > div:first-child > div:first-child,
        #documento-conformidade-oficial-export.pdf-export-mode > div:first-child > div:first-child {
          font-size: 19px !important;
          font-weight: 900 !important;
          padding-top: 14px !important;
          padding-bottom: 14px !important;
          color: #0f172a !important;
          background-color: #f8fafc !important;
          border-bottom: 2px solid #1e293b !important;
        }
        #documento-conformidade-oficial.pdf-export-mode .grid,
        #documento-conformidade-oficial-export.pdf-export-mode .grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        #documento-conformidade-oficial.pdf-export-mode .grid > div,
        #documento-conformidade-oficial.pdf-export-mode > div:first-child > div:nth-child(3),
        #documento-conformidade-oficial.pdf-export-mode > div:first-child > div:nth-child(4),
        #documento-conformidade-oficial-export.pdf-export-mode .grid > div,
        #documento-conformidade-oficial-export.pdf-export-mode > div:first-child > div:nth-child(3),
        #documento-conformidade-oficial-export.pdf-export-mode > div:first-child > div:nth-child(4) {
          padding-top: 12px !important;
          padding-bottom: 12px !important;
          border-color: #334155 !important;
        }
        #documento-conformidade-oficial.pdf-export-mode .grid span,
        #documento-conformidade-oficial.pdf-export-mode .grid input,
        #documento-conformidade-oficial.pdf-export-mode > div:first-child span,
        #documento-conformidade-oficial-export.pdf-export-mode .grid span,
        #documento-conformidade-oficial-export.pdf-export-mode .grid input,
        #documento-conformidade-oficial-export.pdf-export-mode > div:first-child span {
          font-size: 15px !important;
          color: #0f172a !important;
        }
        #documento-conformidade-oficial.pdf-export-mode .pdf-desc-medicao,
        #documento-conformidade-oficial-export.pdf-desc-medicao,
        #documento-conformidade-oficial.pdf-export-mode [data-desc-medicao-pdf],
        #documento-conformidade-oficial-export.pdf-export-mode [data-desc-medicao-pdf],
        #documento-conformidade-oficial.pdf-export-mode .desc-servicos-container,
        #documento-conformidade-oficial-export.pdf-export-mode .desc-servicos-container,
        #documento-conformidade-oficial.pdf-export-mode .desc-servicos-container span,
        #documento-conformidade-oficial-export.pdf-export-mode .desc-servicos-container span,
        #documento-conformidade-oficial.pdf-export-mode .desc-servicos-container input,
        #documento-conformidade-oficial-export.pdf-export-mode .desc-servicos-container input,
        #documento-conformidade-oficial.pdf-export-mode .desc-servicos-container div,
        #documento-conformidade-oficial-export.pdf-export-mode .desc-servicos-container div {
          font-size: 10px !important;
          line-height: 1.3 !important;
          font-weight: 600 !important;
          color: #334155 !important;
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          margin-top: 2px !important;
          letter-spacing: -0.01em !important;
        }
        #documento-conformidade-oficial.pdf-export-mode thead th,
        #documento-conformidade-oficial-export.pdf-export-mode thead th {
          font-size: 14.5px !important;
          font-weight: 900 !important;
          padding-top: 10px !important;
          padding-bottom: 10px !important;
          border-bottom: 2.5px solid #1e293b !important;
          border-right: 1.5px solid #64748b !important;
          color: #0f172a !important;
          background-color: #f1f5f9 !important;
        }
        #documento-conformidade-oficial.pdf-export-mode thead th:first-child,
        #documento-conformidade-oficial-export.pdf-export-mode thead th:first-child {
          white-space: nowrap !important;
          word-break: keep-all !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tr.bg-slate-200,
        #documento-conformidade-oficial-export.pdf-export-mode tr.bg-slate-200 {
          background-color: #e2e8f0 !important;
          border-top: 2px solid #0f172a !important;
          border-bottom: 2px solid #0f172a !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tr.bg-slate-200 td,
        #documento-conformidade-oficial-export.pdf-export-mode tr.bg-slate-200 td {
          font-size: 16px !important;
          font-weight: 900 !important;
          padding-top: 9px !important;
          padding-bottom: 9px !important;
          color: #0f172a !important;
          white-space: nowrap !important;
          word-break: keep-all !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tr.bg-slate-200 span,
        #documento-conformidade-oficial-export.pdf-export-mode tr.bg-slate-200 span {
          font-size: 14.5px !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tbody tr.border-b,
        #documento-conformidade-oficial.pdf-export-mode tbody tr,
        #documento-conformidade-oficial-export.pdf-export-mode tbody tr.border-b,
        #documento-conformidade-oficial-export.pdf-export-mode tbody tr {
          border-bottom: 1.5px solid #64748b !important;
        }
        #documento-conformidade-oficial.pdf-export-mode td.border-r,
        #documento-conformidade-oficial.pdf-export-mode th.border-r,
        #documento-conformidade-oficial-export.pdf-export-mode td.border-r,
        #documento-conformidade-oficial-export.pdf-export-mode th.border-r {
          border-right: 1.5px solid #64748b !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tbody td,
        #documento-conformidade-oficial-export.pdf-export-mode tbody td {
          padding-top: 9px !important;
          padding-bottom: 9px !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tbody td:first-child,
        #documento-conformidade-oficial-export.pdf-export-mode tbody td:first-child {
          font-size: 14px !important;
          font-weight: 800 !important;
          color: #0f172a !important;
          white-space: nowrap !important;
          word-break: keep-all !important;
          overflow-wrap: normal !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tbody td:nth-child(2) span,
        #documento-conformidade-oficial-export.pdf-export-mode tbody td:nth-child(2) span {
          font-size: 15px !important;
          font-weight: 700 !important;
          color: #0f172a !important;
          line-height: 1.35 !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tbody td:nth-child(3) span,
        #documento-conformidade-oficial.pdf-export-mode tbody td:nth-child(5) span,
        #documento-conformidade-oficial-export.pdf-export-mode tbody td:nth-child(3) span,
        #documento-conformidade-oficial-export.pdf-export-mode tbody td:nth-child(5) span {
          font-size: 17px !important;
          font-weight: 900 !important;
          color: #0f172a !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tbody td:nth-child(4) div,
        #documento-conformidade-oficial-export.pdf-export-mode tbody td:nth-child(4) div {
          width: 24px !important;
          height: 24px !important;
          font-size: 14px !important;
          font-weight: 900 !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tbody td:nth-child(6) input,
        #documento-conformidade-oficial-export.pdf-export-mode tbody td:nth-child(6) input {
          font-size: 15px !important;
          font-weight: 800 !important;
          color: #0f172a !important;
        }
        #documento-conformidade-oficial.pdf-export-mode tbody td:nth-child(7),
        #documento-conformidade-oficial-export.pdf-export-mode tbody td:nth-child(7) {
          font-size: 13.5px !important;
          font-weight: 600 !important;
          color: #334155 !important;
          line-height: 1.35 !important;
        }
        #documento-conformidade-oficial.pdf-export-mode > div:last-child,
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child {
          border-top: 2px solid #0f172a !important;
          padding: 24px !important;
        }
        #documento-conformidade-oficial.pdf-export-mode > div:last-child span,
        #documento-conformidade-oficial.pdf-export-mode > div:last-child input,
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child span,
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child input {
          font-size: 15px !important;
          color: #0f172a !important;
        }
        #documento-conformidade-oficial.pdf-export-mode > div:last-child p,
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child p {
          font-size: 15px !important;
          color: #0f172a !important;
          line-height: 1.6 !important;
          text-align: justify !important;
          width: 100% !important;
          max-width: 100% !important;
          margin-top: 8px !important;
          margin-bottom: 8px !important;
        }
        #documento-conformidade-oficial.pdf-export-mode > div:last-child strong,
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child strong,
        #documento-conformidade-oficial.pdf-export-mode > div:last-child strong span,
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child strong span {
          display: inline !important;
          font-weight: 800 !important;
          white-space: nowrap !important;
        }
        #documento-conformidade-oficial.pdf-export-mode > div:last-child strong input,
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child strong input {
          font-size: 16px !important;
          font-weight: 900 !important;
          display: inline !important;
        }
        #documento-conformidade-oficial.pdf-export-mode > div:last-child input[placeholder="JOÃO ALEXANDRE DOURADO"],
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child input[placeholder="JOÃO ALEXANDRE DOURADO"] {
          font-size: 16.5px !important;
          font-weight: 800 !important;
        }
        #documento-conformidade-oficial.pdf-export-mode > div:last-child input[placeholder="ASSISTENTE ADMINISTRATIVO DO SISPEN"],
        #documento-conformidade-oficial.pdf-export-mode > div:last-child input[placeholder="CISE / SOE / GSASIST / SEJUS / MT"],
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child input[placeholder="ASSISTENTE ADMINISTRATIVO DO SISPEN"],
        #documento-conformidade-oficial-export.pdf-export-mode > div:last-child input[placeholder="CISE / SOE / GSASIST / SEJUS / MT"] {
          font-size: 14.5px !important;
          font-weight: 700 !important;
        }
      `}</style>

      {/* Main Official Document Container matching PDF and Screenshot 2 */}
      <div
        id="documento-conformidade-oficial"
        className="bg-white border-2 border-slate-900 shadow-sm overflow-hidden text-slate-800 uppercase"
      >
        {/* Document Header Table */}
        <div className="border-b-2 border-slate-800">
          <div className="py-3 px-4 text-center font-black text-[15px] sm:text-[17px] uppercase tracking-wider bg-slate-50 border-b border-slate-800">
            CONFORMIDADE DOCUMENTAL – PAGAMENTO DE OBRAS E SERVIÇOS DE ENGENHARIA
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 border-b border-slate-800 divide-y md:divide-y-0 md:divide-x divide-slate-800">
            <div className="p-3 sm:p-3.5 flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="font-bold text-slate-900 text-[13px] sm:text-[15px] uppercase shrink-0">PROCESSO Nº:</span>{' '}
                {selectedMedicao ? (
                  <span className="font-mono font-normal text-slate-800 text-[13px] sm:text-[15px] uppercase shrink-0">
                    {currentSigadoc}{!isIndenizacao && currentMedicaoNome ? ` - ${currentMedicaoNome}` : ''}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={currentSigadoc}
                    onChange={(e) => handleUpdateHeaderField('processo', e.target.value)}
                    placeholder="INFORME O Nº DO PROCESSO"
                    data-header-text-input="true"
                    className="flex-1 min-w-[180px] bg-transparent hover:bg-slate-100/70 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 outline-none font-mono font-normal text-slate-800 text-[13px] sm:text-[15px] uppercase border border-transparent hover:border-slate-300"
                  />
                )}
              </div>
              <div className="desc-servicos-container mt-1 w-full">
                <textarea
                  value={descricaoServicosAtual}
                  onChange={(e) => handleUpdateDescricaoServicos(e.target.value.toUpperCase())}
                  placeholder=""
                  rows={2}
                  title="Descrição da medição referente ao processo"
                  data-desc-servicos-input="true"
                  className="w-full bg-transparent hover:bg-slate-100/70 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 outline-none font-mono font-semibold text-slate-700 text-[10px] sm:text-[11px] uppercase border border-transparent hover:border-slate-300 min-w-0 leading-tight resize-none block"
                />
              </div>
            </div>
            <div className="p-3 sm:p-3.5 flex items-center">
              <span className="font-bold text-slate-900 text-[13px] sm:text-[15px] uppercase shrink-0">PERÍODO:</span>{' '}
              {selectedMedicao ? (
                <span className="font-normal text-slate-800 text-[13px] sm:text-[15px] ml-1.5 uppercase">
                  {currentPeriodo}
                </span>
              ) : (
                <input
                  type="text"
                  value={currentPeriodo}
                  onChange={(e) => handleUpdateHeaderField('periodo', e.target.value)}
                  placeholder="INFORME O PERÍODO"
                  data-header-text-input="true"
                  className="flex-1 min-w-[160px] ml-1.5 bg-transparent hover:bg-slate-100/70 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 outline-none font-normal text-slate-800 text-[13px] sm:text-[15px] uppercase border border-transparent hover:border-slate-300"
                />
              )}
            </div>
          </div>

          <div className="p-3 sm:p-3.5 border-b border-slate-800">
            <span className="font-bold text-slate-900 text-[13px] sm:text-[15px] uppercase">INTERESSADO:</span>{' '}
            <span className="uppercase font-normal text-slate-800 text-[13px] sm:text-[15px] ml-1.5">
              {contrato.razaoSocial} – CONTRATO Nº {contrato.numero}
            </span>
          </div>

          <div className="p-3 sm:p-3.5 leading-relaxed">
            <span className="font-bold text-slate-900 text-[13px] sm:text-[15px] uppercase">OBJETO:</span>{' '}
            <span className="uppercase font-normal text-slate-800 text-[13px] sm:text-[14.5px] ml-1.5">
              {contrato.objeto}
            </span>
          </div>
        </div>

        {/* Document Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] sm:text-[14px] border-collapse uppercase">
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-black uppercase text-[13px] sm:text-[13.5px] border-b-2 border-slate-800">
                <th className="py-3 px-1.5 w-16 min-w-[65px] border-r border-slate-300 text-center whitespace-nowrap">Nº</th>
                <th className="py-3 px-3 border-r border-slate-300">DOCUMENTO</th>
                <th className="py-3 px-2 w-16 text-center border-r border-slate-300 text-slate-800 whitespace-nowrap">SIM</th>
                <th className="py-3 px-2 w-16 text-center border-r border-slate-300 text-slate-800 whitespace-nowrap">NÃO</th>
                <th className="py-3 px-2 w-16 text-center border-r border-slate-300 text-slate-800 whitespace-nowrap">N/A</th>
                <th className="py-3 px-2 w-28 text-center border-r border-slate-300 whitespace-nowrap">FLS</th>
                <th className="py-3 px-3 w-80">FUNDAMENTO JURÍDICO</th>
              </tr>
            </thead>
            <tbody>
              {isIndenizacao ? (
                <>
                  {/* SECTION 1 (Indenização): Documentos da Medição */}
                  <tr className="bg-slate-200 font-black text-slate-900 text-[13px] sm:text-[14.5px] uppercase border-t-2 border-b-2 border-slate-800">
                    <td className="py-2.5 px-1.5 text-center border-r border-slate-300 whitespace-nowrap min-w-[65px] font-bold">1</td>
                    <td colSpan={6} className="py-2.5 px-3">
                      <div className="flex items-center justify-between">
                        <span>DOCUMENTOS DA MEDIÇÃO</span>
                        <span className="font-mono text-[13px] sm:text-[14px] text-slate-700 font-bold uppercase whitespace-nowrap">
                          SUB PROCESSO: <span className="uppercase font-mono text-[13px] sm:text-[15px] font-black text-slate-900">{currentSigadoc}</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                  {section1Items.map((item) => renderItemRow(item))}

                  {/* SECTION 2 (Indenização): Documentos Comprobatórios de Regularidade Fiscal */}
                  <tr className="bg-slate-200 font-black text-slate-900 text-[13px] sm:text-[14.5px] uppercase border-t-2 border-b-2 border-slate-800">
                    <td className="py-2.5 px-1.5 text-center border-r border-slate-300 whitespace-nowrap min-w-[65px] font-bold">2</td>
                    <td colSpan={6} className="py-2.5 px-3">
                      DOCUMENTOS COMPROBATÓRIOS DE REGULARIDADE FISCAL
                    </td>
                  </tr>
                  {section2Items.map((item) => renderItemRow(item))}
                </>
              ) : (
                <>
                  {/* SECTION 1: Documentos do Contrato */}
                  <tr className="bg-slate-200 font-black text-slate-900 text-[13px] sm:text-[14.5px] uppercase border-t-2 border-b-2 border-slate-800">
                    <td className="py-2.5 px-1.5 text-center border-r border-slate-300 whitespace-nowrap min-w-[65px] font-bold">1</td>
                    <td colSpan={6} className="py-2.5 px-3">
                      <div className="flex items-center justify-between">
                        <span>DOCUMENTOS DO CONTRATO</span>
                        <span className="font-mono text-[13px] sm:text-[14px] text-slate-700 font-bold uppercase whitespace-nowrap">
                          PROCESSO PAI: <span className="uppercase font-mono text-[13px] sm:text-[15px] font-black text-slate-900">{processoPai}</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                  {section1Items.map((item) => renderItemRow(item))}

                  {/* SECTION 2: Documentos da Medição */}
                  <tr className="bg-slate-200 font-black text-slate-900 text-[13px] sm:text-[14.5px] uppercase border-t-2 border-b-2 border-slate-800">
                    <td className="py-2.5 px-1.5 text-center border-r border-slate-300 whitespace-nowrap min-w-[65px] font-bold">2</td>
                    <td colSpan={6} className="py-2.5 px-3">
                      <div className="flex items-center justify-between">
                        <span>DOCUMENTOS DA MEDIÇÃO</span>
                        <span className="font-mono text-[13px] sm:text-[14px] text-slate-700 font-bold uppercase whitespace-nowrap">
                          SUB PROCESSO: <span className="uppercase font-mono text-[13px] sm:text-[15px] font-black text-slate-900">{currentSigadoc}</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                  {section2Items.map((item) => renderItemRow(item))}

                  {/* SECTION 3: Documentos Comprobatórios de Regularidade Fiscal */}
                  <tr className="bg-slate-200 font-black text-slate-900 text-[13px] sm:text-[14.5px] uppercase border-t-2 border-b-2 border-slate-800">
                    <td className="py-2.5 px-1.5 text-center border-r border-slate-300 whitespace-nowrap min-w-[65px] font-bold">3</td>
                    <td colSpan={6} className="py-2.5 px-3">
                      DOCUMENTOS COMPROBATÓRIOS DE REGULARIDADE FISCAL
                    </td>
                  </tr>
                  {section3Items.map((item) => renderItemRow(item))}

                  {/* SECTION 4: Documento para Medição Final */}
                  <tr className="bg-slate-200 font-black text-slate-900 text-[13px] sm:text-[14.5px] uppercase border-t-2 border-b-2 border-slate-800">
                    <td className="py-2.5 px-1.5 text-center border-r border-slate-300 whitespace-nowrap min-w-[65px] font-bold">4</td>
                    <td colSpan={6} className="py-2.5 px-3">
                      DOCUMENTO PARA MEDIÇÃO FINAL
                    </td>
                  </tr>
                  {section4Items.map((item) => renderItemRow(item))}

                  {/* SECTION 5: Outros Procedimentos Institucionais */}
                  <tr className="bg-slate-200 font-black text-slate-900 text-[13px] sm:text-[14.5px] uppercase border-t-2 border-b-2 border-slate-800">
                    <td className="py-2.5 px-1.5 text-center border-r border-slate-300 whitespace-nowrap min-w-[65px] font-bold">5</td>
                    <td colSpan={6} className="py-2.5 px-3">
                      OUTROS PROCEDIMENTOS INSTITUCIONAIS
                    </td>
                  </tr>
                  {section5Items.map((item) => renderItemRow(item))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Document Footer matching PDF Page 3 */}
        <div className="border-t-2 border-slate-800 p-6 space-y-4 bg-white text-[13.5px] sm:text-[15px] text-slate-800 uppercase">
          <div className="flex items-start gap-2">
            <span className="font-bold text-slate-900 shrink-0 uppercase text-[13.5px] sm:text-[15px] whitespace-nowrap pt-0.5">
              OBSERVAÇÕES:
            </span>
            <textarea
              value={observacaoAtual}
              onChange={(e) => handleUpdateObservacoes(e.target.value)}
              placeholder="DIGITE AS OBSERVAÇÕES..."
              rows={2}
              title="Clique para editar as observações da conformidade"
              data-observacoes-input="true"
              className="flex-1 w-full bg-transparent hover:bg-slate-100/70 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 outline-none text-slate-800 text-[13.5px] sm:text-[15px] font-normal uppercase border border-transparent hover:border-slate-300 resize-y leading-snug"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 shrink-0 uppercase text-[13.5px] sm:text-[15px]">
              DATA:
            </span>
            <span className="font-normal font-mono text-slate-800 text-[13.5px] sm:text-[15px] uppercase">
              {todayBR}
            </span>
          </div>

          <p className="text-slate-800 leading-relaxed font-normal pt-2 text-[13.5px] sm:text-[15px] uppercase text-justify w-full">
            ENCAMINHO O PROCESSO, REFERENTE À MEDIÇÃO DA OBRA/SERVIÇOS ACIMA CITADOS, NO VALOR DE{' '}
            <strong className="font-bold text-slate-950 inline whitespace-nowrap">
              R${' '}
              <input
                type="text"
                value={formatCurrency(valorEncaminhadoAtual, false)}
                onChange={(e) => handleUpdateValor(e.target.value)}
                title="Clique para alterar o valor do encaminhamento"
                style={{ width: `${Math.max(formatCurrency(valorEncaminhadoAtual, false).length + 0.5, 2)}ch`, fieldSizing: 'content' } as React.CSSProperties}
                className="font-mono font-bold text-slate-950 bg-transparent outline-none border-0 text-[13.5px] sm:text-[15px] p-0 inline hover:bg-slate-100/60 rounded focus:bg-white focus:ring-1 focus:ring-blue-500 text-left"
              />
            </strong>
            , CONFORME RESPECTIVA PLANILHA DE MEDIÇÃO, PARA ANÁLISE E POSTERIOR PAGAMENTO.
          </p>

          {/* Signature Block matching PDF page 3 */}
          <div className="pt-8 pb-4 text-center space-y-1.5 max-w-xl mx-auto uppercase">
            <div className="w-80 mx-auto border-t border-slate-800 mb-2"></div>

            {/* Nome */}
            <input
              type="text"
              value={assinanteNome}
              onChange={(e) => handleUpdateAssinante('nome', e.target.value.toUpperCase())}
              placeholder="JOÃO ALEXANDRE DOURADO"
              title="Clique para alterar o nome do assinante"
              className="w-full text-center font-bold text-[13.5px] sm:text-[15px] uppercase text-slate-900 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-0.5 outline-none border-0 tracking-wide"
            />

            {/* Cargo */}
            <input
              type="text"
              value={assinanteCargo}
              onChange={(e) => handleUpdateAssinante('cargo', e.target.value.toUpperCase())}
              placeholder="ASSISTENTE ADMINISTRATIVO DO SISPEN"
              title="Clique para alterar o cargo"
              className="w-full text-center text-[13px] sm:text-[14px] uppercase text-slate-700 font-medium bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-0.5 outline-none border-0 leading-tight"
            />

            {/* Setor */}
            <input
              type="text"
              value={assinanteSetor}
              onChange={(e) => handleUpdateAssinante('setor', e.target.value.toUpperCase())}
              placeholder="CISE / SOE / GSASIST / SEJUS / MT"
              title="Clique para alterar o setor"
              className="w-full text-center text-[13px] sm:text-[13.5px] uppercase font-bold text-slate-800 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-0.5 outline-none border-0 tracking-wider"
            />
          </div>
        </div>
      </div>

      {/* Cobrar Fiscal Modal (Imagem 3) */}
      <CobrarFiscalModal
        isOpen={isCobrarFiscalOpen}
        onClose={() => setIsCobrarFiscalOpen(false)}
        contrato={contrato}
        medicaoNome={currentMedicaoNome || (isIndenizacao ? 'Pagamento por Indenização' : '1ª Medição')}
        medicaoValor={valorEncaminhadoAtual}
        irregularItens={irregularItens}
        processoSigadoc={currentSigadoc}
      />

          {/* Despacho NGER (Indenização) ou Despacho para Pagamento da Medição */}
          {isIndenizacao ? (
            <DespachoNgerModal
              isOpen={isDespachoModalOpen}
              onClose={() => setIsDespachoModalOpen(false)}
              contrato={contrato}
              medicaoObj={selectedMedicao}
              sigadocOverride={currentSigadoc}
              periodoOverride={currentPeriodo}
              valorOverride={valorEncaminhadoAtual}
              descricaoOverride={descricaoServicosAtual}
            />
          ) : (
            <DespachoPagamentoModal
              isOpen={isDespachoModalOpen}
              onClose={() => setIsDespachoModalOpen(false)}
              medicaoNome={currentMedicaoNome || '1ª Medição'}
              objetoContrato={contrato.objeto || contrato.tipo || 'MANUTENÇÃO PREDIAL PREVENTIVA E CORRETIVA'}
              servicoExecutado={
                selectedMedicao?.descricao ||
                descricaoServicosAtual ||
                contrato.conformidade?.descricaoServicosMedidos ||
                (currentSigadoc.includes('16131.09') || currentSigadoc.includes('16131.10') ? 'PINTURA SEDE ANTIGA SEJUS' : '') ||
                contrato.descricao ||
                ''
              }
              descricao={
                selectedMedicao?.descricao ||
                descricaoServicosAtual ||
                contrato.conformidade?.descricaoServicosMedidos ||
                contrato.descricao ||
                contrato.objeto
              }
              contratoNumero={contrato.numero}
              razaoSocial={contrato.razaoSocial || contrato.siglaEmpresa || 'EMPRESA CONTRATADA'}
              valorFormatado={formatCurrency(valorEncaminhadoAtual)}
              processoConformidade={
                currentSigadoc && currentSigadoc !== 'NÃO INFORMADO'
                  ? currentSigadoc
                  : 'SEJUS-DIC-2026/78025'
              }
              processoEmpenho={
                (() => {
                  const empVinc = (selectedMedicao?.empenhoVinculado || '').trim();
                  const isValidEmpVinc = Boolean(
                    empVinc &&
                    empVinc !== '-' &&
                    empVinc.toUpperCase() !== 'SEM EMPENHO' &&
                    !empVinc.toUpperCase().includes('PAGO PELA UO')
                  );
                  const linked = (contrato.empenhos || []).find(
                    (e) => e.numeroEmp?.trim() === empVinc
                  ) || (contrato.empenhos || [])[0];
                  if (isValidEmpVinc) {
                    return linked?.numeroEmp || empVinc;
                  }
                  if (linked?.numeroEmp && linked.numeroEmp !== '-' && !linked.numeroEmp.includes('NÃO INFORMADO')) {
                    return linked.numeroEmp;
                  }
                  if (linked?.numeroProcesso && linked.numeroProcesso !== '-' && !linked.numeroProcesso.includes('NÃO INFORMADO')) {
                    return linked.numeroProcesso;
                  }
                  return 'SEJUS-CAP-2026/91052';
                })()
              }
            />
          )}
        </>
      )}

      {/* Janela pequena informando certidões vencidas detectadas no processo */}
      {expiredCertsModal && expiredCertsModal.length > 0 && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expired-certs-modal-title"
        >
          <div className="bg-white border border-red-200 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-red-600 text-white">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <h3
                  id="expired-certs-modal-title"
                  className="text-xs font-extrabold uppercase tracking-wide"
                >
                  {expiredCertsModal.length === 1
                    ? 'Certidão Vencida Identificada'
                    : 'Certidões Vencidas Identificadas'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExpiredCertsModal(null)}
                className="p-1 rounded hover:bg-red-700/80 transition-colors cursor-pointer"
                title="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-700 leading-relaxed">
                Somente as certidões <strong>vigentes</strong> foram preenchidas na coluna{' '}
                <strong>FLS</strong>. As seguintes certidões constam como{' '}
                <strong className="text-red-700">vencidas</strong> no processo:
              </p>

              <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {expiredCertsModal.map((cert) => (
                  <li
                    key={cert.codigo}
                    className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="font-bold text-red-900">
                      {cert.codigo} — {cert.nomeCertidao}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-red-700 font-medium">
                      {cert.dataValidade && (
                        <span>Vencida em: {cert.dataValidade}</span>
                      )}
                      {cert.folhas && <span>Fls.: {cert.folhas}</span>}
                      {!cert.dataValidade && cert.motivo && (
                        <span>{cert.motivo}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setExpiredCertsModal(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-bold uppercase cursor-pointer"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
