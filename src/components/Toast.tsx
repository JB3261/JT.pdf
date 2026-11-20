import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ToastMessage } from '../types/pdf';

interface ToastProps {
  toasts: ToastMessage[];
}

export function ToastList({ toasts }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast is-${t.tone}`}>
          {t.tone === 'success' && <CheckCircle2 size={16} color="var(--success)" />}
          {t.tone === 'error' && <AlertCircle size={16} color="var(--danger)" />}
          {t.tone === 'info' && <Info size={16} color="var(--brand)" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
