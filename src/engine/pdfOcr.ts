import { createWorker } from 'tesseract.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { OcrPageResult } from '../types/pdf';
import { loadPdfProxy, renderPageToImageBytes } from './pdfRenderer';

function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ');
}

export async function runLocalOcr(
  bytes: Uint8Array,
  zeroBasedPageIndices: number[],
  lang: string,
  createSearchablePdf: boolean,
  onProgress?: (percent: number, label: string) => void
): Promise<{ results: OcrPageResult[]; searchablePdfBytes?: Uint8Array }> {
  if (zeroBasedPageIndices.length === 0) {
    throw new Error('Select at least one page to run OCR.');
  }

  onProgress?.(4, `Initializing local OCR engine (${lang})…`);
  const worker = await createWorker(lang, 1, {
    logger: (m) => {
      if (m.status === 'loading tesseract core') {
        onProgress?.(8, 'Loading WebAssembly OCR engine…');
      } else if (m.status === 'loading language traineddata') {
        onProgress?.(14, `Loading "${lang}" language data…`);
      }
    },
  });

  const proxy = await loadPdfProxy(bytes);
  const results: OcrPageResult[] = [];
  const renderedMap = new Map<
    number,
    { bytes: Uint8Array; widthPt: number; heightPt: number; text: string }
  >();

  try {
    const total = zeroBasedPageIndices.length;
    for (let idx = 0; idx < total; idx++) {
      const pageIdx = zeroBasedPageIndices[idx];
      const pageNum = pageIdx + 1;
      const basePct = 18 + Math.round((idx / total) * 70);
      onProgress?.(basePct, `OCR scanning page ${pageNum} (${idx + 1}/${total})…`);

      const rendered = await renderPageToImageBytes(
        proxy,
        pageNum,
        180,
        'image/png'
      );
      const blob = new Blob([new Uint8Array(rendered.bytes)], { type: 'image/png' });
      const { data } = await worker.recognize(blob);

      const text = (data.text ?? '').trim();
      results.push({
        pageNumber: pageNum,
        text,
        confidence: Math.round(data.confidence ?? 0),
      });

      if (createSearchablePdf) {
        renderedMap.set(pageIdx, { ...rendered, text });
      }
    }
  } finally {
    await worker.terminate();
    await proxy.destroy();
  }

  let searchablePdfBytes: Uint8Array | undefined;

  if (createSearchablePdf) {
    onProgress?.(92, 'Embedding invisible searchable text layer…');
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const outDoc = await PDFDocument.create();
    outDoc.setCreator('JT.pdf Local OCR');
    const font = await outDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 0; i < srcDoc.getPageCount(); i++) {
      const ocrPage = renderedMap.get(i);
      if (!ocrPage) {
        const [copied] = await outDoc.copyPages(srcDoc, [i]);
        outDoc.addPage(copied);
        continue;
      }

      const page = outDoc.addPage([ocrPage.widthPt, ocrPage.heightPt]);
      const png = await outDoc.embedPng(ocrPage.bytes);
      page.drawImage(png, {
        x: 0,
        y: 0,
        width: ocrPage.widthPt,
        height: ocrPage.heightPt,
      });

      // Overlay invisible searchable text layer (opacity 0) so Ctrl+F and selection work
      const lines = sanitizeWinAnsi(ocrPage.text)
        .split('\n')
        .filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        const stepY = Math.max(10, (ocrPage.heightPt - 40) / lines.length);
        lines.forEach((line, lineIdx) => {
          const y = Math.max(12, ocrPage.heightPt - 24 - lineIdx * stepY);
          page.drawText(line, {
            x: 24,
            y,
            size: 10,
            font,
            color: rgb(0, 0, 0),
            opacity: 0,
          });
        });
      }
    }

    searchablePdfBytes = await outDoc.save({ useObjectStreams: true });
  }

  onProgress?.(100, 'OCR complete');
  return { results, searchablePdfBytes };
}
