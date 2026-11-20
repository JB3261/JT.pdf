import { useEffect, useRef } from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Light-dismiss fallback for browsers without native closedby support
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
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby="shortcuts-dialog-title"
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="dialog-head">
        <h2 id="shortcuts-dialog-title">Shortcuts &amp; Privacy</h2>
        <form method="dialog">
          <button
            type="submit"
            className="btn btn-ghost btn-icon"
            aria-label="Close dialog"
            autoFocus
          >
            <X size={16} />
          </button>
        </form>
      </div>

      <div className="dialog-body">
        <div
          style={{
            display: 'flex',
            gap: '10px',
            padding: '12px',
            borderRadius: '10px',
            background: 'var(--success-soft)',
            color: 'var(--text-primary)',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          <ShieldCheck
            size={20}
            color="var(--success)"
            style={{ flexShrink: 0, marginTop: '2px' }}
          />
          <div>
            <strong>Strict Local Processing</strong>
            <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
              FolioPDF runs completely inside your browser using local PDF engines. No
              files or metadata are ever transmitted over the network.
            </div>
          </div>
        </div>

        <div className="shortcut-row">
          <span>Undo last PDF change</span>
          <span>
            <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">Z</kbd>
          </span>
        </div>
        <div className="shortcut-row">
          <span>Redo PDF change</span>
          <span>
            <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">Y</kbd>
          </span>
        </div>
        <div className="shortcut-row">
          <span>Export / Download active PDF</span>
          <span>
            <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">S</kbd>
          </span>
        </div>
        <div className="shortcut-row">
          <span>Zoom in / out (in Viewer)</span>
          <span>
            <kbd className="kbd">+</kbd> / <kbd className="kbd">-</kbd>
          </span>
        </div>
        <div className="shortcut-row">
          <span>Previous / Next page (in Viewer)</span>
          <span>
            <kbd className="kbd">←</kbd> / <kbd className="kbd">→</kbd>
          </span>
        </div>
      </div>

      <div className="dialog-foot">
        <form method="dialog">
          <button type="submit" className="btn btn-primary">
            Done
          </button>
        </form>
      </div>
    </dialog>
  );
}
