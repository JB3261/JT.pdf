import { useState } from 'react';
import { Archive, Download, FileImage, FileUp, Trash2 } from 'lucide-react';
import type { ActivePdfDocument } from '../types/pdf';
import { imagesToPdf, pdfToImagesZip } from '../engine/pdfOperations';
import {
  downloadBytes,
  formatBytes,
  readFileAsUint8Array,
  stripExtension,
} from '../engine/fileUtils';

interface ConvertPaneProps {
  doc: ActivePdfDocument | null;
  onOpenConvertedPdf: (bytes: Uint8Array, name: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

interface QueuedImage {
  id: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export function ConvertPane({
  doc,
  onOpenConvertedPdf,
  onNotify,
}: ConvertPaneProps) {
  const [images, setImages] = useState<QueuedImage[]>([]);
  const [pageMode, setPageMode] = useState<'a4' | 'letter' | 'fit'>('a4');
  const [exportFormat, setExportFormat] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [exportDpi, setExportDpi] = useState(150);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);

  const handleAddImages = async (fileList: FileList | null) => {
    if (!fileList) return;
    const added: QueuedImage[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      const bytes = await readFileAsUint8Array(file);
      added.push({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type,
        bytes,
      });
    }
    setImages((prev) => [...prev, ...added]);
  };

  const handleCreatePdfFromImages = async (openInStudio: boolean) => {
    if (images.length === 0) return;
    setBusy(true);
    try {
      const pdfBytes = await imagesToPdf(images, pageMode);
      const name = 'images-converted.pdf';
      if (openInStudio) {
        onOpenConvertedPdf(pdfBytes, name);
        onNotify('success', `Created ${images.length}-page PDF and opened in Studio.`);
      } else {
        downloadBytes(pdfBytes, name);
        onNotify('success', `Downloaded "${name}".`);
      }
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExportPdfToImages = async () => {
    if (!doc) return;
    setBusy(true);
    setProgress({ percent: 5, label: 'Preparing pages…' });
    try {
      const zip = await pdfToImagesZip(
        doc.bytes,
        doc.name,
        exportFormat,
        exportDpi,
        (percent, label) => setProgress({ percent, label })
      );
      const outName = `${stripExtension(doc.name)}_images.zip`;
      downloadBytes(zip, outName, 'application/zip');
      onNotify('success', `Exported ${doc.pageCount} pages to "${outName}".`);
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Image export failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Convert Images &amp; PDF</h1>
            <p>
              Create a PDF from PNG/JPG/WebP images, or export every page of your active
              PDF as crisp high-DPI images.
            </p>
          </div>
        </div>

        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <h2 className="card-title" style={{ margin: 0 }}>
              Images → PDF
            </h2>
            <label className="btn btn-sm btn-primary">
              <FileUp size={14} aria-hidden="true" />
              <span>Select Images</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="visually-hidden"
                onChange={(e) => {
                  handleAddImages(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {images.length > 0 && (
            <div className="file-list" style={{ marginBottom: '14px' }}>
              {images.map((img) => (
                <div key={img.id} className="file-row">
                  <FileImage size={16} color="var(--success)" aria-hidden="true" />
                  <div className="file-row-info">
                    <div className="file-row-name">{img.name}</div>
                    <div className="file-row-meta">{formatBytes(img.bytes.byteLength)}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                    aria-label={`Remove ${img.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="form-grid" style={{ alignItems: 'end' }}>
            <div className="field">
              <label htmlFor="img-page-mode">Page sizing</label>
              <select
                id="img-page-mode"
                className="select"
                value={pageMode}
                onChange={(e) => setPageMode(e.target.value as 'a4' | 'letter' | 'fit')}
              >
                <option value="a4">A4 (fit with margins)</option>
                <option value="letter">US Letter (fit with margins)</option>
                <option value="fit">Match each image size exactly</option>
              </select>
            </div>

            <div className="toolbar-group" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                disabled={busy || images.length === 0}
                onClick={() => handleCreatePdfFromImages(true)}
              >
                <span>Create &amp; Open in Studio</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || images.length === 0}
                onClick={() => handleCreatePdfFromImages(false)}
              >
                <Download size={15} aria-hidden="true" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Active PDF → Images (ZIP)</h2>
          {!doc ? (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Open a PDF first to export its pages as PNG or JPEG images.
            </p>
          ) : (
            <>
              <div className="form-grid" style={{ alignItems: 'end' }}>
                <div className="field">
                  <label htmlFor="export-img-format">Image format</label>
                  <select
                    id="export-img-format"
                    className="select"
                    value={exportFormat}
                    onChange={(e) =>
                      setExportFormat(e.target.value as 'image/png' | 'image/jpeg')
                    }
                  >
                    <option value="image/png">PNG (Lossless, sharpest text)</option>
                    <option value="image/jpeg">JPEG (Smaller file size)</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="export-img-dpi">Resolution: {exportDpi} DPI</label>
                  <input
                    id="export-img-dpi"
                    type="range"
                    min={72}
                    max={300}
                    step={24}
                    value={exportDpi}
                    onChange={(e) => setExportDpi(parseInt(e.target.value, 10))}
                  />
                </div>

                <div className="toolbar-group" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={handleExportPdfToImages}
                  >
                    <Archive size={15} aria-hidden="true" />
                    <span>Export {doc.pageCount} Pages as ZIP</span>
                  </button>
                </div>
              </div>

              {busy && progress && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {progress.label} ({progress.percent}%)
                  </div>
                  <progress value={progress.percent} max={100} style={{ width: '100%' }} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
