import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

interface BoundsPx {
  top: number;
  bottom: number;
  height: number;
  node: HTMLElement;
}

/**
 * Calculates accurate bounds of any element relative to a root container
 * in CSS pixels using getBoundingClientRect(), completely immune to
 * scrolling, transforms, offsetParent quirks, or nesting.
 */
function getElementBounds(node: HTMLElement, root: HTMLElement, vScale: number): BoundsPx {
  const rootRect = root.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const topCss = nodeRect.top - rootRect.top;
  const bottomCss = nodeRect.bottom - rootRect.top;
  const heightCss = nodeRect.height > 0 ? nodeRect.height : bottomCss - topCss;
  return {
    top: topCss * vScale,
    bottom: bottomCss * vScale,
    height: heightCss * vScale,
    node,
  };
}

/**
 * Computes multi-page slices in canvas image pixels, ensuring page cuts only occur
 * cleanly between rows or sections, never slicing a row, card, or text in half.
 */
function computeSmartPageSlices(
  root: HTMLElement,
  totalPixelHeight: number,
  vScale: number,
  maxPxPerPage: number
): { startY: number; height: number }[] {
  // 1. Collect all table rows (atomic units that must NEVER be sliced)
  const rowElements = Array.from(
    root.querySelectorAll<HTMLElement>('tbody tr, thead tr, tfoot tr, [data-pdf-row]')
  );
  const allRows = rowElements
    .map((node) => {
      const bounds = getElementBounds(node, root, vScale);
      const isHeader = Boolean(node.closest('thead'));
      const isFooter = Boolean(node.closest('tfoot'));
      const isBody = !isHeader && !isFooter;
      return { ...bounds, isHeader, isFooter, isBody };
    })
    .filter((r) => r.height > 2)
    .sort((a, b) => a.top - b.top);

  // 2. Collect all structural blocks/cards
  const blockElements = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[data-pdf-block], [data-pdf-avoid-break], section, .page-break-avoid'
    )
  );
  const allBlocks = blockElements
    .map((node) => {
      const bounds = getElementBounds(node, root, vScale);
      const blockType = node.getAttribute('data-pdf-block') || '';
      return { ...bounds, blockType };
    })
    .filter((b) => b.height > 5)
    .sort((a, b) => a.top - b.top);

  const slices: { startY: number; height: number }[] = [];
  let currentTopPx = 0;

  while (currentTopPx < totalPixelHeight - 2) {
    const remainingPx = totalPixelHeight - currentTopPx;
    if (remainingPx <= maxPxPerPage) {
      slices.push({
        startY: currentTopPx,
        height: remainingPx,
      });
      break;
    }

    const theoreticalBottomPx = currentTopPx + maxPxPerPage;
    let chosenBreakPx = theoreticalBottomPx;

    // Strategy 1: Look for cohesive blocks that start on this page but would be cut by theoreticalBottomPx.
    // If the block can fit on a single page (height <= maxPxPerPage) and the current page already has
    // significant content before it (at least 18% of maxPxPerPage), break BEFORE the block so it starts
    // fresh and intact on the next page.
    const overflowingCohesiveBlock = allBlocks.find(
      (b) =>
        b.top > currentTopPx + maxPxPerPage * 0.18 &&
        b.top < theoreticalBottomPx &&
        b.bottom > theoreticalBottomPx &&
        b.height <= maxPxPerPage
    );

    if (overflowingCohesiveBlock) {
      chosenBreakPx = overflowingCohesiveBlock.top;
    } else {
      // Strategy 2: If we are splitting inside a table or section, pick the bottom of the lowest body/footer row
      // that fits completely before theoreticalBottomPx.
      const candidateRows = allRows.filter(
        (r) =>
          (r.isBody || r.isFooter) &&
          r.bottom <= theoreticalBottomPx &&
          r.bottom > currentTopPx + 20
      );

      if (candidateRows.length > 0) {
        const lastRow = candidateRows[candidateRows.length - 1];
        chosenBreakPx = lastRow.bottom;
      } else {
        // Strategy 3: Try block boundaries
        const candidateBlocks = allBlocks.filter(
          (b) => b.bottom <= theoreticalBottomPx && b.bottom > currentTopPx + 20
        );
        if (candidateBlocks.length > 0) {
          chosenBreakPx = candidateBlocks[candidateBlocks.length - 1].bottom;
        } else {
          chosenBreakPx = theoreticalBottomPx;
        }
      }
    }

    // Safety Guard: Check against all table rows to ensure chosenBreakPx NEVER cuts through any row.
    for (const r of allRows) {
      if (chosenBreakPx > r.top + 1 && chosenBreakPx < r.bottom - 1) {
        // Cut is landing inside this row! Pull back to before the row.
        chosenBreakPx = r.top;
      }
    }

    // Safety Guard: Check against atomic blocks like signature, chart, or title banner
    const atomicBlocks = allBlocks.filter(
      (b) => b.blockType === 'signature' || b.blockType === 'chart' || b.blockType === 'title-banner'
    );
    for (const b of atomicBlocks) {
      if (chosenBreakPx > b.top + 1 && chosenBreakPx < b.bottom - 1) {
        chosenBreakPx = b.top;
      }
    }

    // Ensure forward progress
    if (chosenBreakPx <= currentTopPx + 10) {
      chosenBreakPx = theoreticalBottomPx;
    }

    const sliceHeight = chosenBreakPx - currentTopPx;
    slices.push({
      startY: currentTopPx,
      height: sliceHeight,
    });

    currentTopPx = chosenBreakPx;
  }

  return slices;
}

