export type ToolId =
  | 'view'
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
