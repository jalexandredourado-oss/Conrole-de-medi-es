import React, { useState } from 'react';
import {
  FileText,
  Info,
  Layers,
  DollarSign,
  FileCheck,
  X,
  FileDown,
} from 'lucide-react';
import {
  Contrato,
  Empenho,
  Medicao,
  Pagamento,
  OrdemServico,
  ConformidadeDocumentalData,
} from '../types/contract';
import { clearConformidadeItensForMedicao } from '../data/masterConformidadeItems';
import { ContractDetailsTab } from './tabs/ContractDetailsTab';
import { EmpenhosMedicoesTab } from './tabs/EmpenhosMedicoesTab';
import { PagamentosTab } from './tabs/PagamentosTab';
import { ConformidadeDocumentalTab } from './tabs/ConformidadeDocumentalTab';
import { NewEmpenhoModal } from './modals/NewEmpenhoModal';
import { NewMedicaoModal } from './modals/NewMedicaoModal';
import { PasteSpreadsheetModal } from './modals/PasteSpreadsheetModal';
import { NewPagamentoModal } from './modals/NewPagamentoModal';
import { downloadContratoCompletoPdf } from '../utils/downloadPdf';
import { ContractPdfTemplate } from './pdf/ContractPdfTemplate';
import {
  buildEmpenhoAnexoId,
  deleteEmpenhoAttachment,
} from '../utils/empenhoAttachmentStorage';

export type SubMenuTab =
  | 'DETALHES_DO_CONTRATO'
  | 'EMPENHOS_E_MEDICOES'
  | 'PAGAMENTOS'
  | 'CONFORMIDADE_DOCUMENTAL';

interface ContractModalProps {
  contrato: Contrato | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateContract: (updated: Contrato) => void;
  onEditContract: (contrato: Contrato) => void;
}