/**
 * Renders multiple canvas slices into a jsPDF document.
 */
async function renderSlicesToPdf(
  img: HTMLImageElement,
  slices: { startY: number; height: number }[],
  totalPixelWidth: number,
  mmPerPx: number,
  marginMm: number,
  printableWidthMm: number,
  pdf: jsPDF
): Promise<void> {
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    if (slice.height <= 0) continue;

    if (i > 0) {
      pdf.addPage();
    }

    const canvas = document.createElement('canvas');
    canvas.width = totalPixelWidth;
    canvas.height = Math.ceil(slice.height);
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        0,
        slice.startY,
        totalPixelWidth,
        slice.height,
        0,
        0,
        totalPixelWidth,
        slice.height
      );

      const sliceDataUrl = canvas.toDataURL('image/jpeg', 0.96);
      const sliceHeightMm = slice.height * mmPerPx;
      pdf.addImage(
        sliceDataUrl,
        'JPEG',
        marginMm,
        marginMm,
        printableWidthMm,
        sliceHeightMm,
        undefined,
        'FAST'
      );
    }
  }
}

/**
 * Multi-page PDF generator for main dashboard panel (table of contracts).
 * Guarantees that every row (including execution column) is rendered completely without cutoffs.
 */
export async function downloadPainelPdf(
  element: HTMLElement,
  filename = 'Painel_Contratos_SEJUS_MT.pdf'
): Promise<void> {
  const pageWidthMm = 297;
  const pageHeightMm = 210;
  const marginMm = 8;
  const printableWidthMm = pageWidthMm - marginMm * 2;
  const printableHeightMm = pageHeightMm - marginMm * 2;

  // Temporarily reset scroll in any scrollable container so toPng captures from top to bottom
  const scrollContainer =
    (element.closest('.overflow-y-auto') as HTMLElement) ||
    element.parentElement;
  const savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }
  const savedElementScrollTop = element.scrollTop;
  element.scrollTop = 0;

  // Measure full natural dimensions
  const fullWidth = Math.ceil(element.scrollWidth || element.offsetWidth || 1140);
  const fullHeight = Math.ceil(element.scrollHeight || element.offsetHeight || 800);

  let dataUrl: string;
  try {
    dataUrl = await toPng(element, {
      quality: 0.98,
      pixelRatio: 2,
      width: fullWidth,
      height: fullHeight,
      backgroundColor: '#ffffff',
      cacheBust: true,
      skipFonts: true,
    });
  } finally {
    if (scrollContainer) {
      scrollContainer.scrollTop = savedScrollTop;
    }
    element.scrollTop = savedElementScrollTop;
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve) => {
    img.onload = resolve;
  });

  const totalPixelWidth = img.naturalWidth || img.width;
  const totalPixelHeight = img.naturalHeight || img.height;

  const rootRect = element.getBoundingClientRect();
  const cssHeight = rootRect.height > 0 ? rootRect.height : fullHeight;
  const vScale = totalPixelHeight / cssHeight;

  const mmPerPx = printableWidthMm / totalPixelWidth;
  const totalHeightMm = totalPixelHeight * mmPerPx;

  if (totalHeightMm <= printableHeightMm) {
    pdf.addImage(dataUrl, 'PNG', marginMm, marginMm, printableWidthMm, totalHeightMm);
    pdf.save(filename);
    return;
  }

  const maxPxPerPage = printableHeightMm / mmPerPx;
  const slices = computeSmartPageSlices(
    element,
    totalPixelHeight,
    vScale,
    maxPxPerPage
  );

  await renderSlicesToPdf(
    img,
    slices,
    totalPixelWidth,
    mmPerPx,
    marginMm,
    printableWidthMm,
    pdf
  );

  pdf.save(filename);
}

