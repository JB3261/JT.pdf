import JSZip from 'jszip';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type {
  CompressionOptions,
  CompressionResult,
  MergeItem,
  PageNumberOptions,
  PdfMetadataInfo,
  WatermarkOptions,
} from '../types/pdf';
import { hexToRgbUnit, stripExtension } from './fileUtils';
import { loadPdfProxy, renderPageToImageBytes } from './pdfRenderer';

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function createBlankPdf(
  size: 'a4' | 'letter' = 'a4'
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const dims: [number, number] = size === 'letter' ? [612, 792] : [595.28, 841.89];
  doc.addPage(dims);
  doc.setCreator('JT.pdf');
  return doc.save({ useObjectStreams: true });
}

export async function reorderPages(
  bytes: Uint8Array,
  newOrderZeroBased: number[]
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, newOrderZeroBased);
  copied.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
}

export async function rotatePages(
  bytes: Uint8Array,
  zeroBasedIndices: number[],
  deltaDegrees: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const idx of zeroBasedIndices) {
    const page = pages[idx];
    if (!page) continue;
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + deltaDegrees + 360) % 360));
  }
  return doc.save({ useObjectStreams: true });
}

export async function deletePages(
  bytes: Uint8Array,
  zeroBasedIndices: number[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = doc.getPageCount();
  const toDelete = new Set(zeroBasedIndices);
  if (toDelete.size >= total) {
    throw new Error('Cannot delete every page in the document.');
  }
  const sortedDesc = Array.from(toDelete).sort((a, b) => b - a);
  for (const idx of sortedDesc) {
    if (idx >= 0 && idx < doc.getPageCount()) {
      doc.removePage(idx);
    }
  }
  return doc.save({ useObjectStreams: true });
}

export async function duplicatePages(
  bytes: Uint8Array,
  zeroBasedIndices: number[]
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const toDup = new Set(zeroBasedIndices);
  const total = src.getPageCount();

  for (let i = 0; i < total; i++) {
    const [p] = await out.copyPages(src, [i]);
    out.addPage(p);
    if (toDup.has(i)) {
      const [copy] = await out.copyPages(src, [i]);
      out.addPage(copy);
    }
  }
  return out.save({ useObjectStreams: true });
}

export async function insertBlankPage(
  bytes: Uint8Array,
  insertAtZeroBased: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const refPage = doc.getPage(Math.min(insertAtZeroBased, doc.getPageCount() - 1));
  const { width, height } = refPage ? refPage.getSize() : { width: 595.28, height: 841.89 };
  doc.insertPage(insertAtZeroBased, [width, height]);
  return doc.save({ useObjectStreams: true });
}

async function normalizeImageToPngOrJpg(
  bytes: Uint8Array,
  mimeType: string
): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' }> {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return { bytes, kind: 'jpg' };
  }
  if (mimeType === 'image/png') {
    return { bytes, kind: 'png' };
  }

  // Convert WebP / BMP / GIF etc. via browser canvas to PNG
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to convert image');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image conversion failed'))), 'image/png');
  });
  return { bytes: new Uint8Array(await pngBlob.arrayBuffer()), kind: 'png' };
}

export async function mergeItemsToPdf(items: MergeItem[]): Promise<Uint8Array> {
  if (items.length === 0) {
    throw new Error('Add at least one PDF or image to merge.');
  }
  const out = await PDFDocument.create();
  out.setCreator('JT.pdf');

  for (const item of items) {
    if (item.kind === 'pdf') {
      const src = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
      const indices = src.getPageIndices();
      const copied = await out.copyPages(src, indices);
      copied.forEach((p) => out.addPage(p));
    } else {
      const normalized = await normalizeImageToPngOrJpg(item.bytes, item.mimeType);
      const embedded =
        normalized.kind === 'jpg'
          ? await out.embedJpg(normalized.bytes)
          : await out.embedPng(normalized.bytes);
      const page = out.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: embedded.width,
        height: embedded.height,
      });
    }
  }

  return out.save({ useObjectStreams: true });
}

