export type ToolId =
  | 'view'
  | 'annotate'
  | 'forms'
  | 'organize'
  | 'merge'
  | 'split'
  | 'compress'
  | 'convert'
  | 'enhance'
  | 'metadata';

export interface ActivePdfDocument {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  sizeBytes: number;
}

export interface PdfMetadataInfo {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

export interface MergeItem {
  id: string;
  name: string;
  kind: 'pdf' | 'image';
  mimeType: string;
  bytes: Uint8Array;
  pageCount: number;
  sizeBytes: number;
}

export type CompressionPreset = 'lossless' | 'balanced' | 'strong' | 'custom';

export interface CompressionOptions {
  preset: CompressionPreset;
  dpi: number;
  jpegQuality: number;
}

export interface CompressionResult {
  bytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
  savedPercent: number;
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  colorHex: string;
}

export interface PageNumberOptions {
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right';
  format: 'number' | 'page-of-total';
  startNumber: number;
  fontSize: number;
}

export interface ToastMessage {
  id: string;
  tone: 'info' | 'success' | 'error';
  text: string;
}

/* Phase 2: Annotate, Sign & Forms */

export type AnnotationTool =
  | 'select'
  | 'highlight'
  | 'ink'
  | 'text'
  | 'note'
  | 'rect'
  | 'arrow'
  | 'stamp'
  | 'signature';

export interface NormalizedPoint {
  x: number; // 0..1 relative to page width (left -> right)
  y: number; // 0..1 relative to page height (top -> bottom)
}

export interface BaseAnnotation {
  id: string;
  pageIndex: number; // 0-based
  color: string;
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface InkAnnotation extends BaseAnnotation {
  type: 'ink';
  points: NormalizedPoint[];
  strokeWidth: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface NoteAnnotation extends BaseAnnotation {
  type: 'note';
  x: number;
  y: number;
  text: string;
}

export interface RectAnnotation extends BaseAnnotation {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
}

export interface StampAnnotation extends BaseAnnotation {
  type: 'stamp';
  x: number;
  y: number;
  label: string;
}

export interface SignatureAnnotation extends BaseAnnotation {
  type: 'signature';
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
}

export type PageAnnotation =
  | HighlightAnnotation
  | InkAnnotation
  | TextAnnotation
  | NoteAnnotation
  | RectAnnotation
  | ArrowAnnotation
  | StampAnnotation
  | SignatureAnnotation;

export interface SavedSignature {
  id: string;
  label: string;
  dataUrl: string;
  aspectRatio: number;
}

export type AcroFieldKind = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'unknown';

export interface AcroFormFieldInfo {
  name: string;
  kind: AcroFieldKind;
  value: string | boolean;
  options?: string[];
  readOnly: boolean;
}
