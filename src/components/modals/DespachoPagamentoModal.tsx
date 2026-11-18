import React, { useState, useEffect } from 'react';
import { X, Copy, Check, FileText } from 'lucide-react';

interface DespachoPagamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicaoNome: string;
  objetoContrato?: string;
  servicoExecutado?: string;
  descricao?: string;
  contratoNumero: string;
  razaoSocial: string;
  valorFormatado: string;
  processoConformidade: string;
  processoEmpenho: string;
}

export const DespachoPagamentoModal: React.FC<DespachoPagamentoModalProps> = ({
  isOpen,
  onClose,
  medicaoNome,
  objetoContrato,
  servicoExecutado,
  descricao,
  contratoNumero,
  razaoSocial,
  valorFormatado,
  processoConformidade,
  processoEmpenho,
}) => {
  const [copied, setCopied] = useState(false);
  const editorRef = React.useRef<HTMLDivElement>(null);

  // Helper to format measurement name e.g. "01ª MED" -> "1ª Medição"
  const formatMedicao = (raw: string) => {
    if (!raw) return '1ª Medição';
    const s = raw.trim();

    // Check multiple measurements like "3 E 4" or "3 e 4"
    if (/^\d+\s+(?:E|e)\s+\d+/.test(s)) {
      return s.replace(/^(\d+)\s+(?:E|e)\s+(\d+).*$/, '$1ª e $2ª Medição');
    }

    // Single number formats
    const singleMatch = s.match(/^0*(\d+)ª?\s*(?:MED|MEDIÇÃO|MEDICAO)?$/i);
    if (singleMatch) {
      return `${singleMatch[1]}ª Medição`;
    }

    const numMatch = s.match(/0*(\d+)ª?\s*(?:MED|MEDIÇÃO|MEDICAO)?/i);
    if (numMatch) {
      return `${numMatch[1]}ª Medição`;
    }

    return s;
  };

  // Helper to clean trailing 'para', 'de', punctuation from contract object
  const cleanObjeto = (raw?: string) => {
    if (!raw) return 'Manutenção predial preventiva e corretiva';
    let s = raw.trim();
    // Remove trailing "para", "de", punctuation
    s = s.replace(/\s+(?:para|de|em)[,:\s]*$/i, '').trim();
    s = s.replace(/[,;:\-]+$/, '').trim();
    return s;
  };

  // Helper to format description: sentence case while preserving acronyms/cities/proper nouns
  const formatDescricao = (raw: string) => {
    if (!raw) return '';
    const s = raw.trim();

    const acronyms = new Set([
      'ETE', 'UASB', 'CDP', 'MT', 'SEJUS', 'SESP', 'PJC', 'PM', 'CBM', 'LTDA', 'ME', 'EPP', 'EIRELI', 'UP', 'AD', 'CR', 'DIC', 'CAP', 'PRO', 'PCE', 'TI', 'CASE', 'CISC', 'SOE', 'CISE', 'SISPEN', 'NF', 'OS'
    ]);
    const minorWords = new Set([
      'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os', 'para', 'por', 'com', 'sem', 'sob', 'sobre'
    ]);
    const properNouns = new Set([
      'Tangará', 'Serra', 'Cuiabá', 'Sinop', 'Rondonópolis', 'Sorriso', 'Lucas', 'Rio', 'Verde', 'Barra', 'Garças', 'Cáceres', 'Alta', 'Floresta', 'Diamantino', 'Juína', 'Mato', 'Grosso'
    ]);

    const formatted = s.split(' ').map((token, index) => {
      // Handles tokens with slashes, e.g. "SERRA/MT" -> "Serra/MT"
      if (token.includes('/')) {
        const parts = token.split('/');
        return parts.map((p) => {
          const cleanP = p.replace(/[^a-zA-ZÁ-Úá-ú]/g, '');
          if (acronyms.has(cleanP.toUpperCase())) return cleanP.toUpperCase();
          const titleP = cleanP.charAt(0).toUpperCase() + cleanP.slice(1).toLowerCase();
          if (properNouns.has(titleP)) return titleP;
          return cleanP.charAt(0).toUpperCase() + cleanP.slice(1).toLowerCase();
        }).join('/');
      }

      // Handles tokens with parenthesis, e.g. "(UASB)" -> "(UASB)"
      const insideParen = token.match(/^\((.*)\)$/);
      if (insideParen) {
        const inner = insideParen[1];
        if (acronyms.has(inner.toUpperCase())) return `(${inner.toUpperCase()})`;
        return `(${inner.charAt(0).toUpperCase() + inner.slice(1).toLowerCase()})`;
      }

      const clean = token.replace(/[^a-zA-ZÁ-Úá-ú]/g, '');
      if (acronyms.has(clean.toUpperCase())) {
        return token.replace(clean, clean.toUpperCase());
      }

      const titleCased = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
      if (properNouns.has(titleCased)) {
        return token.replace(clean, titleCased);
      }

      const lower = clean.toLowerCase();
      if (index > 0 && minorWords.has(lower)) {
        return token.replace(clean, lower);
      }

      if (index === 0) {
        return token.replace(clean, titleCased);
      }

      return token.replace(clean, lower);
    }).join(' ');

    // Normaliza 'sede antiga' para 'antiga sede' quando referente a prédios/unidades
    return formatted.replace(/\bsede\s+antiga\b/i, 'antiga sede');
  };

  useEffect(() => {
    if (isOpen) {
      const medNomeFinal = formatMedicao(medicaoNome);

      // Determina o objeto do contrato limpo (fallback caso a medição não possua descrição)
      const rawObjeto = cleanObjeto(objetoContrato || 'Manutenção predial preventiva e corretiva');
      const objetoFinal = formatDescricao(rawObjeto);

      // Usa diretamente a informação da coluna Descrição do histórico de medições
      const rawServico = (servicoExecutado || descricao || '').trim();
      const servicoFinal = formatDescricao(rawServico);

      const referenteFinal = servicoFinal || objetoFinal;
      
      let numContratoFinal = (contratoNumero || '070/2024').trim();
      if (!numContratoFinal.toUpperCase().includes('/SEJUS')) {
        numContratoFinal = `${numContratoFinal}/SEJUS`;
      }

      const empresaFinal = (razaoSocial || 'EMPRESA CONTRATADA').trim().toUpperCase();

      const confRaw = (processoConformidade || '').trim();
      const confFinal = confRaw && confRaw !== 'NÃO INFORMADO' && confRaw !== '-'
        ? confRaw
        : 'SEJUS-DIC-2026/78025';

      const empRaw = (processoEmpenho || '').trim();
      const empFinal = empRaw && empRaw !== 'NÃO INFORMADO' && empRaw !== '-'
        ? empRaw
        : 'SEJUS-CAP-2026/91052';

      const htmlTemplate = `<p><br></p><p>Prezados,</p><p><br></p><p>Encaminhamos à <strong>${medNomeFinal}</strong> referente a ${referenteFinal}, no âmbito do <strong>Contrato nº ${numContratoFinal}</strong>, firmado com a empresa ${empresaFinal}, no valor de <strong>${valorFormatado}</strong>.</p><p><br></p><p>Informamos que o processo encontra-se devidamente instruído, contendo toda a documentação necessária, incluindo a Conformidade ${confFinal} e o Empenho ${empFinal}.</p><p><br></p><p>Dessa forma, encaminhamos autos para conhecimento e adoção das providências necessárias quanto ao prosseguimento do pagamento.</p>`;

      if (editorRef.current) {
        editorRef.current.innerHTML = htmlTemplate;
        editorRef.current.scrollTop = 0;
      }
      setCopied(false);
    }
  }, [
    isOpen,
    medicaoNome,
    objetoContrato,
    servicoExecutado,
    descricao,
    contratoNumero,
    razaoSocial,
    valorFormatado,
    processoConformidade,
    processoEmpenho,
  ]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      const htmlContent = editorRef.current?.innerHTML || '';
      const textContent = editorRef.current?.innerText || '';

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const blobHtml = new Blob([htmlContent], { type: 'text/html' });
        const blobText = new Blob([textContent], { type: 'text/plain' });
        const item = new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText,
        });
        await navigator.clipboard.write([item]);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textContent);
      } else {
        // Fallback for older or restricted environments
        const textArea = document.createElement('textarea');
        textArea.value = textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      try {
        const textContent = editorRef.current?.innerText || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textContent);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (err2) {
        console.error('Erro ao copiar texto:', err2);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1e40af] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-700/60 rounded">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
                DESPACHO PARA PAGAMENTO DA MEDIÇÃO
              </h3>
              <p className="text-[11px] text-blue-100 font-semibold uppercase">
                CONFORMIDADE DOCUMENTAL SALVA COM SUCESSO!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              TEXTO DE ENCAMINHAMENTO (EDITÁVEL):
            </label>
            <span className="text-[10px] text-slate-400 font-semibold uppercase">
              VOCÊ PODE AJUSTAR O TEXTO ANTES DE COPIAR
            </span>
          </div>

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="w-full p-4 border border-slate-300 rounded-lg text-[14px] sm:text-[15px] text-slate-800 leading-relaxed font-sans focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none resize-y min-h-[260px] max-h-[460px] overflow-y-auto whitespace-pre-wrap bg-white [&_strong]:font-black [&_strong]:text-slate-950 [&_b]:font-black [&_b]:text-slate-950"
            role="textbox"
            aria-multiline="true"
          />
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold text-slate-600 hover:text-slate-800 uppercase px-3 py-1.5 rounded transition-colors cursor-pointer"
          >
            FECHAR
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1e40af] hover:bg-[#1d4ed8] active:scale-95 text-white text-xs font-bold uppercase rounded-lg shadow-xs transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>COPIADO!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>COPIAR TEXTO</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
