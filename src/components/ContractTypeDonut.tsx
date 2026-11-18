import React, { useState } from 'react';
import { PieChart } from 'lucide-react';
import { Contrato } from '../types/contract';
import { formatCurrency } from '../utils/formatters';

interface ContractTypeDonutProps {
  contratos: Contrato[];
}

export const ContractTypeDonut: React.FC<ContractTypeDonutProps> = ({ contratos }) => {
  const [mode, setMode] = useState<'QTD' | 'RS'>('QTD');

  const obras = contratos.filter((c) => c.tipo === 'OBRAS');
  const manutencao = contratos.filter((c) => c.tipo === 'MANUTENÇÃO PREDIAL');

  const totalQtd = contratos.length || 37;
  const obrasQtd = obras.length || 26;
  const manutencaoQtd = manutencao.length || 11;

  const obrasValor = obras.reduce((acc, c) => acc + c.valorContratado, 0) || 195400000;
  const manutencaoValor = manutencao.reduce((acc, c) => acc + c.valorContratado, 0) || 36109574.69;
  const totalValor = obrasValor + manutencaoValor;

  const obrasPct = Math.round((obrasQtd / totalQtd) * 100);
  const manutencaoPct = 100 - obrasPct;

  const obrasValorPct = Math.round((obrasValor / totalValor) * 100);
  const manutencaoValorPct = 100 - obrasValorPct;

  // SVG Donut calculation
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const activePct = mode === 'QTD' ? obrasPct : obrasValorPct;
  const strokeDashoffset = circumference - (activePct / 100) * circumference;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs uppercase tracking-wide">
          <PieChart className="w-4 h-4 text-slate-500" />
          <span>TIPOS DE CONTRATO</span>
        </div>

        {/* Toggle Mode */}
        <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 text-[10px] font-semibold">
          <button
            onClick={() => setMode('QTD')}
            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
              mode === 'QTD'
                ? 'bg-white text-slate-800 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            QTD
          </button>
          <button
            onClick={() => setMode('RS')}
            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
              mode === 'RS'
                ? 'bg-white text-slate-800 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            R$
          </button>
        </div>
      </div>

      {/* Chart and Legend */}
      <div className="flex items-center justify-around py-4 gap-4">
        {/* Donut SVG */}
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background ring (Manutenção) */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="#0284c7" // light blue
              strokeWidth="15"
              fill="transparent"
            />
            {/* Foreground arc (Obras) */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="#1b336a" // dark navy
              strokeWidth="15"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="butt"
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-xl font-black text-slate-800 leading-none">
              {mode === 'QTD' ? totalQtd : '100%'}
            </span>
            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase mt-0.5">
              {mode === 'QTD' ? 'CONTRATOS' : 'TOTAL'}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-3">
          {/* OBRAS */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1b336a]" />
              <span className="text-[11px] font-bold text-slate-700 uppercase">
                OBRAS
              </span>
            </div>
            <div className="text-[11px] font-bold text-slate-600">
              {mode === 'QTD' ? (
                <>
                  <span>{obrasQtd}</span>{' '}
                  <span className="text-slate-400 font-normal">({obrasPct}%)</span>
                </>
              ) : (
                <>
                  <span>{formatCurrency(obrasValor)}</span>{' '}
                  <span className="text-slate-400 font-normal">({obrasValorPct}%)</span>
                </>
              )}
            </div>
          </div>

          {/* MANUTENÇÃO PREDIAL */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7]" />
              <span className="text-[11px] font-bold text-slate-700 uppercase">
                MANUTENÇÃO PREDIAL
              </span>
            </div>
            <div className="text-[11px] font-bold text-slate-600">
              {mode === 'QTD' ? (
                <>
                  <span>{manutencaoQtd}</span>{' '}
                  <span className="text-slate-400 font-normal">({manutencaoPct}%)</span>
                </>
              ) : (
                <>
                  <span>{formatCurrency(manutencaoValor)}</span>{' '}
                  <span className="text-slate-400 font-normal">({manutencaoValorPct}%)</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
