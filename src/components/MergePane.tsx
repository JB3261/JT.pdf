import { useState, type DragEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Combine,
  Download,
  FileImage,
  FileText,
  FileUp,
  Trash2,
} from 'lucide-react';
import type { ActivePdfDocument, MergeItem } from '../types/pdf';
import { formatBytes, downloadBytes, readFileAsUint8Array } from '../engine/fileUtils';
import { getPdfPageCount, mergeItemsToPdf } from '../engine/pdfOperations';

interface MergePaneProps {
  activeDoc: ActivePdfDocument | null;
  initialQueue: MergeItem[];
  onClearInitialQueue: () => void;
  onOpenMergedInWorkspace: (bytes: Uint8Array, name: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function MergePane({
  activeDoc,
  initialQueue,
  onClearInitialQueue,
  onOpenMergedInWorkspace,
  onNotify,
}: MergePaneProps) {
  const [items, setItems] = useState<MergeItem[]>(() => {
    if (initialQueue.length > 0) return initialQueue;
    if (activeDoc) {
      return [
        {
          id: crypto.randomUUID(),
          name: activeDoc.name,
          kind: 'pdf',
          mimeType: 'application/pdf',
          bytes: activeDoc.bytes,
          pageCount: activeDoc.pageCount,
          sizeBytes: activeDoc.sizeBytes,
        },
      ];
    }
    return [];
  });
  const [outputName, setOutputName] = useState('merged-document.pdf');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const added: MergeItem[] = [];
    for (const file of files) {
      try {
        const bytes = await readFileAsUint8Array(file);
        const isPdf =
          file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImg = file.type.startsWith('image/');
        if (!isPdf && !isImg) continue;

        const pageCount = isPdf ? await getPdfPageCount(bytes) : 1;
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          kind: isPdf ? 'pdf' : 'image',
          mimeType: file.type || (isPdf ? 'application/pdf' : 'image/png'),
          bytes,
          pageCount,
          sizeBytes: bytes.byteLength,
        });
      } catch (err: unknown) {
        onNotify(
          'error',
          `Skipped "${file.name}": ${err instanceof Error ? err.message : 'Unsupported file'}`
        );
      }
    }

    if (added.length > 0) {
      setItems((prev) => [...prev, ...added]);
      onClearInitialQueue();
    }
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMerge = async (mode: 'workspace' | 'download') => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const mergedBytes = await mergeItemsToPdf(items);
      const finalName = outputName.trim().endsWith('.pdf')
        ? outputName.trim()
        : `${outputName.trim() || 'merged-document'}.pdf`;

      if (mode === 'download') {
        downloadBytes(mergedBytes, finalName);
        onNotify('success', `Downloaded "${finalName}" (${formatBytes(mergedBytes.byteLength)}).`);
      } else {
        onOpenMergedInWorkspace(mergedBytes, finalName);
        onNotify('success', `Merged ${items.length} files into "${finalName}".`);
      }
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = items.reduce((acc, item) => acc + item.pageCount, 0);
  const totalBytes = items.reduce((acc, item) => acc + item.sizeBytes, 0);

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Merge PDFs &amp; Images</h1>
            <p>
              Combine multiple PDF documents and PNG/JPG/WebP images in any order —
              100% locally.
            </p>
          </div>
          <label className="btn btn-primary">
            <FileUp size={15} aria-hidden="true" />
            <span>Add Files</span>
            <input
              type="file"
              accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
              multiple
              className="visually-hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}`}
          style={{ padding: '26px 20px' }}
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <p style={{ margin: 0 }}>
            Drag &amp; drop additional PDFs or images here to append them to the merge queue.
          </p>
        </div>

        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <h2 className="card-title" style={{ margin: 0 }}>
              Merge Queue ({items.length} {items.length === 1 ? 'file' : 'files'} ·{' '}
              {totalPages} {totalPages === 1 ? 'page' : 'pages'} · {formatBytes(totalBytes)})
            </h2>
            {items.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setItems([])}
              >
                Clear All
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0' }}>
              No files queued yet. Click “Add Files” or drag files above to get started.
            </p>
          ) : (
            <div className="file-list">
              {items.map((item, idx) => (
                <div key={item.id} className="file-row">
                  {item.kind === 'pdf' ? (
                    <FileText size={18} color="var(--brand)" aria-hidden="true" />
                  ) : (
                    <FileImage size={18} color="var(--success)" aria-hidden="true" />
                  )}
                  <div className="file-row-info">
                    <div className="file-row-name">{item.name}</div>
                    <div className="file-row-meta">
                      {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                      {formatBytes(item.sizeBytes)}
                    </div>
                  </div>
                  <div className="toolbar-group">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, -1)}
                      aria-label={`Move ${item.name} up`}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      disabled={idx === items.length - 1}
                      onClick={() => moveItem(idx, 1)}
                      aria-label={`Move ${item.name} down`}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <div className="field">
              <label htmlFor="merge-filename">Output filename</label>
              <input
                id="merge-filename"
                type="text"
                className="input"
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
              />
            </div>

            <div className="toolbar-group" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                disabled={busy || items.length === 0}
                onClick={() => handleMerge('workspace')}
              >
                <Combine size={15} aria-hidden="true" />
                <span>{busy ? 'Merging…' : 'Merge & Open in Studio'}</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || items.length === 0}
                onClick={() => handleMerge('download')}
              >
                <Download size={15} aria-hidden="true" />
                <span>{busy ? 'Merging…' : 'Merge & Download'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
