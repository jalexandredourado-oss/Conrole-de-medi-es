import React, { useState } from 'react';
import { Edit, MapPin, Plus, Trash2 } from 'lucide-react';
import { Contrato, RegiaoValor } from '../../types/contract';
import { formatCurrency, formatCnpj } from '../../utils/formatters';
import { FinancialSummaryChart } from '../FinancialSummaryChart';
import { resolveCodigoCredor, isCnpjValue } from '../../utils/driveSpreadsheetSync';

interface ContractDetailsTabProps {
  contrato: Contrato;
  onEditContract: () => void;
  onUpdateContract: (updated: Contrato) => void;
}

export const ContractDetailsTab: React.FC<ContractDetailsTabProps> = ({
  contrato,
  onEditContract,
  onUpdateContract,
}) => {
  const [showAddRegion, setShowAddRegion] = useState(false);
  const [newRegionName, setNewRegionName] = useState('');
  const [newRegionValue, setNewRegionValue] = useState('');

  const handleAddRegion = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newRegionValue.replace(/\./g, '').replace(',', '.'));
    if (!newRegionName.trim() || isNaN(val)) return;

    const newRegion: RegiaoValor = {
      id: `reg-${Date.now()}`,
      nome: newRegionName.trim().toUpperCase(),
      valor: val,
    };

    onUpdateContract({
      ...contrato,
      regioes: [...(contrato.regioes || []), newRegion],
    });

    setNewRegionName('');
    setNewRegionValue('');
    setShowAddRegion(false);
  };

  const handleRemoveRegion = (id: string) => {
    onUpdateContract({
      ...contrato,
      regioes: (contrato.regioes || []).filter((r) => r.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      {/* 1. Full-width Budget & Financial Execution Chart with compact height and wider bars */}
      <div className="w-full">
        <FinancialSummaryChart
          isCompact={false}
          title="EXECUÇÃO ORÇAMENTÁRIA E FINANCEIRA"
          heightClass="h-32 sm:h-34 pt-2.5 sm:pt-3"
          barMaxWidthClass="max-w-[95px] sm:max-w-[120px] md:max-w-[140px]"
          metrics={{
            valorContratado: contrato.valorContratado,
            valorContratadoNaoExecutado: contrato.valorContratadoNaoExecutado,
            valorEmpenhado: contrato.valorEmpenhado,
            valorMedido: contrato.valorMedido,
            valorLiquidado: contrato.valorLiquidado,
            valorPago: contrato.valorPago,
          }}
        />
      </div>

      {/* 2. Section Header: Title on Left, Edit Button on Right (matching Print 3) */}
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          INFORMAÇÕES GERAIS DO CONTRATO
        </h2>
        <button
          onClick={onEditContract}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
        >
          <Edit className="w-3.5 h-3.5 text-slate-500" />
          <span>EDITAR CONTRATO</span>
        </button>
      </div>

      {/* 3. Main Full-Width Card with 3 Columns & Objeto Box (matching Print 3) */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-2xs space-y-6 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 gap-x-8">
          {/* Column 1 */}
          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                NÚMERO DO CONTRATO
              </span>
              <span className="text-xs font-bold text-slate-900 block mt-1">
                {contrato.numero}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                TIPO DE CONTRATO
              </span>
              <span className="text-xs font-bold text-slate-900 uppercase block mt-1">
                {contrato.tipo}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                CNPJ
              </span>
              <span className="text-xs font-medium text-slate-800 font-mono block mt-1">
                {formatCnpj(contrato.cnpj)}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                CÓDIGO DO CREDOR
              </span>
              <span className="text-xs font-medium text-slate-800 font-mono block mt-1">
                {(!isCnpjValue(contrato.codigoCredor) ? contrato.codigoCredor : '') || resolveCodigoCredor('', contrato.cnpj) || '-'}
              </span>
            </div>
          </div>

          {/* Column 2 */}
          <div className="space-y-6">
            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                Nº DO PROCESSO SIGADOC
              </span>
              <span className="text-xs text-slate-500 italic block mt-1">
                {contrato.processoSigadoc || 'NÃO INFORMADO'}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                RAZÃO SOCIAL
              </span>
              <span className="text-xs font-bold text-slate-900 block mt-1 uppercase">
                {contrato.razaoSocial}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                SIGLA
              </span>
              <span className="text-xs font-bold text-slate-900 block mt-1 font-mono tracking-wider">
                {contrato.siglaEmpresa || '-'}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                PERÍODO DE VIGÊNCIA
              </span>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-xs font-semibold text-slate-800">
                  {contrato.dataInicio} A {contrato.dataFim}
                </span>
                <span className={`text-xs font-bold ${contrato.diasVencer < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ({contrato.diasVencer} DIAS)
                </span>
              </div>
            </div>
          </div>

          {/* Column 3 */}
          <div className="space-y-4">
            <div className="border border-blue-200 bg-blue-50/20 rounded-md p-2.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                VALOR CONTRATADO
              </span>
              <span className="text-sm font-black text-blue-700 block mt-0.5 font-mono">
                {formatCurrency(contrato.valorContratado)}
              </span>
            </div>

            <div className="border border-emerald-200 bg-emerald-50/20 rounded-md p-2.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                SALDO DO CONTRATO
              </span>
              <span className="text-sm font-black text-emerald-600 block mt-0.5 font-mono">
                {formatCurrency(contrato.saldoContrato)}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block">
                FISCAL / SUBSTITUTO
              </span>
              <span className="text-xs font-bold text-slate-900 block mt-1 uppercase leading-tight">
                {contrato.fiscal}{' '}
                <span className="text-slate-500 font-normal">
                  (SUB: {contrato.substituto || 'NÃO INFORMADO'})
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Objeto Box spanning all columns */}
        <div className="pt-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">
            OBJETO
          </span>
          <div className="bg-slate-50/60 border border-slate-200 rounded p-3.5 text-xs text-slate-700 uppercase leading-relaxed font-medium">
            {contrato.objeto || contrato.descricao}
          </div>
        </div>
      </div>

      {/* 4. Optional Regiões Section (only shown if configured) */}
      {contrato.regioes && contrato.regioes.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs uppercase tracking-wide">
                <MapPin className="w-4 h-4 text-slate-500" />
                <span>VALOR POR REGIÃO</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">
                DISTRIBUIÇÃO DO VALOR CONTRATADO DO CONTRATO ENTRE AS REGIÕES
              </p>
            </div>
            <button
              onClick={() => setShowAddRegion(!showAddRegion)}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Região</span>
            </button>
          </div>

          {showAddRegion && (
            <form onSubmit={handleAddRegion} className="my-3 p-3 bg-slate-50 rounded border border-slate-200 flex flex-wrap gap-2 items-center">
              <input
                type="text"
                placeholder="NOME DA REGIÃO OU UNIDADE"
                value={newRegionName}
                onChange={(e) => setNewRegionName(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded uppercase flex-1 min-w-[200px]"
                required
              />
              <input
                type="text"
                placeholder="VALOR EM R$ (ex: 250000,00)"
                value={newRegionValue}
                onChange={(e) => setNewRegionValue(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded w-44"
                required
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setShowAddRegion(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </form>
          )}

          <div className="mt-4 divide-y divide-slate-100">
            {contrato.regioes.map((reg) => (
              <div key={reg.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 uppercase block">
                    {reg.nome}
                  </span>
                  {reg.cidades && (
                    <span className="text-[10px] text-slate-500 font-medium block">
                      📍 Cidades: {reg.cidades}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-800 font-mono">
                    {formatCurrency(reg.valor)}
                  </span>
                  <button
                    onClick={() => handleRemoveRegion(reg.id)}
                    className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
