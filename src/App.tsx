import { useCallback, useEffect, useState } from 'react';
import type {
  ActivePdfDocument,
  MergeItem,
  ToastMessage,
  ToolId,
} from './types/pdf';
import { createBlankPdf, getPdfPageCount } from './engine/pdfOperations';
import { downloadBytes, readFileAsUint8Array } from './engine/fileUtils';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DropZone } from './components/DropZone';
import { ViewerPane } from './components/ViewerPane';
import { AnnotatePane } from './components/AnnotatePane';
import { FormsPane } from './components/FormsPane';
import { OrganizePane } from './components/OrganizePane';
import { MergePane } from './components/MergePane';
import { SplitPane } from './components/SplitPane';
import { CompressPane } from './components/CompressPane';
import { ConvertPane } from './components/ConvertPane';
import { EnhancePane } from './components/EnhancePane';
import { MetadataPane } from './components/MetadataPane';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ToastList } from './components/Toast';

export function App() {
  const [doc, setDoc] = useState<ActivePdfDocument | null>(null);
  const [undoStack, setUndoStack] = useState<ActivePdfDocument[]>([]);
  const [redoStack, setRedoStack] = useState<ActivePdfDocument[]>([]);
  const [activeTool, setActiveTool] = useState<ToolId>('view');
  const [mergeQueue, setMergeQueue] = useState<MergeItem[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback(
    (tone: ToastMessage['tone'], text: string) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, tone, text }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    },
    []
  );

  const loadNewDocument = useCallback(
    async (bytes: Uint8Array, name: string, switchTo: ToolId = 'view') => {
      const pageCount = await getPdfPageCount(bytes);
      const next: ActivePdfDocument = {
        id: crypto.randomUUID(),
        name,
        bytes,
        pageCount,
        sizeBytes: bytes.byteLength,
      };
      setDoc(next);
      setUndoStack([]);
      setRedoStack([]);
      setActiveTool(switchTo);
    },
    []
  );

  const updateActiveDocument = useCallback(
    async (bytes: Uint8Array, label: string) => {
      if (!doc) return;
      const pageCount = await getPdfPageCount(bytes);
      const next: ActivePdfDocument = {
        ...doc,
        id: crypto.randomUUID(),
        bytes,
        pageCount,
        sizeBytes: bytes.byteLength,
      };
      setUndoStack((prev) => [...prev.slice(-19), doc]);
      setRedoStack([]);
      setDoc(next);
      notify('success', label);
    },
    [doc, notify]
  );

  const handleUndo = useCallback(() => {
    if (!doc || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, doc]);
    setDoc(previous);
    notify('info', 'Undid last change.');
  }, [doc, undoStack, notify]);

  const handleRedo = useCallback(() => {
    if (!doc || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, doc]);
    setDoc(next);
    notify('info', 'Redid change.');
  }, [doc, redoStack, notify]);

  const handleDownload = useCallback(() => {
    if (!doc) return;
    downloadBytes(doc.bytes, doc.name);
    notify('success', `Downloaded "${doc.name}".`);
  }, [doc, notify]);

  const handleOpenPdfFile = useCallback(
    async (file: File) => {
      try {
        const bytes = await readFileAsUint8Array(file);
        await loadNewDocument(bytes, file.name, 'view');
        notify('success', `Opened "${file.name}".`);
      } catch (err: unknown) {
        notify(
          'error',
          `Could not open "${file.name}": ${
            err instanceof Error ? err.message : 'Invalid PDF'
          }`
        );
      }
    },
    [loadNewDocument, notify]
  );

  const handleOpenFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      await handleOpenPdfFile(files[0]);
    },
    [handleOpenPdfFile]
  );

  const handleStartMergeWithFiles = useCallback(
    async (files: File[]) => {
      const prepared: MergeItem[] = [];
      for (const file of files) {
        try {
          const bytes = await readFileAsUint8Array(file);
          const isPdf =
            file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          const isImg = file.type.startsWith('image/');
          if (!isPdf && !isImg) continue;
          const pageCount = isPdf ? await getPdfPageCount(bytes) : 1;
          prepared.push({
            id: crypto.randomUUID(),
            name: file.name,
            kind: isPdf ? 'pdf' : 'image',
            mimeType: file.type || (isPdf ? 'application/pdf' : 'image/png'),
            bytes,
            pageCount,
            sizeBytes: bytes.byteLength,
          });
        } catch {
          // Skip invalid files
        }
      }
      if (prepared.length > 0) {
        setMergeQueue(prepared);
        setActiveTool('merge');
      } else {
        notify('error', 'Please drop valid PDF or PNG/JPG/WebP image files.');
      }
    },
    [notify]
  );

  const handleCreateBlank = useCallback(async () => {
    const bytes = await createBlankPdf('a4');
    await loadNewDocument(bytes, 'untitled.pdf', 'organize');
    notify('success', 'Created a new blank A4 PDF.');
  }, [loadNewDocument, notify]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      } else if (key === 's') {
        e.preventDefault();
        handleDownload();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, handleDownload]);

  const renderMainContent = () => {
    if (activeTool === 'merge') {
      return (
        <MergePane
          activeDoc={doc}
          initialQueue={mergeQueue}
          onClearInitialQueue={() => setMergeQueue([])}
          onOpenMergedInWorkspace={(bytes, name) => loadNewDocument(bytes, name, 'view')}
          onNotify={notify}
        />
      );
    }

    if (activeTool === 'convert') {
      return (
        <ConvertPane
          doc={doc}
          onOpenConvertedPdf={(bytes, name) => loadNewDocument(bytes, name, 'view')}
          onNotify={notify}
        />
      );
    }

    if (!doc) {
      return (
        <DropZone
          onOpenPdfFile={handleOpenPdfFile}
          onStartMergeWithFiles={handleStartMergeWithFiles}
          onCreateBlankPdf={handleCreateBlank}
          onJumpToTool={(tool) => setActiveTool(tool)}
        />
      );
    }

    switch (activeTool) {
      case 'view':
        return (
          <ViewerPane
            doc={doc}
            onUpdateDocument={updateActiveDocument}
            onNotify={notify}
          />
        );
      case 'annotate':
        return (
          <AnnotatePane
            doc={doc}
            onUpdateDocument={updateActiveDocument}
            onNotify={notify}
          />
        );
      case 'forms':
        return (
          <FormsPane
            doc={doc}
            onUpdateDocument={updateActiveDocument}
            onJumpToTool={setActiveTool}
            onNotify={notify}
          />
        );
      case 'organize':
        return (
          <OrganizePane
            doc={doc}
            onUpdateDocument={updateActiveDocument}
            onNotify={notify}
          />
        );
      case 'split':
        return (
          <SplitPane
            doc={doc}
            onOpenExtractedInWorkspace={(bytes, name) =>
              loadNewDocument(bytes, name, 'view')
            }
            onNotify={notify}
          />
        );
      case 'compress':
        return (
          <CompressPane
            doc={doc}
            onUpdateDocument={updateActiveDocument}
            onNotify={notify}
          />
        );
      case 'enhance':
        return (
          <EnhancePane
            doc={doc}
            onUpdateDocument={updateActiveDocument}
            onNotify={notify}
          />
        );
      case 'metadata':
        return (
          <MetadataPane
            doc={doc}
            onUpdateDocument={updateActiveDocument}
            onNotify={notify}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-shell">
      <Header
        doc={doc}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenFiles={handleOpenFiles}
        onDownload={handleDownload}
        onResetHome={() => {
          setDoc(null);
          setUndoStack([]);
          setRedoStack([]);
          setActiveTool('view');
        }}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <div className="app-body">
        <Sidebar
          activeTool={activeTool}
          hasDocument={doc !== null}
          onSelectTool={setActiveTool}
        />
        <main className="app-main">{renderMainContent()}</main>
      </div>

      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <ToastList toasts={toasts} />
    </div>
  );
}
