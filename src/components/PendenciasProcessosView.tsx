import React, { useState, useMemo } from 'react';
import { ArrowLeft, Clock, Search, MapPin, FileText } from 'lucide-react';
import { Contrato } from '../types/contract';
import { TopStatsBar } from './TopStatsBar';
import { formatCurrency, formatNumeroMedicao } from '../utils/formatters';
import { DespachoNgerModal } from './modals/DespachoNgerModal';

export interface ProcessoPendenciaItem {
  id: string;
  sigadoc: string;
  contratoNumero: string;
  empresa: string;
  municipio: string;
  medicoes: string;
  descricao: string;
  observacao: string;
  valorMedicao: number;
  valorPendente: number;
  contrato: Contrato;
}

interface PendenciasProcessosViewProps {
  contratos: Contrato[];
  onBackToPainel: () => void;
  onSelectContract: (contrato: Contrato) => void;
  onNewContract: () => void;
  onDownloadPdf: () => void;
  isDownloadingPdf?: boolean;
  onOpenRelatorioGerencial: () => void;
  totalObservationsCount: number;
}

export const PendenciasProcessosView: React.FC<PendenciasProcessosViewProps> = ({
  contratos,
  onBackToPainel,
  onSelectContract,
  onNewContract,
  onDownloadPdf,
  isDownloadingPdf = false,
  onOpenRelatorioGerencial,
  totalObservationsCount,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNgerItem, setSelectedNgerItem] = useState<ProcessoPendenciaItem | null>(null);

  // Extract all processes that have observations registered across all contracts
  const processosComPendencia = useMemo<ProcessoPendenciaItem[]>(() => {
    const items: ProcessoPendenciaItem[] = [];

    contratos.forEach((contrato) => {
      (contrato.medicoes || []).forEach((med) => {
        const obs = med.observacao?.trim();
        // Ignore empty observations and those marked as 'Pago pela UO da SESP'
        if (obs && obs.length > 0 && med.empenhoVinculado !== 'Pago pela UO da SESP') {
          const sigadocValue =
            med.sigadoc?.trim() || contrato.processoSigadoc?.trim() || 'NÃO INFORMADO';

          const municipioValue =
            med.unidadeCidade?.trim() ||
            contrato.regioes?.[0]?.cidades?.trim() ||
            contrato.regioes?.[0]?.nome?.replace(/^POLO\s+/i, '')?.trim() ||
            'NÃO INFORMADO';

          const formattedMedicao = formatNumeroMedicao(med.numeroMed) || med.numeroMed;

          const descValue =
            med.descricao?.trim() ||
            contrato.descricao?.trim() ||
            contrato.objeto?.trim() ||
            '-';

          const valorMed = med.valorMedicao || 0;
          const valorPend =
            med.valorPendente !== undefined && med.valorPendente > 0
              ? med.valorPendente
              : med.empenhoVinculado === 'SEM EMPENHO'
              ? med.valorMedicao
              : 0;

          items.push({
            id: `${contrato.id}-${med.id}`,
            sigadoc: sigadocValue,
            contratoNumero: contrato.numero,
            empresa: contrato.razaoSocial,
            municipio: municipioValue,
            medicoes: formattedMedicao,
            descricao: descValue,
            observacao: obs,
            valorMedicao: valorMed,
            valorPendente: valorPend,
            contrato,
          });
        }
      });
    });

    return items;
  }, [contratos]);

  // Filtered by search term
  const filteredProcesses = useMemo(() => {
    if (!searchTerm.trim()) return processosComPendencia;
    const term = searchTerm.toLowerCase();

    return processosComPendencia.filter(
      (p) =>
        p.sigadoc.toLowerCase().includes(term) ||
        p.contratoNumero.toLowerCase().includes(term) ||
        p.empresa.toLowerCase().includes(term) ||
        p.municipio.toLowerCase().includes(term) ||
        p.medicoes.toLowerCase().includes(term) ||
        p.descricao.toLowerCase().includes(term) ||
        p.observacao.toLowerCase().includes(term)
    );
  }, [processosComPendencia, searchTerm]);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* 1. Subheader: Back Button on Left, TopStatsBar on Right (matching Image 2) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
        <button
          onClick={onBackToPainel}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md text-xs font-bold uppercase transition-all shadow-2xs cursor-pointer active:scale-95 group w-fit"
          title="Retornar para o Painel Geral de Contratos"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>VOLTAR AO PAINEL GERAL</span>
        </button>

        <TopStatsBar
          expiringCount={0}
          onFilterExpiring={() => {}}
          isFilterExpiringActive={false}
          pendingObservationsCount={totalObservationsCount}
          onTogglePendencias={onBackToPainel}
          isPendenciasActive={true}
          onOpenRelatorioGerencial={onOpenRelatorioGerencial}
          onDownloadPdf={onDownloadPdf}
          isDownloadingPdf={isDownloadingPdf}
          onNewContract={onNewContract}
        />
      </div>

      {/* 2. Title & Search Filter Row (matching Image 2) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-transparent">
        {/* Title + Process Count Tag */}
        <div className="flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-full border border-slate-400/80 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
            <Clock className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-black text-slate-800 tracking-wide uppercase">
                PENDÊNCIAS DE PROCESSOS
              </h2>
              <span className="bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[10px] px-2 py-0.5 rounded uppercase shadow-2xs">
                {filteredProcesses.length}{' '}
                {filteredProcesses.length === 1 ? 'PROCESSO' : 'PROCESSOS'}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-0.5">
              EXIBINDO OS PROCESSOS COM OBSERVAÇÕES REGISTRADAS
            </p>
          </div>
        </div>

        {/* Filter Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="FILTRAR POR PROCESSO, CONTRATO, MUN..."
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-800 placeholder-slate-400 uppercase focus:ring-1 focus:ring-blue-600 outline-none shadow-2xs"
          />
        </div>
      </div>

      {/* 3. Table Container Card with Red Border/Shadow styling from Image 2 */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        {/* Subheader bar inside card */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase">
            <Clock className="w-3.5 h-3.5 text-slate-600" />
            <span>PROCESSOS COM PENDÊNCIA ({filteredProcesses.length})</span>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            LISTAGEM CONSOLIDADA POR PROCESSO SIGADOC
          </span>
        </div>

        {/* Main Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-[#1b346d] text-white font-bold uppercase text-[11px] tracking-wider border-b border-[#142752]">
                <th className="py-3 px-4 w-48 min-w-[190px] whitespace-nowrap">PROCESSO SIGADOC</th>
                <th className="py-3 px-4 w-52">CONTRATO / EMPRESA</th>
                <th className="py-3 px-4 w-32">MUNICÍPIO</th>
                <th className="py-3 px-4 w-28">MEDIÇÕES</th>
                <th className="py-3 px-4 min-w-[200px] max-w-[280px]">DESCRIÇÃO</th>
                <th className="py-3 px-4 min-w-[240px]">OBSERVAÇÕES ANOTADAS</th>
                <th className="py-2.5 px-4 text-center w-36 whitespace-nowrap">
                  <span className="block leading-tight">VALOR DA MEDIÇÃO</span>
                  <span className="block text-[9px] font-medium text-blue-200 uppercase tracking-normal mt-0.5">
                    VALOR PENDENTE
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProcesses.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-slate-500 font-semibold uppercase text-xs"
                  >
                    Nenhum processo com observação registrado no momento.
                  </td>
                </tr>
              ) : (
                filteredProcesses.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onSelectContract(item.contrato)}
                    className="hover:bg-blue-50/70 cursor-pointer transition-colors group"
                    title={`Clique para acessar o Contrato Nº ${item.contratoNumero}`}
                  >
                    {/* 1. PROCESSO SIGADOC (sem quebra de linha) */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800 text-xs w-52 min-w-[200px] whitespace-nowrap select-text">
                      {item.sigadoc || '-'}
                    </td>

                    {/* 2. CONTRATO / EMPRESA */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-xs uppercase whitespace-nowrap group-hover:text-blue-700 transition-colors">
                        Nº {item.contratoNumero}
                      </div>
                      <div
                        className="text-[10.5px] font-semibold text-slate-500 uppercase truncate mt-0.5 max-w-[200px]"
                        title={item.empresa}
                      >
                        {item.empresa}
                      </div>
                    </td>

                    {/* 3. MUNICÍPIO */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 text-slate-700 font-medium text-xs uppercase whitespace-nowrap">
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{item.municipio}</span>
                      </div>
                    </td>

                    {/* 4. MEDIÇÕES */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800 text-xs uppercase whitespace-nowrap">
                      {item.medicoes}
                    </td>

                    {/* 5. DESCRIÇÃO */}
                    <td className="py-3.5 px-4">
                      <div
                        className="text-[11px] font-semibold text-slate-700 uppercase leading-snug line-clamp-2"
                        title={item.descricao}
                      >
                        {item.descricao}
                      </div>
                    </td>

                    {/* 6. OBSERVAÇÕES ANOTADAS (Soft amber/cream tone) */}
                    <td className="py-3.5 px-4">
                      <div className="bg-amber-50/70 border border-amber-200/80 text-amber-950 px-3 py-2 rounded-md text-[11.5px] font-normal leading-relaxed uppercase shadow-2xs max-w-xl">
                        <div>{item.observacao}</div>
                        {(item.observacao.toUpperCase().includes('NGER') ||
                          item.observacao.toUpperCase().includes('SOLICITAR EMPENHO')) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedNgerItem(item);
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#d97706] hover:bg-[#b45309] active:scale-95 text-white rounded text-[10.5px] font-bold uppercase transition-all cursor-pointer shadow-2xs"
                            title="Gerar/Visualizar Despacho NGER para esta medição"
                          >
                            <FileText className="w-3.5 h-3.5 text-amber-100" />
                            <span>Despacho NGER</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* 7. VALOR DA MEDIÇÃO COM VALOR PENDENTE ABAIXO */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-900 text-xs block leading-tight">
                        {formatCurrency(item.valorMedicao)}
                      </span>
                      <span
                        className={`text-[10px] font-mono block mt-0.5 ${
                          item.valorPendente > 0
                            ? 'text-red-600 font-semibold'
                            : 'text-slate-500 font-normal'
                        }`}
                        title={`Valor Pendente: ${formatCurrency(item.valorPendente)}`}
                      >
                        {formatCurrency(item.valorPendente)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Despacho NGER Modal */}
      <DespachoNgerModal
        isOpen={!!selectedNgerItem}
        onClose={() => setSelectedNgerItem(null)}
        contrato={selectedNgerItem?.contrato}
        medicaoObj={
          selectedNgerItem
            ? selectedNgerItem.contrato.medicoes?.find(
                (m) =>
                  m.sigadoc === selectedNgerItem.sigadoc ||
                  m.observacao === selectedNgerItem.observacao
              ) || {
                id: selectedNgerItem.id,
                numeroMed: selectedNgerItem.medicoes,
                periodo: '',
                unidadeCidade: selectedNgerItem.municipio,
                descricao: selectedNgerItem.descricao,
                sigadoc: selectedNgerItem.sigadoc,
                empenhoVinculado: 'SEM EMPENHO',
                valorMedicao: selectedNgerItem.valorPendente,
                medicaoPendente: true,
                percentualFisico: 0,
                dataRegistro: '',
                observacao: selectedNgerItem.observacao,
              }
            : null
        }
      />
    </div>
  );
};
