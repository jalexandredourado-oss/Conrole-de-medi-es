import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Calendar,
  Plus,
  MapPin,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Contrato, RegiaoValor, TipoContrato } from '../../types/contract';
import { createDefaultConformidadeItens } from '../../data/initialContracts';
import {
  formatCurrency,
  formatCurrencyInput,
  formatCurrencyBlur,
  formatNumeroContrato,
  formatCnpjInput,
  formatDateInput,
  suggestSigla,
  calculateDaysRemaining,
  parseFlexibleNumber,
} from '../../utils/formatters';
import { ManageTiposModal } from './ManageTiposModal';
import { resolveCodigoCredor, isCnpjValue } from '../../utils/driveSpreadsheetSync';
import { getSignerConfig } from '../../utils/signerConfig';

const TIPOS_STORAGE_KEY = 'sistema_orcamento_tipos_contrato_v1';
const DEFAULT_TIPOS = ['OBRAS', 'MANUTENÇÃO PREDIAL'];

interface NewContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contrato: Contrato) => void;
  contractToEdit?: Contrato | null;
}

export const NewContractModal: React.FC<NewContractModalProps> = ({
  isOpen,
  onClose,
  onSave,
  contractToEdit,
}) => {
  // Form state
  const [numero, setNumero] = useState('');
  const [processoSigadoc, setProcessoSigadoc] = useState('');
  const [tipo, setTipo] = useState<TipoContrato>('OBRAS');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [sigla, setSigla] = useState('');
  const [isSiglaManual, setIsSiglaManual] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [codigoCredor, setCodigoCredor] = useState('');
  const [objeto, setObjeto] = useState('');
  const [pgtoIndenizacao, setPgtoIndenizacao] = useState(false);

  // Vigência e Fiscais
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [fiscal, setFiscal] = useState('');
  const [substituto, setSubstituto] = useState('');

  // Orçamento e Regiões
  const [valorContratadoInput, setValorContratadoInput] = useState('');
  const [regioes, setRegioes] = useState<RegiaoValor[]>([]);
  const [openCitiesForRegiaoId, setOpenCitiesForRegiaoId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  // Tipos de Contrato list management
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(TIPOS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_TIPOS;
  });
  const [isManageTiposOpen, setIsManageTiposOpen] = useState(false);

  // Sync types with localStorage
  const handleSaveTipos = (updated: string[]) => {
    setTiposDisponiveis(updated);
    try {
      localStorage.setItem(TIPOS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (contractToEdit) {
      setNumero(contractToEdit.numero || '');
      setProcessoSigadoc(contractToEdit.processoSigadoc || '');
      setTipo(contractToEdit.tipo || 'OBRAS');
      setRazaoSocial(contractToEdit.razaoSocial || '');
      setSigla(contractToEdit.siglaEmpresa || suggestSigla(contractToEdit.razaoSocial || ''));
      setIsSiglaManual(Boolean(contractToEdit.siglaEmpresa));
      setCnpj(contractToEdit.cnpj || '');
      const initialCredor = contractToEdit.codigoCredor && !isCnpjValue(contractToEdit.codigoCredor)
        ? contractToEdit.codigoCredor
        : (resolveCodigoCredor('', contractToEdit.cnpj) || '');
      setCodigoCredor(initialCredor);
      setObjeto(contractToEdit.objeto || contractToEdit.descricao || '');
      setPgtoIndenizacao(Boolean(contractToEdit.pgtoIndenizacao));
      setDataInicio(contractToEdit.dataInicio || '');
      setDataFim(contractToEdit.dataFim || '');
      setFiscal(contractToEdit.fiscal || '');
      setSubstituto(contractToEdit.substituto || '');
      setValorContratadoInput(
        contractToEdit.valorContratado
          ? formatCurrency(contractToEdit.valorContratado, true)
          : ''
      );
      setRegioes(
        (contractToEdit.regioes || []).map((r) => ({
          ...r,
          valorInput: r.valor ? formatCurrency(r.valor, true) : '',
        }))
      );
    } else {
      setNumero('');
      setProcessoSigadoc('');
      setTipo(tiposDisponiveis[0] || 'OBRAS');
      setRazaoSocial('');
      setSigla('');
      setIsSiglaManual(false);
      setCnpj('');
      setCodigoCredor('');
      setObjeto('');
      setPgtoIndenizacao(false);
      setDataInicio('');
      setDataFim('');
      setFiscal('');
      setSubstituto('');
      setValorContratadoInput('');
      setRegioes([]);
    }
  }, [contractToEdit, isOpen]);

  if (!isOpen) return null;

  // Mask handler for Nº DO CONTRATO: 000/0000 (8 characters total)
  const handleNumeroChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatNumeroContrato(e.target.value);
    setNumero(formatted);
  };

  // Mask handler for CNPJ: 00.000.000/0000-00 (18 characters max)
  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCnpjInput(e.target.value);
    setCnpj(formatted);
  };

  // Mask handler for Vigência Início / Fim: DD/MM/AAAA (10 characters max)
  const handleDataInicioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value);
    setDataInicio(formatted);
  };

  const handleDataFimChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDateInput(e.target.value);
    setDataFim(formatted);
  };

  // Handler for Razão Social with auto 4-letter Sigla suggestion
  const handleRazaoSocialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRazaoSocial(value);
    if (!isSiglaManual) {
      const suggested = suggestSigla(value);
      setSigla(suggested);
    }
  };

  // Handler for Sigla when user manually types or alters it
  const handleSiglaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().slice(0, 10);
    setSigla(val);
    setIsSiglaManual(true);
  };

  // Currency parsing and numeric value calculation using flexible parser
  const valorContratadoNum = parseFlexibleNumber(valorContratadoInput);

  // Region actions
  const handleAddRegiao = () => {
    const nextIndex = regioes.length + 1;
    const newRegiao: RegiaoValor = {
      id: `reg-${Date.now()}-${nextIndex}`,
      nome: `Região ${nextIndex}`,
      cidades: '',
      valor: 0,
      valorInput: '',
    };
    setRegioes((prev) => [...prev, newRegiao]);
    setOpenCitiesForRegiaoId(newRegiao.id);
  };

  const handleUpdateRegiaoValor = (id: string, text: string) => {
    const masked = formatCurrencyInput(text);
    const num = parseFlexibleNumber(masked);
    setRegioes((prev) => {
      const updated = prev.map((r) =>
        r.id === id ? { ...r, valorInput: masked, valor: num } : r
      );
      // Automatically sum up and update Valor Contratado in the budget section
      const sumRegioes = updated.reduce((acc, r) => acc + (r.valor || 0), 0);
      if (sumRegioes > 0) {
        setValorContratadoInput(formatCurrency(sumRegioes, true));
      }
      return updated;
    });
  };

  const handleBlurRegiaoValor = (id: string) => {
    setRegioes((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const currentStr = r.valorInput !== undefined ? r.valorInput : (r.valor ? formatCurrency(r.valor, true) : '');
        const formatted = formatCurrencyBlur(currentStr);
        const num = parseFlexibleNumber(formatted);
        return {
          ...r,
          valor: num,
          valorInput: formatted,
        };
      })
    );
  };

  const handleUpdateRegiaoCidades = (id: string, cidades: string) => {
    setRegioes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, cidades: cidades.toUpperCase() } : r))
    );
  };

  const handleUpdateRegiaoNome = (id: string, nome: string) => {
    setRegioes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, nome: nome.toUpperCase() } : r))
    );
  };

  const handleRemoveRegiao = (id: string) => {
    setRegioes((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      const sumRegioes = updated.reduce((acc, r) => acc + (r.valor || 0), 0);
      setValorContratadoInput(sumRegioes > 0 ? formatCurrency(sumRegioes, true) : '');
      return updated;
    });
    if (openCitiesForRegiaoId === id) {
      setOpenCitiesForRegiaoId(null);
    }
  };

  const totalRegioesValor = regioes.reduce((acc, r) => acc + (r.valor || 0), 0);
  const saldoDistribuir = valorContratadoNum - totalRegioesValor;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!numero.trim() || numero.length < 8) {
      setValidationError('Por favor, informe o Nº do Contrato no formato 000/0000 (8 caracteres).');
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!tipo) {
      setValidationError('Por favor, selecione o Tipo de Contrato.');
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!razaoSocial.trim()) {
      setValidationError('Por favor, informe a Razão Social da empresa.');
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const valor = valorContratadoNum;
    const dias = dataFim ? calculateDaysRemaining(dataFim) : 365;

    if (contractToEdit) {
      const updated: Contrato = {
        ...contractToEdit,
        numero: numero.trim(),
        processoSigadoc: processoSigadoc.trim().toUpperCase() || 'NÃO INFORMADO',
        tipo,
        razaoSocial: razaoSocial.trim().toUpperCase(),
        siglaEmpresa: (sigla.trim() || suggestSigla(razaoSocial)).toUpperCase(),
        cnpj: cnpj.trim(),
        codigoCredor: (codigoCredor.trim() && !isCnpjValue(codigoCredor.trim()) ? codigoCredor.trim() : (resolveCodigoCredor('', cnpj) || undefined)),
        objeto: objeto.trim().toUpperCase() || contractToEdit.objeto || contractToEdit.descricao,
        descricao: objeto.trim().toUpperCase() || contractToEdit.descricao,
        dataInicio: dataInicio.trim() || contractToEdit.dataInicio,
        dataFim: dataFim.trim() || contractToEdit.dataFim,
        fiscal: fiscal.trim().toUpperCase() || contractToEdit.fiscal,
        substituto: substituto.trim().toUpperCase() || contractToEdit.substituto,
        valorContratado: valor,
        saldoContrato: Math.max(valor - (contractToEdit.valorMedido || 0), 0),
        valorContratadoNaoExecutado: Math.max(valor - (contractToEdit.valorMedido || 0), 0),
        diasVencer: dias,
        regioes: regioes,
        pgtoIndenizacao,
      };
      onSave(updated);
    } else {
      const newContrato: Contrato = {
        id: `contrato-${Date.now()}`,
        numero: numero.trim(),
        processoSigadoc: processoSigadoc.trim().toUpperCase() || 'NÃO INFORMADO',
        tipo,
        razaoSocial: razaoSocial.trim().toUpperCase(),
        siglaEmpresa: (sigla.trim() || suggestSigla(razaoSocial)).toUpperCase(),
        cnpj: cnpj.trim(),
        codigoCredor: (codigoCredor.trim() && !isCnpjValue(codigoCredor.trim()) ? codigoCredor.trim() : (resolveCodigoCredor('', cnpj) || undefined)),
        objeto: objeto.trim().toUpperCase() || `CONTRATO Nº ${numero.trim()}`,
        descricao: objeto.trim().toUpperCase() || `CONTRATO Nº ${numero.trim()}`,
        dataInicio: dataInicio.trim() || '01/01/2026',
        dataFim: dataFim.trim() || '31/12/2026',
        fiscal: fiscal.trim().toUpperCase() || 'STEPHANIE KAROLYNE C. S. DAMASCENO',
        substituto: substituto.trim().toUpperCase() || 'RODRIGO PANDIN GANDINI PIOVEZANI PEDRO',
        valorContratado: valor,
        valorContratadoNaoExecutado: valor,
        valorEmpenhado: 0,
        valorMedido: 0,
        valorLiquidado: 0,
        valorPago: 0,
        saldoContrato: valor,
        diasVencer: dias,
        execucaoFisica: 0.0,
        pgtoIndenizacao,
        regioes: regioes,
        empenhos: [],
        medicoes: [],
        pagamentos: [],
        conformidade: {
          itens: createDefaultConformidadeItens(),
          observacoes: '',
          data: '30/09/2026',
          valorEncaminhado: valor,
          assinante: {
            nome: getSignerConfig().nome,
            cargo: getSignerConfig().cargo,
            setor: getSignerConfig().setor,
          },
        },
      };
      onSave(newContrato);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-2xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1360px] xl:max-w-[1440px] overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header (Exact Match to Screenshot) */}
        <div className="bg-[#1b346d] text-white px-6 py-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-white/10 flex items-center justify-center border border-white/20 shadow-xs">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                {contractToEdit ? 'EDITAR DADOS DO CONTRATO' : 'CADASTRAR NOVO CONTRATO'}
              </h2>
              <p className="text-[10px] sm:text-[11px] font-bold text-blue-200 uppercase tracking-wide">
                GERENCIE AS INFORMAÇÕES CONTRATUAIS, VIGÊNCIAS E DISTRIBUIÇÃO ORÇAMENTÁRIA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - Two Columns (Exact Layout of Screenshot) */}
        <form ref={formRef} onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto bg-slate-50/40">
          {validationError && (
            <div className="flex items-center gap-2.5 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            
            {/* LEFT COLUMN: Dados Principais e Vigência */}
            <div className="space-y-4">
              
              {/* 1. DADOS PRINCIPAIS DO CONTRATO */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-2xs space-y-3">
                <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                  DADOS PRINCIPAIS DO CONTRATO
                </h3>

                {/* Row 1: Nº DO CONTRATO | Nº DO PROCESSO SIGADOC | TIPO DE CONTRATO */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Nº DO CONTRATO */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      Nº DO CONTRATO <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="000/0000"
                      value={numero}
                      onChange={handleNumeroChange}
                      maxLength={8}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none uppercase"
                      required
                    />
                    <span className="text-[9px] text-slate-400 block mt-0.5 font-medium">
                      Ex: 070/2024 (3 dígitos/ano)
                    </span>
                  </div>

                  {/* Nº DO PROCESSO SIGADOC */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      Nº DO PROCESSO SIGADOC
                    </label>
                    <input
                      type="text"
                      placeholder="EX: 000.000/2024"
                      value={processoSigadoc}
                      onChange={(e) => setProcessoSigadoc(e.target.value.toUpperCase())}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none uppercase"
                    />
                  </div>

                  {/* TIPO DE CONTRATO (function to create, edit, delete is inside the select) */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      TIPO DE CONTRATO <span className="text-red-500">*</span>
                    </label>

                    <select
                      value={tipo}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsManageTiposOpen(true);
                        } else {
                          setTipo(e.target.value);
                        }
                      }}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-bold text-slate-800 uppercase focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none cursor-pointer bg-white"
                      required
                    >
                      <option value="" disabled>SELECIONE...</option>
                      {tiposDisponiveis.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      <option value="__NEW__" className="text-blue-700 font-bold bg-blue-50">
                        + CRIAR, EDITAR OU EXCLUIR TIPOS...
                      </option>
                    </select>
                  </div>
                </div>

                {/* Row 2: RAZÃO SOCIAL | SIGLA */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      RAZÃO SOCIAL <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="EX: SERVIÇOS AVANÇADOS LTDA"
                      value={razaoSocial}
                      onChange={handleRazaoSocialChange}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none uppercase"
                      required
                    />
                  </div>

                  {/* SIGLA */}
                  <div className="sm:col-span-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      SIGLA
                    </label>
                    <input
                      type="text"
                      placeholder="EX: SIGLA"
                      value={sigla}
                      onChange={handleSiglaChange}
                      maxLength={10}
                      className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded font-bold font-mono text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none uppercase text-center tracking-wider"
                    />
                  </div>
                </div>

                {/* Row 3: CNPJ | CÓDIGO DO CREDOR */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* CNPJ with 00.000.000/0000-00 mask */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      CNPJ
                    </label>
                    <input
                      type="text"
                      placeholder="00.000.000/0001-00"
                      value={cnpj}
                      onChange={handleCnpjChange}
                      maxLength={18}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none"
                    />
                  </div>

                  {/* CÓDIGO DO CREDOR */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      CÓDIGO DO CREDOR
                    </label>
                    <input
                      type="text"
                      placeholder="EX: 2024.06804-1 (FIPLAN COLUNA M)"
                      value={codigoCredor}
                      onChange={(e) => setCodigoCredor(e.target.value.toUpperCase())}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none uppercase"
                    />
                  </div>
                </div>

                {/* Row 4: OBJETO DO CONTRATO */}
                <div>
                  <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                    OBJETO DO CONTRATO
                  </label>
                  <input
                    type="text"
                    placeholder="EX: REFORMA E MANUTENÇÃO DE INFRAESTRUTURA"
                    value={objeto}
                    onChange={(e) => setObjeto(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none uppercase"
                  />
                </div>

                {/* Caixa de seleção: Pgto por Indenização */}
                <div className="pt-1">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-[11px] font-bold text-slate-700">
                      Pgto por Indenização
                    </span>
                    <input
                      type="checkbox"
                      checked={pgtoIndenizacao}
                      onChange={(e) => setPgtoIndenizacao(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 cursor-pointer accent-[#1b346d]"
                    />
                  </label>
                </div>
              </div>

              {/* 2. VIGÊNCIA E FISCAIS RESPONSÁVEIS */}
              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-2xs space-y-3">
                <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                  VIGÊNCIA E FISCAIS RESPONSÁVEIS
                </h3>

                {/* Row 1: INÍCIO DA VIGÊNCIA | FIM DA VIGÊNCIA */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      INÍCIO DA VIGÊNCIA
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={dataInicio}
                        onChange={handleDataInicioChange}
                        maxLength={10}
                        className="w-full text-xs pl-3 pr-8 py-1.5 border border-slate-300 rounded font-mono text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 outline-none"
                      />
                      <Calendar className="w-4 h-4 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      FIM DA VIGÊNCIA
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={dataFim}
                        onChange={handleDataFimChange}
                        maxLength={10}
                        className="w-full text-xs pl-3 pr-8 py-1.5 border border-slate-300 rounded font-mono text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 outline-none"
                      />
                      <Calendar className="w-4 h-4 text-slate-400 absolute right-2.5 top-2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 2: FISCAL DO CONTRATO | FISCAL SUBSTITUTO (SUB) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      FISCAL DO CONTRATO
                    </label>
                    <input
                      type="text"
                      placeholder="NOME DO FISCAL TITULAR"
                      value={fiscal}
                      onChange={(e) => setFiscal(e.target.value.toUpperCase())}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 outline-none uppercase"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                      FISCAL SUBSTITUTO (SUB)
                    </label>
                    <input
                      type="text"
                      placeholder="NOME DO FISCAL SUBSTITUTO (SUB)"
                      value={substituto}
                      onChange={(e) => setSubstituto(e.target.value.toUpperCase())}
                      className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-600 outline-none uppercase"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Orçamento e Rateio Regional */}
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-2xs space-y-4">
                <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                  ORÇAMENTO E RATEIO REGIONAL
                </h3>

                {/* VALOR CONTRATADO (R$) * (Large display input as in screenshot) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase">
                      VALOR CONTRATADO (R$) <span className="text-red-500">*</span>
                    </label>
                    {regioes.length > 0 && (
                      <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Soma calculada das {regioes.length} região(ões)
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="R$ 0,00"
                      value={valorContratadoInput}
                      onChange={(e) => {
                        const masked = formatCurrencyInput(e.target.value);
                        setValorContratadoInput(masked);
                      }}
                      onBlur={() => {
                        const formatted = formatCurrencyBlur(valorContratadoInput);
                        setValorContratadoInput(formatted);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const formatted = formatCurrencyBlur(valorContratadoInput);
                          setValorContratadoInput(formatted);
                        }
                      }}
                      className="w-full text-base sm:text-lg font-bold text-slate-800 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none bg-white placeholder:text-slate-400"
                      required
                    />
                    {valorContratadoNum > 0 && (
                      <span className="absolute right-3 top-2.5 text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {formatCurrency(valorContratadoNum)}
                      </span>
                    )}
                  </div>
                </div>

                {/* DISTRIBUIÇÃO DAS REGIÕES */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase">
                        DISTRIBUIÇÃO DAS REGIÕES
                      </h4>
                      <p className="text-[10px] text-slate-400 uppercase font-medium">
                        REGIÕES EXCLUSIVAS DESTE CONTRATO E VALOR RATEADO
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddRegiao}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1b346d] hover:bg-[#142854] text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer shadow-xs active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>NOVA REGIÃO</span>
                    </button>
                  </div>

                  {/* Empty state (Exact match to screenshot) */}
                  {regioes.length === 0 ? (
                    <div className="border border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50/50 space-y-1">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                        NENHUMA REGIÃO ADICIONADA PARA ESTE CONTRATO.
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        SE ESTE CONTRATO POSSUIR RATEIO REGIONAL, CLIQUE EM &quot;+ NOVA REGIÃO&quot;.
                      </p>
                    </div>
                  ) : (
                    /* Regions list */
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {regioes.map((regiao, idx) => (
                        <div
                          key={regiao.id || idx}
                          className="border border-slate-200 rounded-lg p-3 bg-white shadow-2xs space-y-2 hover:border-blue-300 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            {/* Region Name */}
                            <div className="flex items-center gap-2 flex-1">
                              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <input
                                type="text"
                                value={regiao.nome}
                                onChange={(e) => handleUpdateRegiaoNome(regiao.id, e.target.value)}
                                className="font-bold text-xs uppercase text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-blue-600 outline-none w-32"
                                placeholder={`Região ${idx + 1}`}
                              />
                            </div>

                            {/* City toggle button with icon */}
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCitiesForRegiaoId(
                                  openCitiesForRegiaoId === regiao.id ? null : regiao.id
                                )
                              }
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer border ${
                                regiao.cidades
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                              title="Informar cidades desta região"
                            >
                              <MapPin className="w-3.5 h-3.5 text-blue-600" />
                              <span>
                                {regiao.cidades ? 'Cidades' : '+ Cidades'}
                              </span>
                            </button>

                            {/* Region Value Input (Masked currency input) */}
                            <div className="w-36 sm:w-44">
                              <input
                                type="text"
                                placeholder="R$ 0,00"
                                value={
                                  regiao.valorInput !== undefined
                                    ? regiao.valorInput
                                    : regiao.valor
                                    ? formatCurrency(regiao.valor, true)
                                    : ''
                                }
                                onChange={(e) => handleUpdateRegiaoValor(regiao.id, e.target.value)}
                                onBlur={() => handleBlurRegiaoValor(regiao.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleBlurRegiaoValor(regiao.id);
                                  }
                                }}
                                className="w-full text-right text-xs font-mono font-bold text-slate-800 px-2.5 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 outline-none placeholder:text-slate-400"
                              />
                            </div>

                            {/* Delete Region Button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveRegiao(regiao.id)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors"
                              title="Remover região"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Cities Input Area (Always visible or toggled) */}
                          <div className="pt-1 border-t border-slate-100 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              placeholder={`DIGITE AS CIDADES DE ${regiao.nome.toUpperCase()} (EX: CUIABÁ, VÁRZEA GRANDE...)`}
                              value={regiao.cidades || ''}
                              onChange={(e) => handleUpdateRegiaoCidades(regiao.id, e.target.value)}
                              className="flex-1 text-[11px] px-2 py-0.5 border border-slate-200 rounded text-slate-700 uppercase placeholder:text-slate-400 focus:border-blue-500 outline-none"
                            />
                          </div>
                        </div>
                      ))}

                      {/* Regional Summary Bar */}
                      <div className="p-3 bg-slate-100/80 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between font-semibold text-slate-700">
                          <span>Total Rateado nas Regiões:</span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatCurrency(totalRegioesValor)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Saldo a Distribuir:</span>
                          <span
                            className={`font-mono font-bold flex items-center gap-1 ${
                              Math.abs(saldoDistribuir) < 0.01
                                ? 'text-emerald-700'
                                : saldoDistribuir > 0
                                ? 'text-amber-700'
                                : 'text-red-600'
                            }`}
                          >
                            {Math.abs(saldoDistribuir) < 0.01 ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>100% DISTRIBUÍDO</span>
                              </>
                            ) : (
                              <>
                                {saldoDistribuir < 0 && <AlertCircle className="w-3 h-3 text-red-600" />}
                                <span>{formatCurrency(saldoDistribuir)}</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions Footer (Exact match to screenshot) */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 uppercase transition-colors cursor-pointer"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-[#1b346d] hover:bg-[#142854] text-white text-xs font-bold uppercase transition-all shadow-md active:scale-95 cursor-pointer"
            >
              {contractToEdit ? 'ATUALIZAR CONTRATO' : 'CADASTRAR CONTRATO'}
            </button>
          </div>
        </form>

        {/* Modal to Manage (Create, Edit, Delete) Contract Types */}
        <ManageTiposModal
          isOpen={isManageTiposOpen}
          onClose={() => setIsManageTiposOpen(false)}
          tipos={tiposDisponiveis}
          onSaveTipos={handleSaveTipos}
          onSelectTipo={(selected) => setTipo(selected)}
        />
      </div>
    </div>
  );
};
