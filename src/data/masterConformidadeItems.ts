import { ItemConformidade } from '../types/contract';

export const MASTER_CONFORMIDADE_ITEMS: Omit<ItemConformidade, 'id' | 'status' | 'folhas'>[] = [
  // 1. Documentos do Contrato
  {
    codigo: '1.1',
    descricao: 'INSTRUMENTO CONTRATUAL E ALTERAÇÕES',
    baseLegal: 'Lei Federal Nº 8.666/93, Art. 62',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.2',
    descricao: 'PUBLICAÇÃO EXTRATO DO CONTRATO',
    baseLegal: 'Lei Federal Nº 8.666/93, Art. 62',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.3',
    descricao: 'REGISTRO DA EMPRESA NO CREA/CAU',
    baseLegal: 'Lei Federal Nº 5.194/66',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.4',
    descricao: 'ART DO RESPONSÁVEL TÉCNICO PELA OBRA OU SERVIÇO',
    baseLegal: 'Lei Federal 8.666/93, Art. 68; Lei Federal Nº 5.194/66',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.5',
    descricao: 'MATRÍCULA DA OBRA NO CNO',
    baseLegal: 'Instrução Normativa RFB Nº 1634 de 06/05/2016 – Receita Federal',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.6',
    descricao: 'CRONOGRAMA FÍSICO-FINANCEIRO',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.7',
    descricao: 'PORTARIA DE NOMEAÇÃO DO FISCAL',
    baseLegal: 'Lei Federal Nº 8.666/93, Art. 67;',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.8',
    descricao: 'ART DO FISCAL',
    baseLegal: 'Lei Federal Nº 8.666/93, Art. 67; Lei Federal Nº 5.194/66',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.9',
    descricao: 'CÓPIA DA ORDEM DE SERVIÇO E/OU ORDEM DE PARALIZAÇÃO/ REINÍCIO',
    baseLegal: 'Lei Federal Nº 8.666/93, Art. 62',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.10',
    descricao: 'NOTA DE EMPENHO',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },

  // 2. Documentos da Medição
  {
    codigo: '2.1',
    descricao: 'OFÍCIO DA SOLICITANDO MEDIÇÃO E/OU ENTREGA DA OBRA',
    baseLegal: 'OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.2',
    descricao: 'PARECER TÉCNICO',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.3',
    descricao: 'DIÁRIO DE OBRAS',
    baseLegal: 'Portaria Conjunta SEPLAN/SEFAZ Nº008/2016; OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.4',
    descricao: 'FOLHA DE IDENTIFICAÇÃO COM OS DADOS DO CONTRATO',
    baseLegal: 'Portaria Conjunta SEPLAN/SEFAZ Nº008/2016; OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.5',
    descricao: 'MEDIÇÃO ACUMULADA',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.6',
    descricao: 'PLANILHA DE MEDIÇÃO',
    baseLegal: 'Portaria Conjunta SEPLAN/SEFAZ Nº008/2016; OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.7',
    descricao: 'FICHA DE ÍNDICES PLUVIOMÉTRICOS (PLUVIOMETRIA)',
    baseLegal: 'Portaria Conjunta SEPLAN/SEFAZ Nº008/2016; OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.8',
    descricao: 'REGISTRO FOTOGRÁFICO DOS SERVIÇOS EXECUTADOS',
    baseLegal: 'Portaria Conjunta SEPLAN/SEFAZ Nº008/2016; OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.9',
    descricao: 'NOTA FISCAL',
    baseLegal: 'OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.10',
    descricao: 'ATESTO DA NOTA FISCAL',
    baseLegal: 'OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.11',
    descricao: 'RELATÓRIO DE ACOMPANHAMENTO DA EXECUÇÃO',
    baseLegal: 'IN 005/2018/SESP/MT',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.12',
    descricao: 'CRONOGRAMA FÍSICO-FINANCEIRO',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.13',
    descricao: 'ATUALIZAÇÃO DO SISTEMA FIPLAN - GFO',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.14',
    descricao: 'ATUALIZAÇÃO DO SISTEMA SIAG',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '2.15',
    descricao: 'ATUALIZAÇÃO DO SISTEMA GEO-OBRAS (TCE)',
    baseLegal: 'Resolução Normativa nº 06/2011 – TCE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },

  // 3. Documentos Comprobatórios de Regularidade Fiscal
  {
    codigo: '3.1',
    descricao: 'RELAÇÃO DE ENVIO FGTS E INSS',
    baseLegal: '-',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.2',
    descricao: 'GRF - GUIA DE RECOLHIMENTO DO FGTS - ÚLTIMA COMPETÊNCIA VENCIDA',
    baseLegal: 'Decreto Estadual 1525/',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.3',
    descricao: 'GPS - GUIA DA PREVIDÊNCIA SOCIAL - ÚLTIMA COMPETÊNCIA VENCIDA',
    baseLegal: 'Decreto Estadual 1525',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.4',
    descricao: 'CERTIDÃO NEGATIVA DO FGTS',
    baseLegal: 'Lei Federal Nº 14.133',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.5',
    descricao: 'CERTIDÃO EXPEDIDA PELA PREFEITURA MUNICIPAL',
    baseLegal: 'Decreto Estadual 1525',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.6',
    descricao: 'CERTIDÃO CONJUNTA DE PENDÊNCIAS TRIBUTÁRIAS E NÃO TRIBUTÁRIAS JUNTO À SEFAZ E À PGE DO ESTADO DE MATO GROSSO',
    baseLegal: 'Lei Federal Nº 14.133',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.7',
    descricao: 'CERTIDÃO DE DÉBITOS RELATIVOS A CRÉDITOS TRIBUTÁRIOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO',
    baseLegal: 'Lei Federal Nº 14.133',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.8',
    descricao: 'CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS (TST)',
    baseLegal: 'Lei Federal Nº 14.133',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.9',
    descricao: 'EMPENHO',
    baseLegal: '-',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '3.10',
    descricao: 'AQS',
    baseLegal: '-',
    categoria: '2_REGULARIDADE_FISCAL',
  },

  // 4. Documento para Medição Final
  {
    codigo: '4.1',
    descricao: 'TERMO DE RECEBIMENTO PROVISÓRIO OU DEFINITIVO EMITIDO PELO FISCAL E ASSINADO PELA CONTRATADA',
    baseLegal: 'Lei Federal Nº 14.133',
    categoria: '3_MEDICAO_FINAL_E_INSTITUCIONAL',
  },
  {
    codigo: '4.2',
    descricao: 'BAIXA DA ART DE FISCALIZAÇÃO NO CREA/CAU',
    baseLegal: 'Lei Federal Nº 5.194/66',
    categoria: '3_MEDICAO_FINAL_E_INSTITUCIONAL',
  },
  {
    codigo: '4.3',
    descricao: 'ATUALIZAÇÃO DA DOCUMENTAÇÃO TÉCNICA DA OBRA COMO CONSTRUÍDO (“AS BUILT”)',
    baseLegal: 'OT Nº002/2016/CGE',
    categoria: '3_MEDICAO_FINAL_E_INSTITUCIONAL',
  },
  {
    codigo: '4.4',
    descricao: 'BAIXA DO CEI (INSS)',
    baseLegal: 'Instrução Normativa RFB Nº 1634 de 06/05/2016',
    categoria: '3_MEDICAO_FINAL_E_INSTITUCIONAL',
  },
  {
    codigo: '4.5',
    descricao: 'AUTORIZAÇÃO DE USO/ FUNCIONAMENTO (HABITE-SE E/OU LICENÇA DE INSTALAÇÃO E/OU LAUDO DE VISTORIA CORPO DE BOMBEIROS)',
    baseLegal: 'OT Nº002/2016/CGE',
    categoria: '3_MEDICAO_FINAL_E_INSTITUCIONAL',
  },

  // 5. Outros Procedimentos Institucionais
  {
    codigo: '5.1',
    descricao: 'OS ATOS DE RESPONSABILIDADE DESTE SETOR FORAM ANALISADOS E ENCONTRAM-SE DEVIDAMENTE FORMALIZADOS, PODENDO O PROCESSO SEGUIR O SEU TRÂMITE',
    baseLegal: 'Lei 14.133, Art. 2º, I, LCE 295/2007, RN 17/2010-TCE/MT',
    categoria: '3_MEDICAO_FINAL_E_INSTITUCIONAL',
  },
];

export const INDENIZACAO_CONFORMIDADE_ITEMS: Omit<ItemConformidade, 'id' | 'status' | 'folhas'>[] = [
  // 1. Documentos da Medição
  {
    codigo: '1.1',
    descricao: 'OFÍCIO SOLICITANDO MEDIÇÃO E/OU ENTREGA DA OBRA [E-MAIL]',
    baseLegal: 'OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.2',
    descricao: 'TAC',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.3',
    descricao: 'DECISÕES DO TCE',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.4',
    descricao: 'PARECER REFERENCIAL PGE',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.5',
    descricao: 'RELATÓRIO FOTOGRÁFICO',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.6',
    descricao: 'RELATÓRIO DE ANÁLISES LABORATORIAL',
    baseLegal: '-',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.7',
    descricao: 'NOTA FISCAL',
    baseLegal: 'OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.8',
    descricao: 'ATESTO DA NOTA FISCAL',
    baseLegal: 'OT Nº006/2014/CGE',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },
  {
    codigo: '1.9',
    descricao: 'RELATÓRIO DE ACOMPANHAMENTO DA EXECUÇÃO',
    baseLegal: 'IN 005/2018/SESP/MT',
    categoria: '1_DOCUMENTOS_MEDICAO',
  },

  // 2. Documentos Comprobatórios de Regularidade Fiscal
  {
    codigo: '2.1',
    descricao: 'RELAÇÃO DE ENVIO FGTS E INSS',
    baseLegal: '-',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.2',
    descricao: 'GRF - GUIA DE RECOLHIMENTO DO FGTS - ÚLTIMA COMPETÊNCIA VENCIDA',
    baseLegal: 'Decreto Estadual 8.199/06.',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.3',
    descricao: 'GPS - GUIA DA PREVIDÊNCIA SOCIAL - ÚLTIMA COMPETÊNCIA VENCIDA',
    baseLegal: 'Decreto Estadual 8.199/06.',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.4',
    descricao: 'CERTIDÃO NEGATIVA DO FGTS',
    baseLegal: 'Art. 27º, inciso IV e Art. 55º, inciso XIII da Lei Federal Nº 8.666/93.',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.5',
    descricao: 'CERTIDÃO EXPEDIDA PELA PREFEITURA MUNICIPAL',
    baseLegal: 'Decreto Estadual 10/03, Art. 11º.',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.6',
    descricao: 'CERTIDÃO CONJUNTA DE PENDÊNCIAS TRIBUTÁRIAS E NÃO TRIBUTÁRIAS JUNTO À SEFAZ E À PGE DO ESTADO DE MATO GROSSO',
    baseLegal: 'Art. 27º, inciso IV e Art. 55º, inciso XIII da Lei Federal Nº 8.666/93.',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.7',
    descricao: 'CERTIDÃO DE DÉBITOS RELATIVOS A CRÉDITOS TRIBUTÁRIOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO',
    baseLegal: 'Art. 27º, inciso IV e Art. 55º, inciso XIII da Lei Federal Nº 8.666/93.',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.8',
    descricao: 'CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS (TST)',
    baseLegal: 'Art. 27º, inciso IV e Art. 55º, inciso XIII da Lei Federal Nº 8.666/93.',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.9',
    descricao: 'EMPENHO',
    baseLegal: '-',
    categoria: '2_REGULARIDADE_FISCAL',
  },
  {
    codigo: '2.10',
    descricao: 'CNPJ',
    baseLegal: '-',
    categoria: '2_REGULARIDADE_FISCAL',
  },
];

/**
 * Returns a full list of ItemConformidade ensuring all master items are present.
 * If an existing item exists, preserves its status and folhas.
 * If contratoNumero is provided, checks and persists contract-specific pagination.
 */
export function ensureFullConformidadeItems(
  existingItems?: ItemConformidade[],
  contratoNumero?: string,
  medicaoId?: string,
  isIndenizacao: boolean = false
): ItemConformidade[] {
  const map = new Map<string, ItemConformidade>();
  const prefix = isIndenizacao ? 'conformidade_ind_' : 'conformidade_';

  const isCompatibleModeItem = (it: ItemConformidade) => {
    const isItemInd = Boolean(it.id?.startsWith('conf-ind-'));
    return isItemInd === Boolean(isIndenizacao);
  };

  // 1. Check medicao-specific saved items in localStorage first if medicaoId provided
  if (contratoNumero && medicaoId && typeof window !== 'undefined' && window.localStorage) {
    try {
      const medSaved = localStorage.getItem(`${prefix}itens_${contratoNumero}_${medicaoId}`);
      if (medSaved) {
        const parsed: ItemConformidade[] = JSON.parse(medSaved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const it of parsed) {
            if (isCompatibleModeItem(it)) {
              map.set(it.codigo, it);
            }
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  // 2. Check contract-specific saved items in localStorage
  if (map.size === 0 && contratoNumero && typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedKey = `${prefix}doc_contrato_${contratoNumero}`;
      const saved = localStorage.getItem(savedKey);
      if (saved) {
        const parsed: ItemConformidade[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          for (const it of parsed) {
            if (isCompatibleModeItem(it)) {
              map.set(it.codigo, it);
            }
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  // 3. Override / merge with existingItems passed from contrato
  if (existingItems && existingItems.length > 0) {
    for (const it of existingItems) {
      if (!isCompatibleModeItem(it)) continue;
      if (!isIndenizacao && it.codigo === '1.1' && it.descricao?.toUpperCase().includes('REQUERIMENTO')) continue;
      if (!isIndenizacao && it.codigo === '1.2' && it.descricao?.toUpperCase().includes('PLANILHA')) continue;
      map.set(it.codigo, it);
    }
  }

  const targetMasterList = isIndenizacao ? INDENIZACAO_CONFORMIDADE_ITEMS : MASTER_CONFORMIDADE_ITEMS;
  const isSampleContract = !isIndenizacao && Boolean(contratoNumero && contratoNumero.includes('142'));

  return targetMasterList.map((master) => {
    const existing = map.get(master.codigo);
    if (existing) {
      return {
        ...existing,
        descricao: master.descricao,
        baseLegal: master.baseLegal,
        categoria: master.categoria,
      };
    }

    // Default sample values based on official PDF
    let defaultFolhas = '-';
    let defaultStatus: ItemConformidade['status'] = 'DISPENSADO';

    if (isIndenizacao) {
      defaultFolhas = '';
      defaultStatus = 'IRREGULAR';
    } else if (isSampleContract) {
      if (master.codigo.startsWith('1.')) {
        if (master.codigo === '1.1') {
          defaultFolhas = '1962 a 1983';
          defaultStatus = 'REGULAR';
        } else if (master.codigo === '1.2') {
          defaultFolhas = '2005';
          defaultStatus = 'REGULAR';
        } else if (master.codigo === '1.4') {
          defaultFolhas = '2045/2046';
          defaultStatus = 'REGULAR';
        } else if (master.codigo === '1.7') {
          defaultFolhas = '2051';
          defaultStatus = 'REGULAR';
        } else if (master.codigo === '1.8') {
          defaultFolhas = '2050';
          defaultStatus = 'REGULAR';
        } else if (master.codigo === '1.9') {
          defaultFolhas = '2054';
          defaultStatus = 'REGULAR';
        } else if (master.codigo === '1.10') {
          defaultFolhas = '2043';
          defaultStatus = 'REGULAR';
        }
      } else if (master.codigo === '2.1') {
        defaultFolhas = '2';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.3') {
        defaultFolhas = '3 a 70';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.4') {
        defaultFolhas = '72';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.6') {
        defaultFolhas = '101';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.7') {
        defaultFolhas = '116';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.8') {
        // By default irregular in sample (as shown in Screenshot 1!)
        defaultFolhas = '';
        defaultStatus = 'IRREGULAR';
      } else if (master.codigo === '2.9') {
        defaultFolhas = '83';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.10') {
        defaultFolhas = '115';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.11') {
        defaultFolhas = '103';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.13') {
        defaultFolhas = '107';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.14') {
        defaultFolhas = '85';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '2.15') {
        defaultFolhas = '100';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '3.4') {
        defaultFolhas = '74';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '3.5') {
        defaultFolhas = '76';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '3.6') {
        defaultFolhas = '81';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '3.7') {
        defaultFolhas = '78';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '3.8') {
        defaultFolhas = '79';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '3.9') {
        defaultFolhas = '108';
        defaultStatus = 'REGULAR';
      } else if (master.codigo === '3.10') {
        defaultFolhas = '109';
        defaultStatus = 'REGULAR';
      }
    } else if (master.codigo.startsWith('2.') || master.codigo.startsWith('3.')) {
      defaultFolhas = '';
      defaultStatus = 'IRREGULAR';
    }

    return {
      id: `${isIndenizacao ? 'conf-ind-' : 'conf-'}${master.codigo.replace('.', '_')}`,
      codigo: master.codigo,
      descricao: master.descricao,
      baseLegal: master.baseLegal,
      categoria: master.categoria,
      status: defaultStatus,
      folhas: defaultFolhas,
      irregularMotivo: defaultStatus === 'IRREGULAR' ? 'IRREGULAR' : undefined,
    };
  });
}

export function clearConformidadeItensForMedicao(
  existingItems?: ItemConformidade[],
  contratoNumero?: string,
  isIndenizacao: boolean = false,
  persistDocContrato: boolean = false
): ItemConformidade[] {
  const fullItens = ensureFullConformidadeItems(
    existingItems,
    contratoNumero,
    undefined,
    isIndenizacao
  );

  const clearedItens = fullItens.map((item) => {
    if (
      !isIndenizacao &&
      (item.codigo.startsWith('1.') ||
        item.codigo.startsWith('4.') ||
        item.codigo.startsWith('5.'))
    ) {
      return { ...item };
    }
    return {
      ...item,
      folhas: '',
      status: 'IRREGULAR' as ItemConformidade['status'],
      irregularMotivo: 'IRREGULAR',
    };
  });

  if (persistDocContrato && contratoNumero && typeof window !== 'undefined' && window.localStorage) {
    try {
      const prefix = isIndenizacao ? 'conformidade_ind_' : 'conformidade_';
      localStorage.setItem(`${prefix}doc_contrato_${contratoNumero}`, JSON.stringify(clearedItens));
    } catch {
      // Ignore localStorage errors
    }
  }

  return clearedItens;
}
