import { Contrato } from '../types/contract';
import { formatCurrency, formatPercent } from './formatters';

export function exportContractsToCSV(contratos: Contrato[]) {
  const headers = [
    'Nº DO CONTRATO',
    'TIPO DE CONTRATO',
    'PROCESSO SIGADOC',
    'DESCRIÇÃO',
    'RAZÃO SOCIAL',
    'CNPJ',
    'FISCAL TITULAR',
    'FISCAL SUBSTITUTO',
    'VALOR CONTRATADO',
    'VALOR EMPENHADO',
    'VALOR MEDIDO',
    'VALOR PAGO',
    'SALDO DO CONTRATO',
    'VIGÊNCIA INÍCIO',
    'VIGÊNCIA FIM',
    'DIAS P/ VENCER',
    'EXECUÇÃO FÍSICA (%)',
  ];

  const rows = contratos.map((c) => [
    `"${c.numero}"`,
    `"${c.tipo}"`,
    `"${c.processoSigadoc || ''}"`,
    `"${c.descricao.replace(/"/g, '""')}"`,
    `"${c.razaoSocial.replace(/"/g, '""')}"`,
    `"${c.cnpj}"`,
    `"${c.fiscal.replace(/"/g, '""')}"`,
    `"${(c.substituto || '').replace(/"/g, '""')}"`,
    c.valorContratado.toFixed(2).replace('.', ','),
    c.valorEmpenhado.toFixed(2).replace('.', ','),
    c.valorMedido.toFixed(2).replace('.', ','),
    c.valorPago.toFixed(2).replace('.', ','),
    c.saldoContrato.toFixed(2).replace('.', ','),
    `"${c.dataInicio}"`,
    `"${c.dataFim}"`,
    c.diasVencer,
    c.execucaoFisica.toFixed(1).replace('.', ','),
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `contratos_orcamento_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}
