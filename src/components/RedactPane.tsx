import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  EyeOff,
  ShieldAlert,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ActivePdfDocument, RedactionBox } from '../types/pdf';
import {
  loadPdfProxy,
  renderPageToCanvas,
  type LoadedPdfProxy,
} from '../engine/pdfRenderer';
import { applyTrueRedactions } from '../engine/pdfSecurity';

interface RedactPaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function RedactPane({
  doc,
  onUpdateDocument,
  onNotify,
}: RedactPaneProps) {
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [pageDims, setPageDims] = useState({ width: 600, height: 800 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);

  const [boxes, setBoxes] = useState<RedactionBox[]>([]);
  const [draft, setDraft] = useState<RedactionBox | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<LoadedPdfProxy | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setPageNumber((prev) => Math.min(prev, doc.pageCount));
  }, [doc.pageCount]);

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
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc.bytes]);

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
    renderPageToCanvas(proxy, safePage, canvas, scale)
      .then((dims) => {
        if (!cancelled) setPageDims(dims);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pageNumber, scale, loading, doc.bytes]);

  const getNorm = (e: PointerEvent<HTMLDivElement>) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getNorm(e);
    startRef.current = pt;
    setDraft({
      id: 'draft',
      pageIndex: pageNumber - 1,
      x: pt.x,
      y: pt.y,
      width: 0,
      height: 0,
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draft || !startRef.current) return;
    const pt = getNorm(e);
    const start = startRef.current;
    setDraft({
      ...draft,
      x: Math.min(start.x, pt.x),
      y: Math.min(start.y, pt.y),
      width: Math.abs(pt.x - start.x),
      height: Math.abs(pt.y - start.y),
    });
  };

  const onPointerUp = () => {
    if (draft && draft.width > 0.008 && draft.height > 0.006) {
      setBoxes((prev) => [...prev, { ...draft, id: crypto.randomUUID() }]);
    }
    setDraft(null);
    startRef.current = null;
  };

  const handleApplyRedactions = async () => {
    if (boxes.length === 0) return;
    setBusy(true);
    setProgress({ percent: 5, label: 'Applying permanent redactions…' });
    try {
      const redactedBytes = await applyTrueRedactions(
        doc.bytes,
        boxes,
        (percent, label) => setProgress({ percent, label })
      );
      const count = boxes.length;
      setBoxes([]);
      onUpdateDocument(
        redactedBytes,
        `Permanently redacted ${count} ${count === 1 ? 'area' : 'areas'}`
      );
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Redaction failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pageIndex = pageNumber - 1;
  const pageBoxes = boxes.filter((b) => b.pageIndex === pageIndex);
  const visibleBoxes = draft ? [...pageBoxes, draft] : pageBoxes;

  return (
    <>
      <div className="sub-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-icon btn-sm"
            style={{ width: '28px', height: '28px' }}
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>
            Page {pageNumber} / {doc.pageCount}
          </span>
          <button
            type="button"
            className="btn btn-icon btn-sm"
            style={{ width: '28px', height: '28px' }}
            disabled={pageNumber >= doc.pageCount}
            onClick={() => setPageNumber((p) => Math.min(doc.pageCount, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>

          <div className="toolbar-divider" />

          <button
            type="button"
            className="btn btn-icon btn-sm"
            style={{ width: '28px', height: '28px' }}
            onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))}
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <span style={{ fontSize: '12px', minWidth: '42px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="btn btn-icon btn-sm"
            style={{ width: '28px', height: '28px' }}
            onClick={() => setScale((s) => Math.min(2.6, +(s + 0.15).toFixed(2)))}
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={pageBoxes.length === 0 || busy}
            onClick={() =>
              setBoxes((prev) => prev.filter((b) => b.pageIndex !== pageIndex))
            }
          >
            <Eraser size={14} aria-hidden="true" />
            <span>Clear Page</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={boxes.length === 0 || busy}
            onClick={handleApplyRedactions}
          >
            <EyeOff size={14} aria-hidden="true" />
            <span>
              {busy
                ? 'Redacting…'
                : `Apply Permanent Redaction${boxes.length ? ` (${boxes.length})` : ''}`}
            </span>
          </button>
        </div>
      </div>

      <div
        className="sub-toolbar"
        style={{ background: 'var(--warning-soft)', paddingBlock: '7px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
          }}
        >
          <ShieldAlert size={15} color="var(--warning)" aria-hidden="true" />
          <span>
            <strong>True Redaction:</strong> Drag boxes over sensitive text or images.
            Click a box to remove it. Applying burns solid black bars and rasterizes
            redacted pages so hidden text cannot be copied or recovered.
          </span>
        </div>

        {busy && progress && (
          <div style={{ minWidth: '200px' }}>
            <progress value={progress.percent} max={100} style={{ width: '100%' }} />
          </div>
        )}
      </div>

      <div className="viewer-stage">
        <div className="viewer-page-frame" style={{ cursor: 'crosshair' }}>
          <canvas ref={canvasRef} />
          <div
            ref={overlayRef}
            className="annotate-overlay"
            style={{ width: `${pageDims.width}px`, height: `${pageDims.height}px` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {visibleBoxes.map((box) => (
              <div
                key={box.id}
                className="redact-box"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                }}
                title="Click to remove redaction box"
                onPointerDown={(e) => {
                  if (box.id === 'draft') return;
                  e.stopPropagation();
                  setBoxes((prev) => prev.filter((b) => b.id !== box.id));
                }}
              >
                {box.id !== 'draft' && (
                  <span className="redact-box-remove" aria-hidden="true">
                    <Trash2 size={11} />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
