import { useState } from 'react';
import { Hash, Stamp } from 'lucide-react';
import type { ActivePdfDocument, PageNumberOptions } from '../types/pdf';
import { applyPageNumbers, applyWatermark } from '../engine/pdfOperations';

interface EnhancePaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function EnhancePane({
  doc,
  onUpdateDocument,
  onNotify,
}: EnhancePaneProps) {
  const [wmText, setWmText] = useState('CONFIDENTIAL');
  const [wmSize, setWmSize] = useState(52);
  const [wmOpacity, setWmOpacity] = useState(0.22);
  const [wmRotation, setWmRotation] = useState(40);
  const [wmColor, setWmColor] = useState('#dc2626');

  const [numPosition, setNumPosition] =
    useState<PageNumberOptions['position']>('bottom-center');
  const [numFormat, setNumFormat] =
    useState<PageNumberOptions['format']>('page-of-total');
  const [numStart, setNumStart] = useState(1);
  const [numSize, setNumSize] = useState(10);

  const [busy, setBusy] = useState(false);

  const handleWatermark = async () => {
    setBusy(true);
    try {
      const updated = await applyWatermark(doc.bytes, {
        text: wmText,
        fontSize: wmSize,
        opacity: wmOpacity,
        rotation: wmRotation,
        colorHex: wmColor,
      });
      onUpdateDocument(updated, `Applied watermark "${wmText}"`);
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Watermark failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePageNumbers = async () => {
    setBusy(true);
    try {
      const updated = await applyPageNumbers(doc.bytes, {
        position: numPosition,
        format: numFormat,
        startNumber: numStart,
        fontSize: numSize,
      });
      onUpdateDocument(updated, 'Added page numbers to all pages');
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Page numbering failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Watermark &amp; Page Numbers</h1>
            <p>
              Stamp diagonal text watermarks or clean header/footer page numbering across
              every page. You can always Undo with Ctrl+Z.
            </p>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Add Text Watermark</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="wm-text">Watermark text</label>
              <input
                id="wm-text"
                type="text"
                className="input"
                value={wmText}
                onChange={(e) => setWmText(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="wm-color">Color</label>
              <input
                id="wm-color"
                type="color"
                className="input"
                style={{ height: '38px', padding: '4px' }}
                value={wmColor}
                onChange={(e) => setWmColor(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="wm-size">Font size: {wmSize} pt</label>
              <input
                id="wm-size"
                type="range"
                min={18}
                max={96}
                value={wmSize}
                onChange={(e) => setWmSize(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="field">
              <label htmlFor="wm-opacity">
                Opacity: {Math.round(wmOpacity * 100)}%
              </label>
              <input
                id="wm-opacity"
                type="range"
                min={5}
                max={80}
                value={Math.round(wmOpacity * 100)}
                onChange={(e) => setWmOpacity(parseInt(e.target.value, 10) / 100)}
              />
            </div>

            <div className="field">
              <label htmlFor="wm-angle">Rotation: {wmRotation}°</label>
              <input
                id="wm-angle"
                type="range"
                min={-60}
                max={60}
                value={wmRotation}
                onChange={(e) => setWmRotation(parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !wmText.trim()}
              onClick={handleWatermark}
            >
              <Stamp size={15} aria-hidden="true" />
              <span>Apply Watermark to All Pages</span>
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Add Page Numbers</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="num-position">Position</label>
              <select
                id="num-position"
                className="select"
                value={numPosition}
                onChange={(e) =>
                  setNumPosition(e.target.value as PageNumberOptions['position'])
                }
              >
                <option value="bottom-center">Bottom Center</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-right">Top Right</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="num-format">Format</label>
              <select
                id="num-format"
                className="select"
                value={numFormat}
                onChange={(e) =>
                  setNumFormat(e.target.value as PageNumberOptions['format'])
                }
              >
                <option value="page-of-total">Page 1 of N</option>
                <option value="number">1, 2, 3…</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="num-start">Start numbering at</label>
              <input
                id="num-start"
                type="number"
                min={1}
                className="input"
                value={numStart}
                onChange={(e) => setNumStart(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>

            <div className="field">
              <label htmlFor="num-size">Font size: {numSize} pt</label>
              <input
                id="num-size"
                type="range"
                min={8}
                max={18}
                value={numSize}
                onChange={(e) => setNumSize(parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handlePageNumbers}
            >
              <Hash size={15} aria-hidden="true" />
              <span>Stamp Page Numbers</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
