/**
 * Triggers direct download of the standalone index.html system file
 * without opening any secondary modal or dialog window.
 */
export async function downloadStandaloneIndexHtml(): Promise<void> {
  try {
    const res = await fetch(`/standalone-system.html?v=${Date.now()}`);
    if (!res.ok) {
      throw new Error(`Falha ao obter standalone-system.html: status ${res.status}`);
    }
    let htmlText = await res.text();
    const apiBaseScript = `<script>window.__API_BASE_URL__ = ${JSON.stringify(window.location.origin)};</script>`;
    if (htmlText.includes('</head>')) {
      htmlText = htmlText.replace('</head>', `  ${apiBaseScript}\n</head>`);
    } else {
      htmlText = `${apiBaseScript}\n${htmlText}`;
    }
    const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'index.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (error) {
    console.error('Erro ao baixar index.html autônomo:', error);
    // Fallback direct navigation if blob failed
    const link = document.createElement('a');
    link.href = '/standalone-system.html';
    link.download = 'index.html';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
