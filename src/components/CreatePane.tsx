import { useState } from 'react';
import {
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FileUp,
} from 'lucide-react';
import type { ActivePdfDocument } from '../types/pdf';
import {
  buildDocxFromPages,
  docxBytesToText,
  extractPdfTextByPage,
  markdownToPdf,
} from '../engine/pdfCreator';
import {
  downloadBytes,
  readFileAsUint8Array,
  stripExtension,
} from '../engine/fileUtils';

interface CreatePaneProps {
  doc: ActivePdfDocument | null;
  onOpenCreatedPdf: (bytes: Uint8Array, name: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

const SAMPLE_MD = `# Project Status Brief

## Executive Summary
Write or paste Markdown here, or import a **.docx**, **.md**, or **.txt** file to generate a clean, selectable-text PDF completely offline.

## Key Highlights
- 100% local processing — documents never leave your machine
- Automatic word wrapping, headings, lists, blockquotes, and code blocks
- Instant export to A4 or US Letter PDF

> Tip: You can also export any open PDF below to Microsoft Word (.docx), Markdown (.md), or Plain Text (.txt).

---

### Next Steps
1. Review the draft content above
2. Adjust page size and typography settings
3. Click **Create & Open in Studio** to sign, watermark, or merge
`;

export function CreatePane({
  doc,
  onOpenCreatedPdf,
  onNotify,
}: CreatePaneProps) {
  const [title, setTitle] = useState('Untitled Document');
  const [markdown, setMarkdown] = useState(SAMPLE_MD);
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [fontSize, setFontSize] = useState(11);
  const [includePageNumbers, setIncludePageNumbers] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleImportSource = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.docx')) {
        const bytes = await readFileAsUint8Array(file);
        const extracted = await docxBytesToText(bytes);
        setMarkdown(extracted || '(Empty document)');
        setTitle(stripExtension(file.name));
        onNotify('success', `Imported Word document "${file.name}".`);
      } else {
        const text = await file.text();
        setMarkdown(text);
        setTitle(stripExtension(file.name));
        onNotify('success', `Imported "${file.name}".`);
      }
    } catch (err: unknown) {
      onNotify(
        'error',
        `Import failed: ${err instanceof Error ? err.message : 'Unsupported file'}`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGeneratePdf = async (openInStudio: boolean) => {
    if (!markdown.trim()) {
      onNotify('error', 'Enter some text or import a document first.');
      return;
    }
    setBusy(true);
    try {
      const pdfBytes = await markdownToPdf(markdown, {
        title,
        pageSize,
        fontSize,
        includePageNumbers,
      });
      const filename = `${(title.trim() || 'document').replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
      if (openInStudio) {
        onOpenCreatedPdf(pdfBytes, filename);
        onNotify('success', `Created "${filename}" and opened in Studio.`);
      } else {
        downloadBytes(pdfBytes, filename);
        onNotify('success', `Downloaded "${filename}".`);
      }
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'PDF creation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExportActivePdf = async (format: 'docx' | 'md' | 'txt') => {
    if (!doc) return;
    setBusy(true);
    try {
      const pages = await extractPdfTextByPage(doc.bytes);
      const stem = stripExtension(doc.name);

      if (format === 'docx') {
        const blob = await buildDocxFromPages(pages, stem);
        downloadBytes(
          blob,
          `${stem}.docx`,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        onNotify('success', `Exported "${stem}.docx" for Microsoft Word.`);
      } else if (format === 'md') {
        const md = pages
          .map((p, idx) => `## Page ${idx + 1}\n\n${p}`)
          .join('\n\n---\n\n');
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        downloadBytes(blob, `${stem}.md`, 'text/markdown');
        onNotify('success', `Exported "${stem}.md".`);
      } else {
        const txt = pages.join('\n\n--- Page Break ---\n\n');
        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        downloadBytes(blob, `${stem}.txt`, 'text/plain');
        onNotify('success', `Exported "${stem}.txt".`);
      }
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Create &amp; Export Documents</h1>
            <p>
              Create clean vector PDFs from Markdown, Plain Text, or Word (.docx) files,
              or convert your active PDF back into Word (.docx), Markdown, or Text.
            </p>
          </div>

          <label className="btn">
            <FileUp size={15} aria-hidden="true" />
            <span>Import .docx / .md / .txt</span>
            <input
              type="file"
              accept=".docx,.md,.markdown,.txt,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="visually-hidden"
              onChange={(e) => {
                handleImportSource(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <div className="card">
          <h2 className="card-title">Create PDF from Markdown / Word / Text</h2>
          <div className="form-grid" style={{ marginBottom: '14px' }}>
            <div className="field">
              <label htmlFor="create-title">Document title &amp; filename</label>
              <input
                id="create-title"
                type="text"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="create-page-size">Page size</label>
              <select
                id="create-page-size"
                className="select"
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as 'a4' | 'letter')}
              >
                <option value="a4">A4 (210 × 297 mm)</option>
                <option value="letter">US Letter (8.5 × 11 in)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="create-font-size">Body font size: {fontSize} pt</label>
              <input
                id="create-font-size"
                type="range"
                min={9}
                max={16}
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: '12px' }}>
            <label htmlFor="create-markdown">Document content (Markdown supported)</label>
            <textarea
              id="create-markdown"
              className="input"
              rows={12}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px',
                resize: 'vertical',
                lineHeight: 1.55,
              }}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={includePageNumbers}
                onChange={(e) => setIncludePageNumbers(e.target.checked)}
              />
              <span>Include footer page numbers</span>
            </label>

            <div className="toolbar-group">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => handleGeneratePdf(true)}
              >
                <FilePlus2 size={15} aria-hidden="true" />
                <span>Create &amp; Open in Studio</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => handleGeneratePdf(false)}
              >
                <Download size={15} aria-hidden="true" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Export Active PDF → Word / Markdown / Text</h2>
          {!doc ? (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Open a PDF first to export its text content to Microsoft Word (.docx),
              Markdown (.md), or Plain Text (.txt).
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Extracts selectable text from all {doc.pageCount} pages of “{doc.name}”.
                For scanned (image-only) PDFs, run <strong>Local OCR</strong> first.
              </p>
              <div className="toolbar-group">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => handleExportActivePdf('docx')}
                >
                  <FileText size={15} aria-hidden="true" />
                  <span>Export to Word (.docx)</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => handleExportActivePdf('md')}
                >
                  <FileCode2 size={15} aria-hidden="true" />
                  <span>Export to Markdown (.md)</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => handleExportActivePdf('txt')}
                >
                  <Download size={15} aria-hidden="true" />
                  <span>Export to Text (.txt)</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
