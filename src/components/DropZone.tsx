import { useState, type DragEvent } from 'react';
import { Combine, FileImage, FilePlus2, FileUp, ShieldCheck } from 'lucide-react';
import type { ToolId } from '../types/pdf';

interface DropZoneProps {
  onOpenPdfFile: (file: File) => void;
  onStartMergeWithFiles: (files: File[]) => void;
  onCreateBlankPdf: () => void;
  onJumpToTool: (tool: ToolId) => void;
}

export function DropZone({
  onOpenPdfFile,
  onStartMergeWithFiles,
  onCreateBlankPdf,
  onJumpToTool,
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (files.length === 1 && files[0].type === 'application/pdf') {
      onOpenPdfFile(files[0]);
      return;
    }
    onStartMergeWithFiles(files);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="landing-wrap">
      <div className="landing-inner">
        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="dropzone-icon" aria-hidden="true">
            <FileUp size={28} />
          </div>
          <h2>Drop your PDF or images here</h2>
          <p>
            Open a single PDF to view, organize, split, or compress — or drop multiple
            PDFs/images to merge them instantly.
          </p>

          <label className="btn btn-primary">
            <FileUp size={15} aria-hidden="true" />
            <span>Choose PDF or Images</span>
            <input
              type="file"
              accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
              multiple
              className="visually-hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <div className="quick-actions-grid">
          <button
            type="button"
            className="quick-action-card"
            onClick={() => onJumpToTool('merge')}
          >
            <Combine size={20} color="var(--brand)" aria-hidden="true" />
            <strong>Merge PDFs</strong>
            <span>Combine multiple PDFs or images in any order.</span>
          </button>

          <button
            type="button"
            className="quick-action-card"
            onClick={() => onJumpToTool('convert')}
          >
            <FileImage size={20} color="var(--brand)" aria-hidden="true" />
            <strong>Images to PDF</strong>
            <span>Turn PNG, JPG, or WebP scans into a clean PDF.</span>
          </button>

          <button
            type="button"
            className="quick-action-card"
            onClick={onCreateBlankPdf}
          >
            <FilePlus2 size={20} color="var(--brand)" aria-hidden="true" />
            <strong>New Blank PDF</strong>
            <span>Start with a fresh A4 page and build from scratch.</span>
          </button>

          <div className="quick-action-card" style={{ cursor: 'default' }}>
            <ShieldCheck size={20} color="var(--success)" aria-hidden="true" />
            <strong>100% Client-Side</strong>
            <span>No servers, no accounts, no document uploads.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