export async function extractPages(
  bytes: Uint8Array,
  zeroBasedIndices: number[]
): Promise<Uint8Array> {
  if (zeroBasedIndices.length === 0) {
    throw new Error('Select at least one valid page to extract.');
  }
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, zeroBasedIndices);
  copied.forEach((p) => out.addPage(p));
  return out.save({ useObjectStreams: true });
}

export async function splitPdfToZip(
  bytes: Uint8Array,
  baseFilename: string,
  mode: 'every-page' | 'chunk',
  chunkSize = 1
): Promise<Blob> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const step = mode === 'every-page' ? 1 : Math.max(1, Math.floor(chunkSize));
  const zip = new JSZip();
  const stem = stripExtension(baseFilename);

  for (let start = 0; start < total; start += step) {
    const end = Math.min(total, start + step);
    const indices: number[] = [];
    for (let i = start; i < end; i++) indices.push(i);

    const part = await PDFDocument.create();
    const copied = await part.copyPages(src, indices);
    copied.forEach((p) => part.addPage(p));
    const partBytes = await part.save({ useObjectStreams: true });

    const label =
      step === 1
        ? `${stem}_page-${String(start + 1).padStart(3, '0')}.pdf`
        : `${stem}_pages-${start + 1}-${end}.pdf`;
    zip.file(label, partBytes);
  }

  return zip.generateAsync({ type: 'blob' });
}

export async function compressPdf(
  bytes: Uint8Array,
  options: CompressionOptions,
  onProgress?: (percent: number, label: string) => void
): Promise<CompressionResult> {
  const originalSize = bytes.byteLength;

  if (options.preset === 'lossless') {
    onProgress?.(40, 'Rebuilding object streams...');
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
    const optimized = await out.save({ useObjectStreams: true });
    onProgress?.(100, 'Complete');

    const finalBytes = optimized.byteLength < originalSize ? optimized : bytes;
    const savedPercent = Math.max(
      0,
      Math.round(((originalSize - finalBytes.byteLength) / originalSize) * 100)
    );
    return {
      bytes: finalBytes,
      originalSize,
      compressedSize: finalBytes.byteLength,
      savedPercent,
    };
  }

  const dpi =
    options.preset === 'balanced'
      ? 144
      : options.preset === 'strong'
        ? 100
        : options.dpi;
  const quality =
    options.preset === 'balanced'
      ? 0.72
      : options.preset === 'strong'
        ? 0.52
        : options.jpegQuality;

  onProgress?.(5, 'Loading document...');
  const proxy = await loadPdfProxy(bytes);
  const out = await PDFDocument.create();
  out.setCreator('JT.pdf Compressor');

  try {
    for (let p = 1; p <= proxy.numPages; p++) {
      onProgress?.(
        Math.round(((p - 1) / proxy.numPages) * 90) + 5,
        `Optimizing page ${p} of ${proxy.numPages}...`
      );
      const rendered = await renderPageToImageBytes(proxy, p, dpi, 'image/jpeg', quality);
      const jpg = await out.embedJpg(rendered.bytes);
      const page = out.addPage([rendered.widthPt, rendered.heightPt]);
      page.drawImage(jpg, {
        x: 0,
        y: 0,
        width: rendered.widthPt,
        height: rendered.heightPt,
      });
    }
  } finally {
    await proxy.destroy();
  }

  onProgress?.(96, 'Finalizing PDF...');
  const compressed = await out.save({ useObjectStreams: true });
  onProgress?.(100, 'Complete');

  const savedPercent = Math.round(
    ((originalSize - compressed.byteLength) / originalSize) * 100
  );
  return {
    bytes: compressed,
    originalSize,
    compressedSize: compressed.byteLength,
    savedPercent,
  };
}

