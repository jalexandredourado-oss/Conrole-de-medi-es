import React, { useState, useEffect } from 'react';
import { X, FileText, Check, Copy, Edit3 } from 'lucide-react';
import { MedicaoPendenteItem } from '../../types/reports';
import { Contrato, Medicao } from '../../types/contract';
import { formatCurrency, formatNumeroMedicao, valorPorExtenso } from '../../utils/formatters';
import { useSignerConfig } from '../../utils/signerConfig';

interface DespachoNgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicao?: MedicaoPendenteItem | null;
  contrato?: Contrato | null;
  medicaoObj?: Medicao | null;
  sigadocOverride?: string;
  periodoOverride?: string;
  valorOverride?: number;
  descricaoOverride?: string;
}

export const DespachoNgerModal: React.FC<DespachoNgerModalProps> = ({
  isOpen,
  onClose,
  medicao,
  contrato,
  medicaoObj,
  sigadocOverride,
  periodoOverride,
  valorOverride,
  descricaoOverride,
}) => {
  const { signer, updateSigner } = useSignerConfig();
  const [copied, setCopied] = useState(false);
  const [isEditingCustomText, setIsEditingCustomText] = useState(false);
  const [customText, setCustomText] = useState<string | null>(null);

  const initialUo = (contrato as { uo?: string })?.uo || '18101';
  const initialUg = (contrato as { ug?: string })?.ug || '0002';
  const [uo, setUo] = useState(initialUo);
  const [ug, setUg] = useState(initialUg);

  useEffect(() => {
    if (isOpen) {
      setCustomText(null);
      setIsEditingCustomText(false);
      setCopied(false);
      setUo((contrato as { uo?: string })?.uo || '18101');
      setUg((contrato as { ug?: string })?.ug || '0002');
    }
  }, [isOpen, medicaoObj?.id, medicao?.id, contrato?.id, contrato]);

  if (!isOpen) return null;
  if (!medicao && !medicaoObj && !contrato) return null;

  const isIndenizacao = Boolean(contrato?.pgtoIndenizacao);

  // Extração de dados da medição e do contrato
  const sigadoc =
    (sigadocOverride && sigadocOverride.trim()) ||
    medicaoObj?.sigadoc ||
    medicao?.sigadoc ||
    contrato?.processoSigadoc ||
    'SEJUS-PRO-2025/03206';

  const rawContratoNum =
    contrato?.numero ||
    medicao?.contratoNumero ||
    '038/2025';

  const contratoFormatado = rawContratoNum.toUpperCase().includes('SEJUS')
    ? rawContratoNum
    : `${rawContratoNum}/SEJUS/MT`;

  const empresa =
    contrato?.razaoSocial ||
    medicao?.empresa ||
    'VIGA CONSTRUÇÕES E SERVIÇOS LTDA - ME.';

  // Descrição do objeto priorizando a descrição da medição
  const rawDescricao =
    (descricaoOverride && descricaoOverride.trim()) ||
    medicaoObj?.descricao?.trim() ||
    medicao?.descricao?.trim() ||
    contrato?.descricao?.trim() ||
    contrato?.objeto?.trim() ||
    'prestação dos serviços de Manutenção Predial para atendimento de diversas regiões do estado';

  const cleanDescricao = rawDescricao.replace(/[.;]+$/, '').trim();

  // Formata o texto do objeto: se começar com 'prestação', adiciona 'a ', caso contrário mantém
  const objetoTexto = /^prestação/i.test(cleanDescricao)
    ? `a ${cleanDescricao}`
    : cleanDescricao;

  const rawMedNome = medicaoObj?.numeroMed || medicao?.numeroMedicao || 'Medição final';
  const formattedMed = formatNumeroMedicao(rawMedNome);
  const nomeMedicao = rawMedNome.toLowerCase().includes('final')
    ? 'Medição final'
    : formattedMed
      ? (formattedMed.toLowerCase().includes('medição') ? formattedMed : `${formattedMed} Medição`)
      : 'Medição final';

  const valor =
    valorOverride !== undefined && valorOverride > 0
      ? valorOverride
      : (medicaoObj?.valorMedicao ?? medicaoObj?.valorTac ?? medicao?.valorMedicao ?? (isIndenizacao ? 0 : 750000));
  const extenso = valorPorExtenso(valor);

  // Dados específicos de Pagamento por Indenização (TAC / NF / Período / Unidade)
  const tacNumero = (medicaoObj?.numeroTac || '')
    .replace(/^TAC\s*[:\-]?\s*/i, '')
    .trim();
  const nfNumeroRaw = (medicaoObj?.numeroNf || '')
    .replace(/^NF\s*/i, '')
    .trim();
  const nfNumero = nfNumeroRaw ? `NF ${nfNumeroRaw}` : '';
  const dataEmissaoNf = medicaoObj?.dataEmissaoNf?.trim() || '';
  const dataAtesto = medicaoObj?.dataAtesto?.trim() || '';
  const periodoApurado =
    (periodoOverride && periodoOverride.trim()) ||
    medicaoObj?.periodo?.trim() ||
    medicaoObj?.periodoTac?.trim() ||
    '';
  const unidadeLocal = medicaoObj?.unidadeCidade?.trim() || '';

  const nfPartes: string[] = [];
  if (nfNumeroRaw) nfPartes.push(`Nota Fiscal nº ${nfNumeroRaw}`);
  if (dataEmissaoNf) nfPartes.push(`emitida em ${dataEmissaoNf}`);
  if (dataAtesto) nfPartes.push(`atestada em ${dataAtesto}`);
  const nfTextoInline = nfPartes.join(', ');

  const nfDatasResumo = dataEmissaoNf
    ? ` (Emissão: ${dataEmissaoNf}${dataAtesto ? ` | Atesto: ${dataAtesto}` : ''})`
    : dataAtesto
      ? ` (Atesto: ${dataAtesto})`
      : '';

  const localTextoInline = unidadeLocal ? `, executados na unidade ${unidadeLocal}` : '';
  const tacTextoInline = tacNumero
    ? `Termo de Ajuste de Contas (TAC) nº ${tacNumero}`
    : 'Termo de Ajuste de Contas (TAC)';
  const periodoTextoInline = periodoApurado
    ? `, referente ao período apurado de ${periodoApurado}`
    : '';

  const detalhesIndenizacaoLinhas = [
    `Processo: ${sigadoc}`,
    tacNumero ? `TAC: ${tacNumero}` : null,
    nfNumero ? `Nota Fiscal: ${nfNumero}${nfDatasResumo}` : null,
    periodoApurado ? `Período apurado: ${periodoApurado}` : null,
    unidadeLocal ? `Unidade/Local: ${unidadeLocal}` : null,
    `UO: ${uo}`,
    `UG: ${ug}`,
    `Valor: ${formatCurrency(valor)} (${extenso})`,
  ]
    .filter(Boolean)
    .join('\n');

  const indenizacaoDespachoText = `Prezado Chefe de Unidade,

I - Trata-se dos autos, versando acerca da solicitação de emissão de nota de empenho para pagamento por indenização, no âmbito do Contrato n° ${contratoFormatado}, firmado com a empresa ${empresa}, cujo objeto é ${objetoTexto}${localTextoInline};

II - O referido pagamento refere-se ao ${tacTextoInline}${nfTextoInline ? `, ${nfTextoInline}` : ''}${periodoTextoInline}, encontrando-se o processo devidamente instruído com a Conformidade Documental nos autos (${sigadoc});

III - Encaminham-se os autos ao Núcleo de Gestão Estratégica e Resultados (NGER) para análise e deliberações quanto à validação orçamentária, bem como à disponibilidade de recursos para atendimento da despesa indenizatória.

${detalhesIndenizacaoLinhas}

Para posterior encaminhamento à Coordenadoria de Orçamento - COC/SEJUS, para a emissão da Nota de Empenho e prosseguimento do pagamento por indenização.`;

  const standardDespachoText = `Prezado Chefe de Unidade,

I - Trata-se dos autos, versando acerca da solicitação da emissão de nota de empenho, para atendimento ao Contrato n° ${contratoFormatado}, firmado com a ${empresa}, cujo objeto é ${objetoTexto};

II - Considerando a insuficiência de saldo de empenho para o atendimento da ${nomeMedicao} do Contrato retromencionado;

III - Encaminham-se os autos para análise e deliberações quanto à validação orçamentária, bem como, à disponibilidade de recursos para as medições finais do referido instrumento contratual.

UO: ${uo}
UG: ${ug}
Valor: ${formatCurrency(valor)} (${extenso})

Para posterior encaminhamento à Coordenadoria de Orçamento - COC/SEJUS, para a emissão da Nota de Empenho Complementar.`;

  const defaultDespachoText = isIndenizacao ? indenizacaoDespachoText : standardDespachoText;
  const currentText = customText !== null ? customText : defaultDespachoText;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col overflow-hidden border border-slate-300 my-auto">
        {/* Modal Action Bar */}
        <div className="print:hidden bg-[#d97706] text-white px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {isIndenizacao
                  ? 'DESPACHO NGER — PAGAMENTO POR INDENIZAÇÃO'
                  : 'DESPACHO NGER — SOLICITAÇÃO DE EMPENHO'}
              </h3>
              <p className="text-[10px] text-amber-100 font-medium">
                {isIndenizacao
                  ? `Contrato ${contratoFormatado}${tacNumero ? ` • TAC ${tacNumero}` : ''}${nfNumero ? ` • ${nfNumero}` : ''}`
                  : `Contrato ${contratoFormatado} • ${nomeMedicao}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-900 rounded text-xs font-bold uppercase transition-all cursor-pointer shadow-xs"
              title="Copiar texto do despacho para área de transferência"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-800" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-900" />
                  <span>Copiar Texto</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsEditingCustomText(!isEditingCustomText)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded text-xs font-bold uppercase cursor-pointer shadow-xs"
              title="Alternar edição direta do texto"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingCustomText ? 'Visualizar' : 'Editar'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 sm:p-10 space-y-6 text-xs text-slate-800 leading-relaxed font-sans bg-white overflow-y-auto">
          {/* Dados Resumidos */}
          <div className="bg-slate-50 p-3 rounded border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div>
              <strong className="text-slate-500 block text-[10px] uppercase">PROCESSO:</strong>
              <span className="font-mono font-bold text-slate-900 text-[11px] whitespace-nowrap select-text">{sigadoc || '-'}</span>
            </div>
            <div>
              <strong className="text-slate-500 block text-[10px] uppercase">CONTRATO:</strong>
              <span className="font-bold text-slate-900">Nº {contratoFormatado}</span>
            </div>
            <div>
              <strong className="text-slate-500 block text-[10px] uppercase">
                {isIndenizacao ? 'TAC / NOTA FISCAL:' : 'MEDIÇÃO:'}
              </strong>
              {isIndenizacao ? (
                <div className="font-bold text-slate-900 uppercase leading-tight">
                  <span>
                    {tacNumero ? `TAC ${tacNumero}` : 'INDENIZAÇÃO'}
                    {nfNumero ? ` • ${nfNumero}` : ''}
                  </span>
                  {periodoApurado && (
                    <span className="block text-[10px] font-normal text-slate-600 mt-0.5">
                      Período: {periodoApurado}
                    </span>
                  )}
                </div>
              ) : (
                <span className="font-bold text-slate-900 uppercase">{nomeMedicao}</span>
              )}
            </div>
            <div>
              <strong className="text-slate-500 block text-[10px] uppercase">VALOR:</strong>
              <span className="font-mono font-bold text-emerald-800">{formatCurrency(valor)}</span>
            </div>
          </div>

          {/* Despacho Text Body */}
          {isEditingCustomText ? (
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">
                Edição Direta do Texto do Despacho:
              </label>
              <textarea
                rows={14}
                value={currentText}
                onChange={(e) => setCustomText(e.target.value)}
                className="w-full text-[14px] sm:text-[15px] p-3 font-serif leading-relaxed border border-amber-300 rounded focus:ring-1 focus:ring-amber-500 outline-none bg-amber-50/20"
              />
            </div>
          ) : isIndenizacao ? (
            <div className="bg-white p-5 rounded border border-slate-200 shadow-2xs space-y-4 text-[15px] leading-relaxed text-slate-900 font-serif">
              <p className="font-bold text-slate-900">Prezado Chefe de Unidade,</p>

              <p className="text-justify indent-6">
                <strong>I - </strong>Trata-se dos autos, versando acerca da solicitação de emissão de nota de empenho para pagamento por indenização, no âmbito do <strong>Contrato n° {contratoFormatado}</strong>, firmado com a empresa <strong>{empresa}</strong>, cujo objeto é {objetoTexto}{localTextoInline};
              </p>

              <p className="text-justify indent-6">
                <strong>II - </strong>O referido pagamento refere-se ao <strong>{tacTextoInline}</strong>{nfTextoInline ? `, ${nfTextoInline}` : ''}{periodoTextoInline}, encontrando-se o processo devidamente instruído com a Conformidade Documental nos autos (<strong>{sigadoc}</strong>);
              </p>

              <p className="text-justify indent-6">
                <strong>III - </strong>Encaminham-se os autos ao Núcleo de Gestão Estratégica e Resultados (NGER) para análise e deliberações quanto à validação orçamentária, bem como à disponibilidade de recursos para atendimento da despesa indenizatória.
              </p>

              <div className="bg-slate-50 p-3.5 rounded border border-slate-200 font-mono text-xs space-y-1">
                <div><strong>Processo:</strong> {sigadoc}</div>
                {tacNumero && <div><strong>TAC:</strong> {tacNumero}</div>}
                {nfNumero && (
                  <div>
                    <strong>Nota Fiscal:</strong> {nfNumero}
                    {nfDatasResumo}
                  </div>
                )}
                {periodoApurado && <div><strong>Período apurado:</strong> {periodoApurado}</div>}
                {unidadeLocal && <div><strong>Unidade/Local:</strong> {unidadeLocal}</div>}
                <div className="flex items-center gap-1.5">
                  <strong>UO:</strong>
                  <input
                    type="text"
                    value={uo}
                    onChange={(e) => setUo(e.target.value.toUpperCase())}
                    title="Editar UO"
                    className="w-24 bg-white border border-slate-300 focus:border-amber-500 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <strong>UG:</strong>
                  <input
                    type="text"
                    value={ug}
                    onChange={(e) => setUg(e.target.value.toUpperCase())}
                    title="Editar UG"
                    className="w-24 bg-white border border-slate-300 focus:border-amber-500 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 outline-none"
                  />
                </div>
                <div>
                  <strong>Valor:</strong> <span className="font-bold text-slate-900">{formatCurrency(valor)}</span> ({extenso})
                </div>
              </div>

              <p className="text-justify">
                Para posterior encaminhamento à Coordenadoria de Orçamento - COC/SEJUS, para a emissão da Nota de Empenho e prosseguimento do pagamento por indenização.
              </p>
            </div>
          ) : (
            <div className="bg-white p-5 rounded border border-slate-200 shadow-2xs space-y-4 text-[15px] leading-relaxed text-slate-900 font-serif">
              <p className="font-bold text-slate-900">Prezado Chefe de Unidade,</p>

              <p className="text-justify indent-6">
                <strong>I - </strong>Trata-se dos autos, versando acerca da solicitação da emissão de nota de empenho, para atendimento ao <strong>Contrato n° {contratoFormatado}</strong>, firmado com a <strong>{empresa}</strong>, cujo objeto é {objetoTexto};
              </p>

              <p className="text-justify indent-6">
                <strong>II - </strong>Considerando a insuficiência de saldo de empenho para o atendimento da <strong>{nomeMedicao}</strong> do Contrato retromencionado;
              </p>

              <p className="text-justify indent-6">
                <strong>III - </strong>Encaminham-se os autos para análise e deliberações quanto à validação orçamentária, bem como, à disponibilidade de recursos para as medições finais do referido instrumento contratual.
              </p>

              <div className="bg-slate-50 p-3.5 rounded border border-slate-200 font-mono text-xs space-y-1">
                <div className="flex items-center gap-1.5">
                  <strong>UO:</strong>
                  <input
                    type="text"
                    value={uo}
                    onChange={(e) => setUo(e.target.value.toUpperCase())}
                    title="Editar UO"
                    className="w-24 bg-white border border-slate-300 focus:border-amber-500 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <strong>UG:</strong>
                  <input
                    type="text"
                    value={ug}
                    onChange={(e) => setUg(e.target.value.toUpperCase())}
                    title="Editar UG"
                    className="w-24 bg-white border border-slate-300 focus:border-amber-500 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 outline-none"
                  />
                </div>
                <div><strong>Valor:</strong> <span className="font-bold text-slate-900">{formatCurrency(valor)}</span> ({extenso})</div>
              </div>

              <p className="text-justify">
                Para posterior encaminhamento à Coordenadoria de Orçamento - COC/SEJUS, para a emissão da Nota de Empenho Complementar.
              </p>
            </div>
          )}

          {/* Signer Block */}
          <div className="pt-6 text-center space-y-1 max-w-sm mx-auto group relative">
            <div className="w-72 mx-auto border-t-2 border-slate-800 pt-2 font-black text-xs uppercase text-slate-900">
              <input
                type="text"
                value={signer.nome}
                onChange={(e) => updateSigner({ nome: e.target.value.toUpperCase() })}
                title="Clique para editar o nome do responsável"
                placeholder="JOÃO ALEXANDRE DOURADO"
                className="w-full text-center font-black text-xs uppercase text-slate-900 bg-transparent hover:bg-amber-50/80 focus:bg-white focus:ring-1 focus:ring-amber-500 rounded px-1 py-0.5 outline-none border border-transparent hover:border-amber-300 transition-all cursor-text"
              />
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-600">
              <input
                type="text"
                value={signer.cargo}
                onChange={(e) => updateSigner({ cargo: e.target.value.toUpperCase() })}
                title="Clique para editar o cargo"
                placeholder="ASSISTENTE ADMINISTRATIVO DO SISPEN"
                className="w-full text-center text-[10px] uppercase font-bold text-slate-600 bg-transparent hover:bg-amber-50/80 focus:bg-white focus:ring-1 focus:ring-amber-500 rounded px-1 py-0.5 outline-none border border-transparent hover:border-amber-300 transition-all cursor-text"
              />
            </div>
            <div className="text-[10px] uppercase font-mono font-bold text-slate-700">
              <input
                type="text"
                value={signer.setor}
                onChange={(e) => updateSigner({ setor: e.target.value.toUpperCase() })}
                title="Clique para editar o setor/lotação"
                placeholder="CISE / SOE / SEJUS / MT"
                className="w-full text-center text-[10px] uppercase font-mono font-bold text-slate-700 bg-transparent hover:bg-amber-50/80 focus:bg-white focus:ring-1 focus:ring-amber-500 rounded px-1 py-0.5 outline-none border border-transparent hover:border-amber-300 transition-all cursor-text"
              />
            </div>
            <div className="print:hidden text-[9px] text-amber-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 font-medium pt-0.5">
              <Edit3 className="w-2.5 h-2.5" />
              <span>Clique no nome ou cargo para editar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
