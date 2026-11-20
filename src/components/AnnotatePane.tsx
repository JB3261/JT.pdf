import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  MousePointer2,
  PenTool,
  Signature,
  Square,
  Stamp,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ActivePdfDocument,
  AnnotationTool,
  NormalizedPoint,
  PageAnnotation,
  SavedSignature,
} from '../types/pdf';
import {
  loadPdfProxy,
  renderPageToCanvas,
  type LoadedPdfProxy,
} from '../engine/pdfRenderer';
import { applyAnnotationsToPdf } from '../engine/pdfAnnotations';
import { SignatureDialog } from './SignatureDialog';

interface AnnotatePaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const SWATCHES = [
  '#facc15', // Yellow highlight
  '#ef4444', // Red
  '#2563eb', // Blue
  '#059669', // Green
  '#0f172a', // Ink Black
  '#9333ea', // Purple
];

const STAMP_PRESETS = [
  { label: 'APPROVED', color: '#059669' },
  { label: 'CONFIDENTIAL', color: '#dc2626' },
  { label: 'DRAFT', color: '#2563eb' },
  { label: 'REVIEWED', color: '#7c3aed' },
  { label: 'PAID', color: '#059669' },
  { label: 'URGENT', color: '#dc2626' },
];

const SIG_STORAGE_KEY = 'jtpdf.savedSignatures.v1';

