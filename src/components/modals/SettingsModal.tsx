import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RotateCcw,
  Download,
  Upload,
  Database,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  Layers,
  AlertTriangle,
  Info,
  CheckCircle2,
  ArrowRight,
  Link as LinkIcon,
  ClipboardList,
  Building2,
  ChevronLeft,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { Contrato, Empenho, Medicao, Pagamento } from '../../types/contract';
import { formatCurrency, formatHistoricoDisplay } from '../../utils/formatters';
import {
  generateContratosDriveExport,
  generateEmpDriveExport,
  generateLiqDriveExport,
  getAllEmpenhosFromContracts,
  getAllMedicoesFromContracts,
  parseContratosFromDriveText,
  parseEmpFromDriveText,
  parseLiqFromDriveText,
  extractSpreadsheetTextFromArrayBuffer,
  extractGoogleSheetsExportUrl,
  extractGoogleDriveId,
  extractGoogleDriveGid,
  triggerFileDownload,
  isSameContractNumber,
  formatContractNumber,
  CONTRATOS_HEADERS,
  EMP_HEADERS,
  LIQ_HEADERS,
  FlatEmpenhoRow,
  FlatMedicaoRow,
  FlatLiqRow,
  resolveCodigoCredor,
  isCnpjValue,
  isInvalidContractNumber,
} from '../../utils/driveSpreadsheetSync';
import { exportFullExcelWorkbook } from '../../utils/fullExcelExport';

interface SettingsModalProps {
  isOpen?: boolean;
  isFullPage?: boolean;
  onClose: () => void;
  contratos: Contrato[];
  onResetData: () => void;
  onImportData: (data: Contrato[]) => void | Promise<void>;
  currentUser?: User | null;
}

