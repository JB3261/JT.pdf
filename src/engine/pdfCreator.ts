import JSZip from 'jszip';
import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { loadPdfProxy } from './pdfRenderer';

export interface CreatePdfOptions {
  title?: string;
  pageSize: 'a4' | 'letter';
  fontSize: number;
  includePageNumbers: boolean;
}

/**
 * Strips characters outside WinAnsi so pdf-lib standard fonts never throw.
 */
function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u2026/g, '...')
    .replace(/\t/g, '    ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const clean = sanitizeWinAnsi(text);
  if (!clean.trim()) return [''];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // If a single word is wider than maxWidth, break it safely
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let slice = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(slice + ch, fontSize) > maxWidth && slice) {
            lines.push(slice);
            slice = ch;
          } else {
            slice += ch;
          }
        }
        current = slice;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function markdownToPdf(
  markdown: string,
  options: CreatePdfOptions
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (options.title?.trim()) doc.setTitle(options.title.trim());
  doc.setCreator('JT.pdf');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const dims: [number, number] =
    options.pageSize === 'letter' ? [612, 792] : [595.28, 841.89];
  const marginX = 56;
  const marginTop = 60;
  const marginBottom = 56;
  const maxWidth = dims[0] - marginX * 2;

  let page = doc.addPage(dims);
  let cursorY = dims[1] - marginTop;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < marginBottom) {
      page = doc.addPage(dims);
      cursorY = dims[1] - marginTop;
    }
  };

  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n');
  let inCodeBlock = false;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      cursorY -= 6;
      continue;
    }

    if (inCodeBlock) {
      const codeSize = Math.max(8.5, options.fontSize - 1.5);
      const lineH = codeSize * 1.45;
      const wrapped = wrapText(rawLine, mono, codeSize, maxWidth - 20);
      for (const l of wrapped) {
        ensureSpace(lineH);
        page.drawRectangle({
          x: marginX,
          y: cursorY - lineH + 3,
          width: maxWidth,
          height: lineH,
          color: rgb(0.95, 0.96, 0.98),
        });
        page.drawText(l, {
          x: marginX + 10,
          y: cursorY - codeSize,
          size: codeSize,
          font: mono,
          color: rgb(0.12, 0.16, 0.24),
        });
        cursorY -= lineH;
      }
      continue;
    }

    if (!trimmed) {
      cursorY -= options.fontSize * 0.7;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      ensureSpace(16);
      cursorY -= 6;
      page.drawLine({
        start: { x: marginX, y: cursorY },
        end: { x: dims[0] - marginX, y: cursorY },
        thickness: 0.8,
        color: rgb(0.78, 0.82, 0.88),
      });
      cursorY -= 12;
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].replace(/\*\*|__/g, '');
      const hSize =
        level === 1
          ? options.fontSize + 9
          : level === 2
            ? options.fontSize + 5
            : options.fontSize + 2;
      const lineH = hSize * 1.35;
      cursorY -= level === 1 ? 8 : 5;
      const wrapped = wrapText(text, bold, hSize, maxWidth);
      for (const l of wrapped) {
        ensureSpace(lineH);
        page.drawText(l, {
          x: marginX,
          y: cursorY - hSize,
          size: hSize,
          font: bold,
          color: rgb(0.06, 0.09, 0.16),
        });
        cursorY -= lineH;
      }
      if (level === 1) {
        page.drawLine({
          start: { x: marginX, y: cursorY + 2 },
          end: { x: dims[0] - marginX, y: cursorY + 2 },
          thickness: 0.7,
          color: rgb(0.85, 0.88, 0.92),
        });
        cursorY -= 6;
      }
      cursorY -= 4;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s?/, '').replace(/\*\*|__/g, '');
      const lineH = options.fontSize * 1.45;
      const wrapped = wrapText(quoteText, italic, options.fontSize, maxWidth - 18);
      for (const l of wrapped) {
        ensureSpace(lineH);
        page.drawLine({
          start: { x: marginX + 4, y: cursorY },
          end: { x: marginX + 4, y: cursorY - lineH + 2 },
          thickness: 2.5,
          color: rgb(0.15, 0.39, 0.92),
        });
        page.drawText(l, {
          x: marginX + 16,
          y: cursorY - options.fontSize,
          size: options.fontSize,
          font: italic,
          color: rgb(0.28, 0.33, 0.42),
        });
        cursorY -= lineH;
      }
      cursorY -= 3;
      continue;
    }

    // Bullet / numbered list
    const listMatch = /^([-*]|\d+\.)\s+(.*)$/.exec(trimmed);
    if (listMatch) {
      const marker = listMatch[1] === '-' || listMatch[1] === '*' ? '*' : listMatch[1];
      const itemText = listMatch[2].replace(/\*\*|__/g, '').replace(/`/g, '');
      const lineH = options.fontSize * 1.45;
      const wrapped = wrapText(itemText, regular, options.fontSize, maxWidth - 20);
      wrapped.forEach((l, idx) => {
        ensureSpace(lineH);
        if (idx === 0) {
          page.drawText(marker, {
            x: marginX + 4,
            y: cursorY - options.fontSize,
            size: options.fontSize,
            font: bold,
            color: rgb(0.15, 0.39, 0.92),
          });
        }
        page.drawText(l, {
          x: marginX + 20,
          y: cursorY - options.fontSize,
          size: options.fontSize,
          font: regular,
          color: rgb(0.12, 0.16, 0.23),
        });
        cursorY -= lineH;
      });
      continue;
    }

    // Standard paragraph
    const cleanPara = trimmed.replace(/\*\*|__/g, '').replace(/`/g, '');
    const lineH = options.fontSize * 1.48;
    const wrapped = wrapText(cleanPara, regular, options.fontSize, maxWidth);
    for (const l of wrapped) {
      ensureSpace(lineH);
      page.drawText(l, {
        x: marginX,
        y: cursorY - options.fontSize,
        size: options.fontSize,
        font: regular,
        color: rgb(0.12, 0.16, 0.23),
      });
      cursorY -= lineH;
    }
    cursorY -= 3;
  }

  if (options.includePageNumbers) {
    const pages = doc.getPages();
    pages.forEach((p, idx) => {
      const label = `Page ${idx + 1} of ${pages.length}`;
      const w = regular.widthOfTextAtSize(label, 9);
      p.drawText(label, {
        x: (dims[0] - w) / 2,
        y: 26,
        size: 9,
        font: regular,
        color: rgb(0.45, 0.5, 0.58),
      });
    });
  }

  return doc.save({ useObjectStreams: true });
}