/**
 * Multi-page PDF generator for full contract reports (details + empenhos + medições).
 * Ensures the complete document (Sections 1, 2, 3, 4, 5, and Signature) is captured and
 * split cleanly across pages without cutting off any section, general info, or table row.
 */
export async function downloadContratoCompletoPdf(
  element: HTMLElement,
  filename = 'Relatorio_Completo_Contrato.pdf',
  orientation: 'portrait' | 'landscape' = 'landscape'
): Promise<void> {
  const isLandscape = orientation === 'landscape';
  const pageWidthMm = isLandscape ? 297 : 210;
  const pageHeightMm = isLandscape ? 210 : 297;
  const marginMm = 8;
  const printableWidthMm = pageWidthMm - marginMm * 2;
  const printableHeightMm = pageHeightMm - marginMm * 2;

  // Temporarily reset scroll in any scrollable container so toPng captures from top to bottom
  const scrollContainer =
    (element.closest('.overflow-y-auto') as HTMLElement) ||
    element.parentElement;
  const savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }
  const savedElementScrollTop = element.scrollTop;
  element.scrollTop = 0;

  // Measure full height and width
  const fullWidth = Math.ceil(element.scrollWidth || element.offsetWidth || 1180);
  const fullHeight = Math.ceil(element.scrollHeight || element.offsetHeight || 1200);

  let dataUrl: string;
  try {
    dataUrl = await toPng(element, {
      quality: 0.98,
      pixelRatio: 2,
      width: fullWidth,
      height: fullHeight,
      backgroundColor: '#ffffff',
      cacheBust: true,
      skipFonts: true,
    });
  } finally {
    // Restore user's previous scroll position
    if (scrollContainer) {
      scrollContainer.scrollTop = savedScrollTop;
    }
    element.scrollTop = savedElementScrollTop;
  }

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve) => {
    img.onload = resolve;
  });

  const totalPixelWidth = img.naturalWidth || img.width;
  const totalPixelHeight = img.naturalHeight || img.height;

  const rootRect = element.getBoundingClientRect();
  const cssHeight = rootRect.height > 0 ? rootRect.height : fullHeight;
  const vScale = totalPixelHeight / cssHeight;

  const mmPerPx = printableWidthMm / totalPixelWidth;
  const totalHeightMm = totalPixelHeight * mmPerPx;

  if (totalHeightMm <= printableHeightMm) {
    pdf.addImage(dataUrl, 'PNG', marginMm, marginMm, printableWidthMm, totalHeightMm);
    pdf.save(filename);
    return;
  }

  const maxPxPerPage = printableHeightMm / mmPerPx;
  const slices = computeSmartPageSlices(
    element,
    totalPixelHeight,
    vScale,
    maxPxPerPage
  );

  await renderSlicesToPdf(
    img,
    slices,
    totalPixelWidth,
    mmPerPx,
    marginMm,
    printableWidthMm,
    pdf
  );

  pdf.save(filename);
}
