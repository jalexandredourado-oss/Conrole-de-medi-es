import React from 'react';
import { Info, Building2, Calendar, UserCheck, DollarSign, Layers, CheckCircle2 } from 'lucide-react';
import { Contrato, Empenho, Medicao } from '../../types/contract';
import {
  formatCurrency,
  formatPercent,
  formatCnpj,
  formatDataHojeBR,
  formatDataHojePorExtenso,
  formatNumeroMedicao,
  getSaldoDisponivelAposMedicao,
  getExpandedMedicoes,
  isPagamentoOfMedicao,
} from '../../utils/formatters';
import { getSignerConfig } from '../../utils/signerConfig';
import { resolveCodigoCredor, isCnpjValue } from '../../utils/driveSpreadsheetSync';
import { INITIAL_EMPENHOS_PENDENTES } from '../../data/reportData';

export interface ContractPdfTemplateProps {
  contrato: Contrato;
  mode?: 'COMPLETO' | 'CONFORMIDADE';
}

export const ContractPdfTemplate = React.forwardRef<HTMLDivElement, ContractPdfTemplateProps>(
  ({ contrato, mode = 'COMPLETO' }, ref) => {
    const signer = getSignerConfig();
    const codigoCredorFinal =
      (!isCnpjValue(contrato.codigoCredor) ? contrato.codigoCredor : '') ||
      resolveCodigoCredor('', contrato.cnpj) ||
      '-';

    // Financial metrics & chart calculations
    const maxVal = Math.max(
      contrato.valorContratado || 0,
      contrato.valorContratadoNaoExecutado || 0,
      contrato.valorEmpenhado || 0,
      contrato.valorMedido || 0,
      contrato.valorLiquidado || 0,
      contrato.valorPago || 0,
      1
    );

    const bars = [
      {
        label: 'VALOR CONTRATADO',
        value: contrato.valorContratado || 0,
        hexColor: '#10192e',
        heightPct: Math.max(((contrato.valorContratado || 0) / maxVal) * 100, 6),
      },
      {
        label: 'VALOR CONTRATADO NÃO EXECUTADO',
        value: contrato.valorContratadoNaoExecutado || 0,
        hexColor: '#3b4858',
        heightPct: Math.max(((contrato.valorContratadoNaoExecutado || 0) / maxVal) * 100, 6),
      },
      {
        label: 'VALOR EMPENHADO',
        value: contrato.valorEmpenhado || 0,
        hexColor: '#2563eb',
        heightPct: contrato.valorEmpenhado > 0 ? Math.max((contrato.valorEmpenhado / maxVal) * 100, 6) : 3,
      },
      {
        label: 'VALOR MEDIDO (ATESTADO)',
        value: contrato.valorMedido || 0,
        hexColor: '#c2410c',
        heightPct: contrato.valorMedido > 0 ? Math.max((contrato.valorMedido / maxVal) * 100, 6) : 3,
      },
      {
        label: 'VALOR LIQUIDADO',
        value: contrato.valorLiquidado || 0,
        hexColor: '#059669',
        heightPct: contrato.valorLiquidado > 0 ? Math.max((contrato.valorLiquidado / maxVal) * 100, 6) : 3,
      },
      {
        label: 'VALOR PAGO',
        value: contrato.valorPago || 0,
        hexColor: '#0d9488',
        heightPct: contrato.valorPago > 0 ? Math.max((contrato.valorPago / maxVal) * 100, 6) : 3,
      },
    ];

    // Empenhos totals
    const empenhosList = contrato.empenhos || [];
    const totalEmpenhado = empenhosList.reduce((acc, e) => acc + (e.valorTotal || 0), 0);
    const totalSaldoEmpenhos = empenhosList.reduce(
      (acc, e) => acc + (e.saldoDisponivel ?? e.saldoEmpenho ?? 0),
      0
    );

    // Medicoes totals
    const medicoesList = contrato.medicoes || [];
    const totalValorMedicoes = medicoesList.reduce((acc, m) => {
      const isCont = Boolean(
        m.isContinuation ||
        m.parentMedicaoId ||
        (m.numeroMed && (m.numeroMed.toUpperCase().includes('(CONT') || m.numeroMed.toUpperCase().includes('CONT.'))) ||
        (m.descricao && (m.descricao.toUpperCase().includes('(CONT') || m.descricao.toUpperCase().includes('CONT.')))
      );
      if (isCont) {
        return acc;
      }
      return acc + (m.valorMedicao || 0);
    }, 0);
    const totalDescontado = medicoesList.reduce(
      (acc, m) => acc + (m.valorDescontadoEmpenho || 0),
      0
    );
    const totalPendente = medicoesList.reduce((acc, m, idx) => {
      const nextM = medicoesList[idx + 1];
      const hasContinuationBelow = Boolean(
        nextM && (
          nextM.parentMedicaoId === m.id ||
          nextM.isContinuation ||
          (nextM.numeroMed && nextM.numeroMed.toUpperCase().includes('(CONT'))
        )
      );
      const isLinked = Boolean(
        m.empenhoVinculado &&
        m.empenhoVinculado.trim() !== '' &&
        m.empenhoVinculado.toUpperCase() !== 'SEM EMPENHO' &&
        m.empenhoVinculado !== '-' &&
        !m.empenhoVinculado.includes('R$') &&
        !/^\s*R?\$?\s*[\d.,]+\s*$/.test(m.empenhoVinculado)
      );
      const isContinuing =
        hasContinuationBelow ||
        (isLinked &&
          m.valorDescontadoEmpenho !== undefined &&
          m.valorDescontadoEmpenho > 0 &&
          m.valorMedicao - m.valorDescontadoEmpenho > 0.01);

      if (isContinuing || isLinked || m.empenhoVinculado === 'Pago pela UO da SESP' || !m.medicaoPendente) {
        return acc;
      }
      return acc + (m.valorPendente && m.valorPendente > 0 ? m.valorPendente : 0);
    }, 0);

    const ordensServicoList = contrato.ordensServico || [];

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

    const expandedMedicoesWithGroup = React.useMemo(() => {
      const medicoes = getExpandedMedicoes(contrato);
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
    }, [contrato]);

    return (
      <div
        ref={ref}
        style={{
          backgroundColor: '#ffffff',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          width: '1180px',
          minWidth: '1180px',
          maxWidth: '1180px',
          boxSizing: 'border-box',
          padding: '16px 14px',
          position: 'relative',
        }}
        className="w-[1180px] max-w-[1180px] bg-white text-slate-900 space-y-2.5 shadow-xl rounded border border-slate-300 print:border-none print:shadow-none print:p-0 print:space-y-2 print:overflow-visible text-xs overflow-hidden"
      >
        {/* Official Letterhead Header */}
        <div data-pdf-block="header" className="w-full text-center border-b-2 border-slate-800 pb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
            ESTADO DE MATO GROSSO — SECRETARIA DE ESTADO DE JUSTIÇA
          </span>
          <h1 className="text-sm font-black text-slate-900 uppercase tracking-wider mt-0.5">
            COORDENADORIA DE INFRAESTRUTURA E SERVIÇOS DE ENGENHARIA — CISE / SOE
          </h1>
          <h2 className="text-xs font-bold text-slate-700 uppercase mt-0.5">
            SISTEMA DE CONTROLE DE ORÇAMENTO E FISCALIZAÇÃO CONTRATUAL
          </h2>
        </div>

        {/* Banner Title */}
        <div
          data-pdf-block="title-banner"
          style={{ backgroundColor: '#1b346d', color: '#ffffff' }}
          className="w-full max-w-full box-border px-4 py-2 rounded flex items-center justify-between overflow-hidden"
        >
          <div>
            <span className="text-sm font-black uppercase tracking-wider block">
              CONTRATO Nº {contrato.numero} — {contrato.tipo}
            </span>
            <span className="text-[11px] text-blue-200 uppercase font-semibold">
              {contrato.razaoSocial}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-bold text-blue-200 block uppercase">
              {formatDataHojePorExtenso()}
            </span>
            <span className="text-[10px] text-blue-300 font-medium">
              VIGÊNCIA: {contrato.dataInicio} A {contrato.dataFim} ({contrato.diasVencer} DIAS RESTANTES)
            </span>
          </div>
        </div>

        {mode === 'COMPLETO' ? (
          <>
            {/* ============================================================ */}
            {/* JANELA 1: DETALHES DO CONTRATO                               */}
            {/* ============================================================ */}

            {/* 1.1 Execução Orçamentária e Financeira (Gráfico Oficial) */}
            <div
              data-pdf-block="chart"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              className="w-full max-w-full box-border bg-white rounded border border-slate-300 p-2.5 sm:p-3 space-y-1.5 overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-700" />
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wide">
                    1. EXECUÇÃO ORÇAMENTÁRIA E FINANCEIRA
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  VALORES EM REAIS (R$)
                </span>
              </div>

              {/* Bar Chart Area */}
              <div className="h-44 flex items-end justify-between gap-3 pt-6 pb-2 px-4 bg-slate-50 rounded border border-slate-200">
                {bars.map((bar, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                    <span className="text-[10px] font-bold font-mono text-slate-900 mb-1 whitespace-nowrap">
                      {formatCurrency(bar.value, false)}
                    </span>
                    <div
                      style={{
                        height: `${bar.heightPct}%`,
                        backgroundColor: bar.hexColor,
                      }}
                      className="w-full max-w-[85px] rounded-t-sm transition-all duration-300"
                    />
                  </div>
                ))}
              </div>

              {/* Labels below bars */}
              <div className="flex justify-between gap-3 px-4 pt-1">
                {bars.map((bar, idx) => (
                  <div key={idx} className="flex-1 text-center">
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tight block leading-tight">
                      {bar.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 1.2 Cartões de Dados Cadastrais e Fiscais */}
            <div
              data-pdf-block="cadastral-cards"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              className="grid grid-cols-2 gap-2.5 w-full max-w-full box-border overflow-hidden"
            >
              {/* Card Esquerdo: Dados Gerais */}
              <div className="border border-slate-300 rounded p-2.5 space-y-1.5 bg-white text-[11px] overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1">
                  <Building2 className="w-3.5 h-3.5 text-blue-700" />
                  <h4 className="font-black text-slate-800 uppercase tracking-wider text-[11px]">
                    DADOS DA CONTRATAÇÃO E CREDOR
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-0.5">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">RAZÃO SOCIAL:</span>
                    <span className="font-bold text-slate-900 uppercase block leading-tight">
                      {contrato.razaoSocial}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">CNPJ / CÓD. CREDOR:</span>
                    <span className="font-bold font-mono text-slate-800 block">
                      {formatCnpj(contrato.cnpj)} {codigoCredorFinal !== '-' ? `(CÓD: ${codigoCredorFinal})` : ''}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">OBJETO:</span>
                    <span className="font-semibold text-slate-800 uppercase block leading-tight">
                      {contrato.objeto || contrato.descricao}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">PROCESSO SIGADOC:</span>
                    <span className="font-bold font-mono text-blue-700 block">
                      {contrato.processoSigadoc || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Direito: Gestão e Prazos */}
              <div className="border border-slate-300 rounded p-2.5 space-y-1.5 bg-white text-[11px] overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <h4 className="font-black text-slate-800 uppercase tracking-wider text-[11px]">
                    FISCALIZAÇÃO E VIGÊNCIA
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-0.5">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">FISCAL TITULAR:</span>
                    <span className="font-bold text-slate-900 uppercase block leading-tight">
                      {contrato.fiscal || 'NÃO DESIGNADO'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">FISCAL SUBSTITUTO:</span>
                    <span className="font-semibold text-slate-700 uppercase block leading-tight">
                      {contrato.substituto || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">PERÍODO VIGÊNCIA:</span>
                    <span className="font-bold font-mono text-slate-900 block">
                      {contrato.dataInicio} A {contrato.dataFim}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">DIAS PARA VENCER:</span>
                    <span
                      className={`font-black font-mono block ${
                        contrato.diasVencer <= 30
                          ? 'text-red-700'
                          : contrato.diasVencer <= 60
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {contrato.diasVencer} DIAS
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">EXECUÇÃO FÍSICA:</span>
                    <span className="font-black font-mono text-blue-700 block">
                      {formatPercent(contrato.execucaoFisica)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">SALDO NÃO EXECUTADO:</span>
                    <span className="font-bold font-mono text-slate-800 block">
                      {formatCurrency(contrato.valorContratadoNaoExecutado)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 1.3 Tabela de Ordens de Serviço */}
            {ordensServicoList.length > 0 && (
              <div
                data-pdf-block="ordens-servico-table"
                style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                className="border border-slate-300 rounded p-2.5 bg-white space-y-1.5 w-full max-w-full box-border"
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-700" />
                    <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wider">
                      ORDENS DE SERVIÇO EMITIDAS ({ordensServicoList.length})
                    </h4>
                  </div>
                </div>
                <div className="w-full">
                <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', boxSizing: 'border-box' }} className="w-full text-left text-[11px] border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 font-bold uppercase border-b border-slate-300">
                      <th style={{ width: '18%' }} className="p-1 border-r border-slate-300">Nº OS</th>
                      <th style={{ width: '9%' }} className="p-1 border-r border-slate-300 text-center">DATA INÍCIO</th>
                      <th style={{ width: '9%' }} className="p-1 border-r border-slate-300 text-center">DATA TÉRMINO</th>
                      <th style={{ width: '7%' }} className="p-1 border-r border-slate-300 text-center">PRAZO</th>
                      <th style={{ width: '13%' }} className="p-1 border-r border-slate-300 text-right">VALOR DA OS</th>
                      <th style={{ width: '44%' }} className="p-1 pr-2">STATUS / OBSERVAÇÃO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ordensServicoList.map((os) => (
                      <tr key={os.id} className="leading-tight">
                        <td style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }} className="p-1 font-bold font-mono border-r border-slate-300 break-words">{os.numeroOs}</td>
                        <td className="p-1 font-mono text-center border-r border-slate-300 whitespace-nowrap">{os.dataEmissao || '-'}</td>
                        <td className="p-1 font-mono text-center border-r border-slate-300">-</td>
                        <td className="p-1 font-mono text-center border-r border-slate-300">-</td>
                        <td className="p-1 font-bold font-mono text-right border-r border-slate-300 whitespace-nowrap">
                          {formatCurrency(os.valorTotal)}
                        </td>
                        <td style={{ overflowWrap: 'break-word' }} className="p-1 pr-2 uppercase text-slate-700 break-words">{os.observacao || os.descricao || 'EM EXECUÇÃO'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* JANELA 2: EMPENHOS E MEDIÇÕES                                */}
            {/* ============================================================ */}

            {/* 2.1 Tabela de Empenhos */}
            <div
              data-pdf-block="empenhos-table"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
              className="border border-slate-300 rounded p-2.5 bg-white space-y-1.5 w-full max-w-full box-border"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-700" />
                  <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wider">
                    2. NOTAS DE EMPENHO ({empenhosList.length})
                  </h4>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono">
                  <span>
                    TOTAL EMPENHADO: <strong>{formatCurrency(totalEmpenhado)}</strong>
                  </span>
                  <span>
                    SALDO DISPONÍVEL: <strong className="text-emerald-700">{formatCurrency(totalSaldoEmpenhos)}</strong>
                  </span>
                </div>
              </div>

              {empenhosList.length === 0 ? (
                <div className="py-2 text-center text-slate-400 font-bold uppercase text-[10px]">
                  NENHUM EMPENHO CADASTRADO
                </div>
              ) : (
                <div className="w-full">
                <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', boxSizing: 'border-box' }} className="w-full text-left text-[11px] border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 font-bold uppercase border-b border-slate-300 text-slate-700 text-[10px]">
                      <th style={{ width: '20%' }} className="p-1 border-r border-slate-300 whitespace-nowrap">Nº EMP</th>
                      <th style={{ width: '20%' }} className="p-1 border-r border-slate-300">PROCESSO</th>
                      <th style={{ width: '17%' }} className="p-1 border-r border-slate-300">REGIÃO</th>
                      <th style={{ width: '21%' }} className="p-1 border-r border-slate-300 text-right">VALOR</th>
                      <th style={{ width: '22%' }} className="p-1 pr-2 text-right whitespace-nowrap">SALDO DISP.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {empenhosList.map((emp) => (
                      <tr key={emp.id} className="leading-tight">
                        <td className="p-1 font-bold font-mono border-r border-slate-300 text-slate-800 text-[10.5px] whitespace-nowrap">
                          {emp.numeroEmp}
                        </td>
                        <td className="p-1 font-mono text-slate-700 text-[10.5px] border-r border-slate-300 break-words">
                          {emp.numeroProcesso || '-'}
                        </td>
                        <td className="p-1 uppercase text-slate-700 font-medium text-[10.5px] border-r border-slate-300 break-words">
                          {emp.regiao || 'GERAL'}
                        </td>
                        <td className="p-1 font-bold font-mono text-right text-blue-700 border-r border-slate-300 text-[10.5px] whitespace-nowrap">
                          {formatCurrency(emp.valorTotal)}
                        </td>
                        <td className="p-1 pr-2 text-right whitespace-nowrap">
                          <div className="font-bold font-mono text-emerald-700 text-[10.5px]">
                            {formatCurrency(getSaldoDisponivelAposMedicao(emp, contrato.medicoes))}
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono tracking-tight">
                            {formatCurrency(getSaldoEmpenhoBM(emp))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* 2.2 Tabela de Medições */}
            <div
              data-pdf-block="medicoes-table"
              className="border border-slate-300 rounded p-2.5 bg-white space-y-1.5 w-full max-w-full box-border"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wider">
                    3. HISTÓRICO DE MEDIÇÕES LANÇADAS ({medicoesList.length})
                  </h4>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono">
                  <span>
                    TOTAL MEDIDO: <strong>{formatCurrency(totalValorMedicoes)}</strong>
                  </span>
                  <span>
                    TOTAL PENDENTE: <strong className="text-amber-700">{formatCurrency(totalPendente)}</strong>
                  </span>
                </div>
              </div>

              {expandedMedicoesWithGroup.length === 0 ? (
                <div className="py-2 text-center text-slate-400 font-bold uppercase text-[10px]">
                  NENHUMA MEDIÇÃO REGISTRADA
                </div>
              ) : (
                <div className="w-full">
                <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', boxSizing: 'border-box' }} className="w-full text-left text-[11px] border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 font-bold uppercase border-b border-slate-300 text-slate-700 text-[10px]">
                      <th style={{ width: '16%' }} className="p-1 border-r border-slate-300 whitespace-nowrap">SIGADOC</th>
                      <th style={{ width: '13%' }} className="p-1 border-r border-slate-300 whitespace-nowrap">LOCAL/CIDADE</th>
                      <th style={{ width: '26%' }} className="p-1 border-r border-slate-300">DESCRIÇÃO</th>
                      <th style={{ width: '13%' }} className="p-1 border-r border-slate-300 whitespace-nowrap">NOTA FISCAL</th>
                      <th style={{ width: '18%' }} className="p-1 border-r border-slate-300 whitespace-nowrap">EMPENHO VINCULADO</th>
                      <th style={{ width: '14%' }} className="p-1 pr-2 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end leading-tight">
                          <span>VALOR DA MEDIÇÃO</span>
                          <span className="text-[8.5px] font-bold text-emerald-600 tracking-normal normal-case">
                            Medição Pendente
                          </span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {expandedMedicoesWithGroup.map(({ med, index, isContinuationRow, groupIndex }) => {
                      const isEvenGroup = groupIndex % 2 === 0;
                      const isLinked = Boolean(
                        med.empenhoVinculado &&
                          med.empenhoVinculado.trim() !== '' &&
                          med.empenhoVinculado.toUpperCase() !== 'SEM EMPENHO' &&
                          med.empenhoVinculado !== '-' &&
                          !med.empenhoVinculado.includes('R$') &&
                          !/^\s*R?\$?\s*[\d.,]+\s*$/.test(med.empenhoVinculado)
                      );

                      return (
                        <tr
                          key={med.id || index}
                          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                          className={`leading-tight ${isEvenGroup ? 'bg-white' : 'bg-slate-50/70'} ${
                            isContinuationRow
                              ? 'border-t border-slate-200 border-dashed'
                              : index > 0
                              ? 'border-t-2 border-slate-300'
                              : ''
                          }`}
                        >
                          {/* 1. SIGADOC */}
                          <td className="p-1 border-r border-slate-300 break-words">
                            {!isContinuationRow ? (
                              <div className="space-y-0.5">
                                <span className="font-mono text-slate-800 font-bold text-[10.5px] block break-words">
                                  {med.sigadoc || '-'}
                                </span>
                                {!contrato.pgtoIndenizacao ? (
                                  <div className="text-[10px] text-slate-700 leading-tight">
                                    Medição: <span className="font-bold text-slate-900">{formatNumeroMedicao(med.numeroMed) || med.numeroMed}</span>
                                  </div>
                                ) : med.numeroTac ? (
                                  <div className="text-[9.5px] text-slate-500 font-normal leading-tight">
                                    TAC: <span className="text-slate-700">{med.numeroTac.replace(/^TAC\s*[:\-]?\s*/i, '').trim()}</span>
                                  </div>
                                ) : null}
                                {(med.periodo || (contrato.pgtoIndenizacao && med.periodoTac)) ? (
                                  <div className="text-[9.5px] text-slate-500 font-normal leading-tight">
                                    {contrato.pgtoIndenizacao ? 'Período apurado:' : 'Período:'} <span className="text-slate-700">{med.periodo || med.periodoTac}</span>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </td>

                          {/* 2. LOCAL/CIDADE */}
                          <td style={{ overflowWrap: 'anywhere' }} className="p-1 border-r border-slate-300 text-slate-700 uppercase font-medium text-[10.5px] break-words">
                            {!isContinuationRow ? (med.unidadeCidade || '-') : null}
                          </td>

                          {/* 3. DESCRIÇÃO */}
                          <td style={{ overflowWrap: 'break-word' }} className="p-1 border-r border-slate-300 text-slate-700 uppercase text-[10.5px] leading-tight break-words">
                            {!isContinuationRow ? med.descricao : null}
                          </td>

                          {/* 4. NOTA FISCAL */}
                          <td className="p-1 border-r border-slate-300 text-[10.5px] text-slate-800 break-words">
                            {!isContinuationRow ? (
                              med.numeroNf || med.dataEmissaoNf || med.dataAtesto ? (
                                <div className="space-y-0.5">
                                  {med.numeroNf ? (
                                    <span className="font-mono font-bold text-slate-800 text-[10.5px] block">
                                      NF {med.numeroNf}
                                    </span>
                                  ) : null}
                                  {med.dataEmissaoNf ? (
                                    <div className="text-[9.5px] text-slate-500 font-normal">
                                      Emissão: <span className="text-slate-700">{med.dataEmissaoNf}</span>
                                    </div>
                                  ) : null}
                                  {med.dataAtesto ? (
                                    <div className="text-[9.5px] text-slate-500 font-normal">
                                      Atesto: <span className="text-slate-700">{med.dataAtesto}</span>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-400 font-mono text-[10.5px]">-</span>
                              )
                            ) : null}
                          </td>

                          {/* 5. EMPENHO VINCULADO - sem sombreamento e nem borda */}
                          <td className="p-1 border-r border-slate-300 break-words">
                            {isContinuationRow ? (
                              <div className="flex items-start gap-1.5 leading-tight">
                                <span className="text-slate-400 font-bold text-xs leading-none shrink-0 mt-0.5">↳</span>
                                <div className="space-y-0.5">
                                  <div className="font-mono font-semibold text-[10.5px] text-slate-700 break-words">
                                    {med.empenhoVinculado}
                                  </div>
                                  <div className="text-[9.5px] font-mono text-slate-500">
                                    DESC: {formatCurrency(med.valorDescontadoEmpenho ?? med.valorMedicao)}
                                  </div>
                                  {med.observacao && med.empenhoVinculado !== 'Pago pela UO da SESP' && (
                                    <div className="text-[9px] font-semibold text-amber-800 uppercase mt-0.5">
                                      OBS: {med.observacao}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : isLinked ? (
                              <div className="leading-tight space-y-0.5">
                                <div className="font-mono font-bold text-[11px] text-slate-900 break-words">
                                  {med.empenhoVinculado}
                                </div>
                                <div className="text-[10px] font-bold text-blue-700 font-mono">
                                  DESC: {formatCurrency(med.valorDescontadoEmpenho ?? med.valorMedicao)}
                                </div>
                                {med.observacao && med.empenhoVinculado !== 'Pago pela UO da SESP' && (
                                  <div className="text-[9.5px] font-semibold text-amber-800 uppercase mt-0.5">
                                    OBS: {med.observacao}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[10.5px]">-</span>
                            )}
                          </td>

                          {/* 6. VALOR DA MEDIÇÃO com Medição Pendente na parte de baixo */}
                          <td className="p-1 pr-2 text-right whitespace-nowrap">
                            <div className="flex flex-col items-end leading-tight">
                              <span
                                className={
                                  isContinuationRow
                                    ? "font-normal text-slate-500 whitespace-nowrap text-[10.5px] font-mono"
                                    : "font-black text-slate-900 whitespace-nowrap text-[11.5px] font-mono tracking-tight"
                                }
                              >
                                {formatCurrency(med.valorMedicao)}
                              </span>
                              <div className="leading-tight mt-0.5">
                                {med.empenhoVinculado === 'Pago pela UO da SESP' ? (
                                  <span className="font-mono font-bold text-emerald-700 text-[9.5px]">
                                    R$ 0,00
                                  </span>
                                ) : isLinked &&
                                  med.valorDescontadoEmpenho !== undefined &&
                                  med.valorDescontadoEmpenho > 0 &&
                                  med.valorMedicao - med.valorDescontadoEmpenho > 0.01 ? (
                                  <span className="text-slate-400 font-bold text-[9.5px]">-</span>
                                ) : isLinked ? (
                                  <span className="font-mono font-bold text-emerald-700 text-[9.5px]">
                                    R$ 0,00
                                  </span>
                                ) : med.valorPendente && med.valorPendente > 0 ? (
                                  <span className="font-mono font-bold text-[#ea580c] text-[9.5px]">
                                    {formatCurrency(med.valorPendente)}
                                  </span>
                                ) : med.medicaoPendente && (!med.empenhoVinculado || med.empenhoVinculado.toUpperCase() === 'SEM EMPENHO') ? (
                                  <span className="font-mono font-bold text-[#ea580c] text-[9.5px]">
                                    {formatCurrency(med.valorMedicao)}
                                  </span>
                                ) : (
                                  <span className="font-mono font-bold text-emerald-700 text-[9.5px]">
                                    R$ 0,00
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* 2.3 Histórico de Liquidações e Pagamentos */}
            <div
              data-pdf-block="pagamentos-table"
              className="border border-slate-300 rounded p-2.5 bg-white space-y-1.5 w-full max-w-full box-border"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                  <h4 className="font-black text-slate-800 text-[11px] uppercase tracking-wider">
                    4. HISTÓRICO DE LIQUIDAÇÕES E PAGAMENTOS EFETUADOS ({contrato.pagamentos?.length || 0})
                  </h4>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono">
                  <span>
                    TOTAL PAGO: <strong className="text-teal-700">{formatCurrency(contrato.valorPago)}</strong>
                  </span>
                </div>
              </div>

              <div className="w-full">
              <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', boxSizing: 'border-box' }} className="w-full text-left text-[11px] border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 font-bold uppercase border-b border-slate-300 text-slate-700 text-[10px]">
                    <th style={{ width: '17%' }} className="p-1 border-r border-slate-300 whitespace-nowrap">Nº LIQUIDAÇÃO (LIQ)</th>
                    <th style={{ width: '9%' }} className="p-1 border-r border-slate-300 text-center">DATA PAGTO</th>
                    <th style={{ width: '17%' }} className="p-1 border-r border-slate-300 whitespace-nowrap">EMPENHO VINCULADO</th>
                    <th style={{ width: '41%' }} className="p-1 border-r border-slate-300">HISTÓRICO DO PAGAMENTO</th>
                    <th style={{ width: '16%' }} className="p-1 pr-2 text-right whitespace-nowrap">VALOR DA LIQ.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(!contrato.pagamentos || contrato.pagamentos.length === 0) ? (
                    <tr>
                      <td colSpan={5} className="py-2 text-center text-slate-400 font-bold uppercase text-[10px]">
                        NENHUM PAGAMENTO REGISTRADO
                      </td>
                    </tr>
                  ) : (
                    contrato.pagamentos.map((pag, idx) => (
                      <tr
                        key={pag.id || idx}
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                        className="leading-tight"
                      >
                        <td className="p-1 font-bold font-mono border-r border-slate-300 break-words">{pag.ordemBancaria || '-'}</td>
                        <td className="p-1 font-mono text-center border-r border-slate-300 whitespace-nowrap">{pag.dataPagamento || '-'}</td>
                        <td className="p-1 font-mono text-[10px] border-r border-slate-300 break-words">{pag.medicaoVinculada || '-'}</td>
                        <td style={{ overflowWrap: 'break-word' }} className="p-1 uppercase text-slate-700 border-r border-slate-300 break-words">{pag.historico || '-'}</td>
                        <td className="p-1 pr-2 font-bold font-mono text-right text-emerald-700 whitespace-nowrap">
                          {formatCurrency(pag.valorLiquido || pag.valorBruto)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </>
        ) : (
          /* ============================================================ */
          /* MODO CONFORMIDADE: CHECKLIST DOCUMENTAL                      */
          /* ============================================================ */
          <div data-pdf-block="conformidade-checklist" className="space-y-4 w-full max-w-full box-border overflow-hidden">
            <div className="border border-slate-300 rounded p-4 space-y-3 w-full max-w-full box-border overflow-hidden bg-white">
              <h3 className="font-black text-slate-800 text-xs uppercase border-b border-slate-200 pb-1">
                CHECK-LIST DE CONFORMIDADE DOCUMENTAL
              </h3>
              <div className="w-full">
              <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', boxSizing: 'border-box' }} className="w-full text-left text-[11px] border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 font-bold uppercase border-b border-slate-300">
                    <th style={{ width: '50px' }} className="p-1.5 text-center border-r border-slate-300 shrink-0">ITEM</th>
                    <th style={{ width: '420px' }} className="p-1.5 border-r border-slate-300">DOCUMENTO</th>
                    <th style={{ width: '90px' }} className="p-1.5 text-center border-r border-slate-300 shrink-0">STATUS</th>
                    <th style={{ width: '65px' }} className="p-1.5 text-center border-r border-slate-300 shrink-0">FLS.</th>
                    <th style={{ width: '475px' }} className="p-1.5 pr-3">BASE LEGAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {contrato.conformidade.itens.map((item) => (
                    <tr key={item.id} className="leading-tight">
                      <td className="p-1 text-center font-bold border-r border-slate-300">{item.codigo}</td>
                      <td className="p-1 uppercase border-r border-slate-300 font-medium break-words">{item.descricao}</td>
                      <td className="p-1 text-center font-bold border-r border-slate-300">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[9px] ${
                            item.status === 'REGULAR'
                              ? 'bg-green-100 text-green-800'
                              : item.status === 'IRREGULAR'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="p-1 text-center font-mono border-r border-slate-300">{item.folhas}</td>
                      <td className="p-1 pr-3 text-[9px] uppercase text-slate-600 break-words">{item.baseLegal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {/* Observations */}
              <div className="pt-2 w-full">
                <strong className="text-[10px] uppercase text-slate-700 block">OBSERVAÇÕES:</strong>
                <div className="bg-slate-50 border border-slate-200 p-2 rounded text-slate-800 uppercase font-semibold mt-0.5 space-y-1 break-words w-full min-h-[28px]">
                  {contrato.conformidade.observacoes &&
                    contrato.conformidade.observacoes.trim().toUpperCase() !== 'A NOTA DE EMPENHO SE ENCONTRA NO PROCESSO PAI.' &&
                    contrato.conformidade.observacoes.trim().toUpperCase() !== 'A NOTA DE EMPENHO SE ENCONTRA NO PROCESSO PAI' && (
                    <p>{contrato.conformidade.observacoes}</p>
                  )}
                  {contrato.conformidade.observacaoEmpenho && (
                    <p>{contrato.conformidade.observacaoEmpenho}</p>
                  )}
                </div>
              </div>

              {/* Forwarding Statement */}
              <div className="pt-2 text-slate-800 font-semibold uppercase leading-relaxed text-[11px] break-words w-full">
                ENCAMINHO O PROCESSO, REFERENTE À MEDIÇÃO DA OBRA/SERVIÇOS ACIMA CITADOS, NO VALOR DE{' '}
                <strong>{formatCurrency(contrato.conformidade.valorEncaminhado || contrato.valorContratado)}</strong>{' '}
                CONFORME RESPECTIVA PLANILHA DE MEDIÇÃO, PARA ANÁLISE E POSTERIOR PAGAMENTO.
              </div>
            </div>
          </div>
        )}

        {/* Institutional Signature Block */}
        <div
          data-pdf-block="signature"
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          className="w-full max-w-full box-border pt-6 pb-2 text-center space-y-1 overflow-hidden"
        >
          <div className="w-80 mx-auto border-t-2 border-slate-800 pt-2 font-bold text-xs uppercase text-slate-900">
            {contrato.conformidade.assinante?.nome &&
            !contrato.conformidade.assinante.nome.toUpperCase().includes('BENNY')
              ? contrato.conformidade.assinante.nome
              : signer.nome}
          </div>
          <div className="text-[10px] uppercase font-semibold text-slate-600">
            {contrato.conformidade.assinante?.cargo &&
            !contrato.conformidade.assinante.cargo.toUpperCase().includes('RESIDENTE')
              ? contrato.conformidade.assinante.cargo
              : signer.cargo}
          </div>
          <div className="text-[10px] uppercase font-bold text-slate-700 font-mono">
            {contrato.conformidade.assinante?.setor || signer.setor}
          </div>
          <div className="text-[9px] uppercase text-slate-400 font-mono pt-1">
            Documento oficial extraído eletronicamente pelo Sistema de Controle de Orçamento em {formatDataHojeBR()}
          </div>
        </div>
      </div>
    );
  }
);

ContractPdfTemplate.displayName = 'ContractPdfTemplate';