function loadSavedSignatures(): SavedSignature[] {
  try {
    const raw = localStorage.getItem(SIG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedSignatures(sigs: SavedSignature[]) {
  try {
    localStorage.setItem(SIG_STORAGE_KEY, JSON.stringify(sigs.slice(0, 8)));
  } catch {
    // Ignore storage quota errors
  }
}

export function AnnotatePane({
  doc,
  onUpdateDocument,
  onNotify,
}: AnnotatePaneProps) {
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [pageDims, setPageDims] = useState({ width: 600, height: 800 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [tool, setTool] = useState<AnnotationTool>('highlight');
  const [color, setColor] = useState('#facc15');
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [fontSize, setFontSize] = useState(14);
  const [stampPreset, setStampPreset] = useState(STAMP_PRESETS[0]);

  const [annotations, setAnnotations] = useState<PageAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PageAnnotation | null>(null);

  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>(() =>
    loadSavedSignatures()
  );
  const [activeSignature, setActiveSignature] = useState<SavedSignature | null>(
    () => loadSavedSignatures()[0] ?? null
  );
  const [sigDialogOpen, setSigDialogOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<LoadedPdfProxy | null>(null);
  const dragStartRef = useRef<NormalizedPoint | null>(null);
  const movingItemRef = useRef<{
    id: string;
    startPt: NormalizedPoint;
    orig: PageAnnotation;
  } | null>(null);

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
    renderPageToCanvas(proxy, safePage, canvas, scale)
      .then((dims) => {
        if (!cancelled) setPageDims(dims);
      })
      .catch(() => {
        // Handled by viewer
      });

    return () => {
      cancelled = true;
    };
  }, [pageNumber, scale, loading, doc.bytes]);

  // Delete selected annotation with Delete/Backspace
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  const selectTool = (next: AnnotationTool) => {
    setTool(next);
    setSelectedId(null);
    if (next === 'highlight' && color === '#0f172a') {
      setColor('#facc15');
    } else if (next !== 'highlight' && color === '#facc15') {
      setColor('#2563eb');
    }
    if (next === 'signature' && !activeSignature) {
      setSigDialogOpen(true);
    }
  };

  const getNormPoint = (e: PointerEvent<HTMLDivElement>): NormalizedPoint => {
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleOverlayPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const pt = getNormPoint(e);
    const pageIndex = pageNumber - 1;

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    if (tool === 'text') {
      const id = crypto.randomUUID();
      const item: PageAnnotation = {
        id,
        type: 'text',
        pageIndex,
        color,
        x: pt.x,
        y: pt.y,
        text: 'Type your text here',
        fontSize,
      };
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(id);
      setTool('select');
      return;
    }

    if (tool === 'note') {
      const id = crypto.randomUUID();
      const item: PageAnnotation = {
        id,
        type: 'note',
        pageIndex,
        color: '#facc15',
        x: pt.x,
        y: pt.y,
        text: 'Add your comment…',
      };
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(id);
      setTool('select');
      return;
    }

    if (tool === 'stamp') {
      const id = crypto.randomUUID();
      const item: PageAnnotation = {
        id,
        type: 'stamp',
        pageIndex,
        color: stampPreset.color,
        x: pt.x,
        y: pt.y,
        label: stampPreset.label,
      };
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(id);
      setTool('select');
      return;
    }

    if (tool === 'signature') {
      if (!activeSignature) {
        setSigDialogOpen(true);
        return;
      }
      const normW = 0.24;
      const pageAspect = pageDims.width / Math.max(1, pageDims.height);
      const normH = (normW * pageAspect) / Math.max(0.4, activeSignature.aspectRatio);
      const id = crypto.randomUUID();
      const item: PageAnnotation = {
        id,
        type: 'signature',
        pageIndex,
        color: '#0f172a',
        x: Math.max(0, Math.min(1 - normW, pt.x - normW / 2)),
        y: Math.max(0, Math.min(1 - normH, pt.y - normH / 2)),
        width: normW,
        height: normH,
        dataUrl: activeSignature.dataUrl,
      };
      setAnnotations((prev) => [...prev, item]);
      setSelectedId(id);
      setTool('select');
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = pt;

    if (tool === 'highlight') {
      setDraft({
        id: 'draft',
        type: 'highlight',
        pageIndex,
        color,
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        opacity: 0.36,
      });
    } else if (tool === 'rect') {
      setDraft({
        id: 'draft',
        type: 'rect',
        pageIndex,
        color,
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
        strokeWidth,
      });
    } else if (tool === 'arrow') {
      setDraft({
        id: 'draft',
        type: 'arrow',
        pageIndex,
        color,
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
        strokeWidth,
      });
    } else if (tool === 'ink') {
      setDraft({
        id: 'draft',
        type: 'ink',
        pageIndex,
        color,
        points: [pt],
        strokeWidth,
      });
    }
  };

  const handleOverlayPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pt = getNormPoint(e);

    if (movingItemRef.current) {
      const { id, startPt, orig } = movingItemRef.current;
      const dx = pt.x - startPt.x;
      const dy = pt.y - startPt.y;
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          if (a.type === 'arrow' && orig.type === 'arrow') {
            return {
              ...a,
              x1: Math.max(0, Math.min(1, orig.x1 + dx)),
              y1: Math.max(0, Math.min(1, orig.y1 + dy)),
              x2: Math.max(0, Math.min(1, orig.x2 + dx)),
              y2: Math.max(0, Math.min(1, orig.y2 + dy)),
            };
          }
          if (a.type === 'ink' && orig.type === 'ink') {
            return {
              ...a,
              points: orig.points.map((p) => ({
                x: Math.max(0, Math.min(1, p.x + dx)),
                y: Math.max(0, Math.min(1, p.y + dy)),
              })),
            };
          }
          if ('x' in a && 'y' in a && 'x' in orig && 'y' in orig) {
            return {
              ...a,
              x: Math.max(0, Math.min(0.96, orig.x + dx)),
              y: Math.max(0, Math.min(0.96, orig.y + dy)),
            };
          }
          return a;
        })
      );
      return;
    }

    if (!draft || !dragStartRef.current) return;
    const start = dragStartRef.current;

    if (draft.type === 'highlight' || draft.type === 'rect') {
      setDraft({
        ...draft,
        x: Math.min(start.x, pt.x),
        y: Math.min(start.y, pt.y),
        width: Math.abs(pt.x - start.x),
        height: Math.abs(pt.y - start.y),
      });
    } else if (draft.type === 'arrow') {
      setDraft({ ...draft, x2: pt.x, y2: pt.y });
    } else if (draft.type === 'ink') {
      setDraft({ ...draft, points: [...draft.points, pt] });
    }
  };

  const handleOverlayPointerUp = () => {
    if (movingItemRef.current) {
      movingItemRef.current = null;
      return;
    }

    if (!draft) return;
    let valid = false;
    if (draft.type === 'highlight' || draft.type === 'rect') {
      valid = draft.width > 0.008 && draft.height > 0.006;
    } else if (draft.type === 'arrow') {
      valid = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 0.012;
    } else if (draft.type === 'ink') {
      valid = draft.points.length >= 2;
    }

    if (valid) {
      const committed: PageAnnotation = { ...draft, id: crypto.randomUUID() };
      setAnnotations((prev) => [...prev, committed]);
      setSelectedId(committed.id);
    }

    setDraft(null);
    dragStartRef.current = null;
  };

  const startMoveItem = (ann: PageAnnotation, e: PointerEvent<Element>) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(ann.id);
    const rect = overlayRef.current!.getBoundingClientRect();
    const startPt = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    movingItemRef.current = { id: ann.id, startPt, orig: ann };
  };

  const handleApplyToPdf = async () => {
    if (annotations.length === 0) return;
    setBusy(true);
    try {
      const updated = await applyAnnotationsToPdf(doc.bytes, annotations);
      const count = annotations.length;
      setAnnotations([]);
      setSelectedId(null);
      onUpdateDocument(
        updated,
        `Saved ${count} ${count === 1 ? 'annotation' : 'annotations'} into PDF`
      );
    } catch (err: unknown) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Failed to embed annotations'
      );
    } finally {
      setBusy(false);
    }
  };

  const pageIndex = pageNumber - 1;
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);
  const allVisible = draft ? [...pageAnnotations, draft] : pageAnnotations;
  const selectedAnnotation = annotations.find((a) => a.id === selectedId) ?? null;

  const updateSelected = (patch: Partial<PageAnnotation>) => {
    if (!selectedId) return;
    setAnnotations((prev) =>
      prev.map((a) => (a.id === selectedId ? ({ ...a, ...patch } as PageAnnotation) : a))
    );
  };

  return (
    <>
      <div className="sub-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className={`btn btn-sm${tool === 'select' ? ' btn-primary' : ''}`}
            onClick={() => selectTool('select')}
            title="Select & Move"
          >
            <MousePointer2 size={14} aria-hidden="true" />
            <span>Select</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tool === 'highlight' ? ' btn-primary' : ''}`}
            onClick={() => selectTool('highlight')}
            title="Highlight"
          >
            <Highlighter size={14} aria-hidden="true" />
            <span>Highlight</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tool === 'ink' ? ' btn-primary' : ''}`}
            onClick={() => selectTool('ink')}
            title="Freehand Pen"
          >
            <PenTool size={14} aria-hidden="true" />
            <span>Pen</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tool === 'text' ? ' btn-primary' : ''}`}
            onClick={() => selectTool('text')}
            title="Text Box"
          >
            <Type size={14} aria-hidden="true" />
            <span>Text</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tool === 'note' ? ' btn-primary' : ''}`}
            onClick={() => selectTool('note')}
            title="Sticky Note"
          >
            <StickyNote size={14} aria-hidden="true" />
            <span>Note</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tool === 'rect' ? ' btn-primary' : ''}`}
            onClick={() => selectTool('rect')}
            title="Rectangle"
          >
            <Square size={14} aria-hidden="true" />
            <span>Box</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tool === 'arrow' ? ' btn-primary' : ''}`}
            onClick={() => selectTool('arrow')}
            title="Arrow"
          >
            <ArrowUpRight size={14} aria-hidden="true" />
            <span>Arrow</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tool === 'stamp' ? ' btn-primary' : ''}`}
            onClick={() => selectTool('stamp')}
            title="Stamp"
          >
            <Stamp size={14} aria-hidden="true" />
            <span>Stamp</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tool === 'signature' ? ' btn-primary' : ''}`}
            onClick={() => {
              setTool('signature');
              setSigDialogOpen(true);
            }}
            title="Create or place E-Signature"
          >
            <Signature size={14} aria-hidden="true" />
            <span>Sign</span>
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={annotations.length === 0}
            onClick={() => {
              setAnnotations((prev) => prev.slice(0, -1));
              setSelectedId(null);
            }}
            title="Undo last draft annotation"
          >
            <Undo2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || annotations.length === 0}
            onClick={handleApplyToPdf}
          >
            <Check size={14} aria-hidden="true" />
            <span>
              {busy
                ? 'Saving…'
                : `Apply to PDF${annotations.length > 0 ? ` (${annotations.length})` : ''}`}
            </span>
          </button>
        </div>
      </div>

      {/* Contextual options bar */}
      <div
        className="sub-toolbar"
        style={{ background: 'var(--bg-surface-2)', paddingBlock: '7px' }}
      >
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
          {tool === 'stamp' ? (
            <>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Stamp:
              </span>
              {STAMP_PRESETS.map((st) => (
                <button
                  key={st.label}
                  type="button"
                  className={`btn btn-sm${stampPreset.label === st.label ? ' btn-primary' : ''}`}
                  onClick={() => setStampPreset(st)}
                >
                  {st.label}
                </button>
              ))}
            </>
          ) : tool === 'signature' ? (
            <>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {activeSignature
                  ? `Click anywhere on the page to place "${activeSignature.label}"`
                  : 'Create a signature to place it on the page'}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setSigDialogOpen(true)}
              >
                Change Signature
              </button>
            </>
          ) : selectedAnnotation ? (
            <>
              {(selectedAnnotation.type === 'text' ||
                selectedAnnotation.type === 'note') && (
                <input
                  type="text"
                  className="input"
                  style={{ width: '240px', padding: '4px 8px' }}
                  aria-label="Edit selected annotation text"
                  value={selectedAnnotation.text}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                />
              )}
              {selectedAnnotation.type === 'text' && (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                  }}
                >
                  <span>Size</span>
                  <input
                    type="range"
                    min={10}
                    max={36}
                    value={selectedAnnotation.fontSize}
                    onChange={(e) =>
                      updateSelected({ fontSize: parseInt(e.target.value, 10) })
                    }
                  />
                </label>
              )}
              {selectedAnnotation.type === 'signature' && (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                  }}
                >
                  <span>Width</span>
                  <input
                    type="range"
                    min={10}
                    max={55}
                    value={Math.round(selectedAnnotation.width * 100)}
                    onChange={(e) => {
                      const nextW = parseInt(e.target.value, 10) / 100;
                      const ratio =
                        selectedAnnotation.height / Math.max(0.01, selectedAnnotation.width);
                      updateSelected({ width: nextW, height: nextW * ratio });
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
                  setSelectedId(null);
                }}
              >
                <Trash2 size={13} aria-hidden="true" />
                <span>Delete</span>
              </button>
            </>
          ) : (
            <>
              <div className="toolbar-group">
                {SWATCHES.map((sw) => (
                  <button
                    key={sw}
                    type="button"
                    className={`color-swatch${color === sw ? ' is-active' : ''}`}
                    style={{ background: sw }}
                    onClick={() => setColor(sw)}
                    aria-label={`Select color ${sw}`}
                  />
                ))}
              </div>
              {(tool === 'ink' || tool === 'rect' || tool === 'arrow') && (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    marginLeft: '8px',
                  }}
                >
                  <span>Stroke</span>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={0.5}
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                  />
                </label>
              )}
              {tool === 'text' && (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    marginLeft: '8px',
                  }}
                >
                  <span>Font {fontSize}pt</span>
                  <input
                    type="range"
                    min={10}
                    max={32}
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  />
                </label>
              )}
            </>
          )}
        </div>
      </div>

      <div className="viewer-stage">
        <div
          className="viewer-page-frame"
          style={{
            cursor:
              tool === 'select'
                ? 'default'
                : tool === 'text'
                  ? 'text'
                  : 'crosshair',
          }}
        >
          <canvas ref={canvasRef} />

          <div
            ref={overlayRef}
            className="annotate-overlay"
            style={{ width: `${pageDims.width}px`, height: `${pageDims.height}px` }}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
          >
            {/* Vector SVG layer: highlights, ink, boxes, arrows */}
            <svg
              width={pageDims.width}
              height={pageDims.height}
              viewBox={`0 0 ${pageDims.width} ${pageDims.height}`}
              className="annotate-svg"
            >
              <defs>
                {SWATCHES.map((sw) => (
                  <marker
                    key={sw}
                    id={`arrow-${sw.replace('#', '')}`}
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L0,6 L7,3 z" fill={sw} />
                  </marker>
                ))}
              </defs>

              {allVisible.map((ann) => {
                const isSelected = ann.id === selectedId;
                if (ann.type === 'highlight') {
                  return (
                    <rect
                      key={ann.id}
                      x={ann.x * pageDims.width}
                      y={ann.y * pageDims.height}
                      width={ann.width * pageDims.width}
                      height={ann.height * pageDims.height}
                      fill={ann.color}
                      fillOpacity={ann.opacity}
                      stroke={isSelected ? '#2563eb' : 'none'}
                      strokeDasharray={isSelected ? '4 2' : undefined}
                      strokeWidth={isSelected ? 1.5 : 0}
                      style={{
                        pointerEvents: tool === 'select' ? 'all' : 'none',
                        cursor: tool === 'select' ? 'move' : 'inherit',
                      }}
                      onPointerDown={(e) => startMoveItem(ann, e)}
                    />
                  );
                }
                if (ann.type === 'rect') {
                  return (
                    <rect
                      key={ann.id}
                      x={ann.x * pageDims.width}
                      y={ann.y * pageDims.height}
                      width={ann.width * pageDims.width}
                      height={ann.height * pageDims.height}
                      fill="transparent"
                      stroke={ann.color}
                      strokeWidth={ann.strokeWidth * scale}
                      style={{
                        pointerEvents: tool === 'select' ? 'all' : 'none',
                        cursor: tool === 'select' ? 'move' : 'inherit',
                      }}
                      onPointerDown={(e) => startMoveItem(ann, e)}
                    />
                  );
                }
                if (ann.type === 'arrow') {
                  const markerId = `url(#arrow-${ann.color.replace('#', '')})`;
                  return (
                    <line
                      key={ann.id}
                      x1={ann.x1 * pageDims.width}
                      y1={ann.y1 * pageDims.height}
                      x2={ann.x2 * pageDims.width}
                      y2={ann.y2 * pageDims.height}
                      stroke={ann.color}
                      strokeWidth={ann.strokeWidth * scale}
                      markerEnd={markerId}
                      style={{
                        pointerEvents: tool === 'select' ? 'stroke' : 'none',
                        cursor: tool === 'select' ? 'move' : 'inherit',
                      }}
                      onPointerDown={(e) => startMoveItem(ann, e)}
                    />
                  );
                }
                if (ann.type === 'ink') {
                  const pts = ann.points
                    .map((p) => `${p.x * pageDims.width},${p.y * pageDims.height}`)
                    .join(' ');
                  return (
                    <polyline
                      key={ann.id}
                      points={pts}
                      fill="none"
                      stroke={ann.color}
                      strokeWidth={ann.strokeWidth * scale}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        pointerEvents: tool === 'select' ? 'stroke' : 'none',
                        cursor: tool === 'select' ? 'move' : 'inherit',
                      }}
                      onPointerDown={(e) => startMoveItem(ann, e)}
                    />
                  );
                }
                return null;
              })}
            </svg>

            {/* Positioned items: text, notes, stamps, signatures */}
            {pageAnnotations.map((ann) => {
              const isSelected = ann.id === selectedId;
              if (ann.type === 'text') {
                return (
                  <div
                    key={ann.id}
                    className={`ann-item ann-text${isSelected ? ' is-selected' : ''}`}
                    style={{
                      left: `${ann.x * 100}%`,
                      top: `${ann.y * 100}%`,
                      color: ann.color,
                      fontSize: `${ann.fontSize * scale}px`,
                      pointerEvents: tool === 'select' ? 'auto' : 'none',
                    }}
                    onPointerDown={(e) => startMoveItem(ann, e)}
                  >
                    {ann.text}
                  </div>
                );
              }
              if (ann.type === 'note') {
                return (
                  <div
                    key={ann.id}
                    className={`ann-item ann-note${isSelected ? ' is-selected' : ''}`}
                    style={{
                      left: `${ann.x * 100}%`,
                      top: `${ann.y * 100}%`,
                      pointerEvents: tool === 'select' ? 'auto' : 'none',
                    }}
                    onPointerDown={(e) => startMoveItem(ann, e)}
                  >
                    {ann.text}
                  </div>
                );
              }
              if (ann.type === 'stamp') {
                return (
                  <div
                    key={ann.id}
                    className={`ann-item ann-stamp${isSelected ? ' is-selected' : ''}`}
                    style={{
                      left: `${ann.x * 100}%`,
                      top: `${ann.y * 100}%`,
                      color: ann.color,
                      borderColor: ann.color,
                      fontSize: `${15 * scale}px`,
                      pointerEvents: tool === 'select' ? 'auto' : 'none',
                    }}
                    onPointerDown={(e) => startMoveItem(ann, e)}
                  >
                    {ann.label}
                  </div>
                );
              }
              if (ann.type === 'signature') {
                return (
                  <div
                    key={ann.id}
                    className={`ann-item ann-sig${isSelected ? ' is-selected' : ''}`}
                    style={{
                      left: `${ann.x * 100}%`,
                      top: `${ann.y * 100}%`,
                      width: `${ann.width * 100}%`,
                      height: `${ann.height * 100}%`,
                      pointerEvents: tool === 'select' ? 'auto' : 'none',
                    }}
                    onPointerDown={(e) => startMoveItem(ann, e)}
                  >
                    <img src={ann.dataUrl} alt="Signature" draggable={false} />
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>

      <SignatureDialog
        open={sigDialogOpen}
        savedSignatures={savedSignatures}
        onClose={() => setSigDialogOpen(false)}
        onSelectSignature={(sig) => {
          setActiveSignature(sig);
          setTool('signature');
          onNotify('info', 'Click anywhere on the PDF page to place your signature.');
        }}
        onSaveSignature={(sig) => {
          setSavedSignatures((prev) => {
            const next = [sig, ...prev.filter((s) => s.id !== sig.id)];
            persistSavedSignatures(next);
            return next;
          });
        }}
        onDeleteSignature={(id) => {
          setSavedSignatures((prev) => {
            const next = prev.filter((s) => s.id !== id);
            persistSavedSignatures(next);
            return next;
          });
        }}
      />
    </>
  );
}
