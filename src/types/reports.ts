export interface FiscalContractItem {
  numero: string;
  tipo: 'OBRAS' | 'MANUTENÇÃO';
  descricao: string;
  empresa: string;
  valorContratado: number;
  saldoContrato: number;
  execucaoFisica: number;
  diasVencer: number;
}

export interface FiscalGroup {
  id: string;
  nome: string;
  totalContratos: number;
  obrasCount: number;
  manutencaoCount: number;
  valorTotal: number;
  contratos: FiscalContractItem[];
}

export interface MedicaoPendenteItem {
  id: string;
  sigadoc: string;
  contratoNumero: string;
  empresa: string;
  numeroMedicao: string;
  periodo: string;
  descricao: string;
  empenhoCodigo?: string;
  valorMedicao: number;
  valorPendente: number;
  podeLiquidar: boolean;
  observacao?: string;
}

export type SituacaoEmpenho = 'NAO_UTILIZADO' | 'SEM_MEDICAO' | 'EXERCICIO_ANTERIOR';

export interface EmpenhoPendenteItem {
  id: string;
  codigo: string;
  situacao: SituacaoEmpenho;
  diasSemMedicao?: number;
  diasSemUtilizar?: number;
  empenhado: number;
  saldo: number;
  contratoNumero: string;
  empresa: string;
  dataEmissao?: string;
  dataUltimaMedicao?: string;
}
