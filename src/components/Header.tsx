import { useEffect } from 'react';
import {
  Download,
  FileText,
  FolderOpen,
  Keyboard,
  Moon,
  Redo2,
  ShieldCheck,
  Sun,
  Undo2,
} from 'lucide-react';
import type { ActivePdfDocument } from '../types/pdf';
import { formatBytes } from '../engine/fileUtils';

interface HeaderProps {
  doc: ActivePdfDocument | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenFiles: (files: FileList | null) => void;
  onDownload: () => void;
  onResetHome: () => void;
  onOpenShortcuts: () => void;
}

function getSystemScheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyMetaScheme(value: string | null) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) return;
  meta.content = value === 'light' || value === 'dark' ? value : 'light dark';
}

export function Header({
  doc,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenFiles,
  onDownload,
  onResetHome,
  onOpenShortcuts,
}: HeaderProps) {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'color-scheme') {
        applyMetaScheme(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleToggleTheme = () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('color-scheme');
    } catch {
      stored = null;
    }

    const system = getSystemScheme();
    const currentRendered =
      stored === 'light' || stored === 'dark' ? stored : system;
    const target = currentRendered === 'dark' ? 'light' : 'dark';

    if (target === system) {
      try {
        localStorage.removeItem('color-scheme');
      } catch {
        // Ignore storage restrictions
      }
      applyMetaScheme(null);
    } else {
      try {
        localStorage.setItem('color-scheme', target);
      } catch {
        // Ignore storage restrictions
      }
      applyMetaScheme(target);
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="brand"
          onClick={onResetHome}
          title="FolioPDF Home"
        >
          <span className="brand-mark" aria-hidden="true">
            <FileText size={16} />
          </span>
          <span>FolioPDF</span>
        </button>

        {doc && (
          <div className="doc-pill" title={doc.name}>
            <span className="doc-pill-name">{doc.name}</span>
            <span className="doc-pill-meta">
              {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'} ·{' '}
              {formatBytes(doc.sizeBytes)}
            </span>
          </div>
        )}
      </div>

      <div className="header-center">
        <span
          className="privacy-badge"
          title="All PDF operations execute 100% locally in your browser. Files never leave your device."
        >
          <ShieldCheck size={14} aria-hidden="true" />
          <span>100% Local · Private</span>
        </span>
      </div>

      <div className="header-right">
        {doc && (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 size={16} />
            </button>
          </>
        )}

        <label className="btn" title="Open a PDF file">
          <FolderOpen size={15} aria-hidden="true" />
          <span>Open</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="visually-hidden"
            onChange={(e) => {
              onOpenFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>

        {doc && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onDownload}
            title="Download current PDF (Ctrl+S)"
          >
            <Download size={15} aria-hidden="true" />
            <span>Export PDF</span>
          </button>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={handleToggleTheme}
          title="Toggle color theme"
        >
          <span className="theme-icon-light">
            <Sun size={16} aria-hidden="true" />
            <span className="visually-hidden">Switch to light theme</span>
          </span>
          <span className="theme-icon-dark">
            <Moon size={16} aria-hidden="true" />
            <span className="visually-hidden">Switch to dark theme</span>
          </span>
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts & about"
          aria-label="Keyboard shortcuts and privacy details"
        >
          <Keyboard size={16} />
        </button>
      </div>
    </header>
  );
}
