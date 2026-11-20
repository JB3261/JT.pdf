import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Eraser, PenTool, Trash2, Type, Upload, X } from 'lucide-react';
import type { SavedSignature } from '../types/pdf';

interface SignatureDialogProps {
  open: boolean;
  savedSignatures: SavedSignature[];
  onClose: () => void;
  onSelectSignature: (sig: SavedSignature) => void;
  onSaveSignature: (sig: SavedSignature) => void;
  onDeleteSignature: (id: string) => void;
}

const INK_COLORS = [
  { label: 'Black', value: '#0f172a' },
  { label: 'Navy', value: '#1e3a8a' },
  { label: 'Blue', value: '#2563eb' },
];

const TYPE_STYLES = [
  { label: 'Classic Script', font: 'italic 48px Georgia, "Times New Roman", serif' },
  { label: 'Handwritten', font: 'italic 50px "Segoe Script", "Brush Script MT", cursive' },
  { label: 'Clean Editorial', font: '600 40px "Segoe UI", system-ui, sans-serif' },
];

function trimCanvasToPng(canvas: HTMLCanvasElement): {
  dataUrl: string;
  aspectRatio: number;
} | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hasInk = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = imgData[(y * width + x) * 4 + 3];
      if (alpha > 10) {
        hasInk = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasInk) return null;
  const pad = 12;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(width - sx, maxX - minX + pad * 2);
  const sh = Math.min(height - sy, maxY - minY + pad * 2);

  const trimmed = document.createElement('canvas');
  trimmed.width = Math.max(1, sw);
  trimmed.height = Math.max(1, sh);
  const tctx = trimmed.getContext('2d');
  if (!tctx) return null;
  tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  return {
    dataUrl: trimmed.toDataURL('image/png'),
    aspectRatio: sw / Math.max(1, sh),
  };
}

