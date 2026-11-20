import { useEffect, useState, type DragEvent } from 'react';
import {
  CheckSquare,
  Copy,
  Download,
  FilePlus2,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
} from 'lucide-react';
import type { ActivePdfDocument } from '../types/pdf';
import {
  deletePages,
  duplicatePages,
  extractPages,
  insertBlankPage,
  reorderPages,
  rotatePages,
} from '../engine/pdfOperations';
import { loadPdfProxy, renderPageToDataUrl } from '../engine/pdfRenderer';
import { downloadBytes, stripExtension } from '../engine/fileUtils';

interface OrganizePaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function OrganizePane({
  doc,
  onUpdateDocument,
  onNotify,
}: OrganizePaneProps) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSelected(new Set());

    (async () => {
      const proxy = await loadPdfProxy(doc.bytes);
      const urls: string[] = new Array(proxy.numPages).fill('');
      if (!cancelled) setThumbs([...urls]);

      try {
        for (let p = 1; p <= proxy.numPages; p++) {
          if (cancelled) break;
          const url = await renderPageToDataUrl(proxy, p, 220);
          urls[p - 1] = url;
          if (!cancelled) setThumbs([...urls]);
        }
      } finally {
        await proxy.destroy();
      }
    })().catch((err: unknown) => {
      if (!cancelled) {
        onNotify('error', err instanceof Error ? err.message : 'Thumbnail render failed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [doc.bytes, onNotify]);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(Array.from({ length: doc.pageCount }, (_, i) => i)));
  };

  const selectPattern = (even: boolean) => {
    const next = new Set<number>();
    for (let i = 0; i < doc.pageCount; i++) {
      const pageNum = i + 1;
      if ((pageNum % 2 === 0) === even) next.add(i);
    }
    setSelected(next);
  };

  const clearSelection = () => setSelected(new Set());

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  const selectedIndices = Array.from(selected).sort((a, b) => a - b);

  const handleRotate = (delta: number, indices = selectedIndices) => {
    if (indices.length === 0) return;
    runAction(async () => {
      const updated = await rotatePages(doc.bytes, indices, delta);
      onUpdateDocument(
        updated,
        `Rotated ${indices.length} ${indices.length === 1 ? 'page' : 'pages'}`
      );
    });
  };

  const handleDelete = (indices = selectedIndices) => {
    if (indices.length === 0) return;
    runAction(async () => {
      const updated = await deletePages(doc.bytes, indices);
      onUpdateDocument(
        updated,
        `Deleted ${indices.length} ${indices.length === 1 ? 'page' : 'pages'}`
      );
    });
  };

  const handleDuplicate = (indices = selectedIndices) => {
    if (indices.length === 0) return;
    runAction(async () => {
      const updated = await duplicatePages(doc.bytes, indices);
      onUpdateDocument(
        updated,
        `Duplicated ${indices.length} ${indices.length === 1 ? 'page' : 'pages'}`
      );
    });
  };

  const handleInsertBlank = () => {
    const targetIdx =
      selectedIndices.length > 0
        ? selectedIndices[selectedIndices.length - 1] + 1
        : doc.pageCount;
    runAction(async () => {
      const updated = await insertBlankPage(doc.bytes, targetIdx);
      onUpdateDocument(updated, `Inserted blank page at position ${targetIdx + 1}`);
    });
  };

  const handleExtractSelected = () => {
    if (selectedIndices.length === 0) return;
    runAction(async () => {
      const extracted = await extractPages(doc.bytes, selectedIndices);
      downloadBytes(extracted, `${stripExtension(doc.name)}_extracted.pdf`);
      onNotify('success', `Extracted ${selectedIndices.length} pages to a new PDF.`);
    });
  };

  const handleDropOnCard = (targetIdx: number, e: DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (dragIndex === null || dragIndex === targetIdx) return;

    const order = Array.from({ length: doc.pageCount }, (_, i) => i);
    const [moved] = order.splice(dragIndex, 1);
    order.splice(targetIdx, 0, moved);
    setDragIndex(null);

    runAction(async () => {
      const updated = await reorderPages(doc.bytes, order);
      onUpdateDocument(
        updated,
        `Moved page ${dragIndex + 1} to position ${targetIdx + 1}`
      );
    });
  };

  return (
    <>
      <div className="sub-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-sm"
            onClick={selected.size === doc.pageCount ? clearSelection : selectAll}
          >
            {selected.size === doc.pageCount ? (
              <CheckSquare size={14} aria-hidden="true" />
            ) : (
              <Square size={14} aria-hidden="true" />
            )}
            <span>{selected.size === doc.pageCount ? 'Deselect All' : 'Select All'}</span>
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => selectPattern(false)}>
            Odd
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => selectPattern(true)}>
            Even
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
            {selected.size > 0 ? `${selected.size} selected` : 'Drag cards to reorder'}
          </span>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || selected.size === 0}
            onClick={() => handleRotate(-90)}
            title="Rotate selected 90° counter-clockwise"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>-90°</span>
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || selected.size === 0}
            onClick={() => handleRotate(90)}
            title="Rotate selected 90° clockwise"
          >
            <RotateCw size={14} aria-hidden="true" />
            <span>+90°</span>
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || selected.size === 0}
            onClick={() => handleDuplicate()}
          >
            <Copy size={14} aria-hidden="true" />
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={handleInsertBlank}
          >
            <FilePlus2 size={14} aria-hidden="true" />
            <span>Add Blank</span>
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || selected.size === 0}
            onClick={handleExtractSelected}
          >
            <Download size={14} aria-hidden="true" />
            <span>Extract</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={busy || selected.size === 0 || selected.size >= doc.pageCount}
            onClick={() => handleDelete()}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <div className="pane-scroll">
        <div className="pages-grid">
          {Array.from({ length: doc.pageCount }, (_, idx) => {
            const isSelected = selected.has(idx);
            return (
              <div
                key={idx}
                className={`page-card${isSelected ? ' is-selected' : ''}${
                  dragOverIndex === idx ? ' is-drag-over' : ''
                }`}
                draggable={!busy}
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverIndex(idx);
                }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => handleDropOnCard(idx, e)}
                onClick={() => toggleSelect(idx)}
              >
                <div className="page-thumb-box">
                  {thumbs[idx] ? (
                    <img src={thumbs[idx]} alt={`Page ${idx + 1}`} draggable={false} />
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Rendering…
                    </span>
                  )}
                </div>

                <div className="page-card-footer">
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(idx)}
                    />
                    <span className="page-number-tag">Page {idx + 1}</span>
                  </label>

                  <div
                    className="page-card-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      style={{ width: '26px', height: '26px', padding: '4px' }}
                      disabled={busy}
                      onClick={() => handleRotate(90, [idx])}
                      title="Rotate page 90° clockwise"
                      aria-label={`Rotate page ${idx + 1}`}
                    >
                      <RotateCw size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      style={{ width: '26px', height: '26px', padding: '4px' }}
                      disabled={busy || doc.pageCount <= 1}
                      onClick={() => handleDelete([idx])}
                      title="Delete page"
                      aria-label={`Delete page ${idx + 1}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
