declare global {
  interface Window {
    __IS_STANDALONE__?: boolean;
  }
}

declare const __IS_STANDALONE_BUILD__: boolean | undefined;

/**
 * Returns true if the application is executing inside the downloaded standalone
 * index.html file (offline desktop mode), or false if running on the web server.
 */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (window.__IS_STANDALONE__ === true) {
      return true;
    }

    if (typeof __IS_STANDALONE_BUILD__ !== 'undefined' && __IS_STANDALONE_BUILD__ === true) {
      return true;
    }

    if (window.location.protocol === 'file:' || window.location.protocol === 'blob:') {
      return true;
    }

    if (window.location.pathname && (
      window.location.pathname.endsWith('standalone-system.html') ||
      window.location.pathname.endsWith('index.html')
    )) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}
