import { Contrato } from '../types/contract';
import { FiscalGroup, FiscalContractItem } from '../types/reports';

/**
 * Agrupa dinamicamente os fiscais a partir dos contratos cadastrados no painel principal.
 * Apenas os fiscais que constam cadastrados nos contratos ativos são retornados.
 */
export function getFiscaisFromContratos(contratos: Contrato[]): FiscalGroup[] {
  const fiscalMap = new Map<
    string,
    {
      nome: string;
      contratos: FiscalContractItem[];
    }
  >();

  (contratos || []).forEach((c) => {
    const rawFiscal = c.fiscal?.trim();
    if (
      !rawFiscal ||
      rawFiscal === '-' ||
      rawFiscal.toLowerCase() === 'não informado' ||
      rawFiscal.toLowerCase() === 'nao informado'
    ) {
      return;
    }

    // Chave de agrupamento normalizada para unir pequenas variações de acentuação/espaço
    const normalizedKey = rawFiscal
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!fiscalMap.has(normalizedKey)) {
      // Manter a melhor grafia (preferencialmente com acentos se houver)
      fiscalMap.set(normalizedKey, {
        nome: rawFiscal.toUpperCase().replace(/\s+/g, ' ').trim(),
        contratos: [],
      });
    }

    const group = fiscalMap.get(normalizedKey)!;

    const tipoStr = (c.tipo || '').toUpperCase();
    const tipo: 'OBRAS' | 'MANUTENÇÃO' = tipoStr.includes('OBRA') ? 'OBRAS' : 'MANUTENÇÃO';

    group.contratos.push({
      numero: c.numero,
      tipo,
      descricao: c.objeto || c.descricao || 'SEM DESCRIÇÃO',
      empresa: c.siglaEmpresa || c.razaoSocial || 'EMPRESA NÃO INFORMADA',
      valorContratado: c.valorContratado || 0,
      saldoContrato: c.saldoContrato || 0,
      execucaoFisica: c.execucaoFisica || 0,
      diasVencer: c.diasVencer || 0,
    });
  });

  const result: FiscalGroup[] = [];
  let idx = 1;

  for (const [, data] of fiscalMap.entries()) {
    const obrasCount = data.contratos.filter((item) => item.tipo === 'OBRAS').length;
    const manutencaoCount = data.contratos.filter((item) => item.tipo === 'MANUTENÇÃO').length;
    const valorTotal = data.contratos.reduce((sum, item) => sum + (item.valorContratado || 0), 0);

    result.push({
      id: `fisc-${idx++}`,
      nome: data.nome,
      totalContratos: data.contratos.length,
      obrasCount,
      manutencaoCount,
      valorTotal,
      contratos: data.contratos,
    });
  }

  // Ordena por quantidade de contratos (decrescente) e depois por nome
  return result.sort(
    (a, b) => b.totalContratos - a.totalContratos || a.nome.localeCompare(b.nome)
  );
}