export async function docxBytesToText(bytes: Uint8Array): Promise<string> {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

export async function extractPdfTextByPage(bytes: Uint8Array): Promise<string[]> {
  const proxy = await loadPdfProxy(bytes);
  const pagesText: string[] = [];

  try {
    for (let p = 1; p <= proxy.numPages; p++) {
      const page = await proxy.getPage(p);
      const content = await page.getTextContent();

      const lines: string[] = [];
      let currentLine = '';
      let lastY: number | null = null;

      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = Math.round(item.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 4) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          currentLine += (currentLine && item.str && !currentLine.endsWith(' ') ? ' ' : '') + item.str;
        }
        lastY = y;
      }
      if (currentLine.trim()) lines.push(currentLine.trim());
      pagesText.push(lines.join('\n'));
    }
  } finally {
    await proxy.destroy();
  }

  return pagesText;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a valid OOXML .docx Blob completely client-side using JSZip.
 */
export async function buildDocxFromPages(
  pages: string[],
  title: string
): Promise<Blob> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  );

  const paragraphsXml: string[] = [];
  if (title.trim()) {
    paragraphsXml.push(
      `<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escapeXml(
        title.trim()
      )}</w:t></w:r></w:p>`
    );
  }

  pages.forEach((pageText, pageIdx) => {
    if (pageIdx > 0) {
      paragraphsXml.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    }
    const lines = pageText.split('\n');
    for (const line of lines) {
      paragraphsXml.push(
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
      );
    }
  });

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml.join('\n    ')}
    <w:sectPr/>
  </w:body>
</w:document>`
  );

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