type MainTab = 'Importar' | 'Exportar';
type FormatType = 'Planilha do drive' | 'JSON';
type DriveSubTab = 'CONTRATOS' | 'EMP' | 'LIQ';
type InputMode = 'LINK' | 'PASTE_FILE';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen = true,
  isFullPage = false,
  onClose,
  contratos,
  onResetData,
  onImportData,
}) => {
  // Navigation states
  const [mainTab, setMainTab] = useState<MainTab>('Importar');
  const [formatType, setFormatType] = useState<FormatType>('Planilha do drive');
  const [driveSubTab, setDriveSubTab] = useState<DriveSubTab>('EMP');
  const [inputMode, setInputMode] = useState<InputMode>('LINK');

  // Link mode states
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetTabName, setSheetTabName] = useState('EMP');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  // Paste / file states
  const [importPasteText, setImportPasteText] = useState('');

  // Preview states (When not null, activates the confirmation review screen matching the print)
  const [parsedContratosPreview, setParsedContratosPreview] = useState<Partial<Contrato>[] | null>(null);
  const [parsedEmpPreview, setParsedEmpPreview] = useState<FlatEmpenhoRow[] | null>(null);
  const [parsedLiqPreview, setParsedLiqPreview] = useState<FlatMedicaoRow[] | null>(null);
  const [importJsonPreview, setImportJsonPreview] = useState<Contrato[] | null>(null);

  // Selection states in the review table
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [replaceExisting, setReplaceExisting] = useState(true);
  // Contract search filter in settings
  const [selectedContratoFilter, setSelectedContratoFilter] = useState<string>('ALL');

  const selectedContractObj = useMemo(() => {
    if (!selectedContratoFilter || selectedContratoFilter === 'ALL') return null;
    return (contratos || []).find((c) => c.numero.trim() === selectedContratoFilter.trim());
  }, [contratos, selectedContratoFilter]);

  // Feedback states
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Update selected indices whenever a new preview is loaded
  useEffect(() => {
    if (parsedEmpPreview) {
      const all = new Set<number>();
      parsedEmpPreview.forEach((_, idx) => all.add(idx));
      setSelectedIndices(all);
    } else if (parsedContratosPreview) {
      const all = new Set<number>();
      parsedContratosPreview.forEach((_, idx) => all.add(idx));
      setSelectedIndices(all);
    } else if (parsedLiqPreview) {
      const all = new Set<number>();
      parsedLiqPreview.forEach((_, idx) => all.add(idx));
      setSelectedIndices(all);
    } else {
      setSelectedIndices(new Set());
    }
  }, [parsedEmpPreview, parsedContratosPreview, parsedLiqPreview]);

  if (!isOpen) return null;

  // Flattened data for export
  const allEmpenhos = getAllEmpenhosFromContracts(contratos);
  const allMedicoes = getAllMedicoesFromContracts(contratos);

  // Helper to find company name for a contract
  const getEmpresaForContrato = (contratoNum: string) => {
    if (!contratoNum) return 'EMPRESA VINCULADA';
    const found = contratos.find((c) => isSameContractNumber(c.numero, contratoNum));
    return found?.razaoSocial || found?.siglaEmpresa || 'EMPRESA VINCULADA';
  };

  // When switching sub-tab, update default tab name
  const handleSelectDriveSubTab = (tab: DriveSubTab) => {
    setDriveSubTab(tab);
    setStatusMessage(null);
    setParsedContratosPreview(null);
    setParsedEmpPreview(null);
    setParsedLiqPreview(null);
    if (tab === 'CONTRATOS') {
      setSheetTabName('CONSULTAR CONTRATO(FIPLAN)');
    } else if (tab === 'EMP') {
      setSheetTabName('EMP');
    } else if (tab === 'LIQ') {
      setSheetTabName('LIQ');
    }
  };

  // Copy helper
  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Fetch Google Sheets directly by URL
  const handleFetchGoogleSheetsUrl = async () => {
    setStatusMessage(null);
    const trimmedInput = sheetUrl.trim();
    if (!trimmedInput) {
      setStatusMessage({ type: 'error', text: 'Por favor, insira o link completo da planilha do Google Drive ou Google Sheets.' });
      return;
    }

    // Se o usuário colou dados tabulares/células da planilha no campo de link por engano:
    if (trimmedInput.includes('\t') || (trimmedInput.includes('\n') && !trimmedInput.startsWith('http'))) {
      processDriveRawText(trimmedInput);
      return;
    }

    const docId = extractGoogleDriveId(trimmedInput);
    if (!docId) {
      setStatusMessage({
        type: 'error',
        text: 'Link inválido. Insira o link do Google Drive ou Google Sheets (ex: https://docs.google.com/spreadsheets/d/... ou https://drive.google.com/file/d/...).',
      });
      return;
    }

    const effectiveTabOrGid = sheetTabName.trim() || driveSubTab;
    setIsLoadingUrl(true);

    // 1. PRIMEIRA TENTATIVA: Tenta via backend proxy do sistema (/api/drive/fetch-sheet) - Imune a CORS
    try {
      const serverResp = await fetch('/api/drive/fetch-sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          url: trimmedInput,
          sheetTabName: effectiveTabOrGid,
          subTab: driveSubTab,
        }),
      });

      if (serverResp.ok) {
        const json = await serverResp.json();
        if (json && json.success && json.csvData) {
          setIsLoadingUrl(false);
          processDriveRawText(json.csvData);
          return;
        }
      }
    } catch {
      // Servidor local inacessível (ex: executando arquivo index.html standalone estático diretamente)
    }

    // 2. SEGUNDA TENTATIVA: Fallback cliente direto e via proxies CORS para o index.html standalone
    const exportUrl = extractGoogleSheetsExportUrl(trimmedInput, effectiveTabOrGid, 'export');
    const gvizUrl = extractGoogleSheetsExportUrl(trimmedInput, effectiveTabOrGid, 'gviz');
    const foundGid = extractGoogleDriveGid(trimmedInput) || '';

    const urlsToTry: string[] = [];
    if (gvizUrl) urlsToTry.push(gvizUrl);
    if (foundGid) {
      const gidGviz = `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&gid=${foundGid}`;
      if (!urlsToTry.includes(gidGviz)) urlsToTry.push(gidGviz);
    }
    if (exportUrl && !urlsToTry.includes(exportUrl)) urlsToTry.push(exportUrl);
    if (foundGid) {
      const gidExport = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${foundGid}`;
      if (!urlsToTry.includes(gidExport)) urlsToTry.push(gidExport);
    }

    // Proxies CORS para funcionamento standalone quando executado sem backend local
    if (gvizUrl) {
      urlsToTry.push(
        `https://corsproxy.io/?url=${encodeURIComponent(gvizUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(gvizUrl)}`
      );
    }

    let csvData = '';
    let isHtmlResponse = false;

    for (const url of urlsToTry) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'text/csv,text/plain,*/*',
          },
        });
        if (response.ok) {
          const text = await response.text();
          const clean = text.trim();
          if (
            clean.startsWith('<!DOCTYPE') ||
            clean.startsWith('<html') ||
            clean.includes('<title>') ||
            clean.includes('google-signin')
          ) {
            isHtmlResponse = true;
          } else if (clean.length > 0 && !clean.startsWith('{')) {
            csvData = clean;
            break;
          }
        }
      } catch {
        // Erro de rede ou bloqueio de CORS do navegador
      }
    }

    setIsLoadingUrl(false);

    if (csvData) {
      processDriveRawText(csvData);
    } else {
      setInputMode('PASTE_FILE');
      setStatusMessage({
        type: 'error',
        text: isHtmlResponse
          ? 'Esta planilha está restrita no Google Drive (privada da sua conta/organização) e requer permissão para leitura via link ("Qualquer pessoa com o link pode ver"). Alternamos para a opção "COLAR DADOS": copie as células na planilha (Ctrl+C) e cole no campo abaixo (Ctrl+V)!'
          : 'Não foi possível ler diretamente pela URL (restrição de permissão do Google Drive ou CORS). Alternamos para a opção "COLAR DADOS": copie as células na planilha (Ctrl+C) e cole no campo abaixo (Ctrl+V)!',
      });
    }
  };

  // Process raw text (from paste, file, or URL)
  const processDriveRawText = (raw: string) => {
    setStatusMessage(null);
    if (!raw.trim()) {
      setStatusMessage({ type: 'error', text: 'Nenhum dado informado para processar.' });
      return;
    }

    if (driveSubTab === 'CONTRATOS') {
      const parsed = parseContratosFromDriveText(raw);
      if (parsed.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'Não foi possível mapear linhas de contratos no texto fornecido. Verifique os dados.',
        });
        setParsedContratosPreview(null);
      } else {
        setParsedContratosPreview(parsed);
      }
    } else if (driveSubTab === 'EMP') {
      const parsed = parseEmpFromDriveText(raw);
      if (parsed.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'Não foi possível mapear linhas de notas de empenho no texto fornecido.',
        });
        setParsedEmpPreview(null);
      } else {
        setParsedEmpPreview(parsed);
      }
    } else if (driveSubTab === 'LIQ') {
      const parsed = parseLiqFromDriveText(raw, contratos);
      if (parsed.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'Não foi possível mapear linhas de liquidação/medição no texto fornecido. Verifique se copiou as colunas G (Nº LIQ), W (Data), I (Empenho) e AF (Valor) da guia LIQ.',
        });
        setParsedLiqPreview(null);
      } else {
        setParsedLiqPreview(parsed);
      }
    }
  };

  // Import file handler (supports .xlsx, .xls, .csv, .txt, .tsv)
  const handleImportDriveFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();

    if (isExcel) {
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer) return;
        const extracted = extractSpreadsheetTextFromArrayBuffer(buffer, driveSubTab);
        processDriveRawText(extracted);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        const content = event.target?.result as string;
        processDriveRawText(content);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  // Toggle selection for a single row
  const toggleSelectRow = (idx: number) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedIndices(next);
  };

  // Toggle select all
  const toggleSelectAll = (totalCount: number) => {
    if (selectedIndices.size === totalCount) {
      setSelectedIndices(new Set());
    } else {
      const all = new Set<number>();
      for (let i = 0; i < totalCount; i++) all.add(i);
      setSelectedIndices(all);
    }
  };

  // Confirm Import Contratos
  const handleConfirmContratosImport = () => {
    if (!parsedContratosPreview) return;

    const filtered = parsedContratosPreview.filter((_, idx) => selectedIndices.has(idx));
    if (filtered.length === 0) {
      alert('Nenhum contrato selecionado para importação.');
      return;
    }

    let updated = replaceExisting ? [] : [...contratos];
    filtered.forEach((incoming) => {
      if (!incoming.numero) return;
      const numeroFinal = formatContractNumber(incoming.numero, incoming.dataInicio, incoming.processoSigadoc, '2024');
      const idx = updated.findIndex((c) => isSameContractNumber(c.numero, numeroFinal));
      if (idx >= 0) {
        const existingCredor = updated[idx].codigoCredor && !isCnpjValue(updated[idx].codigoCredor) ? updated[idx].codigoCredor : '';
        const incomingCredor = incoming.codigoCredor && !isCnpjValue(incoming.codigoCredor) ? incoming.codigoCredor : '';
        const resolvedCredor = incomingCredor || existingCredor || resolveCodigoCredor('', incoming.cnpj || updated[idx].cnpj) || '';

        updated[idx] = {
          ...updated[idx],
          ...incoming,
          numero: numeroFinal,
          codigoCredor: resolvedCredor,
        } as Contrato;
      } else {
        const incomingCredor = incoming.codigoCredor && !isCnpjValue(incoming.codigoCredor) ? incoming.codigoCredor : '';
        const resolvedCredor = incomingCredor || resolveCodigoCredor('', incoming.cnpj) || '';

        updated.push({
          id: incoming.id || `c-${numeroFinal.replace(/[^0-9/]/g, '')}`,
          numero: numeroFinal,
          processoSigadoc: incoming.processoSigadoc || '',
          tipo: incoming.tipo || 'OBRAS',
          descricao: incoming.descricao || incoming.objeto || '',
          razaoSocial: incoming.razaoSocial || '',
          cnpj: incoming.cnpj || '',
          codigoCredor: resolvedCredor,
          fiscal: incoming.fiscal || '',
          substituto: incoming.substituto || '',
          valorContratado: incoming.valorContratado || 0,
          valorContratadoNaoExecutado: incoming.valorContratadoNaoExecutado || 0,
          valorEmpenhado: incoming.valorEmpenhado || 0,
          valorMedido: incoming.valorMedido || 0,
          valorLiquidado: incoming.valorLiquidado || 0,
          valorPago: incoming.valorPago || 0,
          saldoContrato: incoming.saldoContrato || 0,
          dataInicio: incoming.dataInicio || '01/01/2025',
          dataFim: incoming.dataFim || '31/12/2026',
          diasVencer: incoming.diasVencer || 300,
          execucaoFisica: incoming.execucaoFisica || 0,
          objeto: incoming.objeto || incoming.descricao || '',
          regioes: [],
          empenhos: [],
          medicoes: [],
          pagamentos: [],
          conformidade: {
            itens: [],
            observacoes: '',
            data: new Date().toLocaleDateString('pt-BR'),
            valorEncaminhado: incoming.valorContratado || 0,
            assinante: { nome: '', cargo: '', setor: '' },
          },
        });
      }
    });

    onImportData(updated);
    setParsedContratosPreview(null);
    setImportPasteText('');
    setStatusMessage({ type: 'success', text: `${filtered.length} contratos importados com sucesso no sistema!` });
    setTimeout(() => onClose(), 1000);
  };

  // Confirm Import EMP
  const handleConfirmEmpImport = () => {
    if (!parsedEmpPreview) return;

    const filtered = parsedEmpPreview.filter((_, idx) => selectedIndices.has(idx));
    if (filtered.length === 0) {
      setStatusMessage({ type: 'error', text: 'Nenhuma nota de empenho selecionada para importação.' });
      return;
    }

    const updated = contratos.map((c) => {
      const matchedRows = filtered.filter((r) => isSameContractNumber(r.contratoNumero, c.numero));

      if (replaceExisting) {
        if (matchedRows.length === 0) return c;
        const newEmpList: Empenho[] = matchedRows.map((r) => r.empenho);
        const totalEmp = newEmpList.reduce((acc, e) => acc + e.valorTotal, 0);
        return {
          ...c,
          empenhos: newEmpList,
          valorEmpenhado: totalEmp > 0 ? totalEmp : (newEmpList.length > 0 ? totalEmp : c.valorEmpenhado),
        };
      } else {
        if (matchedRows.length === 0) return c;
        const newEmpList: Empenho[] = [...(c.empenhos || [])];
        matchedRows.forEach((r) => {
          const existingIdx = newEmpList.findIndex(
            (e) => e.numeroEmp.trim() === r.empenho.numeroEmp.trim()
          );
          if (existingIdx >= 0) {
            newEmpList[existingIdx] = {
              ...r.empenho,
              saldoDisponivel: newEmpList[existingIdx].saldoDisponivel,
              saldoEmpenho: r.empenho.saldoEmpenho !== undefined ? r.empenho.saldoEmpenho : newEmpList[existingIdx].saldoEmpenho,
            };
          } else {
            newEmpList.push(r.empenho);
          }
        });
        const totalEmp = newEmpList.reduce((acc, e) => acc + e.valorTotal, 0);
        return {
          ...c,
          empenhos: newEmpList,
          valorEmpenhado: totalEmp > 0 ? totalEmp : c.valorEmpenhado,
        };
      }
    });

    // Add any contracts from filtered that are not yet in updated, grouping all their empenhos
    filtered.forEach((r) => {
      if (!r.contratoNumero) return;
      const existingNew = updated.find((c) => isSameContractNumber(c.numero, r.contratoNumero));
      if (!existingNew) {
        updated.push({
          id: `contrato-${r.contratoNumero.replace(/[^a-zA-Z0-9]/g, '-')}`,
          numero: r.contratoNumero,
          processoSigadoc: r.empenho.numeroProcesso || '',
          tipo: 'OBRAS',
          descricao: `CONTRATO Nº ${r.contratoNumero}`,
          razaoSocial: 'A DEFINIR',
          cnpj: '',
          fiscal: 'A DEFINIR',
          substituto: '',
          valorContratado: r.empenho.valorTotal || 0,
          valorEmpenhado: r.empenho.valorTotal || 0,
          valorLiquidado: 0,
          valorPago: 0,
          valorMedido: 0,
          saldoContrato: r.empenho.valorTotal || 0,
          valorContratadoNaoExecutado: r.empenho.valorTotal || 0,
          dataInicio: '01/01/2025',
          dataFim: '31/12/2026',
          diasVencer: 300,
          execucaoFisica: 0,
          objeto: `CONTRATO Nº ${r.contratoNumero}`,
          regioes: r.empenho.regiao ? [{ id: `reg-${Date.now()}`, nome: r.empenho.regiao, valor: r.empenho.valorTotal }] : [],
          empenhos: [r.empenho],
          medicoes: [],
          pagamentos: [],
          conformidade: {
            itens: [],
            observacoes: '',
            data: new Date().toLocaleDateString('pt-BR'),
            valorEncaminhado: r.empenho.valorTotal || 0,
            assinante: { nome: '', cargo: '', setor: '' },
          },
        });
      } else {
        // Ensure additional empenhos for this newly created contract are appended (never dropped)
        const wasOriginal = contratos.some((orig) => isSameContractNumber(orig.numero, r.contratoNumero));
        if (!wasOriginal) {
          const dupIdx = existingNew.empenhos.findIndex(
            (e) => e.numeroEmp.trim() === r.empenho.numeroEmp.trim()
          );
          if (dupIdx >= 0) {
            existingNew.empenhos[dupIdx] = r.empenho;
          } else {
            existingNew.empenhos.push(r.empenho);
          }
          const sumEmp = existingNew.empenhos.reduce((acc, e) => acc + (e.valorTotal || 0), 0);
          existingNew.valorEmpenhado = sumEmp;
          existingNew.valorContratado = sumEmp;
          existingNew.saldoContrato = sumEmp;
          existingNew.valorContratadoNaoExecutado = sumEmp;
        }
      }
    });

    onImportData(updated);
    setParsedEmpPreview(null);
    setImportPasteText('');
    setStatusMessage({ type: 'success', text: `${filtered.length} nota(s) de empenho vinculadas com sucesso!` });
    setTimeout(() => onClose(), 1000);
  };

  // Confirm Import LIQ
  const handleConfirmLiqImport = () => {
    if (!parsedLiqPreview) return;

    const filtered = parsedLiqPreview.filter((_, idx) => selectedIndices.has(idx));
    if (filtered.length === 0) {
      alert('Nenhum pagamento/liquidação selecionado para importação.');
      return;
    }

    const updated = contratos.map((c) => {
      const matchedRows = filtered.filter((r) => isSameContractNumber(r.contratoNumero, c.numero));
      if (matchedRows.length === 0) {
        // Ensure any past LIQ entries are cleaned from medicoes
        const cleanMedicoes = (c.medicoes || []).filter(
          (m) =>
            !m.id?.startsWith('med-drive-') &&
            !(
              m.numeroMed?.toUpperCase().startsWith('LIQ ') &&
              m.descricao?.toUpperCase().startsWith('LIQUIDAÇÃO Nº')
            )
        );
        return {
          ...c,
          medicoes: cleanMedicoes,
        };
      }

      const newPagamentos: Pagamento[] = matchedRows.map((r) => r.pagamento);
      let finalPagamentosList: Pagamento[] = [];

      if (replaceExisting) {
        finalPagamentosList = newPagamentos;
      } else {
        finalPagamentosList = [...(c.pagamentos || [])];
        newPagamentos.forEach((np) => {
          const exists = finalPagamentosList.some(
            (p) => p.ordemBancaria === np.ordemBancaria && p.dataPagamento === np.dataPagamento
          );
          if (!exists) {
            finalPagamentosList.push(np);
          }
        });
      }

      // DO NOT add LIQ rows to medicoes; clean out any existing LIQ rows from medicoes
      const cleanMedicoesList = (c.medicoes || []).filter(
        (m) =>
          !m.id?.startsWith('med-drive-') &&
          !(
            m.numeroMed?.toUpperCase().startsWith('LIQ ') &&
            m.descricao?.toUpperCase().startsWith('LIQUIDAÇÃO Nº')
          )
      );

      const totalPago = finalPagamentosList.reduce((acc, p) => acc + p.valorBruto, 0);

      return {
        ...c,
        pagamentos: finalPagamentosList,
        // Vincula SOMENTE à janela de pagamentos, mantendo histórico de medições limpo
        medicoes: cleanMedicoesList,
        valorPago: totalPago,
        valorLiquidado: totalPago,
        saldoContrato: Math.max((c.valorContratado || 0) - totalPago, 0),
        valorContratadoNaoExecutado: Math.max((c.valorContratado || 0) - (c.valorMedido > 0 ? c.valorMedido : totalPago), 0),
        execucaoFisica:
          c.valorContratado > 0
            ? Math.min(100, Math.round(((c.valorMedido > 0 ? c.valorMedido : totalPago) / c.valorContratado) * 100))
            : 0,
      };
    });

    // Check if any incoming contract wasn't yet in the list and add it only if valid
    filtered.forEach((r) => {
      const exists = updated.some((c) => isSameContractNumber(c.numero, r.contratoNumero));
      if (!exists && r.contratoNumero && !isInvalidContractNumber(r.contratoNumero)) {
        const total = r.pagamento.valorBruto;
        updated.push({
          id: `c-${r.contratoNumero.replace(/[^0-9/]/g, '')}`,
          numero: r.contratoNumero,
          processoSigadoc: '',
          tipo: 'OBRAS',
          descricao: `CONTRATO ${r.contratoNumero}`,
          razaoSocial: 'EMPRESA CONTRATADA',
          cnpj: '',
          fiscal: 'FISCAL DESIGNADO',
          substituto: '',
          valorContratado: total,
          valorContratadoNaoExecutado: 0,
          valorEmpenhado: total,
          valorMedido: 0,
          valorLiquidado: total,
          valorPago: total,
          saldoContrato: 0,
          dataInicio: '01/01/2025',
          dataFim: '31/12/2026',
          diasVencer: 300,
          execucaoFisica: 0,
          objeto: `CONTRATO ${r.contratoNumero}`,
          regioes: [],
          empenhos: [],
          medicoes: [],
          pagamentos: [r.pagamento],
          conformidade: {
            itens: [],
            observacoes: '',
            data: new Date().toLocaleDateString('pt-BR'),
            valorEncaminhado: total,
            assinante: { nome: '', cargo: '', setor: '' },
          },
        });
      }
    });

    onImportData(updated);
    setParsedLiqPreview(null);
    setImportPasteText('');
    setStatusMessage({
      type: 'success',
      text: `${filtered.length} pagamento(s) / liquidação(ões) vinculados com sucesso à janela de pagamentos!`,
    });
    setTimeout(() => onClose(), 1000);
  };

  // Export handlers
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(contratos, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `backup_contratos_orcamento_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportDriveSheet = (subTab: DriveSubTab) => {
    const dateStr = new Date().toISOString().slice(0, 10);
    if (subTab === 'CONTRATOS') {
      const csv = generateContratosDriveExport(contratos);
      triggerFileDownload(csv, `Planilha_Drive_Aba_Contratos_${dateStr}.csv`);
    } else if (subTab === 'EMP') {
      const csv = generateEmpDriveExport(contratos);
      triggerFileDownload(csv, `Planilha_Drive_Aba_EMP_${dateStr}.csv`);
    } else if (subTab === 'LIQ') {
      const csv = generateLiqDriveExport(contratos);
      triggerFileDownload(csv, `Planilha_Drive_Aba_LIQ_${dateStr}.csv`);
    }
  };

  const handleCopyDriveSheet = (subTab: DriveSubTab) => {
    if (subTab === 'CONTRATOS') {
      const tsv = generateContratosDriveExport(contratos, '\t');
      handleCopyText(tsv, 'CONTRATOS');
    } else if (subTab === 'EMP') {
      const tsv = generateEmpDriveExport(contratos, '\t');
      handleCopyText(tsv, 'EMP');
    } else if (subTab === 'LIQ') {
      const tsv = generateLiqDriveExport(contratos, '\t');
      handleCopyText(tsv, 'LIQ');
    }
  };

  // Subtitle matching Print
  const getSubTitleText = () => {
    if (formatType === 'JSON') {
      return mainTab === 'Importar'
        ? 'RESTAURAÇÃO DE BACKUP INTEGRAL DO BANCO DE DADOS EM FORMATO JSON'
        : 'EXPORTAÇÃO DE CÓPIA DE SEGURANÇA INTEGRAL EM FORMATO JSON';
    }
    if (driveSubTab === 'CONTRATOS') {
      return mainTab === 'Importar'
        ? 'IMPORTAÇÃO E CADASTRO DE CONTRATOS (ABA CONSULTAR CONTRATO - FIPLAN)'
        : 'EXPORTAÇÃO E ATUALIZAÇÃO DE CONTRATOS (ABA CONSULTAR CONTRATO - FIPLAN)';
    }
    if (driveSubTab === 'EMP') {
      return mainTab === 'Importar'
        ? 'IMPORTAÇÃO DE NOTAS DE EMPENHO VINCULADAS AOS CONTRATOS (ABA EMP)'
        : 'EXPORTAÇÃO DE NOTAS DE EMPENHO (ABA EMP)';
    }
    return mainTab === 'Importar'
      ? 'IMPORTAÇÃO DE PAGAMENTOS / LIQUIDAÇÕES (ABA LIQ DA PLANILHA PARA A JANELA DE PAGAMENTOS)'
      : 'EXPORTAÇÃO DE PAGAMENTOS / LIQUIDAÇÕES (ABA LIQ)';
  };

  // Is review screen active?
  const isReviewActive =
    mainTab === 'Importar' &&
    formatType === 'Planilha do drive' &&
    (parsedEmpPreview !== null || parsedContratosPreview !== null || parsedLiqPreview !== null);

  const resetReviewMode = () => {
    setParsedEmpPreview(null);
    setParsedContratosPreview(null);
    setParsedLiqPreview(null);
  };

  if (!isFullPage && !isOpen) return null;

  const modalInner = (
    <div className={`bg-white rounded-xl shadow-md w-full flex flex-col overflow-hidden border border-slate-300 ${
      isFullPage ? 'min-h-[calc(100vh-80px)] flex-1' : 'max-w-5xl h-[630px] max-h-[92vh] shadow-2xl'
    }`}>
      {/* Header (Matching Print) */}
      <div className="bg-[#1b346d] text-white px-4 sm:px-6 py-3.5 flex items-center justify-between border-b border-[#142854] shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#254284] rounded border border-[#3b5ba5]">
            {formatType === 'JSON' ? (
              <FileText className="w-5 h-5 text-white" />
            ) : (
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide">
              {`${mainTab.toUpperCase()} PLANILHA DO DRIVE`}
            </h3>
            <p className="text-[11px] text-slate-300 font-medium">
              {getSubTitleText()}
            </p>
          </div>
        </div>
        {/* Actions: Close */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer transition-colors"
            title="Fechar Janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

        {/* ============================================================== */}
        {/* SCREEN 1: REVIEW CONFIRMATION SCREEN (MATCHING PRINT EXACTLY)  */}
        {/* ============================================================== */}
        {isReviewActive ? (
          <div className="flex flex-col flex-1 overflow-hidden p-6 space-y-4">
            {/* Top Banner (Print: "84 NOTA(S) DE EMPENHO IDENTIFICADA(S)...") */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                    {parsedEmpPreview && `${parsedEmpPreview.length} NOTA(S) DE EMPENHO IDENTIFICADA(S)`}
                    {parsedContratosPreview && `${parsedContratosPreview.length} CONTRATO(S) IDENTIFICADO(S)`}
                    {parsedLiqPreview && `${parsedLiqPreview.length} MEDIÇÃO(ÕES) / LIQUIDAÇÃO(ÕES) IDENTIFICADA(S)`}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    VERIFIQUE O VÍNCULO COM OS CONTRATOS E OS VALORES ANTES DE CONFIRMAR.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const total =
                      parsedEmpPreview?.length ||
                      parsedContratosPreview?.length ||
                      parsedLiqPreview?.length ||
                      0;
                    toggleSelectAll(total);
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline uppercase cursor-pointer"
                >
                  {selectedIndices.size ===
                  (parsedEmpPreview?.length || parsedContratosPreview?.length || parsedLiqPreview?.length || 0)
                    ? 'DESMARCAR TODOS'
                    : 'SELECIONAR TODOS'}
                </button>

                <div className="px-3 py-1 bg-slate-100 border border-slate-300 rounded-md text-xs font-bold text-slate-700 uppercase">
                  {selectedIndices.size} SELECIONADO(S)
                </div>
              </div>
            </div>

            {/* Review Table Container (Matching Print with Blue Header & Selection Checkboxes) */}
            <div className="flex-1 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs flex flex-col min-h-[280px]">
              <div className="overflow-auto flex-1 custom-table-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  {/* Table Header with Deep Navy Blue */}
                  <thead className="bg-[#1b346d] text-white font-bold text-xs uppercase sticky top-0 z-10 shadow-xs border-b border-[#142854]">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedIndices.size > 0 &&
                            selectedIndices.size ===
                              (parsedEmpPreview?.length ||
                                parsedContratosPreview?.length ||
                                parsedLiqPreview?.length ||
                                0)
                          }
                          onChange={() => {
                            const total =
                              parsedEmpPreview?.length ||
                              parsedContratosPreview?.length ||
                              parsedLiqPreview?.length ||
                              0;
                            toggleSelectAll(total);
                          }}
                          className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                        />
                      </th>

                      {/* Columns for EMP */}
                      {parsedEmpPreview && (
                        <>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL BJ</span>
                            CONTRATO VINCULADO
                          </th>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL B</span>
                            Nº DE EMP
                          </th>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL D</span>
                            Nº DO PROCESSO
                          </th>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL BP</span>
                            REGIÃO
                          </th>
                          <th className="p-3 text-right whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL BH</span>
                            VALOR DO EMP
                          </th>
                          <th className="p-3 text-right whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL BJ</span>
                            SALDO EMP
                          </th>
                          <th className="p-3 text-right whitespace-nowrap bg-amber-900/40 border-l border-r border-amber-500/30">
                            <span className="text-[10px] text-amber-300 block font-black">COL BM</span>
                            SALDO DO EMP (FALTA LIQ.)
                          </th>
                        </>
                      )}

                      {/* Columns for Contratos */}
                      {parsedContratosPreview && (
                        <>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL AC</span>
                            Nº DO CONTRATO
                          </th>
                          <th className="p-3 whitespace-nowrap bg-blue-900/40 text-blue-200 border-l border-r border-blue-500/30">
                            <span className="text-[10px] text-blue-200 block font-black">COL M</span>
                            CÓDIGO DO CREDOR
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[220px]">
                            <span className="text-[10px] text-blue-200 block font-normal">COL N / O</span>
                            RAZÃO SOCIAL / CNPJ
                          </th>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL L</span>
                            TIPO DE CONTRATO
                          </th>
                          <th className="p-3 whitespace-nowrap max-w-xs">
                            <span className="text-[10px] text-blue-200 block font-normal">COL AB</span>
                            DESCRIÇÃO / OBJETO
                          </th>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL Z / AA</span>
                            FISCAL / SUBSTITUTO
                          </th>
                          <th className="p-3 text-right whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL S</span>
                            VALOR CONTRATADO
                          </th>
                          <th className="p-3 text-right whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL AF</span>
                            SALDO DO CONTRATO
                          </th>
                          <th className="p-3 text-center whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL I / J</span>
                            VIGÊNCIA
                          </th>
                        </>
                      )}

                      {/* Columns for LIQ */}
                      {parsedLiqPreview && (
                        <>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL DT / EMP</span>
                            CONTRATO VINCULADO
                          </th>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL G</span>
                            Nº DA LIQUIDAÇÃO (LIQ)
                          </th>
                          <th className="p-3 text-center whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL W</span>
                            DATA DO PAGAMENTO (DATA P/ PAGTº)
                          </th>
                          <th className="p-3 whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL I</span>
                            EMPENHO (EMP)
                          </th>
                          <th className="p-3 w-[320px] min-w-[280px] max-w-[340px]">
                            <span className="text-[10px] text-blue-200 block font-normal">COL T</span>
                            HISTÓRICO DE PAGAMENTO
                          </th>
                          <th className="p-3 text-right whitespace-nowrap">
                            <span className="text-[10px] text-blue-200 block font-normal">COL AF (VALOR LIQ)</span>
                            VALOR DO PAGAMENTO
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {/* Rows for EMP */}
                    {parsedEmpPreview &&
                      parsedEmpPreview.map(({ contratoNumero, empenho }, idx) => {
                        const isSelected = selectedIndices.has(idx);
                        const empresaNome = getEmpresaForContrato(contratoNumero);

                        return (
                          <tr
                            key={idx}
                            onClick={() => toggleSelectRow(idx)}
                            className={`transition-colors cursor-pointer select-none ${
                              isSelected ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-white hover:bg-slate-50 opacity-60'
                            }`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectRow(idx)}
                                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                              />
                            </td>

                            {/* Contrato Vinculado with Green Company Pill */}
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-slate-900 block text-xs">
                                CONTRATO: {contratoNumero}
                              </span>
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                                <Building2 className="w-3 h-3 text-emerald-700 shrink-0" />
                                <span className="truncate max-w-[260px]">{empresaNome}</span>
                              </div>
                            </td>

                            {/* Nº de EMP */}
                            <td className="p-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                              {empenho.numeroEmp}
                            </td>

                            {/* Nº do Processo */}
                            <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                              {empenho.numeroProcesso || '-'}
                            </td>

                            {/* Região (Editável na tabela) */}
                            <td className="p-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={empenho.regiao || ''}
                                placeholder="GERAL"
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase();
                                  setParsedEmpPreview((prev) =>
                                    prev
                                      ? prev.map((item, i) =>
                                          i === idx
                                            ? { ...item, empenho: { ...item.empenho, regiao: val } }
                                            : item
                                        )
                                      : null
                                  );
                                }}
                                className="bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-2 py-1 text-xs font-medium uppercase text-slate-800 outline-none w-36 transition-colors"
                                title="Clique para editar a região deste empenho"
                              />
                            </td>

                            {/* Valor Total (Bold Blue) */}
                            <td className="p-3 text-right font-bold text-blue-600 font-mono whitespace-nowrap">
                              {formatCurrency(empenho.valorTotal)}
                            </td>

                            {/* Saldo Disponível (Coluna BJ) */}
                            <td className="p-3 text-right font-bold text-emerald-600 font-mono whitespace-nowrap">
                              {formatCurrency(empenho.saldoDisponivel)}
                            </td>

                            {/* Saldo do EMP (Coluna BM - Falta Liquidar) */}
                            <td className="p-3 text-right font-mono whitespace-nowrap bg-amber-50/50">
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs" title="Saldo do empenho na planilha do Drive (Coluna BM da guia EMP)">
                                {formatCurrency(empenho.saldoEmpenho !== undefined ? empenho.saldoEmpenho : empenho.saldoDisponivel)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}

                    {/* Rows for Contratos */}
                    {parsedContratosPreview &&
                      parsedContratosPreview.map((c, idx) => {
                        const isSelected = selectedIndices.has(idx);

                        return (
                          <tr
                            key={idx}
                            onClick={() => toggleSelectRow(idx)}
                            className={`transition-colors cursor-pointer select-none ${
                              isSelected ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-white hover:bg-slate-50 opacity-60'
                            }`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectRow(idx)}
                                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                              />
                            </td>

                            {/* 1. COL AC: Nº DO CONTRATO */}
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-bold text-slate-900 block text-xs">
                                CONTRATO: {c.numero}
                              </span>
                              {c.processoSigadoc && c.processoSigadoc !== 'NÃO INFORMADO' && (
                                <span className="text-[10px] text-blue-600 block mt-0.5 font-mono">
                                  {c.processoSigadoc}
                                </span>
                              )}
                            </td>

                            {/* 2. COL M: CÓDIGO DO CREDOR */}
                            <td className="p-3 whitespace-nowrap font-mono text-xs">
                              {c.codigoCredor && !isCnpjValue(c.codigoCredor) ? (
                                <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-bold">
                                  {c.codigoCredor}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">-</span>
                              )}
                            </td>

                            {/* 3. COL N: RAZÃO SOCIAL */}
                            <td className="p-3 whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-100/90 text-emerald-900 border border-emerald-300 text-xs font-bold max-w-[280px]">
                                <Building2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span className="truncate" title={c.razaoSocial}>{c.razaoSocial}</span>
                              </div>
                              {c.cnpj && (
                                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                                  CNPJ: {c.cnpj}
                                </span>
                              )}
                            </td>

                            {/* 3. COL L: TIPO DE CONTRATO */}
                            <td className="p-3 uppercase font-medium text-slate-700 whitespace-nowrap">
                              {c.tipo}
                            </td>

                            {/* 4. COL AB: DESCRIÇÃO / OBJETO */}
                            <td className="p-3 text-slate-600 max-w-xs truncate text-[11px]" title={c.descricao}>
                              {c.descricao || '-'}
                            </td>

                            {/* 5. COL Z / AA: FISCAL / SUBSTITUTO */}
                            <td className="p-3 whitespace-nowrap text-[11px]">
                              <span className="font-bold text-slate-800 block">{c.fiscal}</span>
                              {c.substituto && <span className="text-slate-500 block text-[10px]">SUB: {c.substituto}</span>}
                            </td>

                            {/* 6. COL S: VALOR CONTRATADO */}
                            <td className="p-3 text-right font-bold text-blue-600 font-mono whitespace-nowrap">
                              {formatCurrency(c.valorContratado || 0)}
                            </td>

                            {/* 7. COL AF: SALDO DO CONTRATO */}
                            <td className="p-3 text-right font-bold text-emerald-600 font-mono whitespace-nowrap">
                              {formatCurrency(c.saldoContrato || 0)}
                            </td>

                            {/* 8. COL I / J: VIGÊNCIA */}
                            <td className="p-3 text-center text-slate-600 text-[11px] whitespace-nowrap">
                              {c.dataInicio} a {c.dataFim}
                            </td>
                          </tr>
                        );
                      })}

                    {/* Rows for LIQ */}
                    {parsedLiqPreview &&
                      parsedLiqPreview.map(({ contratoNumero, pagamento }, idx) => {
                        const isSelected = selectedIndices.has(idx);
                        const empresaNome = getEmpresaForContrato(contratoNumero);

                        return (
                          <tr
                            key={idx}
                            onClick={() => toggleSelectRow(idx)}
                            className={`transition-colors cursor-pointer select-none ${
                              isSelected ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-white hover:bg-slate-50 opacity-60'
                            }`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectRow(idx)}
                                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                              />
                            </td>

                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <span className="font-bold text-slate-900 text-xs">CONTRATO:</span>
                                <select
                                  value={contratoNumero}
                                  onChange={(e) => {
                                    const newNum = e.target.value;
                                    setParsedLiqPreview((prev) =>
                                      prev ? prev.map((item, i) => (i === idx ? { ...item, contratoNumero: newNum } : item)) : null
                                    );
                                  }}
                                  className="text-xs font-bold text-blue-700 bg-white border border-slate-300 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:border-blue-500"
                                >
                                  {contratos.map((c) => (
                                    <option key={c.id} value={c.numero}>
                                      {c.numero}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {empresaNome && empresaNome !== 'EMPRESA NÃO IDENTIFICADA' && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                                  <Building2 className="w-3 h-3 text-emerald-700 shrink-0" />
                                  <span className="truncate max-w-[260px]">{empresaNome}</span>
                                </div>
                              )}
                            </td>

                            <td className="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                              {pagamento.ordemBancaria || '-'}
                            </td>

                            <td className="p-3 text-center text-slate-700 whitespace-nowrap font-medium">
                              {pagamento.dataPagamento || '-'}
                            </td>

                            <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                              {pagamento.medicaoVinculada || '-'}
                            </td>

                            <td className="p-3 text-slate-700 text-xs font-mono w-[320px] min-w-[280px] max-w-[340px] whitespace-normal break-words" title={pagamento.historico}>
                              <div className="max-h-24 overflow-y-auto leading-relaxed text-[11px] pr-1">
                                {formatHistoricoDisplay(pagamento.historico)}
                              </div>
                            </td>

                            <td className="p-3 text-right font-bold text-emerald-700 font-mono whitespace-nowrap">
                              {formatCurrency(pagamento.valorBruto)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Replace Checkbox Option (Matching Print) */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
              />
              <span>
                {parsedEmpPreview &&
                  'SUBSTITUIR TODAS AS NOTAS DE EMPENHO ATUAIS (SE DESMARCADO, SERÃO ADICIONADAS / ATUALIZADAS)'}
                {parsedContratosPreview &&
                  'SUBSTITUIR TODOS OS CONTRATOS ATUAIS (SE DESMARCADO, SERÃO ADICIONADOS / ATUALIZADOS)'}
                {parsedLiqPreview &&
                  'SUBSTITUIR TODOS OS PAGAMENTOS ATUAIS (SE DESMARCADO, SERÃO ADICIONADOS / ATUALIZADOS)'}
              </span>
            </label>

            {/* Bottom Action Footer (Matching Print: Return, Cancel, and Green Import Button) */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-200">
              <button
                type="button"
                onClick={resetReviewMode}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 uppercase cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>← VOLTAR E AJUSTAR OPÇÕES</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold uppercase text-slate-700 transition-colors cursor-pointer"
                >
                  CANCELAR
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (parsedEmpPreview) handleConfirmEmpImport();
                    else if (parsedContratosPreview) handleConfirmContratosImport();
                    else if (parsedLiqPreview) handleConfirmLiqImport();
                  }}
                  disabled={selectedIndices.size === 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-black uppercase transition-all cursor-pointer shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {parsedEmpPreview && `IMPORTAR ${selectedIndices.size} NOTA(S) DE EMPENHO`}
                    {parsedContratosPreview && `IMPORTAR ${selectedIndices.size} CONTRATO(S)`}
                    {parsedLiqPreview && `IMPORTAR ${selectedIndices.size} PAGAMENTO(S)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ============================================================== */
          /* SCREEN 2: STANDARD NAVIGATION & INPUT CONFIGURATION SCREEN     */
          /* ============================================================== */
          <>
            {/* Level 1: Main Tabs (Importar | Exportar) */}
            <div className="bg-slate-100 border-b border-slate-200 px-6 pt-3 flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setMainTab('Importar');
                  setStatusMessage(null);
                }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-t-lg text-xs font-bold tracking-wider transition-all cursor-pointer border-t border-x ${
                  mainTab === 'Importar'
                    ? 'bg-white border-slate-200 text-blue-700 shadow-2xs -mb-px'
                    : 'bg-slate-200/70 border-transparent text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Importar</span>
              </button>

              <button
                onClick={() => {
                  setMainTab('Exportar');
                  setStatusMessage(null);
                }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-t-lg text-xs font-bold tracking-wider transition-all cursor-pointer border-t border-x ${
                  mainTab === 'Exportar'
                    ? 'bg-white border-slate-200 text-blue-700 shadow-2xs -mb-px'
                    : 'bg-slate-200/70 border-transparent text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Exportar</span>
              </button>
            </div>

            {/* Level 2: Format Selector (Left) & Sheet SubTabs (Right) on the same row */}
            <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between gap-4 shrink-0 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                    FORMATO:
                  </span>
                  <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                    <button
                      onClick={() => {
                        setFormatType('Planilha do drive');
                        setStatusMessage(null);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        formatType === 'Planilha do drive'
                          ? 'bg-white text-emerald-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Planilha do drive</span>
                    </button>

                    <button
                      onClick={() => {
                        setFormatType('JSON');
                        setStatusMessage(null);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                        formatType === 'JSON'
                          ? 'bg-white text-blue-700 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>JSON</span>
                    </button>
                  </div>
                </div>

                {/* Sub-tabs positioned on the right of the FORMATO row (apenas no modo Importar) */}
                {formatType === 'Planilha do drive' && mainTab === 'Importar' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleSelectDriveSubTab('CONTRATOS')}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-black uppercase transition-all cursor-pointer border ${
                        driveSubTab === 'CONTRATOS'
                          ? 'bg-[#1b346d] text-white border-[#1b346d] shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>CONTRATOS (FIPLAN)</span>
                    </button>

                    <button
                      onClick={() => handleSelectDriveSubTab('EMP')}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-black uppercase transition-all cursor-pointer border ${
                        driveSubTab === 'EMP'
                          ? 'bg-[#1b346d] text-white border-[#1b346d] shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>EMPENHOS (EMP)</span>
                    </button>

                    <button
                      onClick={() => handleSelectDriveSubTab('LIQ')}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-black uppercase transition-all cursor-pointer border ${
                        driveSubTab === 'LIQ'
                          ? 'bg-[#1b346d] text-white border-[#1b346d] shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span>PAGAMENTOS (LIQ)</span>
                    </button>

                    {contratos.length > 0 && (
                      <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 pl-3">
                        <select
                          value={selectedContratoFilter}
                          onChange={(e) => setSelectedContratoFilter(e.target.value)}
                          className="text-[11px] font-bold px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 cursor-pointer max-w-[190px] truncate"
                          title="Filtrar por Contrato específico"
                        >
                          <option value="ALL">TODOS OS CONTRATOS ({contratos.length})</option>
                          {contratos.map((c) => (
                            <option key={c.id || c.numero} value={c.numero}>
                              Nº {c.numero} - {c.razaoSocial}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Banner Informativo do Contrato Buscado quando há filtro ativo (destacado exclusivamente na aba Configurações) */}
              {selectedContratoFilter !== 'ALL' && (
                <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-950 shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-amber-800">
                      CONTRATO BUSCADO:
                    </span>
                    <span className="font-mono bg-amber-200/90 text-amber-950 px-2.5 py-0.5 rounded font-black text-xs border border-amber-300">
                      Nº {selectedContratoFilter}
                    </span>
                    {selectedContractObj && (
                      <span className="text-slate-700 font-semibold uppercase text-[11px]">
                        — {selectedContractObj.razaoSocial}
                      </span>
                    )}
                    <span className="text-amber-800 font-medium text-[11px]">
                      (Exibindo somente os empenho(s) com saldo cadastrados neste contrato)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedContratoFilter('ALL')}
                    className="px-2.5 py-1 rounded bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold uppercase text-[10px] tracking-wider transition-colors cursor-pointer shadow-2xs"
                  >
                    Ver Todos os Contratos ({contratos.length})
                  </button>
                </div>
              )}

            {/* Level 4: Mode selector in Import */}
            {formatType === 'Planilha do drive' && mainTab === 'Importar' && (
              <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-6 shrink-0 text-xs font-bold uppercase tracking-wide">
                <button
                  onClick={() => setInputMode('LINK')}
                  className={`py-3 flex items-center gap-1.5 border-b-2 cursor-pointer transition-all ${
                    inputMode === 'LINK'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>LINK DO GOOGLE SHEETS / DRIVE</span>
                </button>

                <button
                  onClick={() => setInputMode('PASTE_FILE')}
                  className={`py-3 flex items-center gap-1.5 border-b-2 cursor-pointer transition-all ${
                    inputMode === 'PASTE_FILE'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>COLAR DADOS / ARQUIVO (.XLSX / .CSV)</span>
                </button>
              </div>
            )}

            {/* Status Message */}
            {statusMessage && (
              <div
                className={`px-6 py-2.5 text-xs font-medium flex items-center gap-2 border-b shrink-0 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Main Content Area */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* ============================================================== */}
              {/* IMPORTAR - PLANILHA DO DRIVE                                    */}
              {/* ============================================================== */}
              {mainTab === 'Importar' && formatType === 'Planilha do drive' && (
                <>
                  {inputMode === 'LINK' && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 uppercase block tracking-wide">
                          LINK DA PLANILHA (URL)
                        </label>
                        <input
                          type="text"
                          value={sheetUrl}
                          onChange={(e) => setSheetUrl(e.target.value)}
                          placeholder="Cole aqui o link do Google Drive ou Google Sheets (ex: https://docs.google.com/... ou https://drive.google.com/file/d/...)"
                          className="w-full text-xs font-mono px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none placeholder-slate-400 text-slate-800"
                        />
                        <span className="text-[10px] text-slate-400 block uppercase">
                          Cole o link completo da planilha no Google Drive ou Google Sheets (se tiver #gid da aba, ele será considerado automaticamente).
                        </span>
                      </div>

                      <div className="space-y-1 max-w-sm">
                        <label className="text-[11px] font-bold text-slate-700 uppercase block tracking-wide">
                          NOME DA ABA OU GID ESPECÍFICO (OPCIONAL)
                        </label>
                        <input
                          type="text"
                          value={sheetTabName}
                          onChange={(e) => setSheetTabName(e.target.value)}
                          placeholder="Ex: LIQ, EMP, CONTRATOS ou 468429138"
                          className="w-full text-xs font-bold px-3.5 py-2 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-600 outline-none uppercase text-slate-800"
                        />
                        <span className="text-[10px] text-slate-400 block uppercase">
                          Informe o nome da aba ou deixe o padrão para detecção automática dos dados de {driveSubTab}.
                        </span>
                      </div>

                      {/* Direct Alternative Card */}
                      <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs text-blue-900 leading-relaxed">
                          <span className="font-bold block text-blue-950 mb-0.5">Planilha institucional ou privada no Google Drive?</span>
                          Se a planilha do Google Drive estiver restrita à sua conta/órgão (não pública), copie as células diretamente da planilha (<kbd className="px-1 py-0.5 bg-white border rounded text-[10px] font-mono">Ctrl+C</kbd>) e cole aqui:
                        </div>
                        <button
                          type="button"
                          onClick={() => setInputMode('PASTE_FILE')}
                          className="px-3.5 py-2 bg-white hover:bg-blue-50 border border-blue-300 text-blue-800 rounded text-xs font-bold uppercase transition-colors shrink-0 shadow-xs cursor-pointer text-center"
                        >
                          Colar Células / Arquivo
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-xs font-bold text-slate-500 uppercase">
                          {isLoadingUrl ? 'CARREGANDO DADOS DA PLANILHA...' : 'PRONTO PARA CARREGAR OS DADOS MAPEADOS'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded text-xs font-bold uppercase text-slate-700 transition-colors cursor-pointer"
                          >
                            CANCELAR
                          </button>
                          <button
                            type="button"
                            onClick={handleFetchGoogleSheetsUrl}
                            disabled={isLoadingUrl}
                            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer shadow-xs"
                          >
                            <span>{isLoadingUrl ? 'CARREGANDO...' : 'CARREGAR DADOS DA PLANILHA'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {inputMode === 'PASTE_FILE' && (
                    <div className="space-y-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5">
                        <span className="font-bold text-xs text-slate-800 uppercase block">
                          Colar Células da Planilha do Google Drive ({driveSubTab})
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Abra a sua planilha no Google Drive, vá na aba <strong>{driveSubTab}</strong>, selecione as linhas
                          desejadas, copie (<kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px] font-mono">Ctrl+C</kbd>)
                          e cole abaixo:
                        </p>
                        {driveSubTab === 'EMP' && (
                          <div className="bg-blue-50/80 border border-blue-200 rounded-md p-2.5 text-[11px] text-blue-900 mt-2 space-y-1">
                            <span className="font-bold block text-blue-950">Mapeamento Oficial da Guia EMP:</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 text-[11px] text-blue-800">
                              <div>• <strong>COL B:</strong> Nº de EMP</div>
                              <div>• <strong>COL D:</strong> Nº do Processo</div>
                              <div>• <strong>COL BP:</strong> Região</div>
                              <div>• <strong>COL BH:</strong> Valor do EMP (Empenhado)</div>
                              <div>• <strong>COL BJ:</strong> Saldo EMP</div>
                              <div className="bg-amber-100/70 text-amber-950 px-1 py-0.5 rounded font-bold">
                                • <strong>COL BM:</strong> Falta Liquidar por Emp (Saldo do EMP)
                              </div>
                            </div>
                            <div className="text-[10px] text-blue-700 pt-0.5">
                              • <strong>COL BK:</strong> Nº do Contrato vinculado (ex: 057/2025). Os valores de empenho são carregados estritamente da <strong>Coluna BH</strong>.
                            </div>
                          </div>
                        )}
                        {driveSubTab === 'LIQ' && (
                          <div className="bg-blue-50/80 border border-blue-200 rounded-md p-2.5 text-[11px] text-blue-900 mt-2 space-y-1">
                            <span className="font-bold block text-blue-950">Mapeamento Oficial da Guia LIQ:</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-blue-800">
                              <div>• <strong>COL G:</strong> Nº da Liquidação (LIQ)</div>
                              <div>• <strong>COL W:</strong> Data do Pagamento (Data p/ Pagtº)</div>
                              <div>• <strong>COL I:</strong> Empenho (EMP)</div>
                              <div>• <strong>COL T:</strong> Histórico de Pagamento</div>
                              <div>• <strong>COL AF:</strong> Valor do Pagamento (coluna "Valor LIQ")</div>
                              <div>• <strong>COL AJ:</strong> Tipo de Pagamento (somente "P - Credor Principal")</div>
                            </div>
                            <div className="text-[10px] text-blue-700 pt-0.5">
                              • <strong>COL DT / Vinculação:</strong> O contrato é associado automaticamente pelo nº do contrato ou pelo código do empenho.
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 uppercase">
                            Linhas Copiadas da Aba {driveSubTab} (Ctrl+V):
                          </label>
                          <label className="text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer flex items-center gap-1">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Carregar Arquivo XLSX / CSV / TXT</span>
                            <input
                              type="file"
                              accept=".xlsx,.xls,.csv,.txt,.tsv"
                              onChange={handleImportDriveFile}
                              className="hidden"
                            />
                          </label>
                        </div>

                        <textarea
                          rows={7}
                          value={importPasteText}
                          onChange={(e) => setImportPasteText(e.target.value)}
                          placeholder={`Cole aqui as linhas da aba ${driveSubTab} copiadas do Google Drive (com ou sem cabeçalho)...`}
                          className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-600 focus:bg-white outline-none placeholder-slate-400"
                        />

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => processDriveRawText(importPasteText)}
                            disabled={!importPasteText.trim()}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer shadow-2xs"
                          >
                            Processar e Visualizar Linhas
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ============================================================== */}
              {/* EXPORTAR - PLANILHA DO DRIVE                                    */}
              {/* ============================================================== */}
              {mainTab === 'Exportar' && formatType === 'Planilha do drive' && (
                <div className="space-y-4">
                  {/* Card Principal de Exportação Completa Excel (.xlsx) */}
                  <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-emerald-950 text-white rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-md border border-emerald-700/50">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-300 shrink-0" />
                        <span className="font-extrabold text-sm uppercase tracking-wide text-white">
                          Planilha Completa em Excel (.xlsx)
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
                          Multi-Abas Oficial
                        </span>
                      </div>
                      <p className="text-xs text-emerald-100/90 leading-relaxed max-w-2xl">
                        Exporta o arquivo oficial completo contendo na <strong>1ª guia o &quot;Resumo do contrato&quot;</strong> (consolidado de todos os {contratos.length} contratos) e <strong>uma guia individual para cada contrato</strong> com seus respectivos quadros de <strong>Controle do Empenho</strong> e <strong>Medições</strong>.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <button
                        onClick={() => exportFullExcelWorkbook(contratos)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 text-slate-950 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md hover:shadow-lg whitespace-nowrap"
                      >
                        <Download className="w-4 h-4 stroke-[2.5]" />
                        <span>Baixar Planilha Completa (.xlsx)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* FORMATO JSON                                                   */}
              {/* ============================================================== */}
              {formatType === 'JSON' && (
                <div className="space-y-4">
                  {mainTab === 'Importar' ? (
                    <div className="space-y-4">
                      <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-4 space-y-1.5">
                        <span className="font-bold text-xs text-blue-900 uppercase block">
                          Importar Backup Completo (JSON)
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Carregue um arquivo de backup em formato <code>.json</code> para restaurar todos os 37 contratos,
                          histórico de empenhos, medições, liquidações e notas fiscais.
                        </p>
                      </div>

                      <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-lg p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center gap-2 group">
                        <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-600 transition-colors" />
                        <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700 uppercase">
                          Clique para selecionar arquivo .json
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Suporta arquivos de backup gerados pelo sistema
                        </span>
                        <input
                          type="file"
                          accept=".json"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              try {
                                const parsed = JSON.parse(event.target?.result as string);
                                if (Array.isArray(parsed) && parsed.length > 0) {
                                  setImportJsonPreview(parsed);
                                  setStatusMessage({
                                    type: 'success',
                                    text: `${parsed.length} contratos identificados no arquivo JSON. Clique em confirmar abaixo!`,
                                  });
                                }
                              } catch {
                                setStatusMessage({ type: 'error', text: 'Arquivo JSON inválido.' });
                              }
                            };
                            reader.readAsText(file);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>

                      {importJsonPreview && (
                        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-800 uppercase">
                              Prévia do Backup ({importJsonPreview.length} contratos)
                            </span>
                            <button
                              onClick={async () => {
                                if (!importJsonPreview) return;
                                try {
                                  await onImportData(importJsonPreview);
                                  setImportJsonPreview(null);
                                  setStatusMessage({ type: 'success', text: 'Backup JSON restaurado com sucesso! Somente os contratos e dados do arquivo foram importados.' });
                                  setTimeout(() => onClose(), 1200);
                                } catch (err) {
                                  setStatusMessage({ type: 'error', text: 'Falha ao restaurar dados do backup JSON.' });
                                }
                              }}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer shadow-2xs"
                            >
                              Confirmar e Restaurar Banco de Dados
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-4 space-y-2">
                        <span className="font-bold text-xs text-blue-900 uppercase block">
                          Exportar Backup Completo (JSON)
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Gera uma cópia de segurança integral em formato <code>.json</code> contendo todos os dados
                          estruturados: <strong>{contratos.length} contratos</strong>, <strong>{allEmpenhos.length} empenhos</strong>,
                          {' '}<strong>{allMedicoes.length} medições</strong> e conformidades documentais.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={handleExportJson}
                          className="p-5 border border-slate-200 hover:border-blue-500 rounded-lg bg-slate-50/50 hover:bg-blue-50/30 text-left transition-all cursor-pointer group flex items-start gap-3 shadow-2xs"
                        >
                          <Download className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-bold text-xs text-slate-800 uppercase block group-hover:text-blue-700">
                              Baixar Arquivo JSON (.json)
                            </span>
                            <span className="text-[11px] text-slate-500 mt-0.5 block">
                              Download direto do arquivo de backup para salvar no computador
                            </span>
                          </div>
                        </button>

                        <button
                          onClick={() => handleCopyText(JSON.stringify(contratos, null, 2), 'JSON')}
                          className="p-5 border border-slate-200 hover:border-blue-500 rounded-lg bg-slate-50/50 hover:bg-blue-50/30 text-left transition-all cursor-pointer group flex items-start gap-3 shadow-2xs"
                        >
                          {copiedKey === 'JSON' ? (
                            <Check className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                          ) : (
                            <Copy className="w-5 h-5 text-slate-500 group-hover:text-blue-600 mt-0.5 shrink-0" />
                          )}
                          <div>
                            <span className="font-bold text-xs text-slate-800 uppercase block group-hover:text-blue-700">
                              {copiedKey === 'JSON' ? 'Copiado para Área de Transferência!' : 'Copiar Texto JSON'}
                            </span>
                            <span className="text-[11px] text-slate-500 mt-0.5 block">
                              Copia o código JSON diretamente para colar onde desejar
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Standard Footer */}
            <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                onClick={() => {
                  if (confirm('Tem certeza que deseja restaurar para os dados originais dos 37 contratos dos prints?')) {
                    onResetData();
                    onClose();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 rounded text-xs font-bold uppercase transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Dados Originais</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-bold uppercase transition-colors cursor-pointer shadow-xs"
              >
                <span>Fechar</span>
              </button>
            </div>
          </>
        )}
      </div>
  );

  if (isFullPage) {
    return <div className="w-full flex-1 flex flex-col">{modalInner}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4">
      {modalInner}
    </div>
  );
};