export async function imagesToPdf(
  files: { name: string; mimeType: string; bytes: Uint8Array }[],
  pageMode: 'fit' | 'a4' | 'letter'
): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('Select at least one image.');
  const out = await PDFDocument.create();
  out.setCreator('JT.pdf');

  for (const file of files) {
    const normalized = await normalizeImageToPngOrJpg(file.bytes, file.mimeType);
    const img =
      normalized.kind === 'jpg'
        ? await out.embedJpg(normalized.bytes)
        : await out.embedPng(normalized.bytes);

    if (pageMode === 'fit') {
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    } else {
      const [pw, ph] = pageMode === 'letter' ? [612, 792] : [595.28, 841.89];
      const margin = 36;
      const maxW = pw - margin * 2;
      const maxH = ph - margin * 2;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const page = out.addPage([pw, ph]);
      page.drawImage(img, {
        x: (pw - drawW) / 2,
        y: (ph - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  }

  return out.save({ useObjectStreams: true });
}

export async function pdfToImagesZip(
  bytes: Uint8Array,
  baseFilename: string,
  format: 'image/png' | 'image/jpeg',
  dpi: number,
  onProgress?: (percent: number, label: string) => void
): Promise<Blob> {
  const proxy = await loadPdfProxy(bytes);
  const zip = new JSZip();
  const stem = stripExtension(baseFilename);
  const ext = format === 'image/png' ? 'png' : 'jpg';

  try {
    for (let p = 1; p <= proxy.numPages; p++) {
      onProgress?.(
        Math.round(((p - 1) / proxy.numPages) * 90) + 5,
        `Rendering page ${p} of ${proxy.numPages}...`
      );
      const rendered = await renderPageToImageBytes(proxy, p, dpi, format, 0.9);
      zip.file(`${stem}_page-${String(p).padStart(3, '0')}.${ext}`, rendered.bytes);
    }
  } finally {
    await proxy.destroy();
  }

  onProgress?.(98, 'Packaging ZIP...');
  const blob = await zip.generateAsync({ type: 'blob' });
  onProgress?.(100, 'Complete');
  return blob;
}

export async function applyWatermark(
  bytes: Uint8Array,
  options: WatermarkOptions
): Promise<Uint8Array> {
  if (!options.text.trim()) throw new Error('Enter watermark text.');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const { r, g, b } = hexToRgbUnit(options.colorHex);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
    const rad = (options.rotation * Math.PI) / 180;
    const x = width / 2 - (textWidth / 2) * Math.cos(rad);
    const y = height / 2 - (textWidth / 2) * Math.sin(rad);

    page.drawText(options.text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(r, g, b),
      opacity: options.opacity,
      rotate: degrees(options.rotation),
    });
  }

  return doc.save({ useObjectStreams: true });
}

export async function applyPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;

  pages.forEach((page, index) => {
    const num = options.startNumber + index;
    const label =
      options.format === 'page-of-total'
        ? `Page ${num} of ${options.startNumber + total - 1}`
        : `${num}`;
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(label, options.fontSize);
    const margin = 28;

    let x = (width - textWidth) / 2;
    let y = margin;

    if (options.position === 'bottom-right') {
      x = width - textWidth - margin;
      y = margin;
    } else if (options.position === 'bottom-left') {
      x = margin;
      y = margin;
    } else if (options.position === 'top-right') {
      x = width - textWidth - margin;
      y = height - margin - options.fontSize;
    }

    page.drawText(label, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(0.25, 0.25, 0.28),
    });
  });

  return doc.save({ useObjectStreams: true });
}

export async function readMetadata(bytes: Uint8Array): Promise<PdfMetadataInfo> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
  };
}

export async function writeMetadata(
  bytes: Uint8Array,
  metadata: PdfMetadataInfo
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.setTitle(metadata.title);
  doc.setAuthor(metadata.author);
  doc.setSubject(metadata.subject);
  doc.setKeywords(
    metadata.keywords
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  doc.setCreator(metadata.creator || 'JT.pdf');
  return doc.save({ useObjectStreams: true });
}