export const ContractModal: React.FC<ContractModalProps> = ({
  contrato,
  isOpen,
  onClose,
  onUpdateContract,
  onEditContract,
}) => {
  const [activeTab, setActiveTab] = useState<SubMenuTab>('DETALHES_DO_CONTRATO');
  const [highlightedPagamentoId, setHighlightedPagamentoId] = useState<string | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const handleTabChange = (tab: SubMenuTab) => {
    setActiveTab(tab);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  };

  const handleNavigateToPagamento = (pagamentoId: string) => {
    setActiveTab('PAGAMENTOS');
    setHighlightedPagamentoId(pagamentoId);
  };

  // Submodals state
  const [isEmpenhoModalOpen, setIsEmpenhoModalOpen] = useState(false);
  const [empenhoToEdit, setEmpenhoToEdit] = useState<Empenho | null>(null);
  const [isMedicaoModalOpen, setIsMedicaoModalOpen] = useState(false);
  const [isColarPlanilhaOpen, setIsColarPlanilhaOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const contractPdfTemplateRef = React.useRef<HTMLDivElement>(null);
  const [isPagamentoModalOpen, setIsPagamentoModalOpen] = useState(false);
  const [medicaoParaPagamento, setMedicaoParaPagamento] = useState<Medicao | null>(null);

  if (!isOpen || !contrato) return null;

  // Handlers for adding/editing/removing items
  const handleOpenNovoPagamento = (med?: Medicao) => {
    setMedicaoParaPagamento(med || null);
    setIsPagamentoModalOpen(true);
  };

  const handleSavePagamento = (novoPag: Pagamento) => {
    const novosPagamentos = [...contrato.pagamentos, novoPag];
    const totalPago = novosPagamentos.reduce((sum, p) => sum + p.valorBruto, 0);
    const totalLiquidado = totalPago;

    onUpdateContract({
      ...contrato,
      pagamentos: novosPagamentos,
      valorPago: totalPago,
      valorLiquidado: totalLiquidado,
    });
  };
  const handleOpenNovoEmpenho = () => {
    setEmpenhoToEdit(null);
    setIsEmpenhoModalOpen(true);
  };

  const handleOpenEditEmpenho = (emp: Empenho) => {
    setEmpenhoToEdit(emp);
    setIsEmpenhoModalOpen(true);
  };

  const handleSaveEmpenho = (newEmp: Empenho) => {
    let updatedEmpenhos: Empenho[];
    const exists = contrato.empenhos.some((e) => e.id === newEmp.id);
    if (exists) {
      updatedEmpenhos = contrato.empenhos.map((e) => (e.id === newEmp.id ? newEmp : e));
    } else {
      updatedEmpenhos = [...contrato.empenhos, newEmp];
    }
    const totalEmpenhado = updatedEmpenhos.reduce((acc, e) => acc + e.valorTotal, 0);

    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
      valorEmpenhado: totalEmpenhado,
    });
    setEmpenhoToEdit(null);
  };

  const handleDeleteEmpenho = (empId: string) => {
    const deletedEmp = contrato.empenhos.find((e) => e.id === empId);
    if (deletedEmp) {
      const anexoId =
        deletedEmp.anexoId || buildEmpenhoAnexoId(contrato.numero || contrato.id, empId);
      deleteEmpenhoAttachment(anexoId).catch(() => {});
    }
    const updatedEmpenhos = contrato.empenhos.filter((e) => e.id !== empId);
    const totalEmpenhado = updatedEmpenhos.reduce((acc, e) => acc + e.valorTotal, 0);

    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
      valorEmpenhado: totalEmpenhado,
    });
  };

  const handleUpdateEmpenhoRegiao = (empId: string, newRegiao: string) => {
    const updatedEmpenhos = contrato.empenhos.map((e) =>
      e.id === empId ? { ...e, regiao: newRegiao.toUpperCase() } : e
    );
    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
    });
  };

  const isContinuationMedicao = (m?: Medicao | null): boolean => {
    if (!m) return false;
    return Boolean(
      m.isContinuation ||
        m.parentMedicaoId ||
        (m.numeroMed &&
          (m.numeroMed.toUpperCase().includes('(CONT') ||
            m.numeroMed.toUpperCase().includes('CONT.'))) ||
        (m.descricao &&
          (m.descricao.toUpperCase().includes('(CONT') ||
            m.descricao.toUpperCase().includes('CONT.')))
    );
  };

  const prepareConformidadeForNewMedicao = (
    nextMedicoes: Medicao[],
    newPrimaryMed?: Medicao
  ): {
    medicoes: Medicao[];
    conformidadePorMedicao?: Record<string, ConformidadeDocumentalData>;
    conformidade: ConformidadeDocumentalData;
  } => {
    const isIndenizacao = Boolean(contrato.pgtoIndenizacao);
    const updatedPorMed: Record<string, ConformidadeDocumentalData> = {
      ...(contrato.conformidadePorMedicao || {}),
    };
    let finalMedicoes = nextMedicoes;

    // Preserva eventual conformidade preenchida da medição anterior antes de limpar as folhas para a nova medição
    const currentConf = contrato.conformidade;
    const hasCurrentFilled = Boolean(
      currentConf?.itens?.some(
        (it) => it.status !== 'IRREGULAR' || (it.folhas && it.folhas.trim() !== '')
      )
    );
    const prevNonContMeds = (contrato.medicoes || []).filter((m) => !isContinuationMedicao(m));
    const fallbackPrevMed = prevNonContMeds[prevNonContMeds.length - 1];
    const prevMedId = currentConf?.medicaoId || fallbackPrevMed?.id;

    if (
      hasCurrentFilled &&
      currentConf &&
      prevMedId &&
      (!newPrimaryMed || prevMedId !== newPrimaryMed.id)
    ) {
      const prevMedObj = (contrato.medicoes || []).find((m) => m.id === prevMedId);
      const prevMedNumero = currentConf.medicaoNumero || prevMedObj?.numeroMed;
      const alreadyHasSaved =
        Boolean(updatedPorMed[prevMedId]?.itens?.length) ||
        Boolean(prevMedNumero && updatedPorMed[prevMedNumero]?.itens?.length) ||
        Boolean(prevMedObj?.conformidade?.itens?.length);

      if (!alreadyHasSaved) {
        const snapshotPrev: ConformidadeDocumentalData = {
          ...currentConf,
          medicaoId: prevMedId,
          medicaoNumero: prevMedNumero,
          itens: currentConf.itens.map((it) => ({ ...it })),
        };
        updatedPorMed[prevMedId] = snapshotPrev;
        if (prevMedNumero) {
          updatedPorMed[prevMedNumero] = snapshotPrev;
        }
        finalMedicoes = finalMedicoes.map((m) =>
          m.id === prevMedId ? { ...m, conformidade: snapshotPrev } : m
        );
      }
    }

    const clearedItens = clearConformidadeItensForMedicao(
      contrato.conformidade?.itens,
      contrato.numero,
      isIndenizacao,
      true
    );

    const nextConformidade: ConformidadeDocumentalData = {
      ...(contrato.conformidade || { data: '' }),
      itens: clearedItens,
      medicaoId: newPrimaryMed?.id,
      medicaoNumero: newPrimaryMed?.numeroMed,
      processo: newPrimaryMed?.sigadoc || contrato.processoSigadoc || '',
      periodo: newPrimaryMed?.periodo || '',
      valorEncaminhado: newPrimaryMed?.valorMedicao ?? 0,
      descricaoServicosMedidos: newPrimaryMed?.descricao || '',
      observacoes: '',
    };

    return {
      medicoes: finalMedicoes,
      conformidadePorMedicao: updatedPorMed,
      conformidade: nextConformidade,
    };
  };

  const computeTotalMedido = (meds: Medicao[]) => {
    return meds.reduce((acc, m) => {
      // Do not double count continuation rows
      if (isContinuationMedicao(m)) {
        return acc;
      }
      return acc + (m.valorMedicao || 0);
    }, 0);
  };

  const handleSaveMedicao = (
    newMed: Medicao,
    empenhoDeduction?: { empenhoNumero: string; amount: number }
  ) => {
    let updatedEmpenhos = [...contrato.empenhos];
    if (empenhoDeduction && empenhoDeduction.amount > 0) {
      updatedEmpenhos = updatedEmpenhos.map((e) => {
        if (e.numeroEmp === empenhoDeduction.empenhoNumero) {
          return {
            ...e,
            saldoDisponivel: Math.max(0, e.saldoDisponivel - empenhoDeduction.amount),
          };
        }
        return e;
      });
    }

    let updatedMedicoes = [...contrato.medicoes];
    let createdPrimaryMed: Medicao = newMed;

    // If an empenho was selected and there is pending remainder > 0:
    // create the primary row with pending = 0 and insert a continuation row directly below it!
    if (
      newMed.empenhoVinculado &&
      newMed.empenhoVinculado !== 'SEM EMPENHO' &&
      newMed.empenhoVinculado !== '-' &&
      newMed.valorPendente &&
      newMed.valorPendente > 0
    ) {
      const remainingPending = newMed.valorPendente;
      const primaryMed: Medicao = {
        ...newMed,
        valorPendente: 0,
        medicaoPendente: false,
      };
      createdPrimaryMed = primaryMed;
      const contMed: Medicao = {
        id: `${newMed.id}-cont-${Date.now()}`,
        numeroMed: newMed.numeroMed.includes('(CONT')
          ? `${newMed.numeroMed}`
          : `${newMed.numeroMed} (CONT.)`,
        periodo: newMed.periodo,
        unidadeCidade: newMed.unidadeCidade,
        descricao: newMed.descricao,
        sigadoc: newMed.sigadoc,
        empenhoVinculado: 'SEM EMPENHO',
        valorDescontadoEmpenho: 0,
        valorMedicao: remainingPending,
        medicaoPendente: true,
        valorPendente: remainingPending,
        percentualFisico:
          contrato.valorContratado > 0
            ? Number(((remainingPending / contrato.valorContratado) * 100).toFixed(1))
            : 0,
        dataRegistro: newMed.dataRegistro,
        observacao: newMed.observacao || '',
        numeroNf: newMed.numeroNf,
        dataEmissaoNf: newMed.dataEmissaoNf,
        dataAtesto: newMed.dataAtesto,
        parentMedicaoId: newMed.id,
        isContinuation: true,
      };
      updatedMedicoes.push(primaryMed, contMed);
    } else {
      updatedMedicoes.push(newMed);
    }

    let updatedOrdensServico = contrato.ordensServico ? [...contrato.ordensServico] : [];
    if (newMed.numeroOs && newMed.numeroOs.trim()) {
      const osNum = newMed.numeroOs.trim().toUpperCase();
      const existingOs = updatedOrdensServico.find(
        (o) => o.numeroOs.trim().toUpperCase() === osNum
      );
      if (!existingOs) {
        updatedOrdensServico.push({
          id: newMed.osId || `os-${Date.now()}`,
          numeroOs: osNum,
          descricao: newMed.descricao || `OS Nº ${osNum}`,
          itens: [
            {
              id: `it-${Date.now()}`,
              item: '01',
              qtd: 1,
              unidade: 'UN',
              especificacao: newMed.descricao || 'SERVIÇOS MEDIDOS',
              valorItem: newMed.valorAbatidoOs1 || newMed.valorOs || newMed.valorMedicao,
            },
          ],
          valorTotal: newMed.valorOs || newMed.valorAbatidoOs1 || newMed.valorMedicao,
          dataEmissao: newMed.dataEmissaoOs || '01/01/2026',
        });
      }
    }
    if (newMed.numeroOs2 && newMed.numeroOs2.trim()) {
      const osNum2 = newMed.numeroOs2.trim().toUpperCase();
      const existingOs2 = updatedOrdensServico.find(
        (o) => o.numeroOs.trim().toUpperCase() === osNum2
      );
      if (!existingOs2) {
        updatedOrdensServico.push({
          id: newMed.osId2 || `os-${Date.now()}-2`,
          numeroOs: osNum2,
          descricao: `OS Nº ${osNum2}`,
          itens: [
            {
              id: `it-${Date.now()}-2`,
              item: '01',
              qtd: 1,
              unidade: 'UN',
              especificacao: newMed.descricao || 'SERVIÇOS MEDIDOS',
              valorItem: newMed.valorAbatidoOs2 || newMed.valorOs2 || 0,
            },
          ],
          valorTotal: newMed.valorOs2 || newMed.valorAbatidoOs2 || 0,
          dataEmissao: newMed.dataEmissaoOs2 || '01/01/2026',
        });
      }
    }

    const totalMedido = computeTotalMedido(updatedMedicoes);
    const saldo = Math.max(contrato.valorContratado - totalMedido, 0);

    const conformidadeReset =
      Boolean(contrato.pgtoIndenizacao) && !isContinuationMedicao(createdPrimaryMed)
        ? prepareConformidadeForNewMedicao(updatedMedicoes, createdPrimaryMed)
        : null;

    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
      ordensServico: updatedOrdensServico,
      medicoes: conformidadeReset ? conformidadeReset.medicoes : updatedMedicoes,
      ...(conformidadeReset
        ? {
            conformidadePorMedicao: conformidadeReset.conformidadePorMedicao,
            conformidade: conformidadeReset.conformidade,
          }
        : {}),
      valorMedido: totalMedido,
      saldoContrato: saldo,
      valorContratadoNaoExecutado: saldo,
      execucaoFisica: Math.max(contrato.execucaoFisica, newMed.percentualFisico),
    });
  };

  const handleAddNewOs = (newOs: OrdemServico) => {
    if (!onUpdateContract) return;
    const currentOsList = contrato.ordensServico ? [...contrato.ordensServico] : [];
    const existingIndex = currentOsList.findIndex(
      (o) => o.id === newOs.id || o.numeroOs.trim().toUpperCase() === newOs.numeroOs.trim().toUpperCase()
    );
    let updatedList: OrdemServico[];
    if (existingIndex >= 0) {
      updatedList = currentOsList.map((o, idx) => (idx === existingIndex ? newOs : o));
    } else {
      updatedList = [...currentOsList, newOs];
    }
    onUpdateContract({
      ...contrato,
      ordensServico: updatedList,
    });
  };

  const handleLinkEmpenhoToMedicao = (
    medicaoId: string,
    empenhoNumero: string,
    valorDescontado?: number
  ) => {
    // 1. Identify target medicao. Check if targetMed is a synthetic continuation row or already exists
    let targetMed = contrato.medicoes.find((m) => m.id === medicaoId);
    let parentMed: Medicao | undefined;

    if (!targetMed && medicaoId.endsWith('-cont')) {
      const parentId = medicaoId.replace(/-cont$/, '');
      parentMed = contrato.medicoes.find((m) => m.id === parentId);
      if (parentMed && parentMed.valorPendente && parentMed.valorPendente > 0) {
        targetMed = {
          id: medicaoId,
          numeroMed: parentMed.numeroMed.includes('(CONT')
            ? parentMed.numeroMed
            : `${parentMed.numeroMed} (CONT.)`,
          periodo: parentMed.periodo,
          unidadeCidade: parentMed.unidadeCidade,
          descricao: parentMed.descricao,
          sigadoc: parentMed.sigadoc,
          empenhoVinculado: 'SEM EMPENHO',
          valorDescontadoEmpenho: 0,
          valorMedicao: parentMed.valorPendente,
          medicaoPendente: true,
          valorPendente: parentMed.valorPendente,
          percentualFisico: parentMed.percentualFisico,
          dataRegistro: parentMed.dataRegistro,
          observacao: parentMed.observacao || '',
          numeroNf: parentMed.numeroNf,
          dataEmissaoNf: parentMed.dataEmissaoNf,
          dataAtesto: parentMed.dataAtesto,
          parentMedicaoId: parentMed.id,
          isContinuation: true,
        };
      }
    }

    if (!targetMed) return;

    // Special case: "Pago pela UO da SESP"
    if (empenhoNumero === 'Pago pela UO da SESP') {
      let updatedEmpenhos = [...contrato.empenhos];

      // If targetMed had an existing empenho linked, restore its balance first
      if (
        targetMed.empenhoVinculado &&
        targetMed.empenhoVinculado !== 'SEM EMPENHO' &&
        targetMed.empenhoVinculado !== 'Pago pela UO da SESP' &&
        targetMed.empenhoVinculado !== '-' &&
        targetMed.valorDescontadoEmpenho
      ) {
        updatedEmpenhos = updatedEmpenhos.map((e) => {
          if (e.numeroEmp === targetMed!.empenhoVinculado) {
            return {
              ...e,
              saldoDisponivel: e.saldoDisponivel + (targetMed!.valorDescontadoEmpenho || 0),
            };
          }
          return e;
        });
      }

      let currentList = [...contrato.medicoes];
      if (parentMed && !currentList.some((m) => m.id === targetMed!.id)) {
        currentList = currentList.map((m) =>
          m.id === parentMed!.id ? { ...m, valorPendente: 0, medicaoPendente: false } : m
        );
        const parentIdx = currentList.findIndex((m) => m.id === parentMed!.id);
        currentList.splice(parentIdx + 1, 0, targetMed);
      }

      const updatedMedicoes = currentList
        .filter((m) => m.parentMedicaoId !== targetMed!.id)
        .map((m) => {
          if (m.id === targetMed!.id) {
            return {
              ...m,
              empenhoVinculado: 'Pago pela UO da SESP',
              valorDescontadoEmpenho: 0,
              valorPendente: 0,
              medicaoPendente: false,
            };
          }
          return m;
        });

      onUpdateContract({
        ...contrato,
        medicoes: updatedMedicoes,
        empenhos: updatedEmpenhos,
      });
      return;
    }

    const targetEmp = contrato.empenhos.find((e) => e.numeroEmp === empenhoNumero);
    if (!targetEmp) return;

    let updatedEmpenhos = [...contrato.empenhos];

    // If targetMed had an existing empenho linked, restore its balance first
    if (
      targetMed.empenhoVinculado &&
      targetMed.empenhoVinculado !== 'SEM EMPENHO' &&
      targetMed.empenhoVinculado !== '-' &&
      targetMed.valorDescontadoEmpenho
    ) {
      updatedEmpenhos = updatedEmpenhos.map((e) => {
        if (e.numeroEmp === targetMed!.empenhoVinculado) {
          return {
            ...e,
            saldoDisponivel: e.saldoDisponivel + (targetMed!.valorDescontadoEmpenho || 0),
          };
        }
        return e;
      });
    }

    // Now find available balance for targetEmp in updatedEmpenhos
    const freshEmp = updatedEmpenhos.find((e) => e.numeroEmp === empenhoNumero);
    const availableSaldo = freshEmp ? freshEmp.saldoDisponivel : targetEmp.saldoDisponivel;

    const deduction =
      valorDescontado !== undefined
        ? valorDescontado
        : Math.min(targetMed.valorMedicao, availableSaldo);

    // Deduct from targetEmp
    updatedEmpenhos = updatedEmpenhos.map((e) => {
      if (e.numeroEmp === empenhoNumero) {
        return {
          ...e,
          saldoDisponivel: Math.max(0, e.saldoDisponivel - deduction),
        };
      }
      return e;
    });

    const remaining = Math.max(0, targetMed.valorMedicao - deduction);

    // Build the updated list of medicoes
    let currentList = [...contrato.medicoes];
    if (parentMed && !currentList.some((m) => m.id === targetMed!.id)) {
      // Materialize parent if targetMed was synthetic
      currentList = currentList.map((m) =>
        m.id === parentMed!.id ? { ...m, valorPendente: 0, medicaoPendente: false } : m
      );
      const parentIdx = currentList.findIndex((m) => m.id === parentMed!.id);
      currentList.splice(parentIdx + 1, 0, targetMed);
    }

    const updatedMedicoes: Medicao[] = [];

    for (let i = 0; i < currentList.length; i++) {
      const m = currentList[i];
      if (m.id === targetMed.id) {
        // Linked target medicao row: pending column shows '-'
        const linkedMed: Medicao = {
          ...m,
          empenhoVinculado: empenhoNumero,
          valorDescontadoEmpenho: deduction,
          valorPendente: 0,
          medicaoPendente: false,
        };
        updatedMedicoes.push(linkedMed);

        // If there is remaining pending amount > 0, create continuation row directly below
        if (remaining > 0) {
          const contNumero = m.numeroMed.includes('(CONT')
            ? `${m.numeroMed}`
            : `${m.numeroMed} (CONT.)`;

          const contMed: Medicao = {
            id: `${m.id}-cont-${Date.now()}`,
            numeroMed: contNumero,
            periodo: m.periodo,
            unidadeCidade: m.unidadeCidade,
            descricao: m.descricao,
            sigadoc: m.sigadoc,
            empenhoVinculado: 'SEM EMPENHO',
            valorDescontadoEmpenho: 0,
            valorMedicao: remaining,
            medicaoPendente: true,
            valorPendente: remaining,
            percentualFisico:
              contrato.valorContratado > 0
                ? Number(((remaining / contrato.valorContratado) * 100).toFixed(1))
                : 0,
            dataRegistro: m.dataRegistro || '30/09/2026',
            observacao: '',
            parentMedicaoId: m.id,
            isContinuation: true,
          };
          updatedMedicoes.push(contMed);
        }
      } else if (
        m.parentMedicaoId === targetMed.id ||
        (m.numeroMed === `${targetMed.numeroMed} (CONT.)` && m.id === `${targetMed.id}-cont`)
      ) {
        // Previous continuation row of targetMed handled above
        continue;
      } else {
        updatedMedicoes.push(m);
      }
    }

    const totalMedido = computeTotalMedido(updatedMedicoes);
    const saldo = Math.max(contrato.valorContratado - totalMedido, 0);
    const execFisica = contrato.valorContratado > 0 ? (totalMedido / contrato.valorContratado) * 100 : 0;

    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
      medicoes: updatedMedicoes,
      valorMedido: totalMedido,
      saldoContrato: saldo,
      valorContratadoNaoExecutado: saldo,
      execucaoFisica: execFisica,
    });
  };

  const handleUnlinkEmpenhoFromMedicao = (medicaoId: string) => {
    const targetMed = contrato.medicoes.find((m) => m.id === medicaoId);
    if (!targetMed) return;

    let updatedEmpenhos = [...contrato.empenhos];

    // Restore target empenho balance
    if (
      targetMed.empenhoVinculado &&
      targetMed.empenhoVinculado !== 'SEM EMPENHO' &&
      targetMed.empenhoVinculado !== '-' &&
      targetMed.valorDescontadoEmpenho
    ) {
      updatedEmpenhos = updatedEmpenhos.map((e) => {
        if (e.numeroEmp === targetMed.empenhoVinculado) {
          return {
            ...e,
            saldoDisponivel: e.saldoDisponivel + (targetMed.valorDescontadoEmpenho || 0),
          };
        }
        return e;
      });
    }

    // Restore any child continuation empenhos
    const childContRows = contrato.medicoes.filter((m) => m.parentMedicaoId === targetMed.id);
    for (const child of childContRows) {
      if (
        child.empenhoVinculado &&
        child.empenhoVinculado !== 'SEM EMPENHO' &&
        child.empenhoVinculado !== '-' &&
        child.valorDescontadoEmpenho
      ) {
        updatedEmpenhos = updatedEmpenhos.map((e) => {
          if (e.numeroEmp === child.empenhoVinculado) {
            return {
              ...e,
              saldoDisponivel: e.saldoDisponivel + (child.valorDescontadoEmpenho || 0),
            };
          }
          return e;
        });
      }
    }

    // Remove child continuation rows and reset targetMed
    const updatedMedicoes = contrato.medicoes
      .filter((m) => m.parentMedicaoId !== targetMed.id)
      .map((m) => {
        if (m.id === medicaoId) {
          return {
            ...m,
            empenhoVinculado: 'SEM EMPENHO',
            valorDescontadoEmpenho: 0,
            valorPendente: m.valorMedicao,
            medicaoPendente: true,
            observacao: m.observacao || '',
          };
        }
        return m;
      });

    const totalMedido = computeTotalMedido(updatedMedicoes);
    const saldo = Math.max(contrato.valorContratado - totalMedido, 0);

    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
      medicoes: updatedMedicoes,
      valorMedido: totalMedido,
      saldoContrato: saldo,
      valorContratadoNaoExecutado: saldo,
    });
  };

  const handleUpdateMedicaoObservation = (medicaoId: string, observation: string) => {
    const exists = contrato.medicoes.some((m) => m.id === medicaoId);
    let updatedMedicoes: Medicao[];

    if (!exists && medicaoId.endsWith('-cont')) {
      const parentId = medicaoId.replace(/-cont$/, '');
      const parent = contrato.medicoes.find((m) => m.id === parentId);
      if (parent && parent.valorPendente && parent.valorPendente > 0) {
        const contMed: Medicao = {
          id: medicaoId,
          numeroMed: parent.numeroMed.includes('(CONT')
            ? parent.numeroMed
            : `${parent.numeroMed} (CONT.)`,
          periodo: parent.periodo,
          unidadeCidade: parent.unidadeCidade,
          descricao: parent.descricao,
          sigadoc: parent.sigadoc,
          empenhoVinculado: 'SEM EMPENHO',
          valorDescontadoEmpenho: 0,
          valorMedicao: parent.valorPendente,
          medicaoPendente: true,
          valorPendente: parent.valorPendente,
          percentualFisico: parent.percentualFisico,
          dataRegistro: parent.dataRegistro,
          observacao: observation,
          parentMedicaoId: parent.id,
          isContinuation: true,
        };
        updatedMedicoes = contrato.medicoes.map((m) =>
          m.id === parentId ? { ...m, valorPendente: 0, medicaoPendente: false } : m
        );
        const pIdx = updatedMedicoes.findIndex((m) => m.id === parentId);
        updatedMedicoes.splice(pIdx + 1, 0, contMed);
      } else {
        updatedMedicoes = contrato.medicoes;
      }
    } else {
      updatedMedicoes = contrato.medicoes.map((m) => {
        if (m.id === medicaoId) {
          return {
            ...m,
            observacao: observation,
          };
        }
        return m;
      });
    }

    onUpdateContract({
      ...contrato,
      medicoes: updatedMedicoes,
    });
  };

  const handleDeleteMedicao = (medId: string) => {
    let targetMed = contrato.medicoes.find((m) => m.id === medId);
    let isSyntheticCont = false;
    let parentId = '';

    if (!targetMed && medId.endsWith('-cont')) {
      isSyntheticCont = true;
      parentId = medId.replace(/-cont$/, '');
      const parent = contrato.medicoes.find((m) => m.id === parentId);
      if (parent) {
        targetMed = {
          ...parent,
          id: medId,
          numeroMed: `${parent.numeroMed} (CONT.)`,
          valorMedicao: parent.valorPendente || 0,
        };
      }
    }

    let updatedEmpenhos = [...contrato.empenhos];

    if (
      targetMed &&
      targetMed.empenhoVinculado &&
      targetMed.empenhoVinculado !== 'SEM EMPENHO' &&
      targetMed.empenhoVinculado !== '-' &&
      targetMed.valorDescontadoEmpenho
    ) {
      updatedEmpenhos = updatedEmpenhos.map((e) => {
        if (e.numeroEmp === targetMed!.empenhoVinculado) {
          return {
            ...e,
            saldoDisponivel: e.saldoDisponivel + (targetMed!.valorDescontadoEmpenho || 0),
          };
        }
        return e;
      });
    }

    // Also restore and delete any child continuation rows
    const childContRows = contrato.medicoes.filter((m) => m.parentMedicaoId === medId);
    for (const child of childContRows) {
      if (
        child.empenhoVinculado &&
        child.empenhoVinculado !== 'SEM EMPENHO' &&
        child.empenhoVinculado !== '-' &&
        child.valorDescontadoEmpenho
      ) {
        updatedEmpenhos = updatedEmpenhos.map((e) => {
          if (e.numeroEmp === child.empenhoVinculado) {
            return {
              ...e,
              saldoDisponivel: e.saldoDisponivel + (child.valorDescontadoEmpenho || 0),
            };
          }
          return e;
        });
      }
    }

    let updatedMedicoes: Medicao[];
    if (isSyntheticCont) {
      updatedMedicoes = contrato.medicoes.map((m) =>
        m.id === parentId ? { ...m, valorPendente: 0, medicaoPendente: false } : m
      );
    } else {
      updatedMedicoes = contrato.medicoes.filter(
        (m) => m.id !== medId && m.parentMedicaoId !== medId
      );
    }

    const totalMedido = computeTotalMedido(updatedMedicoes);
    const saldo = Math.max(contrato.valorContratado - totalMedido, 0);

    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
      medicoes: updatedMedicoes,
      valorMedido: totalMedido,
      saldoContrato: saldo,
      valorContratadoNaoExecutado: saldo,
    });
  };

  const handleUpdateMedicao = (
    updatedMed: Medicao,
    empenhoDeduction?: { empenhoNumero: string; amount: number }
  ) => {
    const oldMed = contrato.medicoes.find((m) => m.id === updatedMed.id);
    let updatedEmpenhos = [...contrato.empenhos];

    // Restore old deduction from empenho if it had one
    if (
      oldMed &&
      oldMed.empenhoVinculado &&
      oldMed.empenhoVinculado.toUpperCase() !== 'SEM EMPENHO' &&
      oldMed.empenhoVinculado !== '-' &&
      oldMed.valorDescontadoEmpenho
    ) {
      updatedEmpenhos = updatedEmpenhos.map((e) => {
        if (e.numeroEmp === oldMed.empenhoVinculado) {
          return {
            ...e,
            saldoDisponivel: e.saldoDisponivel + oldMed.valorDescontadoEmpenho!,
          };
        }
        return e;
      });
    }

    // Apply new deduction
    if (empenhoDeduction && empenhoDeduction.amount > 0) {
      updatedEmpenhos = updatedEmpenhos.map((e) => {
        if (e.numeroEmp === empenhoDeduction.empenhoNumero) {
          return {
            ...e,
            saldoDisponivel: Math.max(0, e.saldoDisponivel - empenhoDeduction.amount),
          };
        }
        return e;
      });
    }

    const updatedMedicoes = contrato.medicoes.map((m) =>
      m.id === updatedMed.id ? updatedMed : m
    );

    let updatedOrdensServico = contrato.ordensServico ? [...contrato.ordensServico] : [];
    if (updatedMed.numeroOs && updatedMed.numeroOs.trim()) {
      const osNum = updatedMed.numeroOs.trim().toUpperCase();
      const existingOs = updatedOrdensServico.find(
        (o) => o.numeroOs.trim().toUpperCase() === osNum
      );
      if (!existingOs) {
        updatedOrdensServico.push({
          id: updatedMed.osId || `os-${Date.now()}`,
          numeroOs: osNum,
          descricao: updatedMed.descricao || `OS Nº ${osNum}`,
          itens: [
            {
              id: `it-${Date.now()}`,
              item: '01',
              qtd: 1,
              unidade: 'UN',
              especificacao: updatedMed.descricao || 'SERVIÇOS MEDIDOS',
              valorItem: updatedMed.valorAbatidoOs1 || updatedMed.valorOs || updatedMed.valorMedicao,
            },
          ],
          valorTotal: updatedMed.valorOs || updatedMed.valorAbatidoOs1 || updatedMed.valorMedicao,
          dataEmissao: updatedMed.dataEmissaoOs || '01/01/2026',
        });
      }
    }
    if (updatedMed.numeroOs2 && updatedMed.numeroOs2.trim()) {
      const osNum2 = updatedMed.numeroOs2.trim().toUpperCase();
      const existingOs2 = updatedOrdensServico.find(
        (o) => o.numeroOs.trim().toUpperCase() === osNum2
      );
      if (!existingOs2) {
        updatedOrdensServico.push({
          id: updatedMed.osId2 || `os-${Date.now()}-2`,
          numeroOs: osNum2,
          descricao: `OS Nº ${osNum2}`,
          itens: [
            {
              id: `it-${Date.now()}-2`,
              item: '01',
              qtd: 1,
              unidade: 'UN',
              especificacao: updatedMed.descricao || 'SERVIÇOS MEDIDOS',
              valorItem: updatedMed.valorAbatidoOs2 || updatedMed.valorOs2 || 0,
            },
          ],
          valorTotal: updatedMed.valorOs2 || updatedMed.valorAbatidoOs2 || 0,
          dataEmissao: updatedMed.dataEmissaoOs2 || '01/01/2026',
        });
      }
    }

    const totalMedido = computeTotalMedido(updatedMedicoes);
    const saldo = Math.max(contrato.valorContratado - totalMedido, 0);

    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
      ordensServico: updatedOrdensServico,
      medicoes: updatedMedicoes,
      valorMedido: totalMedido,
      saldoContrato: saldo,
      valorContratadoNaoExecutado: saldo,
      execucaoFisica: Math.max(contrato.execucaoFisica, updatedMed.percentualFisico),
    });
  };

  const handleImportMedicoes = (imported: Medicao[]) => {
    const updatedMedicoes = [...contrato.medicoes, ...imported];
    const totalMedido = computeTotalMedido(updatedMedicoes);
    const saldo = Math.max(contrato.valorContratado - totalMedido, 0);

    const importedNonCont = imported.filter((m) => !isContinuationMedicao(m));
    const latestImportedPrimary = importedNonCont[importedNonCont.length - 1];
    const conformidadeReset =
      Boolean(contrato.pgtoIndenizacao) && latestImportedPrimary
        ? prepareConformidadeForNewMedicao(updatedMedicoes, latestImportedPrimary)
        : null;

    onUpdateContract({
      ...contrato,
      medicoes: conformidadeReset ? conformidadeReset.medicoes : updatedMedicoes,
      ...(conformidadeReset
        ? {
            conformidadePorMedicao: conformidadeReset.conformidadePorMedicao,
            conformidade: conformidadeReset.conformidade,
          }
        : {}),
      valorMedido: totalMedido,
      saldoContrato: saldo,
      valorContratadoNaoExecutado: saldo,
    });
  };


  const handleDirectDownloadContractPdf = async () => {
    if (isDownloadingPdf || !contractPdfTemplateRef.current || !contrato) return;
    setIsDownloadingPdf(true);
    try {
      const cleanNum = (contrato.numero || 'Contrato').replace(/[^a-zA-Z0-9_-]/g, '-');
      const filename = `Contrato_${cleanNum}_Completo.pdf`;
      await downloadContratoCompletoPdf(contractPdfTemplateRef.current, filename, 'landscape');
    } catch (err) {
      console.error('Erro ao gerar PDF do contrato:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-2 sm:p-4 overflow-hidden">
        <div className="bg-[#f0f2f5] rounded-xl shadow-2xl w-full max-w-[96vw] xl:max-w-[1650px] 2xl:max-w-[1800px] h-[96vh] sm:h-[97vh] max-h-[97vh] flex flex-col overflow-hidden border border-slate-300">
          {/* Header matching Print 2, 3, 4 */}
          <div className="bg-[#1b346d] text-white px-6 py-3.5 flex items-center justify-between border-b border-[#142854] shrink-0">
            {/* Title & Company */}
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-[#254284] rounded border border-[#3b5ba5]">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black tracking-wide uppercase leading-tight">
                  CONTRATO Nº {contrato.numero}
                </h2>
                <p className="text-[11px] text-slate-300 uppercase font-medium truncate max-w-md sm:max-w-xl">
                  {contrato.razaoSocial}{' '}
                  {contrato.siglaEmpresa && `(${contrato.siglaEmpresa})`}
                </p>
              </div>
            </div>

            {/* Actions: Direct PDF Download & Close Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDirectDownloadContractPdf}
                disabled={isDownloadingPdf}
                className="flex items-center justify-center p-2 rounded bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/20 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-60"
                title="Baixar Relatório Completo do Contrato em PDF"
                aria-label="Baixar PDF"
              >
                {isDownloadingPdf ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 text-slate-200" />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10 cursor-pointer transition-colors"
                title="Fechar Janela"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Submenu Tabs Navigation (Print 2, 3, 4) */}
          <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-6 overflow-x-auto shrink-0 select-none">
            {/* Tab 1: DETALHES DO CONTRATO */}
            <button
              type="button"
              onClick={() => handleTabChange('DETALHES_DO_CONTRATO')}
              className={`flex items-center gap-2 py-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'DETALHES_DO_CONTRATO'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>DETALHES DO CONTRATO</span>
            </button>

            {/* Tab 2: EMPENHOS E MEDIÇÕES */}
            <button
              type="button"
              onClick={() => handleTabChange('EMPENHOS_E_MEDICOES')}
              className={`flex items-center gap-2 py-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'EMPENHOS_E_MEDICOES'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{contrato.pgtoIndenizacao ? 'EMPENHOS E NOTA FISCAIS' : 'EMPENHOS E MEDIÇÕES'}</span>
              {contrato.medicoes.length > 0 && (
                <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {contrato.medicoes.length}
                </span>
              )}
            </button>

            {/* Tab 3: PAGAMENTOS */}
            <button
              type="button"
              onClick={() => handleTabChange('PAGAMENTOS')}
              className={`flex items-center gap-2 py-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'PAGAMENTOS'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>PAGAMENTOS</span>
            </button>

            {/* Tab 4: CONFORMIDADE DOCUMENTAL */}
            <button
              type="button"
              onClick={() => handleTabChange('CONFORMIDADE_DOCUMENTAL')}
              className={`flex items-center gap-2 py-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'CONFORMIDADE_DOCUMENTAL'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>CONFORMIDADE DOCUMENTAL</span>
              {contrato.conformidade.itens.some((i) => i.status === 'IRREGULAR') && (
                <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                  1
                </span>
              )}
            </button>
          </div>

          {/* Modal Content Area */}
          <div ref={contentRef} className="p-6 overflow-y-auto flex-1">
            {activeTab === 'DETALHES_DO_CONTRATO' && (
              <ContractDetailsTab
                contrato={contrato}
                onEditContract={() => onEditContract(contrato)}
                onUpdateContract={onUpdateContract}
              />
            )}

            {activeTab === 'EMPENHOS_E_MEDICOES' && (
              <EmpenhosMedicoesTab
                contrato={contrato}
                onOpenNovoEmpenho={handleOpenNovoEmpenho}
                onOpenNovaMedicao={() => setIsMedicaoModalOpen(true)}
                onOpenColarPlanilha={() => setIsColarPlanilhaOpen(true)}
                onEditEmpenho={handleOpenEditEmpenho}
                onDeleteEmpenho={handleDeleteEmpenho}
                onDeleteMedicao={handleDeleteMedicao}
                onUpdateMedicao={handleUpdateMedicao}
                onLinkEmpenhoToMedicao={handleLinkEmpenhoToMedicao}
                onUnlinkEmpenhoFromMedicao={handleUnlinkEmpenhoFromMedicao}
                onUpdateMedicaoObservation={handleUpdateMedicaoObservation}
                onUpdateEmpenhoRegiao={handleUpdateEmpenhoRegiao}
                onLancarPagamentoMedicao={handleOpenNovoPagamento}
                onNavigateToPagamento={handleNavigateToPagamento}
                onUpdateContract={onUpdateContract}
              />
            )}

            {activeTab === 'PAGAMENTOS' && (
              <PagamentosTab
                contrato={contrato}
                onUpdateContract={onUpdateContract}
                highlightedPagamentoId={highlightedPagamentoId}
              />
            )}

            {activeTab === 'CONFORMIDADE_DOCUMENTAL' && (
              <ConformidadeDocumentalTab
                contrato={contrato}
                onUpdateContract={onUpdateContract}
                onPrintConformidade={handleDirectDownloadContractPdf}
                onNavigateToEmpenhosMedicoes={() => handleTabChange('EMPENHOS_E_MEDICOES')}
              />
            )}
          </div>
        </div>
      </div>

      {/* Auxiliary Modals */}
      <NewEmpenhoModal
        isOpen={isEmpenhoModalOpen}
        onClose={() => {
          setIsEmpenhoModalOpen(false);
          setEmpenhoToEdit(null);
        }}
        onSave={handleSaveEmpenho}
        contractNumero={contrato.numero}
        empenhoToEdit={empenhoToEdit}
      />

      <NewMedicaoModal
        isOpen={isMedicaoModalOpen}
        onClose={() => setIsMedicaoModalOpen(false)}
        onSave={handleSaveMedicao}
        contrato={contrato}
        onAddNewOs={handleAddNewOs}
      />

      <PasteSpreadsheetModal
        isOpen={isColarPlanilhaOpen}
        onClose={() => setIsColarPlanilhaOpen(false)}
        onImport={handleImportMedicoes}
      />


      <NewPagamentoModal
        isOpen={isPagamentoModalOpen}
        onClose={() => {
          setIsPagamentoModalOpen(false);
          setMedicaoParaPagamento(null);
        }}
        onSave={handleSavePagamento}
        contrato={contrato}
        initialMedicao={medicaoParaPagamento}
      />

      {/* Hidden Offscreen Template for Direct High-Quality Contract PDF Generation */}
      <div
        style={{
          position: 'fixed',
          left: '-99999px',
          top: 0,
          width: '1180px',
          minWidth: '1180px',
          maxWidth: '1180px',
          zIndex: -99999,
          pointerEvents: 'none',
          opacity: 0,
        }}
        aria-hidden="true"
      >
        <ContractPdfTemplate
          ref={contractPdfTemplateRef}
          contrato={contrato}
          mode="COMPLETO"
        />
      </div>
    </>
  );
};
