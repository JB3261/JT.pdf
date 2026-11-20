import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';
import { PDFDocument } from 'pdf-lib';
import type { PdfProtectOptions, RedactionBox } from '../types/pdf';
import { loadPdfProxy } from './pdfRenderer';

/**
 * True permanent redaction:
 * - Unredacted pages are copied directly as original vectors.
 * - Redacted pages are rendered to high-DPI canvas (200 DPI), painted with solid opaque
 *   black rectangles over every redaction box, and re-embedded as flat images so the
 *   underlying text and vector data in redacted regions are permanently destroyed.
 */
export async function applyTrueRedactions(
  bytes: Uint8Array,
  boxes: RedactionBox[],
  onProgress?: (percent: number, label: string) => void
): Promise<Uint8Array> {
  if (boxes.length === 0) return bytes;

  const boxesByPage = new Map<number, RedactionBox[]>();
  for (const box of boxes) {
    const list = boxesByPage.get(box.pageIndex) ?? [];
    list.push(box);
    boxesByPage.set(box.pageIndex, list);
  }

  onProgress?.(5, 'Loading PDF for permanent redaction…');
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();
  outDoc.setCreator('JT.pdf Redaction Engine');

  const proxy = await loadPdfProxy(bytes);
  const totalPages = srcDoc.getPageCount();
  const dpi = 200;

  try {
    for (let i = 0; i < totalPages; i++) {
      const pageBoxes = boxesByPage.get(i);
      onProgress?.(
        Math.round((i / totalPages) * 90) + 5,
        pageBoxes
          ? `Permanently redacting page ${i + 1} of ${totalPages}…`
          : `Preserving page ${i + 1} of ${totalPages}…`
      );

      if (!pageBoxes || pageBoxes.length === 0) {
        const [copied] = await outDoc.copyPages(srcDoc, [i]);
        outDoc.addPage(copied);
        continue;
      }

      const pdfJsPage = await proxy.getPage(i + 1);
      const baseViewport = pdfJsPage.getViewport({ scale: 1 });
      const scale = dpi / 72;
      const viewport = pdfJsPage.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Unable to acquire 2D canvas context');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await pdfJsPage.render({
        canvasContext: ctx,
        viewport,
      }).promise;

      // Paint solid opaque black bars directly onto pixels
      ctx.fillStyle = '#000000';
      for (const box of pageBoxes) {
        ctx.fillRect(
          Math.floor(box.x * canvas.width),
          Math.floor(box.y * canvas.height),
          Math.ceil(box.width * canvas.width),
          Math.ceil(box.height * canvas.height)
        );
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Redaction encode failed'))),
          'image/jpeg',
          0.92
        );
      });
      const jpgBytes = new Uint8Array(await blob.arrayBuffer());
      const embedded = await outDoc.embedJpg(jpgBytes);
      const newPage = outDoc.addPage([baseViewport.width, baseViewport.height]);
      newPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      });
    }
  } finally {
    await proxy.destroy();
  }

  onProgress?.(98, 'Saving redacted PDF…');
  const result = await outDoc.save({ useObjectStreams: true });
  onProgress?.(100, 'Complete');
  return result;
}

export async function protectPdfWithPassword(
  bytes: Uint8Array,
  options: PdfProtectOptions
): Promise<Uint8Array> {
  if (!options.userPassword && !options.ownerPassword) {
    throw new Error('Enter a document open password or an owner permissions password.');
  }
  return encryptPDF(bytes, options.userPassword, {
    ownerPassword: options.ownerPassword || options.userPassword,
    allowPrinting: options.allowPrinting,
    allowCopying: options.allowCopying,
    allowModifying: options.allowModifying,
    allowAnnotating: options.allowAnnotating,
    allowFillingForms: options.allowAnnotating,
    allowHighQualityPrint: options.allowPrinting,
  });
}

export async function sanitizePdfMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  const epoch = new Date(0);
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);
  return doc.save({ useObjectStreams: true });
}
