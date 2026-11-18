import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Users,
  AlertCircle,
  Coins,
  RotateCcw,
  X,
  FileDown,
} from 'lucide-react';
import { FiscalGroup, MedicaoPendenteItem, EmpenhoPendenteItem, SituacaoEmpenho } from '../../types/reports';
import { Contrato } from '../../types/contract';
import { FiscaisReportTab } from '../reports/FiscaisReportTab';
import { MedicoesPendentesTab } from '../reports/MedicoesPendentesTab';
import { ContratosComSaldoReportTab } from '../reports/ContratosComSaldoReportTab';
import { EmpenhosPendentesTab } from '../reports/EmpenhosPendentesTab';
import { DespachoNgerModal } from './DespachoNgerModal';
import { getFiscaisFromContratos } from '../../utils/fiscaisHelper';

function parseDateToTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const trimmed = dateStr.trim();
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const parsed = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`).getTime();
      if (!isNaN(parsed)) return parsed;
    }
  }
  const parsed = new Date(trimmed).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

export type ReportTab =
  | 'FISCAIS'
  | 'MEDICOES_PENDENTES'
  | 'CONTRATO_COM_SALDO'
  | 'EMPENHOS_COM_SALDO';

interface RelatorioGerencialModalProps {
  isOpen: boolean;
  onClose: () => void;
  fiscais?: FiscalGroup[];
  medicoesPendentes: MedicaoPendenteItem[];
  empenhosPendentes?: EmpenhoPendenteItem[];
  contratos: Contrato[];
  filteredContratos?: Contrato[];
  activeSearchTerm?: string;
  selectedContract?: Contrato | null;
  onSelectContractByNumero: (numero: string) => void;
  onLiquidarMedicao: (medicaoId: string) => void;
}

export const RelatorioGerencialModal: React.FC<RelatorioGerencialModalProps> = ({
  isOpen,
  onClose,
  fiscais: propFiscais,
  medicoesPendentes,
  contratos,
  filteredContratos,
  activeSearchTerm,
  selectedContract,
  onSelectContractByNumero,
  onLiquidarMedicao,
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('FISCAIS');
  const [selectedDespachoMedicao, setSelectedDespachoMedicao] = useState<MedicaoPendenteItem | null>(null);
  const [selectedContratoFilter, setSelectedContratoFilter] = useState<string>('ALL');

  // Ao abrir a modal, se houver um contrato selecionado ou buscado no painel (Print 2), pré-seleciona ele
  useEffect(() => {
    if (isOpen) {
      if (selectedContract?.numero) {
        setSelectedContratoFilter(selectedContract.numero);
      } else if (activeSearchTerm && activeSearchTerm.trim() !== '') {
        const term = activeSearchTerm.trim().toLowerCase();
        if (filteredContratos && filteredContratos.length === 1) {
          setSelectedContratoFilter(filteredContratos[0].numero);
        } else if (filteredContratos && filteredContratos.length > 0) {
          const exact = filteredContratos.find(
            (c) =>
              c.numero.toLowerCase() === term ||
              c.numero.toLowerCase().includes(term) ||
              c.razaoSocial.toLowerCase().includes(term)
          );
          if (exact) {
            setSelectedContratoFilter(exact.numero);
          } else {
            setSelectedContratoFilter(filteredContratos[0].numero);
          }
        } else {
          setSelectedContratoFilter('ALL');
        }
      } else {
        setSelectedContratoFilter('ALL');
      }
    }
  }, [isOpen, selectedContract?.numero, activeSearchTerm, filteredContratos]);

  // Fiscais calculados exclusivamente a partir dos contratos cadastrados no painel principal
  const fiscaisAtivos = useMemo(() => {
    return getFiscaisFromContratos(contratos);
  }, [contratos]);

  const contratosComSaldo = useMemo(() => {
    return (contratos || []).filter((c) => (c.saldoContrato ?? 0) > 0);
  }, [contratos]);

  // Consolidação de Empenhos com Saldo exclusivamente a partir dos contratos cadastrados no sistema
  const empenhosComSaldo = useMemo(() => {
    const fromContratos: EmpenhoPendenteItem[] = [];
    const seenEmpKeys = new Set<string>();
    const seenContractNumbers = new Set<string>();

    (contratos || []).forEach((c) => {
      // Garantir que o contrato existe e possui identificação
      if (!c.numero) return;
      const contratoNum = c.numero.trim();

      // Evitar contratos duplicados caso haja registros repetidos no estado
      if (seenContractNumbers.has(contratoNum)) return;
      seenContractNumbers.add(contratoNum);

      (c.empenhos || []).forEach((emp, empIdx) => {
        // Obter saldo do empenho cadastrado
        const saldo = typeof emp.saldoDisponivel === 'number'
          ? emp.saldoDisponivel
          : typeof emp.saldoEmpenho === 'number'
            ? emp.saldoEmpenho
            : (emp.valorTotal || 0);

        // Apenas empenhos com saldo positivo cadastrados nos contratos do sistema
        if (saldo > 0) {
          const empNum = emp.numeroEmp?.trim() || '';
          const procNum = emp.numeroProcesso?.trim() || '';

          // Chave única para o empenho para evitar duplicações
          const empUniqueKey = `${contratoNum}__${emp.id || empNum || empIdx}`;
          if (seenEmpKeys.has(empUniqueKey)) return;
          seenEmpKeys.add(empUniqueKey);

          // Medições vinculadas a este empenho dentro do contrato
          const medicoesDoEmp = (c.medicoes || []).filter((m) => {
            const v = m.empenhoVinculado?.trim();
            if (!v) return false;
            return (
              (empNum && v === empNum) ||
              (procNum && v === procNum) ||
              (empNum && v.replace(/[^\d]/g, '') === empNum.replace(/[^\d]/g, ''))
            );
          });

          let diasSemMed = 0;
          let situacao: SituacaoEmpenho = 'NAO_UTILIZADO';

          const isExercicioAnterior =
            empNum.includes('.24.') ||
            empNum.includes('.25.') ||
            (emp.dataEmissao && new Date(parseDateToTimestamp(emp.dataEmissao)).getFullYear() < new Date().getFullYear());

          if (medicoesDoEmp.length === 0) {
            situacao = isExercicioAnterior ? 'EXERCICIO_ANTERIOR' : 'NAO_UTILIZADO';

            const emissaoTime = parseDateToTimestamp(emp.dataEmissao);
            if (emissaoTime > 0) {
              const diffMs = Date.now() - emissaoTime;
              diasSemMed = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            } else {
              diasSemMed = isExercicioAnterior ? 365 : 90;
            }
          } else {
            situacao = 'SEM_MEDICAO';
            const lastMed = medicoesDoEmp[medicoesDoEmp.length - 1];
            const medTime = parseDateToTimestamp(lastMed?.dataRegistro);
            if (medTime > 0) {
              const diffMs = Date.now() - medTime;
              diasSemMed = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
            } else {
              diasSemMed = 60;
            }
          }

          fromContratos.push({
            id: `emp-c-${contratoNum.replace(/[^a-zA-Z0-9]/g, '_')}-${(emp.id || empNum || `idx_${empIdx}`).replace(/[^a-zA-Z0-9]/g, '_')}`,
            codigo: emp.numeroEmp || 'SEM CÓDIGO',
            situacao,
            diasSemMedicao: diasSemMed,
            diasSemUtilizar: diasSemMed,
            empenhado: emp.valorTotal || saldo,
            saldo: saldo,
            contratoNumero: c.numero,
            empresa: c.razaoSocial || 'EMPRESA NÃO INFORMADA',
            dataEmissao: emp.dataEmissao,
          });
        }
      });
    });

    return fromContratos;
  }, [contratos]);

  // Filtra empenhos com saldo de acordo com o contrato selecionado/buscado
  const activeEmpenhosComSaldo = useMemo(() => {
    if (!selectedContratoFilter || selectedContratoFilter === 'ALL') {
      return empenhosComSaldo;
    }
    return empenhosComSaldo.filter(
      (emp) => emp.contratoNumero.trim() === selectedContratoFilter.trim()
    );
  }, [empenhosComSaldo, selectedContratoFilter]);

  const selectedContractObj = useMemo(() => {
    if (!selectedContratoFilter || selectedContratoFilter === 'ALL') return null;
    return (contratos || []).find((c) => c.numero.trim() === selectedContratoFilter.trim());
  }, [contratos, selectedContratoFilter]);

  if (!isOpen) return null;

  const handlePrintCurrentTab = () => {
    handleDownloadActiveTabPdf();
  };

  const handleDownloadActiveTabPdf = () => {
    const contentEl = document.querySelector('[data-report-tab-content="true"]');
    if (contentEl) {
      // Find the tab's PDF download button
      const pdfBtn = contentEl.querySelector<HTMLButtonElement>(
        'button[title*="PDF"], button[title*="pdf"]'
      );
      if (pdfBtn) {
        pdfBtn.click();
        return;
      }
    }
  };

  return (
    <>
      <div className="fixed top-[49px] sm:top-[51px] bottom-0 left-0 right-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-1.5 sm:p-3 overflow-y-auto">
        <div className="bg-[#f0f2f5] rounded-xl shadow-2xl w-full max-w-[98vw] 2xl:max-w-[1900px] h-full max-h-full flex flex-col overflow-hidden border border-slate-300">
          {/* Header matching Print 2, 3, 4 */}
          <div className="bg-[#1b346d] text-white px-6 py-3.5 flex items-center justify-between border-b border-[#142854] shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-[#254284] rounded border border-[#3b5ba5]">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black tracking-wide uppercase leading-tight">
                  RELATÓRIO GERENCIAL DE CONTRATOS
                </h2>
                <p className="text-[11px] text-slate-300 uppercase font-medium">
                  VISÃO DETALHADA E INTERATIVA DE CONTRATOS, FISCAIS, EMPENHOS COM SALDO E MEDIÇÕES
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadActiveTabPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider transition-colors border border-emerald-500 cursor-pointer shadow-2xs active:scale-95"
                title="Exportar Relatório Ativo em PDF"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>PDF</span>
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

          {/* Submenu Tabs Navigation with squared rounded-md borders */}
          <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-3 overflow-x-auto shrink-0 select-none">
            {/* Tab 1: FISCAIS */}
            <button
              onClick={() => setActiveTab('FISCAIS')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                activeTab === 'FISCAIS'
                  ? 'bg-[#1b346d] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>FISCAIS ({fiscaisAtivos.length})</span>
            </button>

            {/* Tab 2: MEDIÇÕES PENDENTES */}
            <button
              onClick={() => setActiveTab('MEDICOES_PENDENTES')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                activeTab === 'MEDICOES_PENDENTES'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>MEDIÇÕES PENDENTES ({medicoesPendentes.length})</span>
            </button>

            {/* Tab 3: CONTRATO COM SALDO */}
            <button
              onClick={() => setActiveTab('CONTRATO_COM_SALDO')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                activeTab === 'CONTRATO_COM_SALDO'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>CONTRATO COM SALDO ({contratosComSaldo.length})</span>
            </button>

            {/* Tab 4: EMPENHOS COM SALDO */}
            <button
              onClick={() => setActiveTab('EMPENHOS_COM_SALDO')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs ${
                activeTab === 'EMPENHOS_COM_SALDO'
                  ? 'bg-[#1b346d] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>EMPENHOS COM SALDO ({activeEmpenhosComSaldo.length})</span>
            </button>
          </div>

          {/* Tab Content Area */}
          <div className="p-6 overflow-y-auto flex-1" data-report-tab-content="true">
            {activeTab === 'FISCAIS' && (
              <FiscaisReportTab
                fiscais={fiscaisAtivos}
                onSelectContractByNumero={(num) => {
                  onSelectContractByNumero(num);
                  onClose();
                }}
                onPrintReport={handlePrintCurrentTab}
              />
            )}

            {activeTab === 'MEDICOES_PENDENTES' && (
              <MedicoesPendentesTab
                medicoes={medicoesPendentes}
                onSelectContractByNumero={(num) => {
                  onSelectContractByNumero(num);
                  onClose();
                }}
                onOpenDespachoNger={(med) => setSelectedDespachoMedicao(med)}
                onLiquidarMedicao={onLiquidarMedicao}
                onPrintReport={handlePrintCurrentTab}
              />
            )}

            {activeTab === 'CONTRATO_COM_SALDO' && (
              <ContratosComSaldoReportTab
                contratos={contratos}
                onSelectContractByNumero={(num) => {
                  onSelectContractByNumero(num);
                  onClose();
                }}
                onPrintReport={handlePrintCurrentTab}
              />
            )}

            {activeTab === 'EMPENHOS_COM_SALDO' && (
              <EmpenhosPendentesTab
                empenhos={activeEmpenhosComSaldo}
                allEmpenhos={empenhosComSaldo}
                contratos={contratos}
                selectedContratoFilter={selectedContratoFilter}
                onChangeContratoFilter={setSelectedContratoFilter}
                onSelectContractByNumero={(num) => {
                  onSelectContractByNumero(num);
                  onClose();
                }}
                onPrintReport={handlePrintCurrentTab}
              />
            )}
          </div>

          {/* Footer Bar */}
          <div className="bg-slate-100 border-t border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs text-slate-600 shrink-0">
            <span className="font-semibold text-[11px] uppercase">
              MOSTRANDO DADOS ATUALIZADOS DE <strong>{contratos.length} CONTRATOS</strong>,{' '}
              <strong>{fiscaisAtivos.length} FISCAIS</strong>,{' '}
              <strong className="text-red-600 font-bold">{medicoesPendentes.length} COM MEDIÇÕES PENDENTES</strong>,{' '}
              <strong className="text-emerald-700 font-bold">{contratosComSaldo.length} CONTRATOS COM SALDO</strong> E{' '}
              <strong className="text-amber-700 font-bold">{activeEmpenhosComSaldo.length} EMPENHOS COM SALDO</strong>
              {selectedContratoFilter !== 'ALL' ? ` (FILTRADO POR CONTRATO Nº ${selectedContratoFilter})` : ''}.
            </span>
          </div>
        </div>
      </div>

      {/* Despacho NGER Modal */}
      {selectedDespachoMedicao && (
        <DespachoNgerModal
          isOpen={Boolean(selectedDespachoMedicao)}
          onClose={() => setSelectedDespachoMedicao(null)}
          medicao={selectedDespachoMedicao}
          contrato={contratos.find((c) => c.numero === selectedDespachoMedicao.contratoNumero)}
        />
      )}
    </>
  );
};
