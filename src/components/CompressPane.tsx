import { useState } from 'react';
import { CheckCircle2, Download, Minimize2 } from 'lucide-react';
import type {
  ActivePdfDocument,
  CompressionPreset,
  CompressionResult,
} from '../types/pdf';
import { compressPdf } from '../engine/pdfOperations';
import { downloadBytes, formatBytes, stripExtension } from '../engine/fileUtils';

interface CompressPaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function CompressPane({
  doc,
  onUpdateDocument,
  onNotify,
}: CompressPaneProps) {
  const [preset, setPreset] = useState<CompressionPreset>('balanced');
  const [dpi, setDpi] = useState(144);
  const [jpegQuality, setJpegQuality] = useState(0.72);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; label: string } | null>(
    null
  );
  const [result, setResult] = useState<CompressionResult | null>(null);

  const handleCompress = async () => {
    setBusy(true);
    setResult(null);
    setProgress({ percent: 5, label: 'Starting optimization…' });
    try {
      const res = await compressPdf(
        doc.bytes,
        { preset, dpi, jpegQuality },
        (percent, label) => setProgress({ percent, label })
      );
      setResult(res);
      onNotify(
        'success',
        `Compression complete: ${formatBytes(res.originalSize)} → ${formatBytes(
          res.compressedSize
        )}`
      );
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Compression failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Compress &amp; Optimize PDF</h1>
            <p>
              Reduce file size for email attachments or archiving — processed locally
              without uploading your document.
            </p>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Choose Compression Level</h2>
          <div className="radio-cards">
            <label className="radio-card">
              <div className="radio-card-head">
                <input
                  type="radio"
                  name="compress-preset"
                  checked={preset === 'lossless'}
                  onChange={() => setPreset('lossless')}
                />
                <span>Lossless Structure</span>
              </div>
              <p>
                Rebuilds PDF object streams. Keeps selectable text &amp; vectors 100%
                intact.
              </p>
            </label>

            <label className="radio-card">
              <div className="radio-card-head">
                <input
                  type="radio"
                  name="compress-preset"
                  checked={preset === 'balanced'}
                  onChange={() => setPreset('balanced')}
                />
                <span>Balanced (Recommended)</span>
              </div>
              <p>
                144 DPI · 72% JPEG quality. Big savings for scans &amp; image-heavy
                reports.
              </p>
            </label>

            <label className="radio-card">
              <div className="radio-card-head">
                <input
                  type="radio"
                  name="compress-preset"
                  checked={preset === 'strong'}
                  onChange={() => setPreset('strong')}
                />
                <span>Maximum Savings</span>
              </div>
              <p>100 DPI · 52% JPEG quality. Best for smallest email-ready file size.</p>
            </label>

            <label className="radio-card">
              <div className="radio-card-head">
                <input
                  type="radio"
                  name="compress-preset"
                  checked={preset === 'custom'}
                  onChange={() => setPreset('custom')}
                />
                <span>Custom</span>
              </div>
              <p>Fine-tune target DPI and image quality sliders directly.</p>
            </label>
          </div>

          {preset === 'custom' && (
            <div className="form-grid" style={{ marginTop: '18px' }}>
              <div className="field">
                <label htmlFor="custom-dpi">Resolution: {dpi} DPI</label>
                <input
                  id="custom-dpi"
                  type="range"
                  min={72}
                  max={240}
                  step={12}
                  value={dpi}
                  onChange={(e) => setDpi(parseInt(e.target.value, 10))}
                />
              </div>
              <div className="field">
                <label htmlFor="custom-quality">
                  JPEG Quality: {Math.round(jpegQuality * 100)}%
                </label>
                <input
                  id="custom-quality"
                  type="range"
                  min={35}
                  max={95}
                  step={5}
                  value={Math.round(jpegQuality * 100)}
                  onChange={(e) => setJpegQuality(parseInt(e.target.value, 10) / 100)}
                />
              </div>
            </div>
          )}

          {preset !== 'lossless' && (
            <p
              style={{
                margin: '14px 0 0',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              Note: Balanced, Maximum, and Custom modes rasterize pages to compressed
              JPEG streams for maximum size reduction on scans and brochures. Use
              Lossless Structure if you must preserve selectable text.
            </p>
          )}

          <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handleCompress}
            >
              <Minimize2 size={15} aria-hidden="true" />
              <span>{busy ? 'Compressing…' : 'Compress PDF'}</span>
            </button>

            {busy && progress && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {progress.label} ({progress.percent}%)
                </span>
                <progress value={progress.percent} max={100} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        </div>

        {result && (
          <div className="card">
            <h2 className="card-title">Compression Summary</h2>
            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-label">Original Size</div>
                <div className="stat-value">{formatBytes(result.originalSize)}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Compressed Size</div>
                <div className="stat-value" style={{ color: 'var(--brand)' }}>
                  {formatBytes(result.compressedSize)}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Size Change</div>
                <div
                  className="stat-value"
                  style={{
                    color: result.savedPercent > 0 ? 'var(--success)' : 'var(--warning)',
                  }}
                >
                  {result.savedPercent > 0
                    ? `-${result.savedPercent}%`
                    : `${Math.abs(result.savedPercent)}% larger`}
                </div>
              </div>
            </div>

            <div className="toolbar-group" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  onUpdateDocument(result.bytes, 'Applied compressed PDF to workspace')
                }
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>Apply to Workspace</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  downloadBytes(
                    result.bytes,
                    `${stripExtension(doc.name)}_compressed.pdf`
                  )
                }
              >
                <Download size={15} aria-hidden="true" />
                <span>Download Compressed PDF</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
