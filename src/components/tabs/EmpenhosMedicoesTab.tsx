import React, { useRef, useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Edit3,
  X,
  FileSpreadsheet,
  DollarSign,
  FileCheck,
  FileCheck2,
  Paperclip,
} from 'lucide-react';
import { Contrato, Empenho, Medicao, OrdemServico } from '../../types/contract';
import {
  formatCurrency,
  formatNumeroMedicao,
  formatOsShortNumber,
  calculateOsSaldo,
  getSaldoDisponivelAposMedicao as calculateSaldoDisponivelAposMedicao,
  isPagamentoOfMedicao,
  normalizeSigadoc,
  getSigadocFromPagamento,
  isSameSigadoc,
} from '../../utils/formatters';
import { EditObservationModal } from '../modals/EditObservationModal';
import { EditMedicaoEmpenhoModal } from '../modals/EditMedicaoEmpenhoModal';
import { EditMedicaoModal } from '../modals/EditMedicaoModal';
import { ImportEmpModal } from '../modals/ImportEmpModal';
import { DespachoNgerModal } from '../modals/DespachoNgerModal';
import { NewOrdemServicoModal } from '../modals/NewOrdemServicoModal';
import { EmpenhoAnexoModal } from '../modals/EmpenhoAnexoModal';
import { INITIAL_EMPENHOS_PENDENTES } from '../../data/reportData';
import {
  buildEmpenhoAnexoId,
  deleteEmpenhoAttachment,
  saveEmpenhoAttachment,
} from '../../utils/empenhoAttachmentStorage';

interface EmpenhosMedicoesTabProps {
  contrato: Contrato;
  onOpenNovoEmpenho: () => void;
  onOpenNovaMedicao: () => void;
  onOpenColarPlanilha: () => void;
  onEditEmpenho: (empenho: Empenho) => void;
  onDeleteEmpenho: (empenhoId: string) => void;
  onDeleteMedicao: (medicaoId: string) => void;
  onUpdateMedicao?: (
    updatedMedicao: Medicao,
    empenhoDeduction?: { empenhoNumero: string; amount: number }
  ) => void;
  onLinkEmpenhoToMedicao: (
    medicaoId: string,
    empenhoNumero: string,
    valorDescontado?: number
  ) => void;
  onUnlinkEmpenhoFromMedicao: (medicaoId: string) => void;
  onUpdateMedicaoObservation: (medicaoId: string, observation: string) => void;
  onUpdateEmpenhoRegiao?: (empId: string, regiao: string) => void;
  onLancarPagamentoMedicao?: (med: Medicao) => void;
  onNavigateToPagamento?: (pagamentoId: string) => void;
  onUpdateContract?: (updated: Contrato) => void;
}

