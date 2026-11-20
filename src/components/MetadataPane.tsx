import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import type { ActivePdfDocument, PdfMetadataInfo } from '../types/pdf';
import { readMetadata, writeMetadata } from '../engine/pdfOperations';

interface MetadataPaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const EMPTY_META: PdfMetadataInfo = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
};

export function MetadataPane({
  doc,
  onUpdateDocument,
  onNotify,
}: MetadataPaneProps) {
  const [meta, setMeta] = useState<PdfMetadataInfo>(EMPTY_META);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readMetadata(doc.bytes)
      .then((info) => {
        if (!cancelled) setMeta(info);
      })
      .catch(() => {
        if (!cancelled) setMeta(EMPTY_META);
      });
    return () => {
      cancelled = true;
    };
  }, [doc.bytes]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await writeMetadata(doc.bytes, meta);
      onUpdateDocument(updated, 'Updated PDF document properties');
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to update metadata');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Document Properties</h1>
            <p>
              Inspect and edit embedded PDF metadata before sharing your file with
              colleagues or clients.
            </p>
          </div>
        </div>

        <form className="card" onSubmit={handleSave}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="meta-title">Title</label>
              <input
                id="meta-title"
                type="text"
                className="input"
                value={meta.title}
                onChange={(e) => setMeta({ ...meta, title: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="meta-author">Author</label>
              <input
                id="meta-author"
                type="text"
                className="input"
                value={meta.author}
                onChange={(e) => setMeta({ ...meta, author: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="meta-subject">Subject</label>
              <input
                id="meta-subject"
                type="text"
                className="input"
                value={meta.subject}
                onChange={(e) => setMeta({ ...meta, subject: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="meta-keywords">Keywords (comma-separated)</label>
              <input
                id="meta-keywords"
                type="text"
                className="input"
                value={meta.keywords}
                onChange={(e) => setMeta({ ...meta, keywords: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="meta-creator">Creator Application</label>
              <input
                id="meta-creator"
                type="text"
                className="input"
                value={meta.creator}
                onChange={(e) => setMeta({ ...meta, creator: e.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="meta-producer">PDF Producer (read-only)</label>
              <input
                id="meta-producer"
                type="text"
                className="input"
                value={meta.producer}
                disabled
              />
            </div>
          </div>

          <div style={{ marginTop: '18px' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <Save size={15} aria-hidden="true" />
              <span>{busy ? 'Saving…' : 'Save Properties'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
