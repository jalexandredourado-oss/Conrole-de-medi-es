export type TipoContrato = 'OBRAS' | 'MANUTENÇÃO PREDIAL' | string;

export type StatusConformidade = 'REGULAR' | 'IRREGULAR' | 'DISPENSADO' | 'PENDENTE';

export interface ItemConformidade {
  id: string;
  codigo: string; // e.g. "3.4", "3.10", "4.1"
  descricao: string;
  status: StatusConformidade;
  folhas: string; // e.g. "23", "298/299", "-"
  baseLegal: string;
  irregularMotivo?: string;
  categoria: '1_DOCUMENTOS_MEDICAO' | '2_REGULARIDADE_FISCAL' | '3_MEDICAO_FINAL_E_INSTITUCIONAL';
}

export interface ConformidadeDocumentalData {
  processo?: string;
  periodo?: string;
  itens: ItemConformidade[];
  observacoes: string;
  observacaoEmpenho?: string;
  descricaoServicosMedidos?: string;
  data: string;
  valorEncaminhado: number;
  medicaoId?: string;
  medicaoNumero?: string;
  salvoEm?: string;
  assinante?: {
    nome: string;
    cargo: string;
    setor: string;
  };
}

export interface Empenho {
  id: string;
  numeroEmp: string;
  numeroProcesso: string;
  regiao: string;
  valorTotal: number;
  saldoDisponivel: number;
  saldoEmpenho?: number;
  dataEmissao: string;
  observacao?: string;
  anexoId?: string;
  anexoNome?: string;
  anexoTipo?: string;
  anexoTamanho?: number;
  anexoAtualizadoEm?: string;
}

export interface ItemOrdemServico {
  id: string;
  item: string; // ex: "01", "Item 1"
  lote?: string; // ex: "01", "Lote 01"
  qtd: number;
  unidade: string; // ex: "UN", "M²", "VB", "SERV", etc.
  especificacao: string;
  valorItem: number;
}

export interface OrdemServico {
  id: string;
  numeroOs: string; // ex: "005/2025/SOENG/SAAS/SEJUS/MT"
  descricao: string;
  lote?: string;
  itens: ItemOrdemServico[];
  valorTotal: number;
  dataEmissao: string;
  observacao?: string;
}

export interface Medicao {
  id: string;
  numeroMed: string;
  periodo: string;
  unidadeCidade: string;
  descricao: string;
  sigadoc: string;
  numeroNf?: string; // Nº da Nota Fiscal
  dataEmissaoNf?: string; // Data de emissão da NF (DD/MM/AAAA)
  dataAtesto?: string; // Data do atesto do fiscal (DD/MM/AAAA)
  empenhoVinculado: string;
  valorDescontadoEmpenho?: number;
  valorMedicao: number;
  medicaoPendente: boolean;
  valorPendente?: number;
  percentualFisico: number;
  dataRegistro: string;
  observacao?: string;
  parentMedicaoId?: string;
  isContinuation?: boolean;
  conformidade?: ConformidadeDocumentalData;
  numeroOs?: string;
  valorOs?: number;
  dataEmissaoOs?: string;
  osId?: string;
  numeroOs2?: string;
  valorOs2?: number;
  dataEmissaoOs2?: string;
  osId2?: string;
  valorAbatidoOs1?: number;
  valorAbatidoOs2?: number;
  osIds?: string[];
  numerosOs?: string[];
  numeroTac?: string;
  valorTac?: number;
  periodoTac?: string;
}

export interface Pagamento {
  id: string;
  ordemBancaria: string;
  dataPagamento: string;
  medicaoVinculada: string;
  sigadoc?: string;
  historico?: string;
  valorBruto: number;
  retencoes: {
    inss: number;
    irrf: number;
    iss: number;
  };
  valorLiquido: number;
  status: 'PAGO' | 'LIQUIDADO' | 'PROCESSANDO';
}

export interface RegiaoValor {
  id: string;
  nome: string;
  cidades?: string;
  valor: number;
  valorInput?: string;
}

export interface Contrato {
  id: string;
  numero: string; // e.g. "070/2024"
  processoSigadoc?: string; // e.g. "SEJUS-PRO-2025/03206"
  tipo: TipoContrato;
  descricao: string;
  razaoSocial: string;
  siglaEmpresa?: string;
  cnpj: string;
  codigoCredor?: string;
  fiscal: string;
  substituto: string;
  valorContratado: number;
  valorContratadoNaoExecutado: number;
  valorEmpenhado: number;
  valorMedido: number;
  valorLiquidado: number;
  valorPago: number;
  saldoContrato: number;
  dataInicio: string;
  dataFim: string;
  diasVencer: number;
  execucaoFisica: number; // percentage, e.g. 69.8
  objeto: string;
  regioes: RegiaoValor[];
  empenhos: Empenho[];
  ordensServico?: OrdemServico[];
  medicoes: Medicao[];
  pagamentos: Pagamento[];
  conformidade: ConformidadeDocumentalData;
  conformidadePorMedicao?: Record<string, ConformidadeDocumentalData>;
  pgtoIndenizacao?: boolean;
}
