import { useState } from 'react';
import { Archive, Download, Scissors } from 'lucide-react';
import type { ActivePdfDocument } from '../types/pdf';
import { extractPages, splitPdfToZip } from '../engine/pdfOperations';
import { downloadBytes, parsePageRanges, stripExtension } from '../engine/fileUtils';

interface SplitPaneProps {
  doc: ActivePdfDocument;
  onOpenExtractedInWorkspace: (bytes: Uint8Array, name: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function SplitPane({
  doc,
  onOpenExtractedInWorkspace,
  onNotify,
}: SplitPaneProps) {
  const [rangeText, setRangeText] = useState(
    doc.pageCount > 1 ? `1-${Math.min(3, doc.pageCount)}` : '1'
  );
  const [chunkSize, setChunkSize] = useState(2);
  const [busy, setBusy] = useState(false);

  const handleExtractRange = async (openInStudio: boolean) => {
    setBusy(true);
    try {
      const indices = parsePageRanges(rangeText, doc.pageCount);
      if (indices.length === 0) {
        throw new Error('No valid pages matched that range.');
      }
      const extracted = await extractPages(doc.bytes, indices);
      const outName = `${stripExtension(doc.name)}_pages.pdf`;
      if (openInStudio) {
        onOpenExtractedInWorkspace(extracted, outName);
        onNotify('success', `Opened ${indices.length} extracted pages in Studio.`);
      } else {
        downloadBytes(extracted, outName);
        onNotify('success', `Downloaded ${indices.length} extracted pages.`);
      }
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Extract failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSplitZip = async (mode: 'every-page' | 'chunk') => {
    setBusy(true);
    try {
      const zipBlob = await splitPdfToZip(doc.bytes, doc.name, mode, chunkSize);
      const outName = `${stripExtension(doc.name)}_split.zip`;
      downloadBytes(zipBlob, outName, 'application/zip');
      onNotify('success', `Downloaded "${outName}".`);
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Split failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Split &amp; Extract Pages</h1>
            <p>
              Extract custom page ranges into a new PDF, or burst “{doc.name}” (
              {doc.pageCount} pages) into multiple PDF files packaged as a ZIP.
            </p>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Extract Specific Pages</h2>
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <div className="field">
              <label htmlFor="split-range">
                Page ranges (1 to {doc.pageCount}, e.g. 1-3, 5, 8-10)
              </label>
              <input
                id="split-range"
                type="text"
                className="input"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                placeholder="1-3, 5, 8-10"
              />
            </div>

            <div className="toolbar-group" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => handleExtractRange(true)}
              >
                <Scissors size={15} aria-hidden="true" />
                <span>Extract &amp; Open</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => handleExtractRange(false)}
              >
                <Download size={15} aria-hidden="true" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Split into Multiple PDFs (ZIP Archive)</h2>
          <div className="form-grid">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <strong>Split Every Page</strong>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Creates {doc.pageCount} individual single-page PDF files inside one ZIP.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => handleSplitZip('every-page')}
              >
                <Archive size={15} aria-hidden="true" />
                <span>Split All Pages to ZIP</span>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="field">
                <label htmlFor="split-chunk">Split every N pages</label>
                <input
                  id="split-chunk"
                  type="number"
                  min={1}
                  max={Math.max(1, doc.pageCount)}
                  className="input"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => handleSplitZip('chunk')}
              >
                <Archive size={15} aria-hidden="true" />
                <span>Split Every {chunkSize} Pages to ZIP</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
