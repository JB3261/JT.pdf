import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';
import type { AcroFormFieldInfo, PageAnnotation } from '../types/pdf';
import { hexToRgbUnit } from './fileUtils';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Maps normalized top-left UI coordinates (0..1) to PDF page coordinates (bottom-left origin).
 */
function toPdfPoint(
  nx: number,
  ny: number,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: nx * width,
    y: height - ny * height,
  };
}

export async function applyAnnotationsToPdf(
  bytes: Uint8Array,
  annotations: PageAnnotation[]
): Promise<Uint8Array> {
  if (annotations.length === 0) return bytes;

  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();

  // Cache embedded PNGs so repeated signatures aren't duplicated in the PDF
  const pngCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();

  for (const ann of annotations) {
    const page = pages[ann.pageIndex];
    if (!page) continue;

    const { width, height } = page.getSize();
    const { r, g, b } = hexToRgbUnit(ann.color);
    const color = rgb(r, g, b);

    switch (ann.type) {
      case 'highlight': {
        const x = ann.x * width;
        const w = ann.width * width;
        const h = ann.height * height;
        const y = height - (ann.y + ann.height) * height;
        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          color,
          opacity: ann.opacity,
        });
        break;
      }

      case 'ink': {
        if (ann.points.length < 2) break;
        for (let i = 1; i < ann.points.length; i++) {
          const p1 = toPdfPoint(ann.points[i - 1].x, ann.points[i - 1].y, width, height);
          const p2 = toPdfPoint(ann.points[i].x, ann.points[i].y, width, height);
          page.drawLine({
            start: p1,
            end: p2,
            thickness: ann.strokeWidth,
            color,
          });
        }
        break;
      }

      case 'text': {
        const lines = ann.text.split('\n');
        const lineHeight = ann.fontSize * 1.25;
        const origin = toPdfPoint(ann.x, ann.y, width, height);
        lines.forEach((line, idx) => {
          page.drawText(line, {
            x: origin.x,
            y: origin.y - ann.fontSize - idx * lineHeight,
            size: ann.fontSize,
            font: helvetica,
            color,
          });
        });
        break;
      }

      case 'note': {
        const origin = toPdfPoint(ann.x, ann.y, width, height);
        const lines = ann.text.trim() ? ann.text.split('\n') : ['Note'];
        const fontSize = 10;
        const pad = 7;
        const lineHeight = 13;
        const maxLineWidth = Math.max(
          90,
          ...lines.map((l) => helvetica.widthOfTextAtSize(l, fontSize))
        );
        const boxW = Math.min(240, maxLineWidth + pad * 2);
        const boxH = lines.length * lineHeight + pad * 2;
        const boxY = Math.max(8, origin.y - boxH);

        page.drawRectangle({
          x: origin.x,
          y: boxY,
          width: boxW,
          height: boxH,
          color: rgb(1, 0.97, 0.76),
          borderColor: rgb(0.85, 0.65, 0.12),
          borderWidth: 1,
        });

        lines.forEach((line, idx) => {
          page.drawText(line, {
            x: origin.x + pad,
            y: boxY + boxH - pad - fontSize - idx * lineHeight,
            size: fontSize,
            font: helvetica,
            color: rgb(0.18, 0.15, 0.05),
          });
        });
        break;
      }

      case 'rect': {
        const x = ann.x * width;
        const w = ann.width * width;
        const h = ann.height * height;
        const y = height - (ann.y + ann.height) * height;
        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          borderColor: color,
          borderWidth: ann.strokeWidth,
        });
        break;
      }

      case 'arrow': {
        const start = toPdfPoint(ann.x1, ann.y1, width, height);
        const end = toPdfPoint(ann.x2, ann.y2, width, height);
        page.drawLine({
          start,
          end,
          thickness: ann.strokeWidth,
          color,
        });
        // Arrowhead wings
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = Math.max(9, ann.strokeWidth * 4);
        const wing1 = {
          x: end.x - headLen * Math.cos(angle - Math.PI / 6),
          y: end.y - headLen * Math.sin(angle - Math.PI / 6),
        };
        const wing2 = {
          x: end.x - headLen * Math.cos(angle + Math.PI / 6),
          y: end.y - headLen * Math.sin(angle + Math.PI / 6),
        };
        page.drawLine({ start: end, end: wing1, thickness: ann.strokeWidth, color });
        page.drawLine({ start: end, end: wing2, thickness: ann.strokeWidth, color });
        break;
      }

      case 'stamp': {
        const origin = toPdfPoint(ann.x, ann.y, width, height);
        const fontSize = 15;
        const label = ann.label.toUpperCase();
        const textW = helveticaBold.widthOfTextAtSize(label, fontSize);
        const padX = 12;
        const padY = 7;
        const boxW = textW + padX * 2;
        const boxH = fontSize + padY * 2;

        page.drawRectangle({
          x: origin.x,
          y: origin.y - boxH,
          width: boxW,
          height: boxH,
          borderColor: color,
          borderWidth: 2,
          color,
          opacity: 0.1,
          rotate: degrees(-6),
        });
        page.drawText(label, {
          x: origin.x + padX,
          y: origin.y - boxH + padY + 2,
          size: fontSize,
          font: helveticaBold,
          color,
          rotate: degrees(-6),
        });
        break;
      }

      case 'signature': {
        let embedded = pngCache.get(ann.dataUrl);
        if (!embedded) {
          embedded = await doc.embedPng(dataUrlToUint8Array(ann.dataUrl));
          pngCache.set(ann.dataUrl, embedded);
        }
        const x = ann.x * width;
        const w = ann.width * width;
        const h = ann.height * height;
        const y = height - (ann.y + ann.height) * height;
        page.drawImage(embedded, { x, y, width: w, height: h });
        break;
      }
    }
  }

  return doc.save({ useObjectStreams: true });
}

export async function readAcroFormFields(
  bytes: Uint8Array
): Promise<AcroFormFieldInfo[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const fields = form.getFields();

  return fields.map((field) => {
    const name = field.getName();
    const readOnly = field.isReadOnly();

    if (field instanceof PDFTextField) {
      return {
        name,
        kind: 'text',
        value: field.getText() ?? '',
        readOnly,
      };
    }
    if (field instanceof PDFCheckBox) {
      return {
        name,
        kind: 'checkbox',
        value: field.isChecked(),
        readOnly,
      };
    }
    if (field instanceof PDFDropdown) {
      const selected = field.getSelected();
      return {
        name,
        kind: 'dropdown',
        value: selected[0] ?? '',
        options: field.getOptions(),
        readOnly,
      };
    }
    if (field instanceof PDFRadioGroup) {
      return {
        name,
        kind: 'radio',
        value: field.getSelected() ?? '',
        options: field.getOptions(),
        readOnly,
      };
    }
    return {
      name,
      kind: 'unknown',
      value: '',
      readOnly,
    };
  });
}

export async function applyAcroFormValues(
  bytes: Uint8Array,
  values: Record<string, string | boolean>,
  flatten: boolean
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();

  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values) || field.isReadOnly()) continue;
    const val = values[name];

    if (field instanceof PDFTextField) {
      field.setText(String(val ?? ''));
    } else if (field instanceof PDFCheckBox) {
      if (val) field.check();
      else field.uncheck();
    } else if (field instanceof PDFDropdown) {
      const str = String(val ?? '');
      if (str) field.select(str);
    } else if (field instanceof PDFRadioGroup) {
      const str = String(val ?? '');
      if (str) field.select(str);
    }
  }

  if (flatten) {
    form.flatten();
  }

  return doc.save({ useObjectStreams: true });
}
