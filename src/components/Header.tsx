import React from 'react';
import { BarChart3, Settings, Database, CloudCheck, Cloud, LogIn, LogOut, User as UserIcon, Menu, X, LayoutDashboard, Download, FileText, FileDown } from 'lucide-react';
import { User } from 'firebase/auth';
import { signInWithGoogle, signOutUser } from '../services/firebase';
import { isStandaloneApp } from '../utils/isStandalone';

interface HeaderProps {
  onOpenSettings?: () => void;
  onNavigatePainel?: () => void;
  onOpenRelatorioGerencial?: () => void;
  onDownloadPdf?: () => void;
  isDownloadingPdf?: boolean;
  onDownloadIndexHtml?: () => void;
  currentUser?: User | null;
  isFirebaseSyncing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onNavigatePainel,
  onOpenRelatorioGerencial,
  onDownloadPdf,
  isDownloadingPdf = false,
  onDownloadIndexHtml,
  currentUser,
  isFirebaseSyncing = false,
}) => {
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const isStandalone = React.useMemo(() => isStandaloneApp(), []);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  const formattedDate = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()).toUpperCase();
    } catch {
      return 'SEXTA-FEIRA, 2 DE OUTUBRO DE 2026';
    }
  }, []);

  const handleAuthAction = async () => {
    if (currentUser) {
      if (window.confirm(`Deseja desconectar a conta ${currentUser.email || currentUser.displayName}?`)) {
        await signOutUser();
      }
    } else {
      setIsSigningIn(true);
      try {
        await signInWithGoogle();
      } catch (err) {
        console.error('Falha ao autenticar:', err);
      } finally {
        setIsSigningIn(false);
      }
    }
  };

  return (
    <header className="print:hidden sticky top-0 z-40 bg-[#1b346d] text-white px-3 sm:px-5 py-2 flex items-center justify-between shadow-md select-none border-b border-[#142752]">
      {/* Left Title & Hamburger Menu */}
      <div className="flex items-center gap-3">
        {/* Hamburger Menu Button */}
        <button
          onClick={() => setIsMenuOpen(true)}
          title="Menu de navegação"
          aria-label="Abrir menu de navegação"
          aria-expanded={isMenuOpen}
          className="p-1.5 rounded bg-[#254284] hover:bg-[#2e509c] text-white border border-[#3b5ba5] transition-colors cursor-pointer flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Backdrop Overlay */}
        {isMenuOpen && (
          <div
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 transition-opacity"
          />
        )}

        {/* Slide-out Drawer Panel (desloca para a direita) */}
        <aside
          ref={menuRef}
          className={`fixed top-0 left-0 bottom-0 w-72 sm:w-80 bg-white z-50 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out text-slate-800 ${
            isMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          aria-label="Menu Lateral"
        >
          {/* Drawer Header */}
          <div className="bg-[#1b346d] text-white p-4 flex items-center justify-between border-b border-[#142752]">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-5 h-5 text-blue-200 stroke-[2.5]" />
              <span className="font-bold tracking-wide text-sm uppercase">Menu do Sistema</span>
            </div>
            <button
              onClick={() => setIsMenuOpen(false)}
              className="p-1.5 rounded hover:bg-[#254284] text-white transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300"
              title="Fechar menu"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body - Navigation Buttons (borderless clean list items) */}
          <div className="p-3 space-y-1.5 flex-1 overflow-y-auto">
            {/* Painel Geral */}
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onNavigatePainel?.();
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-100 text-slate-700 hover:text-[#1b346d] transition-colors text-left cursor-pointer group"
            >
              <div className="p-2 rounded-md bg-blue-50 text-[#1b346d] group-hover:bg-[#1b346d] group-hover:text-white transition-colors">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-800 group-hover:text-[#1b346d]">Painel Geral</div>
                <div className="text-[11px] font-normal text-slate-500">Tela principal de contratos e métricas</div>
              </div>
            </button>

            {/* Relatório Gerencial */}
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenRelatorioGerencial?.();
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-100 text-slate-700 hover:text-emerald-900 transition-colors text-left cursor-pointer group"
            >
              <div className="p-2 rounded-md bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-800 group-hover:text-emerald-900">Relatório Gerencial</div>
                <div className="text-[11px] font-normal text-slate-500">Fiscais, medições pendentes e empenhos</div>
              </div>
            </button>


            {/* Configurações */}
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenSettings?.();
              }}
              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-100 text-slate-700 hover:text-[#1b346d] transition-colors text-left cursor-pointer group"
            >
              <div className="p-2 rounded-md bg-blue-50 text-[#1b346d] group-hover:bg-[#1b346d] group-hover:text-white transition-colors">
                <Settings className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-800 group-hover:text-[#1b346d]">Configurações</div>
                <div className="text-[11px] font-normal text-slate-500">Tela cheia de importação e parâmetros</div>
              </div>
            </button>

            {/* Index.html Desktop - Exibido apenas na versão online/web para download; oculto no index baixado */}
            {!isStandalone && onDownloadIndexHtml && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDownloadIndexHtml();
                }}
                className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-100 text-emerald-900 transition-colors text-left cursor-pointer group"
              >
                <div className="p-2 rounded-md bg-emerald-100 text-emerald-800 group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                  <Download className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-emerald-950">Index.html</div>
                  <div className="text-[11px] font-normal text-emerald-700">Baixar sistema offline completo</div>
                </div>
              </button>
            )}

            {/* Card Google (Aparece no menu configurações) */}
            <div className="pt-2 border-t border-slate-200 mt-2">
              <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Acesso Google
              </div>
              {currentUser ? (
                <div className="mx-1 p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Avatar"
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-[#1b346d] flex items-center justify-center shrink-0">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-800 truncate">
                        {currentUser.displayName || currentUser.email?.split('@')[0]}
                      </div>
                      <div className="text-[10px] text-emerald-600 font-semibold truncate">
                        CONECTADO COM GOOGLE
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAuthAction}
                    title="Desconectar conta Google"
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="mx-1 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <button
                    type="button"
                    onClick={handleAuthAction}
                    disabled={isSigningIn}
                    title="Conectar com conta Google para associar seus lançamentos"
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded bg-[#254284] hover:bg-[#2e509c] text-white border border-[#3b5ba5] text-xs font-semibold cursor-pointer transition-colors shadow-xs disabled:opacity-60"
                  >
                    <LogIn className="w-3.5 h-3.5 text-emerald-300" />
                    <span className="text-[11px] uppercase tracking-wide">
                      {isSigningIn ? 'CONECTANDO...' : 'ENTRAR GOOGLE'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500 font-medium">
            <span>Sistema de Controle de Orçamento</span>
          </div>
        </aside>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center text-white">
            <BarChart3 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <h1 className="text-base font-bold tracking-wider uppercase">
            CONTROLE ORÇAMENTÁRIO DE MEDIÇÕES
          </h1>
        </div>
      </div>

      {/* Right Date and Actions */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Botão de PDF no painel principal (canto direito da janela) */}
        {onDownloadPdf && (
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={isDownloadingPdf}
            className="flex items-center justify-center p-2 rounded bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/20 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-60"
            title="Baixar relatório em PDF do painel"
            aria-label="Exportar PDF do painel"
          >
            {isDownloadingPdf ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileDown className="w-4 h-4 text-slate-200" />
            )}
          </button>
        )}

        {/* Botão de acesso Google quando desconectado */}
        {!isStandalone && !currentUser && (
          <button
            type="button"
            onClick={handleAuthAction}
            disabled={isSigningIn}
            title="Conectar conta Google para sincronizar na nuvem"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#254284] hover:bg-[#2e509c] text-white border border-[#3b5ba5] text-[10.5px] font-semibold uppercase tracking-wide transition-colors cursor-pointer shadow-2xs disabled:opacity-60"
          >
            <LogIn className="w-3.5 h-3.5 text-emerald-300" />
            <span>{isSigningIn ? 'Conectando...' : 'Entrar Google'}</span>
          </button>
        )}

        <span className="hidden md:inline text-[10.5px] font-medium tracking-normal text-slate-300 uppercase">
          {formattedDate}
        </span>
      </div>
    </header>
  );
};

