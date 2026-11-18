import fs from 'fs';
import path from 'path';

const sourcePath = path.resolve('dist-single/index.html');

if (!fs.existsSync(sourcePath)) {
  console.error('Arquivo de origem não encontrado:', sourcePath);
  process.exit(1);
}

let source = fs.readFileSync(sourcePath, 'utf-8');

// Extrai o bloco <script type="module" ...>...</script>
const scriptStartIdx = source.indexOf('<script type="module"');
if (scriptStartIdx === -1) {
  console.error('Tag <script type="module" não encontrada no HTML.');
  process.exit(1);
}
const scriptEndIdx = source.lastIndexOf('</script>') + 9;
const scriptContent = source.substring(scriptStartIdx, scriptEndIdx);

// Extrai o bloco de estilos CSS que o Vite colocou após o script
const styleStartIdx = source.indexOf('<style', scriptEndIdx);
const styleEndIdx = source.lastIndexOf('</style>') + 8;

let cleanStyleTag = '';
if (styleStartIdx !== -1 && styleEndIdx !== -1) {
  const styleRaw = source.substring(styleStartIdx, styleEndIdx);
  const rawCss = styleRaw.replace(/<style[^>]*>/, '').replace(/<\/style>/, '').trim();
  cleanStyleTag = `<style type="text/css">\n${rawCss}\n</style>`;
} else {
  // Fallback caso a tag <style> esteja em outra posição
  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    cleanStyleTag = `<style type="text/css">\n${styleMatch[1].trim()}\n</style>`;
  }
}

// Parte do <head>: do início do arquivo até onde começava o script
const headPart = source.substring(0, scriptStartIdx);

// Parte do <body>: a partir do fim dos estilos até o fim do documento
const bodyPart = styleEndIdx !== -1 ? source.substring(styleEndIdx) : source.substring(scriptEndIdx);

// Localiza a tag </body> para posicionar o script rigorosamente DEPOIS de <div id="root"></div>
const bodyCloseIdx = bodyPart.indexOf('</body>');
let bodyContent = '';
let htmlEnd = '</body></html>';

if (bodyCloseIdx !== -1) {
  bodyContent = bodyPart.substring(0, bodyCloseIdx);
  htmlEnd = bodyPart.substring(bodyCloseIdx);
} else {
  bodyContent = bodyPart;
}

// Monta o documento HTML completo, padronizado e perfeitamente estruturado:
// 1. <head> com meta, title, favicon, flag standalone e estilos CSS
// 2. </head><body> com <div id="root"></div>
// 3. <script type="module"> com todo o bundle React/TypeScript após o elemento #root
// 4. </body></html>
const finalHtml = `${headPart}  <script>window.__IS_STANDALONE__ = true;</script>\n  ${cleanStyleTag}\n${bodyContent}\n  ${scriptContent}\n${htmlEnd}`;

// Destinos onde o standalone deve ser gravado
const destinations = [
  path.resolve('public/standalone-system.html'),
  path.resolve('public/index-standalone.html'),
  path.resolve('dist/standalone-system.html'),
  path.resolve('dist-single/index.html'),
  path.resolve('dist-single/standalone-system.html'),
];

destinations.forEach((dest) => {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dest, finalHtml, 'utf-8');
  console.log('Arquivo standalone gravado em:', dest);
});

console.log('Empacotamento autônomo concluído com sucesso. Tamanho:', finalHtml.length, 'bytes.');

