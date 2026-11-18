import React, { useState, useRef, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { Contrato } from '../../types/contract';
import { downloadContratoCompletoPdf } from '../../utils/downloadPdf';
import { ContractPdfTemplate } from '../pdf/ContractPdfTemplate';

interface ExportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  contrato: Contrato;
  mode?: 'COMPLETO' | 'CONFORMIDADE';
  autoPrint?: boolean;
}

export const ExportPdfModal: React.FC<ExportPdfModalProps> = ({
  isOpen,
  onClose,
  contrato,
  mode = 'COMPLETO',
  autoPrint = false,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);


  if (!isOpen) return null;

  const handleDownloadDirectPdf = async () => {
    if (!printableRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const cleanNum = contrato.numero.replace(/[^a-zA-Z0-9_-]/g, '-');
      const filename =
        mode === 'CONFORMIDADE'
          ? `Termo_Conformidade_${cleanNum}.pdf`
          : `Contrato_${cleanNum}_Completo_Detalhes_Empenhos_Medicoes.pdf`;
      await downloadContratoCompletoPdf(printableRef.current, filename, 'landscape');
    } catch (err) {
      console.error('Erro ao gerar PDF completo:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-1 sm:p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:inset-auto print:overflow-visible">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[98vw] 2xl:max-w-[1680px] max-h-[96vh] flex flex-col overflow-hidden border border-slate-300 print:border-none print:shadow-none print:max-h-none print:overflow-visible">
        {/* Modal Top Control Bar (Hidden when printed) */}
        <div className="print:hidden bg-[#162a52] text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded bg-red-600 font-black text-xs text-white shadow-xs">
              PDF
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                {mode === 'CONFORMIDADE'
                  ? `TERMO DE CONFORMIDADE DOCUMENTAL — CONTRATO Nº ${contrato.numero}`
                  : `RELATÓRIO COMPLETO — DETALHES, EMPENHOS E MEDIÇÕES`}
              </h3>
              <p className="text-[11px] text-blue-200">
                {mode === 'CONFORMIDADE'
                  ? `Contrato Nº ${contrato.numero} — ${contrato.razaoSocial}`
                  : `Contrato Nº ${contrato.numero}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Direct Download Button */}
            <button
              onClick={handleDownloadDirectPdf}
              disabled={isDownloading}
              className={`flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 ${
                isDownloading ? 'opacity-70 cursor-wait' : ''
              }`}
              title="Baixar arquivo PDF consolidado com todos os detalhes e tabelas em um único documento"
            >
              {isDownloading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4 stroke-[2.5]" />
              )}
              <span>{isDownloading ? 'GERANDO PDF...' : 'PDF'}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable preview container */}
        <div className="overflow-y-auto flex-1 bg-slate-200/60 p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible flex justify-center">
          <ContractPdfTemplate ref={printableRef} contrato={contrato} mode={mode} />
        </div>
      </div>
    </div>
  );
};
