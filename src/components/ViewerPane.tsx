import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ActivePdfDocument } from '../types/pdf';
import {
  loadPdfProxy,
  renderPageToCanvas,
  type LoadedPdfProxy,
} from '../engine/pdfRenderer';
import { rotatePages } from '../engine/pdfOperations';

interface ViewerPaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function ViewerPane({
  doc,
  onUpdateDocument,
  onNotify,
}: ViewerPaneProps) {
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [loading, setLoading] = useState(true);
  const [pageInput, setPageInput] = useState('1');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<LoadedPdfProxy | null>(null);

  useEffect(() => {
    setPageNumber((prev) => Math.min(prev, doc.pageCount));
  }, [doc.pageCount]);

  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    loadPdfProxy(doc.bytes)
      .then((proxy) => {
        if (cancelled) {
          proxy.destroy();
          return;
        }
        proxyRef.current?.destroy();
        proxyRef.current = proxy;
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoading(false);
          onNotify(
            'error',
            `Failed to load PDF: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [doc.bytes, onNotify]);

  useEffect(() => {
    return () => {
      proxyRef.current?.destroy();
      proxyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const proxy = proxyRef.current;
    const canvas = canvasRef.current;
    if (!proxy || !canvas || loading) return;

    let cancelled = false;
    const safePage = Math.max(1, Math.min(pageNumber, proxy.numPages));
    renderPageToCanvas(proxy, safePage, canvas, scale).catch((err: unknown) => {
      if (!cancelled) {
        onNotify(
          'error',
          `Render error: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pageNumber, scale, loading, doc.bytes, onNotify]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPageNumber((p) => Math.min(doc.pageCount, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPageNumber((p) => Math.max(1, p - 1));
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(3.5, +(s + 0.2).toFixed(2)));
      } else if (e.key === '-') {
        setScale((s) => Math.max(0.4, +(s - 0.2).toFixed(2)));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc.pageCount]);

  const handleFitWidth = async () => {
    const proxy = proxyRef.current;
    const stage = stageRef.current;
    if (!proxy || !stage) return;
    const page = await proxy.getPage(pageNumber);
    const vp = page.getViewport({ scale: 1 });
    const available = Math.max(320, stage.clientWidth - 72);
    setScale(Math.max(0.4, Math.min(3, +(available / vp.width).toFixed(2))));
  };

  const handleRotateCurrent = async () => {
    try {
      const updated = await rotatePages(doc.bytes, [pageNumber - 1], 90);
      onUpdateDocument(updated, `Rotated page ${pageNumber} by 90°`);
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Rotate failed');
    }
  };

  const commitPageInput = () => {
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      setPageNumber(Math.max(1, Math.min(doc.pageCount, parsed)));
    } else {
      setPageInput(String(pageNumber));
    }
  };

  return (
    <>
      <div className="sub-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-icon"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitPageInput();
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <input
              type="text"
              inputMode="numeric"
              aria-label="Current page number"
              className="input"
              style={{ width: '54px', textAlign: 'center', padding: '5px 6px' }}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={commitPageInput}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              of {doc.pageCount}
            </span>
          </form>

          <button
            type="button"
            className="btn btn-icon"
            disabled={pageNumber >= doc.pageCount}
            onClick={() => setPageNumber((p) => Math.min(doc.pageCount, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setScale((s) => Math.max(0.4, +(s - 0.2).toFixed(2)))}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span
            style={{
              minWidth: '52px',
              textAlign: 'center',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setScale((s) => Math.min(3.5, +(s + 0.2).toFixed(2)))}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={handleFitWidth}
            title="Fit page width"
          >
            <Maximize2 size={14} aria-hidden="true" />
            <span>Fit Width</span>
          </button>

          <div className="toolbar-divider" />

          <button
            type="button"
            className="btn btn-sm"
            onClick={handleRotateCurrent}
            title="Rotate current page 90° clockwise"
          >
            <RotateCw size={14} aria-hidden="true" />
            <span>Rotate Page</span>
          </button>
        </div>
      </div>

      <div ref={stageRef} className="viewer-stage">
        <div className="viewer-page-frame">
          <canvas ref={canvasRef} />
        </div>
        <div className="viewer-page-badge">
          Page {pageNumber} / {doc.pageCount} · {Math.round(scale * 100)}%
        </div>
      </div>
    </>
  );
}
