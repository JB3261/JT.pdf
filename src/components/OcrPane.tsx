import { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ScanText,
} from 'lucide-react';
import type { ActivePdfDocument, OcrPageResult } from '../types/pdf';
import { runLocalOcr } from '../engine/pdfOcr';
import {
  downloadBytes,
  parsePageRanges,
  stripExtension,
} from '../engine/fileUtils';

interface OcrPaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'por', label: 'Portuguese (Português)' },
  { code: 'spa', label: 'Spanish (Español)' },
  { code: 'fra', label: 'French (Français)' },
  { code: 'deu', label: 'German (Deutsch)' },
];

export function OcrPane({
  doc,
  onUpdateDocument,
  onNotify,
}: OcrPaneProps) {
  const [lang, setLang] = useState('eng');
  const [pageScope, setPageScope] = useState<'all' | 'range'>('all');
  const [rangeText, setRangeText] = useState(
    doc.pageCount > 1 ? `1-${Math.min(3, doc.pageCount)}` : '1'
  );
  const [makeSearchable, setMakeSearchable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);
  const [results, setResults] = useState<OcrPageResult[]>([]);
  const [searchablePdf, setSearchablePdf] = useState<Uint8Array | null>(null);

  const handleRunOcr = async () => {
    setBusy(true);
    setResults([]);
    setSearchablePdf(null);
    setProgress({ percent: 2, label: 'Starting local WASM OCR…' });

    try {
      const indices =
        pageScope === 'all'
          ? Array.from({ length: doc.pageCount }, (_, i) => i)
          : parsePageRanges(rangeText, doc.pageCount);

      if (indices.length === 0) {
        throw new Error('No valid pages matched that range.');
      }

      const output = await runLocalOcr(
        doc.bytes,
        indices,
        lang,
        makeSearchable,
        (percent, label) => setProgress({ percent, label })
      );
      setResults(output.results);
      if (output.searchablePdfBytes) {
        setSearchablePdf(output.searchablePdfBytes);
      }
      onNotify(
        'success',
        `OCR completed for ${output.results.length} ${
          output.results.length === 1 ? 'page' : 'pages'
        }.`
      );
    } catch (err: unknown) {
      onNotify(
        'error',
        `OCR failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const combinedText = results
    .map((r) => `=== Page ${r.pageNumber} (Confidence: ${r.confidence}%) ===\n${r.text}`)
    .join('\n\n');

  const avgConfidence =
    results.length > 0
      ? Math.round(
          results.reduce((acc, r) => acc + r.confidence, 0) / results.length
        )
      : 0;

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Local OCR (Scanned PDF to Text)</h1>
            <p>
              Recognize text inside scanned PDFs using a 100% local WebAssembly OCR
              engine (Tesseract.js) and optionally embed a searchable text layer.
            </p>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">OCR Settings</h2>
          <div className="form-grid" style={{ marginBottom: '14px' }}>
            <div className="field">
              <label htmlFor="ocr-lang">Document language</label>
              <select
                id="ocr-lang"
                className="select"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="ocr-scope">Pages to scan</label>
              <select
                id="ocr-scope"
                className="select"
                value={pageScope}
                onChange={(e) => setPageScope(e.target.value as 'all' | 'range')}
              >
                <option value="all">All pages ({doc.pageCount})</option>
                <option value="range">Custom page range</option>
              </select>
            </div>

            {pageScope === 'range' && (
              <div className="field">
                <label htmlFor="ocr-range">Range (e.g. 1-3, 5)</label>
                <input
                  id="ocr-range"
                  type="text"
                  className="input"
                  value={rangeText}
                  onChange={(e) => setRangeText(e.target.value)}
                />
              </div>
            )}
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={makeSearchable}
              onChange={(e) => setMakeSearchable(e.target.checked)}
            />
            <span>
              Embed invisible text layer to create a <strong>Searchable PDF</strong>
            </span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handleRunOcr}
            >
              <ScanText size={15} aria-hidden="true" />
              <span>{busy ? 'Scanning…' : 'Run Local OCR'}</span>
            </button>

            {busy && progress && (
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {progress.label} ({progress.percent}%)
                </div>
                <progress value={progress.percent} max={100} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        </div>

        {results.length > 0 && (
          <div className="card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              <h2 className="card-title" style={{ margin: 0 }}>
                Extracted Text ({results.length}{' '}
                {results.length === 1 ? 'page' : 'pages'} · Avg confidence{' '}
                {avgConfidence}%)
              </h2>

              <div className="toolbar-group">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(combinedText);
                    onNotify('success', 'Copied extracted text to clipboard.');
                  }}
                >
                  <Copy size={14} aria-hidden="true" />
                  <span>Copy Text</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const blob = new Blob([combinedText], {
                      type: 'text/plain;charset=utf-8',
                    });
                    downloadBytes(
                      blob,
                      `${stripExtension(doc.name)}_ocr.txt`,
                      'text/plain'
                    );
                  }}
                >
                  <Download size={14} aria-hidden="true" />
                  <span>Download .txt</span>
                </button>
              </div>
            </div>

            <textarea
              className="input"
              rows={11}
              readOnly
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px',
                lineHeight: 1.5,
              }}
              value={combinedText}
            />

            {searchablePdf && (
              <div className="toolbar-group" style={{ marginTop: '14px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    onUpdateDocument(
                      searchablePdf,
                      'Applied searchable OCR layer to workspace'
                    )
                  }
                >
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span>Apply Searchable PDF to Workspace</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    downloadBytes(
                      searchablePdf,
                      `${stripExtension(doc.name)}_searchable.pdf`
                    )
                  }
                >
                  <Download size={15} aria-hidden="true" />
                  <span>Download Searchable PDF</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
