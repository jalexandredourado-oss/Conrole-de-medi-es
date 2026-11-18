import { useState, useEffect } from 'react';

export interface SignerConfig {
  nome: string;
  cargo: string;
  setor: string;
}

export const DEFAULT_SIGNER: SignerConfig = {
  nome: 'JOÃO ALEXANDRE DOURADO',
  cargo: 'ASSISTENTE ADMINISTRATIVO DO SISPEN',
  setor: 'CISE / SOE / SEJUS / MT',
};

const SIGNER_STORAGE_KEY = 'sispen_signer_config_v1';

export function getSignerConfig(): SignerConfig {
  if (typeof window === 'undefined') return DEFAULT_SIGNER;
  try {
    const raw = localStorage.getItem(SIGNER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.nome === 'string' && parsed.nome.trim()) {
        return {
          nome: parsed.nome.trim(),
          cargo: parsed.cargo?.trim() || DEFAULT_SIGNER.cargo,
          setor: parsed.setor?.trim() || DEFAULT_SIGNER.setor,
        };
      }
    }
  } catch (err) {
    console.warn('Notice loading signer config:', err);
  }
  return DEFAULT_SIGNER;
}

export function saveSignerConfig(config: Partial<SignerConfig>): SignerConfig {
  const current = getSignerConfig();
  const updated: SignerConfig = {
    nome: (config.nome !== undefined && config.nome.trim() ? config.nome : current.nome).trim(),
    cargo: (config.cargo !== undefined && config.cargo.trim() ? config.cargo : current.cargo).trim(),
    setor: (config.setor !== undefined && config.setor.trim() ? config.setor : current.setor).trim(),
  };

  try {
    localStorage.setItem(SIGNER_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('sispen_signer_updated', { detail: updated }));
  } catch (err) {
    console.warn('Notice saving signer config:', err);
  }
  return updated;
}

export function resetSignerConfig(): SignerConfig {
  try {
    localStorage.setItem(SIGNER_STORAGE_KEY, JSON.stringify(DEFAULT_SIGNER));
    window.dispatchEvent(new CustomEvent('sispen_signer_updated', { detail: DEFAULT_SIGNER }));
  } catch (err) {
    console.warn('Notice resetting signer config:', err);
  }
  return DEFAULT_SIGNER;
}

export function useSignerConfig() {
  const [signer, setSigner] = useState<SignerConfig>(getSignerConfig());

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<SignerConfig>;
      if (custom.detail) {
        setSigner(custom.detail);
      } else {
        setSigner(getSignerConfig());
      }
    };
    window.addEventListener('sispen_signer_updated', handler);
    return () => window.removeEventListener('sispen_signer_updated', handler);
  }, []);

  const updateSigner = (partial: Partial<SignerConfig>) => {
    const updated = saveSignerConfig(partial);
    setSigner(updated);
    return updated;
  };

  return { signer, updateSigner, resetSigner: resetSignerConfig };
}