export const EmpenhosMedicoesTab: React.FC<EmpenhosMedicoesTabProps> = ({
  contrato,
  onOpenNovoEmpenho,
  onOpenNovaMedicao,
  onOpenColarPlanilha,
  onEditEmpenho,
  onDeleteEmpenho,
  onDeleteMedicao,
  onUpdateMedicao,
  onLinkEmpenhoToMedicao,
  onUnlinkEmpenhoFromMedicao,
  onUpdateMedicaoObservation,
  onUpdateEmpenhoRegiao,
  onLancarPagamentoMedicao,
  onNavigateToPagamento,
  onUpdateContract,
}) => {
  const isIndenizacao = Boolean(contrato.pgtoIndenizacao);
  const empenhos = contrato.empenhos || [];
  const ordensServico = contrato.ordensServico || [];
  const rawMedicoes = contrato.medicoes || [];
  const [isImportEmpModalOpen, setIsImportEmpModalOpen] = useState(false);

  const getSaldoDisponivelAposMedicao = (emp: Empenho): number => {
    return calculateSaldoDisponivelAposMedicao(emp, rawMedicoes);
  };

  const getSaldoEmpenhoBM = (emp: Empenho): number => {
    if (emp.saldoEmpenho !== undefined && emp.saldoEmpenho !== null) {
      return emp.saldoEmpenho;
    }
    const match = INITIAL_EMPENHOS_PENDENTES.find(
      (ep) =>
        ep.codigo === emp.numeroEmp ||
        ep.codigo.replace(/[^\d]/g, '') === emp.numeroEmp.replace(/[^\d]/g, '')
    );
    if (match && match.saldo !== undefined && match.saldo !== null) {
      return match.saldo;
    }
    return emp.saldoDisponivel ?? emp.valorTotal;
  };

  // Helper para identificar medições originais (sem considerar continuações)
  const isOriginalMedicao = (med: Medicao) => {
    if (med.isContinuation) return false;
    if (med.parentMedicaoId) return false;
    const num = (med.numeroMed || '').toUpperCase();
    if (num.includes('(CONT') || num.includes('CONT.') || num.includes('CONTINUA')) return false;
    const desc = (med.descricao || '').toUpperCase();
    if (desc.includes('(CONT') || desc.includes('CONT.')) return false;
    return true;
  };

  // Calcula o total medido e saldo de cada Ordem de Serviço (OS):
  // Saldo da OS = valor da OS - total das medições originais vinculadas (incluindo rateio de 2ª OS)
  const getOsMedicaoStats = (os: OrdemServico) => {
    const stats = calculateOsSaldo(os, rawMedicoes, ordensServico.length);
    return {
      totalMedido: stats.totalMedido,
      saldo: stats.saldo,
    };
  };

  // Expand medicoes: if any medicao is linked to an empenho AND has valorPendente > 0,
  // and is NOT already followed by a continuation row, create the continuation row directly below it
  const medicoes = React.useMemo(() => {
    const list: Medicao[] = [];
    for (let i = 0; i < rawMedicoes.length; i++) {
      const med = rawMedicoes[i];
      const isLinked =
        Boolean(
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
        // Parent row: pending column shows '-' because pending amount is continued in the row below
        list.push({
          ...med,
          valorPendente: 0,
          medicaoPendente: false,
        });
        // Continuation row created directly below with valorMedicao = valorPendente
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
  }, [rawMedicoes]);

  // Group measurements so that parent and all continuation rows share the same alternating background
  const medicoesWithGroup = React.useMemo(() => {
    let currentGroup = -1;
    return medicoes.map((med, index) => {
      const isContinuationRow = Boolean(
        med.isContinuation ||
        med.parentMedicaoId ||
        (med.numeroMed && (
          med.numeroMed.toUpperCase().includes('(CONT') ||
          med.numeroMed.toUpperCase().includes('CONT.') ||
          med.numeroMed.toUpperCase().includes('CONTINUA')
        )) ||
        (med.descricao && (
          med.descricao.toUpperCase().includes('(CONT') ||
          med.descricao.toUpperCase().includes('CONT.')
        ))
      );

      if (!isContinuationRow) {
        currentGroup++;
      }

      return {
        med,
        index,
        isContinuationRow,
        groupIndex: Math.max(0, currentGroup),
      };
    });
  }, [medicoes]);

  // Modals for editing observation & linked empenho
  const [medicaoForObs, setMedicaoForObs] = useState<Medicao | null>(null);
  const [isEditObsModalOpen, setIsEditObsModalOpen] = useState(false);

  const [despachoNgerMedicao, setDespachoNgerMedicao] = useState<Medicao | null>(null);
  const [isDespachoNgerOpen, setIsDespachoNgerOpen] = useState(false);

  const [medicaoForLink, setMedicaoForLink] = useState<Medicao | null>(null);
  const [selectedEmpenhoForLink, setSelectedEmpenhoForLink] = useState<string>('');
  const [isEditLinkModalOpen, setIsEditLinkModalOpen] = useState(false);

  // Modal for editing the whole medicao
  const [medicaoToEdit, setMedicaoToEdit] = useState<Medicao | null>(null);
  const [isEditMedicaoModalOpen, setIsEditMedicaoModalOpen] = useState(false);

  // Ordem de Serviço (OS) state & handlers
  const [isOsModalOpen, setIsOsModalOpen] = useState(false);
  const [osToEdit, setOsToEdit] = useState<OrdemServico | null>(null);

  // Documento anexo por Nota de Empenho
  const [anexoModalEmpenhoId, setAnexoModalEmpenhoId] = useState<string | null>(null);
  const [attachingEmpenhoId, setAttachingEmpenhoId] = useState<string | null>(null);
  const empenhoAnexoInputRef = useRef<HTMLInputElement>(null);

  const selectedAnexoEmpenho = React.useMemo(
    () => (anexoModalEmpenhoId ? empenhos.find((e) => e.id === anexoModalEmpenhoId) || null : null),
    [anexoModalEmpenhoId, empenhos]
  );

  const handleAttachFileToEmpenho = async (targetEmp: Empenho, file: File) => {
    if (!onUpdateContract) return;
    const anexoId =
      targetEmp.anexoId || buildEmpenhoAnexoId(contrato.numero || contrato.id, targetEmp.id);
    const meta = await saveEmpenhoAttachment(anexoId, file);
    const updatedEmpenhos = empenhos.map((e) =>
      e.id === targetEmp.id
        ? {
            ...e,
            anexoId: meta.anexoId,
            anexoNome: meta.anexoNome,
            anexoTipo: meta.anexoTipo,
            anexoTamanho: meta.anexoTamanho,
            anexoAtualizadoEm: meta.anexoAtualizadoEm,
          }
        : e
    );
    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
    });
    setAnexoModalEmpenhoId(targetEmp.id);
  };

  const handleRemoveEmpenhoAttachment = async (targetEmp: Empenho) => {
    const anexoId =
      targetEmp.anexoId || buildEmpenhoAnexoId(contrato.numero || contrato.id, targetEmp.id);
    await deleteEmpenhoAttachment(anexoId);
    if (!onUpdateContract) return;
    const updatedEmpenhos = empenhos.map((e) => {
      if (e.id !== targetEmp.id) return e;
      const next = { ...e };
      delete next.anexoId;
      delete next.anexoNome;
      delete next.anexoTipo;
      delete next.anexoTamanho;
      delete next.anexoAtualizadoEm;
      return next;
    });
    onUpdateContract({
      ...contrato,
      empenhos: updatedEmpenhos,
    });
  };

  const handleEmpenhoAnexoInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetId = attachingEmpenhoId;
    setAttachingEmpenhoId(null);
    if (!file || !targetId) return;
    const targetEmp = empenhos.find((emp) => emp.id === targetId);
    if (!targetEmp) return;
    try {
      await handleAttachFileToEmpenho(targetEmp, file);
    } catch (err) {
      console.error('Erro ao anexar documento do empenho:', err);
    }
  };

  const handleOpenNovaOs = () => {
    setOsToEdit(null);
    setIsOsModalOpen(true);
  };

  const handleEditOs = (os: OrdemServico) => {
    setOsToEdit(os);
    setIsOsModalOpen(true);
  };

  const handleSaveOs = (savedOs: OrdemServico) => {
    if (!onUpdateContract) return;
    const existingIndex = ordensServico.findIndex((o) => o.id === savedOs.id);
    let updatedList: OrdemServico[];
    if (existingIndex >= 0) {
      updatedList = ordensServico.map((o) => (o.id === savedOs.id ? savedOs : o));
    } else {
      updatedList = [...ordensServico, savedOs];
    }
    onUpdateContract({
      ...contrato,
      ordensServico: updatedList,
    });
  };

  const handleDeleteOs = (osId: string) => {
    if (!onUpdateContract) return;
    const updatedList = ordensServico.filter((o) => o.id !== osId);
    onUpdateContract({
      ...contrato,
      ordensServico: updatedList,
    });
  };

  // Check if a medicao matches any pagamento in contrato.pagamentos
  // REGRA: O pagamento só pertence à medição quando o SIGADOC / Protocolo for igual ao da medição.
  const getMatchingPagamentosForMedicao = (param?: Medicao | string) => {
    if (!param || !contrato.pagamentos || contrato.pagamentos.length === 0) return [];

    if (typeof param === 'string') {
      const targetSig = normalizeSigadoc(param);
      if (!targetSig) return [];
      return contrato.pagamentos.filter((pag) => {
        const pagSig = getSigadocFromPagamento(pag);
        return isSameSigadoc(targetSig, pagSig);
      });
    }

    const med = param;
    return contrato.pagamentos.filter((pag) => isPagamentoOfMedicao(pag, med));
  };

  return (
    <div className="space-y-6">
      {/* GRID: NOTAS DE EMPENHO (1) E ORDENS DE SERVIÇO (2) LADO A LADO - DISCRETO E SEM SCROLL HORIZONTAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* SECTION 1: NOTAS DE EMPENHO VINCULADAS */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1 bg-blue-50 text-blue-600 rounded shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide truncate">
                    NOTAS DE EMPENHO
                  </h3>
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                    {empenhos.length}
                  </span>
                </div>
                <p className="text-[9.5px] text-slate-400 font-semibold uppercase mt-0.5 truncate">
                  NOTAS DE EMPENHO VINCULADAS AO CONTRATO
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={onOpenNovoEmpenho}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-95 text-white text-[10.5px] font-semibold uppercase rounded transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                <span>EMPENHO</span>
              </button>
            </div>
          </div>

          {/* Table / Empty State */}
          <div className="max-h-[280px] overflow-y-auto overflow-x-auto custom-table-scrollbar">
            <table className="w-full text-left text-xs border-collapse table-auto min-w-[650px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-slate-700 font-bold uppercase text-[9.5px] border-b border-slate-200 shadow-2xs">
                  <th className="py-2 px-2.5 bg-slate-50 w-28 whitespace-nowrap">Nº EMP</th>
                  <th className="py-2 px-3 bg-slate-50 min-w-[190px] w-52 whitespace-nowrap">PROCESSO</th>
                  <th className="py-2 px-2 bg-slate-50 w-32 whitespace-nowrap">REGIÃO</th>
                  <th className="py-2 px-2 text-right bg-slate-50 w-28 whitespace-nowrap">VALOR</th>
                  <th className="py-2 px-2 text-right bg-slate-50 w-28 whitespace-nowrap">SALDO DISP.</th>
                  <th className="py-2 px-1 text-center w-20 bg-slate-50 whitespace-nowrap">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {empenhos.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-[11px] text-slate-400 uppercase font-medium"
                    >
                      NENHUMA NOTA DE EMPENHO VINCULADA.
                    </td>
                  </tr>
                ) : (
                  empenhos.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-800 text-[12px] whitespace-nowrap">
                        {emp.numeroEmp}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-700 text-[12px] whitespace-nowrap min-w-[190px]">
                        {emp.numeroProcesso || '-'}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {onUpdateEmpenhoRegiao ? (
                          <input
                            type="text"
                            value={emp.regiao ?? ''}
                            placeholder="GERAL"
                            onChange={(e) => onUpdateEmpenhoRegiao(emp.id, e.target.value.toUpperCase())}
                            onBlur={() => {
                              if (!emp.regiao || !emp.regiao.trim()) {
                                onUpdateEmpenhoRegiao(emp.id, 'GERAL');
                              } else {
                                onUpdateEmpenhoRegiao(emp.id, emp.regiao.trim());
                              }
                            }}
                            style={{
                              fieldSizing: 'content' as any,
                              width: `${Math.max((emp.regiao || 'GERAL').length + 1.2, 5.5)}ch`,
                            }}
                            className="bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 text-[11.5px] font-medium uppercase text-slate-800 outline-none transition-all min-w-[55px] max-w-[320px]"
                            title="Região do empenho"
                          />
                        ) : (
                          <span className="text-slate-700 font-medium uppercase text-[11.5px] whitespace-nowrap block" title={emp.regiao || 'GERAL'}>
                            {emp.regiao || 'GERAL'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-blue-700 text-[12px] whitespace-nowrap">
                        {formatCurrency(emp.valorTotal)}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <div className="font-bold text-emerald-700 text-[12px]">
                          {formatCurrency(getSaldoDisponivelAposMedicao(emp))}
                        </div>
                        <div
                          className="text-[10.5px] text-slate-400 font-mono tracking-tight"
                          title="Saldo do empenho na Coluna BM"
                        >
                          {formatCurrency(getSaldoEmpenhoBM(emp))}
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center w-20">
                        <div className="flex items-center justify-center gap-1">
                          {(() => {
                            const hasAnexo = Boolean(emp.anexoNome || emp.anexoId);
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (hasAnexo) {
                                    setAnexoModalEmpenhoId(emp.id);
                                  } else {
                                    setAttachingEmpenhoId(emp.id);
                                    empenhoAnexoInputRef.current?.click();
                                  }
                                }}
                                title={
                                  hasAnexo
                                    ? `Visualizar / baixar empenho anexado (${emp.anexoNome || 'documento'})`
                                    : 'Anexar documento do empenho (PDF ou imagem)'
                                }
                                className={
                                  hasAnexo
                                    ? 'p-1 text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors cursor-pointer'
                                    : 'p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors cursor-pointer'
                                }
                              >
                                {hasAnexo ? (
                                  <FileCheck2 className="w-3.5 h-3.5" />
                                ) : (
                                  <Paperclip className="w-3.5 h-3.5" />
                                )}
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={() => onEditEmpenho(emp)}
                            title="Editar Empenho"
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteEmpenho(emp.id)}
                            title="Excluir Empenho"
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: ORDENS DE SERVIÇO (OS) */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1 bg-blue-50 text-blue-700 rounded shrink-0">
                <FileCheck className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide truncate">
                    ORDENS DE SERVIÇO (OS)
                  </h3>
                  <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                    {ordensServico.length}
                  </span>
                </div>
                <p className="text-[9.5px] text-slate-400 font-semibold uppercase mt-0.5 truncate">
                  REGISTRADAS ANTES DAS MEDIÇÕES (SOENG/SAAS)
                </p>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleOpenNovaOs}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#1e3a8a] hover:bg-blue-900 active:scale-95 text-white text-[10.5px] font-semibold uppercase rounded transition-all cursor-pointer shadow-2xs"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                <span>LANÇAR OS</span>
              </button>
            </div>
          </div>

          {/* Table / Empty State */}
          <div className="max-h-[280px] overflow-y-auto overflow-x-hidden custom-table-scrollbar">
            <table className="w-full text-left text-xs border-collapse table-auto">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-slate-700 font-bold uppercase text-[9.5px] border-b border-slate-200 shadow-2xs">
                  <th className="py-2 px-2.5 bg-slate-50">Nº DA OS</th>
                  <th className="py-2 px-2 bg-slate-50">EMISSÃO</th>
                  <th className="py-2 px-2 text-right bg-slate-50">
                    <div>VALOR TOTAL</div>
                    <div className="text-[8.5px] text-emerald-700 font-bold tracking-tight">SALDO DA OS</div>
                  </th>
                  <th className="py-2 px-1 text-center w-14 bg-slate-50">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordensServico.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-[11px] text-slate-400 uppercase font-medium"
                    >
                      NENHUMA ORDEM DE SERVIÇO LANÇADA.
                    </td>
                  </tr>
                ) : (
                  ordensServico.map((os) => {
                    const { totalMedido, saldo } = getOsMedicaoStats(os);
                    return (
                      <tr key={os.id} className="hover:bg-slate-50/80 transition-colors">
                        <td
                          className="py-2 px-2.5 font-mono font-bold text-slate-800 text-[10.5px] truncate max-w-[150px]"
                          title={os.numeroOs}
                        >
                          {os.numeroOs}
                        </td>
                        <td className="py-2 px-2 text-slate-600 text-[10.5px] whitespace-nowrap">
                          {os.dataEmissao || '-'}
                        </td>
                        <td className="py-2 px-2 text-right whitespace-nowrap">
                          <div className="font-bold text-blue-700 text-[10.5px]">
                            {formatCurrency(os.valorTotal)}
                          </div>
                          <div
                            className={`font-mono font-bold text-[9.5px] tracking-tight ${
                              saldo > 0
                                ? 'text-emerald-700'
                                : saldo < 0
                                ? 'text-red-700'
                                : 'text-slate-500'
                            }`}
                            title={`Saldo da OS: ${formatCurrency(saldo)} (Medições originais: ${formatCurrency(totalMedido)})`}
                          >
                            {formatCurrency(saldo)}
                          </div>
                        </td>
                        <td className="py-2 px-1 text-center w-14">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditOs(os)}
                              title="Editar Ordem de Serviço (ver todas as informações)"
                              className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOs(os.id)}
                              title="Excluir Ordem de Serviço"
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECTION 2: HISTÓRICO DE MEDIÇÕES LANÇADAS - DISCRETO E REFINADO */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        {/* Header - Discreto e harmonioso com as demais seções */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1 bg-slate-100 text-slate-600 rounded shrink-0">
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide truncate">
                  {isIndenizacao ? 'HISTÓRICO DE NF LANÇADAS' : 'HISTÓRICO DE MEDIÇÕES LANÇADAS'}
                </h3>
                <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                  {medicoes.length}
                </span>
              </div>
              <p className="text-[9.5px] text-slate-400 font-semibold uppercase mt-0.5 truncate">
                HISTÓRICO DE TODAS AS MEDIÇÕES REGISTRADAS PARA ESTE CONTRATO
              </p>
            </div>
          </div>

          {/* Action Buttons - Discretos (Vermelhos acompanhando a janela de lançamento) */}
          <div className="flex items-center gap-1.5 shrink-0 self-start md:self-auto">
            <button
              onClick={onOpenNovaMedicao}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#dc2626] hover:bg-[#b91c1c] active:scale-95 text-white text-[10.5px] font-semibold uppercase rounded transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-3 h-3 stroke-[2.5]" />
              <span>{isIndenizacao ? 'LANÇAR NF' : 'LANÇAR MEDIÇÃO'}</span>
            </button>
          </div>
        </div>

        {/* Table / Empty State with custom scrollbar */}
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto custom-table-scrollbar">
          <table className="w-full text-left text-xs border-collapse min-w-[1650px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-slate-600 font-bold uppercase text-[9.5px] tracking-wider border-b border-slate-200 shadow-2xs">
                <th className="py-2.5 px-3 w-48 min-w-[180px] bg-slate-50 whitespace-nowrap">SIGADOC</th>
                <th className="py-2.5 px-3 w-36 bg-slate-50 whitespace-nowrap">LOCAL/CIDADE</th>
                <th className="py-2.5 px-3 w-96 min-w-[380px] max-w-lg bg-slate-50">DESCRIÇÃO</th>
                <th className="py-2.5 px-3.5 w-48 min-w-[185px] bg-slate-50 whitespace-nowrap text-slate-700">NOTA FISCAL</th>
                <th className="py-2.5 px-3 w-56 bg-slate-50 whitespace-nowrap">EMPENHO VINCULADO</th>
                <th className="py-2 px-3 text-right w-36 bg-slate-50 whitespace-nowrap">
                  <div className="flex flex-col items-end leading-tight">
                    <span>{isIndenizacao ? 'VALOR DA NF' : 'VALOR DA MEDIÇÃO'}</span>
                    {!isIndenizacao && (
                      <span className="text-[8.5px] font-bold text-emerald-600 tracking-normal normal-case">
                        Medição Pendente
                      </span>
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center w-16 bg-slate-50 whitespace-nowrap">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="border-b border-slate-200">
              {medicoesWithGroup.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-xs text-slate-400 uppercase font-medium"
                  >
                    NENHUMA MEDIÇÃO LANÇADA PARA ESTE CONTRATO.
                  </td>
                </tr>
              ) : (
                medicoesWithGroup.map(({ med, index, isContinuationRow, groupIndex }) => {
                  const isEvenGroup = groupIndex % 2 === 0;
                  const rowBg = isEvenGroup ? "bg-white" : "bg-slate-100/80";
                  const rowHover = isEvenGroup ? "hover:bg-blue-50/40" : "hover:bg-blue-100/40";
                  const rowBorder = isContinuationRow
                    ? "border-t border-slate-200/70 border-dashed"
                    : index > 0
                    ? "border-t-2 border-slate-300"
                    : "";

                  const isLinked = Boolean(
                    med.empenhoVinculado &&
                      med.empenhoVinculado.trim() !== '' &&
                      med.empenhoVinculado.toUpperCase() !== 'SEM EMPENHO' &&
                      med.empenhoVinculado !== '-' &&
                      !med.empenhoVinculado.includes('R$') &&
                      !/^\s*R?\$?\s*[\d.,]+\s*$/.test(med.empenhoVinculado)
                  );

                  const matchingPagamentos = getMatchingPagamentosForMedicao(med);
                  const primaryPagamento = matchingPagamentos[0];
                  const totalPagoProcesso = matchingPagamentos.reduce((acc, p) => acc + (p.valorBruto || 0), 0);
                  const isPagamentoTotal = matchingPagamentos.length > 0 && totalPagoProcesso >= (med.valorMedicao - 0.01);

                  return (
                    <tr
                      key={med.id}
                      onClick={() => {
                        setMedicaoToEdit(med);
                        setIsEditMedicaoModalOpen(true);
                      }}
                      title="Clique em qualquer parte da linha para editar esta medição"
                      className={`${rowBg} ${rowHover} ${rowBorder} transition-colors cursor-pointer`}
                    >
                      {/* 1. SIGADOC com Medição e Período abaixo (vazio se for linha de continuação) */}
                      <td className="py-2.5 px-3 w-48 min-w-[180px] whitespace-nowrap">
                        {!isContinuationRow ? (
                          <div className="space-y-0.5">
                            <span className="font-mono text-slate-800 font-semibold text-[11px] select-text whitespace-nowrap block">
                              {med.sigadoc || '-'}
                            </span>
                            {!isIndenizacao && (
                              <div className="text-[10px] text-slate-700 select-text leading-tight">
                                Medição: <span className="font-bold text-slate-800">{formatNumeroMedicao(med.numeroMed) || med.numeroMed}</span>
                              </div>
                            )}
                            {isIndenizacao && med.numeroTac ? (
                              <div className="text-[9.5px] text-slate-500 font-normal select-text leading-tight">
                                TAC: <span className="text-slate-700">{med.numeroTac.replace(/^TAC\s*[:\-]?\s*/i, '').trim()}</span>
                              </div>
                            ) : null}
                            {(med.periodo || (isIndenizacao && med.periodoTac)) ? (
                              <div className="text-[9.5px] text-slate-500 font-normal leading-tight">
                                {isIndenizacao ? 'Período apurado:' : 'Período:'} <span className="text-slate-700">{med.periodo || med.periodoTac}</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>

                      {/* 2. LOCAL/CIDADE (vazio se for linha de continuação) */}
                      <td className="py-2.5 px-3 text-slate-700 uppercase font-medium text-[11px]">
                        {!isContinuationRow ? med.unidadeCidade : null}
                      </td>

                      {/* 3. DESCRIÇÃO (vazio se for linha de continuação) */}
                      <td className="py-2.5 px-3 text-slate-600 uppercase text-[11px] leading-relaxed w-96 min-w-[380px] max-w-lg break-words whitespace-normal" title={!isContinuationRow ? med.descricao : undefined}>
                        {!isContinuationRow ? med.descricao : null}
                      </td>

                      {/* 4. NOTA FISCAL (vazio se for linha de continuação) */}
                      <td className="py-2.5 px-3.5 text-[11px] whitespace-nowrap text-slate-800">
                        {!isContinuationRow ? (
                          med.numeroNf || med.dataEmissaoNf || med.dataAtesto ? (
                            <div className="space-y-0.5">
                              {med.numeroNf ? (
                                <span className="font-mono font-bold text-slate-800 text-[11px]">
                                  NF {med.numeroNf}
                                </span>
                              ) : null}
                              {med.dataEmissaoNf ? (
                                <div className="text-[10px] text-slate-500 font-normal">
                                  Emissão: <span className="text-slate-700">{med.dataEmissaoNf}</span>
                                </div>
                              ) : null}
                              {med.dataAtesto ? (
                                <div className="text-[10px] text-slate-500 font-normal">
                                  Atesto: <span className="text-slate-700">{med.dataAtesto}</span>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">-</span>
                          )
                        ) : null}
                      </td>

                      {/* 8. EMPENHO VINCULADO (com seta curva alinhada à esquerda para manter a caixa alinhada com a de cima) */}
                      <td className={isContinuationRow ? "py-1.5 px-3" : "py-2.5 px-3"}>
                        <div className="relative">
                          {isContinuationRow && (
                            <div
                              className="absolute -left-5 top-1.5 text-slate-400 pointer-events-none"
                              title="Empenho complementar da medição"
                            >
                              <svg
                                className="w-4 h-4 text-slate-400 stroke-[2]"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="15 10 20 15 15 20" />
                                <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                              </svg>
                            </div>
                          )}
                          {isLinked ? (
                            <div className="space-y-1">
                            {med.empenhoVinculado === 'Pago pela UO da SESP' ? (
                              <div className="bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0] rounded-md px-2.5 py-1.5 inline-flex items-center justify-between gap-2 min-w-[210px] text-left shadow-2xs">
                                <span className="font-bold text-[11px] text-emerald-900 leading-tight">
                                  Pago pela UO da SESP
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUnlinkEmpenhoFromMedicao(med.id);
                                  }}
                                  title="Desvincular"
                                  className="text-emerald-700 hover:text-red-700 p-0.5 rounded hover:bg-emerald-200/60 transition-colors cursor-pointer shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : isContinuationRow ? (
                              // Caixa compacta e discreta para o empenho complementar (sem destaque pesado)
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMedicaoForLink(med);
                                  setSelectedEmpenhoForLink(med.empenhoVinculado);
                                  setIsEditLinkModalOpen(true);
                                }}
                                className="bg-slate-50 hover:bg-slate-100/90 text-slate-600 border border-slate-200 hover:border-slate-300 rounded px-2 py-0.5 inline-flex flex-col gap-0.2 min-w-[195px] text-left cursor-pointer group transition-all"
                                title="Empenho complementar - clique para alterar o valor descontado"
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="font-mono font-semibold text-[10.5px] text-slate-600 leading-tight group-hover:underline">
                                    {med.empenhoVinculado}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUnlinkEmpenhoFromMedicao(med.id);
                                      }}
                                      title="Desvincular Empenho Complementar"
                                      className="text-slate-400 hover:text-red-600 p-0.5 rounded hover:bg-slate-200/60 transition-colors cursor-pointer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <div className="text-[9.5px] font-medium text-slate-400 leading-tight">
                                  DESC: {formatCurrency(med.valorDescontadoEmpenho ?? med.valorMedicao)}
                                </div>
                              </div>
                            ) : (
                              // Caixa azul em destaque para a medição principal
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMedicaoForLink(med);
                                  setSelectedEmpenhoForLink(med.empenhoVinculado);
                                  setIsEditLinkModalOpen(true);
                                }}
                                className="bg-[#dbeafe] hover:bg-[#d0e3ff] text-[#1e40af] border border-[#bfdbfe] hover:border-blue-400 rounded-md px-2.5 py-1 inline-flex flex-col gap-0.5 min-w-[210px] text-left shadow-2xs cursor-pointer group transition-all"
                                title="Clique para alterar o valor descontado deste empenho"
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="font-mono font-bold text-[12px] text-blue-900 leading-tight group-hover:underline">
                                    {med.empenhoVinculado}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUnlinkEmpenhoFromMedicao(med.id);
                                      }}
                                      title="Desvincular Empenho"
                                      className="text-blue-600 hover:text-red-700 p-0.5 rounded hover:bg-blue-200/60 transition-colors cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="text-[10px] font-bold text-blue-700 leading-tight">
                                  DESC: {formatCurrency(med.valorDescontadoEmpenho ?? med.valorMedicao)}
                                </div>
                              </div>
                            )}

                            {/* Observation note under linked empenho */}
                            {med.observacao && med.empenhoVinculado !== 'Pago pela UO da SESP' ? (
                              <div className="mt-1 max-w-[220px]">
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMedicaoForObs(med);
                                    setIsEditObsModalOpen(true);
                                  }}
                                  className="bg-amber-50/80 hover:bg-amber-100/70 border border-amber-200 text-amber-900 rounded px-2 py-0.5 text-[10px] flex items-center justify-between gap-1 shadow-2xs font-medium cursor-pointer transition-colors"
                                  title="Clique para editar a observação (consta na Aba Pendências)"
                                >
                                  <div className="flex items-center gap-1 truncate">
                                    <FileText className="w-3 h-3 text-amber-700 shrink-0" />
                                    <span className="truncate uppercase font-bold text-[9.5px]">
                                      OBS: {med.observacao}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdateMedicaoObservation(med.id, '');
                                    }}
                                    title="Remover Observação"
                                    className="text-amber-800 hover:text-red-700 p-0.5 rounded transition-colors cursor-pointer shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>

                                {(med.observacao.toUpperCase().includes('NGER') ||
                                  med.observacao.toUpperCase().includes('SOLICITAR EMPENHO')) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDespachoNgerMedicao(med);
                                      setIsDespachoNgerOpen(true);
                                    }}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-[#d97706] hover:bg-[#b45309] active:scale-95 text-white rounded text-[9.5px] font-bold uppercase transition-all cursor-pointer shadow-2xs mt-1 w-full justify-center"
                                    title="Abrir Despacho NGER com os dados desta medição"
                                  >
                                    <FileText className="w-3 h-3 text-amber-100" />
                                    <span>Despacho NGER</span>
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          // Select dropdown and observation badge for unlinked row (Row 5 in print)
                          <div className="space-y-1 min-w-[220px] max-w-[250px]">
                            <select
                              value=""
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                const chosen = e.target.value;
                                if (chosen) {
                                  if (chosen === 'Pago pela UO da SESP') {
                                    onLinkEmpenhoToMedicao(med.id, chosen, 0);
                                  } else {
                                    setMedicaoForLink(med);
                                    setSelectedEmpenhoForLink(chosen);
                                    setIsEditLinkModalOpen(true);
                                  }
                                }
                              }}
                              className={
                                isContinuationRow
                                  ? "w-full text-[10.5px] font-medium text-slate-600 bg-slate-50/80 border border-slate-200 hover:border-slate-300 rounded px-2 py-0.5 focus:ring-1 focus:ring-slate-400 outline-none cursor-pointer shadow-none min-w-[195px] max-w-[240px]"
                                  : "w-full text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-600 outline-none cursor-pointer shadow-2xs min-w-[220px] max-w-[250px]"
                              }
                            >
                              <option value="" disabled>
                                {isContinuationRow ? "SELECIONAR EMPENHO..." : "SELECIONAR EMPENHO..."}
                              </option>
                              <option value="Pago pela UO da SESP" className="font-bold text-emerald-800">
                                Pago pela UO da SESP
                              </option>
                              {empenhos
                                .map((emp) => {
                                  const disp = getSaldoDisponivelAposMedicao(emp);
                                  return { emp, disp };
                                })
                                .filter(({ disp }) => disp > 0)
                                .map(({ emp, disp }) => (
                                  <option key={emp.id} value={emp.numeroEmp}>
                                    {emp.numeroEmp} (Disp: {formatCurrency(disp)})
                                  </option>
                                ))}
                            </select>

                            {/* Observation note badge matching print */}
                            {med.observacao ? (
                              <div className="space-y-1">
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="bg-amber-50/80 border border-amber-200 text-amber-900 rounded px-2 py-0.5 text-[10px] flex items-center justify-between gap-1 shadow-2xs font-medium"
                                >
                                  <div className="flex items-center gap-1 truncate" title={med.observacao}>
                                    <FileText className="w-3 h-3 text-amber-700 shrink-0" />
                                    <span className="truncate uppercase font-bold text-[9.5px]">
                                      OBS: {med.observacao}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMedicaoForObs(med);
                                        setIsEditObsModalOpen(true);
                                      }}
                                      title="Editar Observação"
                                      className="p-0.5 text-amber-800 hover:text-amber-950 rounded cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateMedicaoObservation(med.id, '');
                                      }}
                                      title="Excluir Observação"
                                      className="p-0.5 text-amber-800 hover:text-red-700 rounded cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {(med.observacao.toUpperCase().includes('NGER') ||
                                  med.observacao.toUpperCase().includes('SOLICITAR EMPENHO')) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDespachoNgerMedicao(med);
                                      setIsDespachoNgerOpen(true);
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-[#d97706] hover:bg-[#b45309] active:scale-95 text-white rounded text-[10px] font-bold uppercase transition-all cursor-pointer shadow-2xs w-full justify-center"
                                    title="Abrir Despacho NGER com os dados desta medição"
                                  >
                                    <FileText className="w-3 h-3 text-amber-100" />
                                    <span>Despacho NGER</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMedicaoForObs(med);
                                  setIsEditObsModalOpen(true);
                                }}
                                className="border border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-800 font-bold px-2 py-0.5 text-[9.5px] rounded flex items-center gap-1 shadow-2xs transition-colors cursor-pointer uppercase"
                              >
                                <FileText className="w-3 h-3 text-amber-700" />
                                <span>+ ESCREVER OBSERVAÇÃO</span>
                              </button>
                            )}
                          </div>
                        )}
                        </div>
                      </td>

                      {/* VALOR DA MEDIÇÃO com Medição Pendente na parte de baixo */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span
                            className={
                              isContinuationRow
                                ? "font-normal text-slate-400 whitespace-nowrap text-[10.5px] font-mono leading-tight"
                                : "font-black text-slate-900 whitespace-nowrap text-[12px] font-mono tracking-tight leading-tight"
                            }
                          >
                            {formatCurrency(med.valorMedicao)}
                          </span>
                          <div className="leading-tight mt-0.5">
                            {med.empenhoVinculado === 'Pago pela UO da SESP' ? (
                              <span
                                title="Medição Pendente: R$ 0,00"
                                className={isContinuationRow ? "font-mono font-medium text-emerald-600/70 text-[9.5px]" : "font-mono font-bold text-emerald-600 text-[10px]"}
                              >
                                R$ 0,00
                              </span>
                            ) : isLinked &&
                              med.valorDescontadoEmpenho !== undefined &&
                              med.valorDescontadoEmpenho > 0 &&
                              med.valorMedicao - med.valorDescontadoEmpenho > 0.01 ? (
                              <span title="Medição Pendente: -" className="text-slate-400 font-bold text-[10px]">-</span>
                            ) : isLinked ? (
                              <span
                                title="Medição Pendente: R$ 0,00"
                                className={isContinuationRow ? "font-mono font-medium text-emerald-600/70 text-[9.5px]" : "font-mono font-bold text-emerald-600 text-[10px]"}
                              >
                                R$ 0,00
                              </span>
                            ) : med.valorPendente && med.valorPendente > 0 ? (
                              <span
                                title={`Medição Pendente: ${formatCurrency(med.valorPendente)}`}
                                className={isContinuationRow ? "font-mono font-medium text-[#ea580c] text-[9.5px]" : "font-mono font-bold text-[#ea580c] text-[10px]"}
                              >
                                {formatCurrency(med.valorPendente)}
                              </span>
                            ) : med.medicaoPendente && (!med.empenhoVinculado || med.empenhoVinculado.toUpperCase() === 'SEM EMPENHO') ? (
                              <span
                                title={`Medição Pendente: ${formatCurrency(med.valorMedicao)}`}
                                className={isContinuationRow ? "font-mono font-medium text-[#ea580c] text-[9.5px]" : "font-mono font-bold text-[#ea580c] text-[10px]"}
                              >
                                {formatCurrency(med.valorMedicao)}
                              </span>
                            ) : (
                              <span
                                title="Medição Pendente: R$ 0,00"
                                className={isContinuationRow ? "font-mono font-medium text-emerald-600/70 text-[9.5px]" : "font-mono font-bold text-emerald-600 text-[10px]"}
                              >
                                R$ 0,00
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* AÇÕES (Pagamento sobre Observação, Editar sobre Excluir) */}
                      <td className={isContinuationRow ? "py-1.5 px-2 text-center" : "py-2 px-2 text-center"}>
                        <div className={isContinuationRow ? "flex items-center justify-center gap-1 opacity-70 hover:opacity-100 transition-opacity" : "flex items-center justify-center gap-1"}>
                          {/* Coluna 1: Pagamento em cima, Observação embaixo */}
                          <div className="flex flex-col items-center gap-0.5">
                            {med.empenhoVinculado !== 'Pago pela UO da SESP' && primaryPagamento ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigateToPagamento?.(primaryPagamento.id);
                                }}
                                title={
                                  isPagamentoTotal
                                    ? `Pagamento Total (${formatCurrency(totalPagoProcesso)} de ${formatCurrency(med.valorMedicao)}) - OB: ${primaryPagamento.ordemBancaria}`
                                    : `Pagamento Parcial (${formatCurrency(totalPagoProcesso)} de ${formatCurrency(med.valorMedicao)}) - OB: ${primaryPagamento.ordemBancaria}`
                                }
                                className={`p-1 active:scale-95 rounded transition-all cursor-pointer ${
                                  isPagamentoTotal
                                    ? 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                                    : 'text-orange-500 hover:text-orange-700 hover:bg-orange-50'
                                }`}
                              >
                                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
                              </button>
                            ) : (
                              <div className="w-5 h-5" />
                            )}

                            {med.empenhoVinculado !== 'Pago pela UO da SESP' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMedicaoForObs(med);
                                  setIsEditObsModalOpen(true);
                                }}
                                title={
                                  med.observacao
                                    ? `Observação: ${med.observacao} (consta na Aba Pendências)`
                                    : 'Inserir Observação (aparecerá na Aba Pendências)'
                                }
                                className={`p-1 active:scale-95 rounded transition-all cursor-pointer relative ${
                                  med.observacao
                                    ? 'text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-300'
                                    : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                }`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                {med.observacao && (
                                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full" />
                                )}
                              </button>
                            ) : null}
                          </div>

                          {/* Coluna 2: Editar em cima, Excluir embaixo */}
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMedicaoToEdit(med);
                                setIsEditMedicaoModalOpen(true);
                              }}
                              title={isIndenizacao ? 'Editar' : 'Editar Medição'}
                              className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteMedicao(med.id);
                              }}
                              title={isIndenizacao ? 'Excluir' : 'Excluir Medição'}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Botão opcional de Despacho NGER caso haja observação específica */}
                          {med.observacao &&
                            (med.observacao.toUpperCase().includes('NGER') ||
                              med.observacao.toUpperCase().includes('SOLICITAR EMPENHO')) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDespachoNgerMedicao(med);
                                  setIsDespachoNgerOpen(true);
                                }}
                                title="Visualizar/Imprimir Despacho NGER"
                                className="p-1 active:scale-95 rounded transition-all cursor-pointer text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 shadow-2xs"
                              >
                                <FileText className="w-3.5 h-3.5 text-amber-800 font-bold" />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auxiliary Modals for Observation and Link Editing */}
      <EditObservationModal
        isOpen={isEditObsModalOpen}
        onClose={() => {
          setIsEditObsModalOpen(false);
          setMedicaoForObs(null);
        }}
        onSave={(obs) => {
          if (medicaoForObs) {
            onUpdateMedicaoObservation(medicaoForObs.id, obs);
          }
        }}
        onSaveAndOpenDespacho={(obs) => {
          if (medicaoForObs) {
            onUpdateMedicaoObservation(medicaoForObs.id, obs);
            setDespachoNgerMedicao(medicaoForObs);
            setIsDespachoNgerOpen(true);
          }
        }}
        medicaoNumero={medicaoForObs?.numeroMed || ''}
        currentObservation={medicaoForObs?.observacao}
      />

      {/* Despacho NGER Modal */}
      <DespachoNgerModal
        isOpen={isDespachoNgerOpen}
        onClose={() => {
          setIsDespachoNgerOpen(false);
          setDespachoNgerMedicao(null);
        }}
        contrato={contrato}
        medicaoObj={despachoNgerMedicao}
      />

      <EditMedicaoEmpenhoModal
        isOpen={isEditLinkModalOpen}
        onClose={() => {
          setIsEditLinkModalOpen(false);
          setMedicaoForLink(null);
          setSelectedEmpenhoForLink('');
        }}
        onSave={(medId, empNumero, valorDesc) => {
          onLinkEmpenhoToMedicao(medId, empNumero, valorDesc);
        }}
        medicao={medicaoForLink}
        contrato={contrato}
        initialEmpenhoNumero={selectedEmpenhoForLink}
      />

      {/* Modal to Edit Medicao */}
      <EditMedicaoModal
        isOpen={isEditMedicaoModalOpen}
        onClose={() => {
          setIsEditMedicaoModalOpen(false);
          setMedicaoToEdit(null);
        }}
        onSave={(updatedMed, empenhoDeduction) => {
          if (onUpdateMedicao) {
            onUpdateMedicao(updatedMed, empenhoDeduction);
          }
        }}
        onDelete={(medId) => {
          onDeleteMedicao(medId);
          setIsEditMedicaoModalOpen(false);
          setMedicaoToEdit(null);
        }}
        medicao={medicaoToEdit}
        contrato={contrato}
        onAddNewOs={handleSaveOs}
      />

      {/* Modal to Import Guia EMP do Google Drive */}
      <ImportEmpModal
        isOpen={isImportEmpModalOpen}
        onClose={() => setIsImportEmpModalOpen(false)}
        contrato={contrato}
        onUpdateContract={onUpdateContract}
      />

      {/* Modal to Create/Edit Ordem de Serviço (OS) */}
      <NewOrdemServicoModal
        isOpen={isOsModalOpen}
        onClose={() => {
          setIsOsModalOpen(false);
          setOsToEdit(null);
        }}
        onSave={handleSaveOs}
        contrato={contrato}
        osToEdit={osToEdit}
      />

      {/* Input oculto para anexar documento de Empenho */}
      <input
        ref={empenhoAnexoInputRef}
        type="file"
        accept=".pdf,application/pdf,image/*"
        className="hidden"
        onChange={handleEmpenhoAnexoInputChange}
      />

      {/* Modal para visualizar e baixar documento de Empenho anexado */}
      <EmpenhoAnexoModal
        isOpen={Boolean(selectedAnexoEmpenho)}
        onClose={() => setAnexoModalEmpenhoId(null)}
        empenho={selectedAnexoEmpenho}
        contratoNumero={contrato.numero}
        onReplaceFile={handleAttachFileToEmpenho}
        onRemoveAttachment={handleRemoveEmpenhoAttachment}
      />
    </div>
  );
};
