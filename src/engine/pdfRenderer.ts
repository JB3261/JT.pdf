import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type LoadedPdfProxy = pdfjsLib.PDFDocumentProxy;

/**
 * Loads a PDFDocumentProxy from raw bytes.
 * Always passes a cloned buffer because pdf.js transfers the ArrayBuffer to its worker.
 */
export async function loadPdfProxy(bytes: Uint8Array): Promise<LoadedPdfProxy> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const task = pdfjsLib.getDocument({ data: copy });
  return task.promise;
}

export async function renderPageToCanvas(
  pdf: LoadedPdfProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<{ width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
  canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Unable to acquire 2D canvas context');

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;
  ctx.restore();

  return { width: viewport.width, height: viewport.height };
}

export async function renderPageToDataUrl(
  pdf: LoadedPdfProxy,
  pageNumber: number,
  maxWidth = 240
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Unable to acquire 2D canvas context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function renderPageToImageBytes(
  pdf: LoadedPdfProxy,
  pageNumber: number,
  dpi: number,
  format: 'image/jpeg' | 'image/png',
  quality = 0.82
): Promise<{ bytes: Uint8Array; widthPt: number; heightPt: number }> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Unable to acquire 2D canvas context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode canvas image'))),
      format,
      format === 'image/jpeg' ? quality : undefined
    );
  });

  const buffer = await blob.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    widthPt: baseViewport.width,
    heightPt: baseViewport.height,
  };
}
