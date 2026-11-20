import { useEffect, useState, type FormEvent } from 'react';
import { CheckSquare, PenTool, Save } from 'lucide-react';
import type { AcroFormFieldInfo, ActivePdfDocument, ToolId } from '../types/pdf';
import { applyAcroFormValues, readAcroFormFields } from '../engine/pdfAnnotations';

interface FormsPaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onJumpToTool: (tool: ToolId) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function FormsPane({
  doc,
  onUpdateDocument,
  onJumpToTool,
  onNotify,
}: FormsPaneProps) {
  const [fields, setFields] = useState<AcroFormFieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    readAcroFormFields(doc.bytes)
      .then((detected) => {
        if (cancelled) return;
        setFields(detected);
        const initial: Record<string, string | boolean> = {};
        detected.forEach((f) => {
          initial[f.name] = f.value;
        });
        setValues(initial);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFields([]);
          setLoading(false);
          onNotify(
            'error',
            err instanceof Error ? err.message : 'Unable to inspect PDF form fields'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [doc.bytes, onNotify]);

  const handleApply = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await applyAcroFormValues(doc.bytes, values, flatten);
      onUpdateDocument(
        updated,
        flatten
          ? 'Filled and flattened PDF form fields'
          : 'Updated PDF form fields'
      );
    } catch (err: unknown) {
      onNotify('error', err instanceof Error ? err.message : 'Failed to fill form');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Fill PDF Forms</h1>
            <p>
              Automatically detects interactive PDF form fields (text boxes, checkboxes,
              dropdowns, radio groups) and optionally flattens them before sharing.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="card">Scanning document for interactive form fields…</div>
        ) : fields.length === 0 ? (
          <div className="card">
            <h2 className="card-title">No Interactive Form Fields Detected</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              “{doc.name}” appears to be a flat (non-AcroForm) PDF. You can still fill
              and sign it effortlessly using Text Boxes, Checkmarks, Stamps, and
              E-Signatures in the Annotate &amp; Sign studio.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onJumpToTool('annotate')}
            >
              <PenTool size={15} aria-hidden="true" />
              <span>Open in Annotate &amp; Sign</span>
            </button>
          </div>
        ) : (
          <form className="card" onSubmit={handleApply}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <h2 className="card-title" style={{ margin: 0 }}>
                <CheckSquare
                  size={16}
                  style={{ verticalAlign: '-3px', marginRight: '6px' }}
                />
                {fields.length} Interactive {fields.length === 1 ? 'Field' : 'Fields'}
              </h2>

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
                  checked={flatten}
                  onChange={(e) => setFlatten(e.target.checked)}
                />
                <span>Flatten form (lock fields permanently)</span>
              </label>
            </div>

            <div className="form-grid">
              {fields.map((field) => {
                const val = values[field.name];
                if (field.kind === 'checkbox') {
                  return (
                    <div key={field.name} className="field">
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          paddingTop: '10px',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={field.readOnly}
                          checked={Boolean(val)}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [field.name]: e.target.checked,
                            }))
                          }
                        />
                        <span>{field.name}</span>
                      </label>
                    </div>
                  );
                }

                if (
                  (field.kind === 'dropdown' || field.kind === 'radio') &&
                  field.options
                ) {
                  return (
                    <div key={field.name} className="field">
                      <label htmlFor={`acro-${field.name}`}>{field.name}</label>
                      <select
                        id={`acro-${field.name}`}
                        className="select"
                        disabled={field.readOnly}
                        value={String(val ?? '')}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                      >
                        <option value="">— Select —</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                return (
                  <div key={field.name} className="field">
                    <label htmlFor={`acro-${field.name}`}>{field.name}</label>
                    <input
                      id={`acro-${field.name}`}
                      type="text"
                      className="input"
                      disabled={field.readOnly || field.kind === 'unknown'}
                      value={String(val ?? '')}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.name]: e.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '18px' }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                <Save size={15} aria-hidden="true" />
                <span>{busy ? 'Applying…' : 'Apply Form Values to PDF'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