export function SignatureDialog({
  open,
  savedSignatures,
  onClose,
  onSelectSignature,
  onSaveSignature,
  onDeleteSignature,
}: SignatureDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const padRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [inkColor, setInkColor] = useState('#0f172a');
  const [typedName, setTypedName] = useState('');
  const [typeStyleIdx, setTypeStyleIdx] = useState(0);
  const [uploadedSig, setUploadedSig] = useState<{
    dataUrl: string;
    aspectRatio: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: globalThis.PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      const onDown = (e: globalThis.PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: globalThis.PointerEvent) => {
        if (pressedOutside && isOutside(e)) dialog.close();
      };
      dialog.addEventListener('pointerdown', onDown);
      dialog.addEventListener('pointerup', onUp);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('pointerup', onUp);
      };
    }

    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const clearPad = () => {
    const canvas = padRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getPadPos = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = padRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const onPadDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPtRef.current = getPadPos(e);
  };

  const onPadMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !padRef.current || !lastPtRef.current) return;
    const ctx = padRef.current.getContext('2d');
    if (!ctx) return;
    const pt = getPadPos(e);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPtRef.current = pt;
  };

  const onPadUp = () => {
    drawingRef.current = false;
    lastPtRef.current = null;
  };

  const handleUploadImage = async (file: File | null) => {
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    setUploadedSig({
      dataUrl: canvas.toDataURL('image/png'),
      aspectRatio: canvas.width / Math.max(1, canvas.height),
      label: file.name,
    });
  };

  const handleUseSignature = () => {
    if (tab === 'draw') {
      const canvas = padRef.current;
      if (!canvas) return;
      const trimmed = trimCanvasToPng(canvas);
      if (!trimmed) return;
      const sig: SavedSignature = {
        id: crypto.randomUUID(),
        label: 'Drawn Signature',
        dataUrl: trimmed.dataUrl,
        aspectRatio: trimmed.aspectRatio,
      };
      onSaveSignature(sig);
      onSelectSignature(sig);
      clearPad();
      onClose();
      return;
    }

    if (tab === 'type') {
      const text = typedName.trim();
      if (!text) return;
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.font = TYPE_STYLES[typeStyleIdx].font;
      ctx.fillStyle = inkColor;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 24, 96);
      const trimmed = trimCanvasToPng(canvas);
      if (!trimmed) return;
      const sig: SavedSignature = {
        id: crypto.randomUUID(),
        label: text,
        dataUrl: trimmed.dataUrl,
        aspectRatio: trimmed.aspectRatio,
      };
      onSaveSignature(sig);
      onSelectSignature(sig);
      onClose();
      return;
    }

    if (tab === 'upload' && uploadedSig) {
      const sig: SavedSignature = {
        id: crypto.randomUUID(),
        label: uploadedSig.label,
        dataUrl: uploadedSig.dataUrl,
        aspectRatio: uploadedSig.aspectRatio,
      };
      onSaveSignature(sig);
      onSelectSignature(sig);
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      style={{ maxWidth: '580px' }}
      aria-labelledby="sig-dialog-title"
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="dialog-head">
        <h2 id="sig-dialog-title">Create or Pick E-Signature</h2>
        <form method="dialog">
          <button
            type="submit"
            className="btn btn-ghost btn-icon"
            aria-label="Close signature dialog"
          >
            <X size={16} />
          </button>
        </form>
      </div>

      <div className="dialog-body">
        {savedSignatures.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div className="sidebar-section-label" style={{ padding: '0 0 8px' }}>
              Saved Signatures (Stored Locally)
            </div>
            <div className="sig-saved-grid">
              {savedSignatures.map((sig) => (
                <div key={sig.id} className="sig-saved-card">
                  <button
                    type="button"
                    className="sig-saved-pick"
                    onClick={() => {
                      onSelectSignature(sig);
                      onClose();
                    }}
                    title={`Use "${sig.label}"`}
                  >
                    <img src={sig.dataUrl} alt={sig.label} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon sig-saved-del"
                    onClick={() => onDeleteSignature(sig.id)}
                    aria-label={`Delete saved signature ${sig.label}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="toolbar-group" style={{ marginBottom: '12px' }}>
          <button
            type="button"
            className={`btn btn-sm${tab === 'draw' ? ' btn-primary' : ''}`}
            onClick={() => setTab('draw')}
          >
            <PenTool size={14} aria-hidden="true" />
            <span>Draw</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tab === 'type' ? ' btn-primary' : ''}`}
            onClick={() => setTab('type')}
          >
            <Type size={14} aria-hidden="true" />
            <span>Type</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${tab === 'upload' ? ' btn-primary' : ''}`}
            onClick={() => setTab('upload')}
          >
            <Upload size={14} aria-hidden="true" />
            <span>Upload Image</span>
          </button>

          {tab !== 'upload' && (
            <div className="toolbar-group" style={{ marginLeft: 'auto' }}>
              {INK_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`color-swatch${inkColor === c.value ? ' is-active' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setInkColor(c.value)}
                  title={c.label}
                  aria-label={`Ink color ${c.label}`}
                />
              ))}
            </div>
          )}
        </div>

        {tab === 'draw' && (
          <div>
            <div className="sig-pad-wrap">
              <canvas
                ref={padRef}
                width={960}
                height={300}
                className="sig-pad-canvas"
                onPointerDown={onPadDown}
                onPointerMove={onPadMove}
                onPointerUp={onPadUp}
                onPointerCancel={onPadUp}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '8px',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Sign inside the box with your mouse, trackpad, or touch screen.
              </span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={clearPad}>
                <Eraser size={14} aria-hidden="true" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        )}

        {tab === 'type' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="field">
              <label htmlFor="typed-sig-name">Full name or initials</label>
              <input
                id="typed-sig-name"
                type="text"
                className="input"
                placeholder="e.g. Jubileu Tembe"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="radio-cards">
              {TYPE_STYLES.map((st, idx) => (
                <label key={st.label} className="radio-card">
                  <div className="radio-card-head">
                    <input
                      type="radio"
                      name="sig-type-style"
                      checked={typeStyleIdx === idx}
                      onChange={() => setTypeStyleIdx(idx)}
                    />
                    <span>{st.label}</span>
                  </div>
                  <div
                    style={{
                      font: st.font,
                      fontSize: '24px',
                      color: inkColor,
                      marginTop: '4px',
                      minHeight: '34px',
                    }}
                  >
                    {typedName.trim() || 'Your Signature'}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="dropzone" style={{ padding: '24px' }}>
              <Upload size={22} color="var(--brand)" aria-hidden="true" />
              <p style={{ margin: '8px 0 0' }}>
                Click to choose a PNG or JPG image of your signature
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="visually-hidden"
                onChange={(e) => handleUploadImage(e.target.files?.[0] ?? null)}
              />
            </label>
            {uploadedSig && (
              <div className="sig-pad-wrap" style={{ padding: '16px', textAlign: 'center' }}>
                <img
                  src={uploadedSig.dataUrl}
                  alt="Uploaded signature preview"
                  style={{ maxHeight: '110px', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dialog-foot">
        <form method="dialog">
          <button type="submit" className="btn">
            Cancel
          </button>
        </form>
        <button type="button" className="btn btn-primary" onClick={handleUseSignature}>
          Save &amp; Place Signature
        </button>
      </div>
    </dialog>
  );
}
