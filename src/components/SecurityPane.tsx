import { useState, type FormEvent } from 'react';
import { Lock, ShieldCheck, Sparkles } from 'lucide-react';
import type { ActivePdfDocument } from '../types/pdf';
import {
  protectPdfWithPassword,
  sanitizePdfMetadata,
} from '../engine/pdfSecurity';
import { downloadBytes, stripExtension } from '../engine/fileUtils';

interface SecurityPaneProps {
  doc: ActivePdfDocument;
  onUpdateDocument: (bytes: Uint8Array, label: string) => void;
  onNotify: (tone: 'info' | 'success' | 'error', text: string) => void;
}

export function SecurityPane({
  doc,
  onUpdateDocument,
  onNotify,
}: SecurityPaneProps) {
  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(false);
  const [allowModifying, setAllowModifying] = useState(false);
  const [allowAnnotating, setAllowAnnotating] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleProtect = async (e: FormEvent) => {
    e.preventDefault();
    if (!userPassword && !ownerPassword) {
      onNotify('error', 'Enter a password to encrypt this PDF.');
      return;
    }
    setBusy(true);
    try {
      const encrypted = await protectPdfWithPassword(doc.bytes, {
        userPassword,
        ownerPassword,
        allowPrinting,
        allowCopying,
        allowModifying,
        allowAnnotating,
      });
      const outName = `${stripExtension(doc.name)}_protected.pdf`;
      downloadBytes(encrypted, outName);
      onNotify(
        'success',
        `Downloaded password-protected "${outName}" (128-bit encryption).`
      );
      setUserPassword('');
      setOwnerPassword('');
    } catch (err: unknown) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Encryption failed'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSanitize = async () => {
    setBusy(true);
    try {
      const cleaned = await sanitizePdfMetadata(doc.bytes);
      onUpdateDocument(cleaned, 'Stripped all hidden metadata from PDF');
    } catch (err: unknown) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Metadata sanitization failed'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane-scroll">
      <div className="pane-container">
        <div className="pane-header">
          <div>
            <h1>Protect &amp; Sanitize PDF</h1>
            <p>
              Encrypt “{doc.name}” with 128-bit password protection and permissions, or
              wipe hidden author &amp; creator metadata — 100% locally.
            </p>
          </div>
        </div>

        <form className="card" onSubmit={handleProtect}>
          <h2 className="card-title">Password Protection &amp; Permissions</h2>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="field">
              <label htmlFor="sec-user-pw">
                Document Open Password (required to open file)
              </label>
              <input
                id="sec-user-pw"
                type="password"
                className="input"
                autoComplete="new-password"
                placeholder="Enter password to open PDF"
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="sec-owner-pw">
                Permissions / Owner Password (optional)
              </label>
              <input
                id="sec-owner-pw"
                type="password"
                className="input"
                autoComplete="new-password"
                placeholder="Defaults to open password if blank"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '10px',
              marginBottom: '18px',
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={allowPrinting}
                onChange={(e) => setAllowPrinting(e.target.checked)}
              />
              <span>Allow printing</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={allowCopying}
                onChange={(e) => setAllowCopying(e.target.checked)}
              />
              <span>Allow copying text &amp; images</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={allowModifying}
                onChange={(e) => setAllowModifying(e.target.checked)}
              />
              <span>Allow editing document</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={allowAnnotating}
                onChange={(e) => setAllowAnnotating(e.target.checked)}
              />
              <span>Allow comments &amp; form filling</span>
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || (!userPassword && !ownerPassword)}
          >
            <Lock size={15} aria-hidden="true" />
            <span>{busy ? 'Encrypting…' : 'Encrypt & Download Protected PDF'}</span>
          </button>
        </form>

        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 className="card-title" style={{ marginBottom: '6px' }}>
                <ShieldCheck
                  size={16}
                  color="var(--success)"
                  style={{ verticalAlign: '-3px', marginRight: '6px' }}
                />
                Sanitize Hidden Metadata
              </h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '580px' }}>
                Clears embedded Author, Title, Subject, Keywords, Creator, Producer, and
                timestamps from the active PDF before sending externally.
              </p>
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={handleSanitize}
            >
              <Sparkles size={15} aria-hidden="true" />
              <span>Scrub Metadata</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
