import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { Contrato, ItemConformidade } from '../../types/contract';

interface CobrarFiscalModalProps {
  isOpen: boolean;
  onClose: () => void;
  contrato: Contrato;
  medicaoNome: string;
  medicaoValor?: number;
  irregularItens: ItemConformidade[];
  processoSigadoc?: string;
}

export const CobrarFiscalModal: React.FC<CobrarFiscalModalProps> = ({
  isOpen,
  onClose,
  contrato,
  medicaoNome,
  irregularItens,
  processoSigadoc,
}) => {
  const [messageText, setMessageText] = useState('');
  const [copied, setCopied] = useState(false);

  // Extracts fiscal first name (e.g. "PAULO ROBERTO" -> "PAULO", "STEPHANIE KAROLYNE..." -> "STEPHANIE")
  const getFiscalFirstName = (fullName?: string) => {
    if (!fullName) return 'FISCAL';
    const clean = fullName.trim().toUpperCase();
    if (
      clean === 'NÃO DESIGNADO' ||
      clean === 'NÃO INFORMADO' ||
      clean === '-' ||
      clean === 'FISCAL DO CONTRATO'
    ) {
      return 'FISCAL';
    }
    const parts = clean.split(/\s+/);
    return parts[0] || 'FISCAL';
  };

  // Formats measurement title e.g. "01ª MED" -> "1ª MEDIÇÃO"
  const formatMedicaoParaMensagem = (raw: string) => {
    if (!raw) return '1ª MEDIÇÃO';
    const s = raw.trim().toUpperCase();
    if (/^\d+\s+(?:E|e)\s+\d+/.test(s)) {
      return s.replace(/^(\d+)\s+(?:E|e)\s+(\d+).*$/, '$1ª E $2ª MEDIÇÃO');
    }
    const singleMatch = s.match(/^0*(\d+)ª?\s*(?:MED|MEDIÇÃO|MEDICAO)?$/i);
    if (singleMatch) {
      return `${singleMatch[1]}ª MEDIÇÃO`;
    }
    const numMatch = s.match(/0*(\d+)ª?\s*(?:MED|MEDIÇÃO|MEDICAO)?/i);
    if (numMatch) {
      return `${numMatch[1]}ª MEDIÇÃO`;
    }
    return s;
  };

  // Format list of irregular items with dots and semicolon/period
  const formatIrregularItens = (itens: ItemConformidade[]) => {
    if (!itens || itens.length === 0) {
      return '. NENHUMA PENDÊNCIA IDENTIFICADA NA DOCUMENTAÇÃO.';
    }
    return itens
      .map((item, idx) => {
        const isLast = idx === itens.length - 1;
        const desc = (item.descricao || item.codigo).trim().toUpperCase();
        return `. ${desc}${isLast ? '.' : ';'}`;
      })
      .join('\n');
  };

  const fiscalFirstName = getFiscalFirstName(contrato.fiscal);
  const contratoNumero = contrato.numero || '001/2022';
  const sigadocFinal = (
    processoSigadoc ||
    contrato.processoSigadoc ||
    'SEJUS-PRO-2025/09284'
  ).trim();

  useEffect(() => {
    if (isOpen) {
      const medNomeFinal = formatMedicaoParaMensagem(medicaoNome);
      const itensFormatados = formatIrregularItens(irregularItens);

      const template = `OLÁ, ${fiscalFirstName}!

IDENTIFIQUEI PENDÊNCIAS NA DOCUMENTAÇÃO PARA O PAGAMENTO DA ${medNomeFinal} DO CONTRATO N. ${contratoNumero} (${sigadocFinal}):

${itensFormatados}`;

      setMessageText(template);
      setCopied(false);
    }
  }, [
    isOpen,
    contrato.fiscal,
    contratoNumero,
    sigadocFinal,
    medicaoNome,
    irregularItens,
    fiscalFirstName,
  ]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(messageText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = messageText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Erro ao copiar texto:', err);
    }
  };

  const handleWhatsApp = () => {
    const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - WhatsApp Emerald */}
        <div className="bg-[#008069] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white/15 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
                COBRAR FISCAL NO WHATSAPP
              </h3>
              <p className="text-[10px] sm:text-[11px] text-emerald-100 font-medium uppercase mt-0.5">
                NOTIFICAÇÃO DE PENDÊNCIA DOCUMENTAL PARA SANEAMENTO DE IRREGULARIDADES
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Destination Warning Box (Amber) */}
          <div className="bg-[#fffdf5] border border-[#fcd34d] rounded-xl p-3.5 sm:p-4 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-900 uppercase">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>DESTINATÁRIO: {fiscalFirstName}</span>
            </div>
            <div className="mt-1 text-[11px] sm:text-xs text-amber-800 font-medium uppercase">
              <span>CONTRATO: </span>
              <span className="font-bold text-amber-950">{contratoNumero}</span>
              <span className="mx-1.5 text-amber-400">•</span>
              <span>PROCESSO: </span>
              <span className="font-bold text-amber-950">{sigadocFinal}</span>
            </div>
          </div>

          {/* Labels above textarea */}
          <div className="flex items-start justify-between gap-2 pt-1">
            <div>
              <span className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                MENSAGEM FORMATADA
              </span>
              <span className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                (EDITÁVEL):
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[10px] sm:text-[11px] text-slate-500 font-medium uppercase">
                COMPATÍVEL COM NEGRITO DO WHATSAPP
              </span>
              <span className="block text-[10px] sm:text-[11px] text-slate-500 font-medium uppercase">
                (*TEXTO*)
              </span>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={8}
            className="w-full p-4 border border-slate-300 rounded-xl text-xs sm:text-[13px] text-slate-800 font-sans leading-relaxed focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none resize-y min-h-[180px]"
            placeholder="Digite ou ajuste a mensagem de cobrança..."
          />
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 uppercase px-2 py-1.5 transition-colors cursor-pointer"
          >
            FECHAR
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-[#00875a] hover:bg-[#00704a] active:scale-95 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer shadow-xs"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>COPIADO!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>COPIAR MENSAGEM</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleWhatsApp}
              className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-[#004d40] hover:bg-[#00382f] active:scale-95 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer shadow-xs"
            >
              <ExternalLink className="w-4 h-4" />
              <span>ABRIR WHATSAPP WEB</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
