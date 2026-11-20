export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export function downloadBytes(
  bytes: Uint8Array | Blob,
  filename: string,
  mimeType = 'application/pdf'
): void {
  const blob =
    bytes instanceof Blob ? bytes : new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * Parses human-readable 1-based page ranges like "1-3, 5, 8-10"
 * into deduplicated 0-based page indices sorted in order of appearance.
 */
export function parsePageRanges(input: string, maxPages: number): number[] {
  const cleaned = input.trim();
  if (!cleaned) return [];

  const result: number[] = [];
  const seen = new Set<number>();
  const parts = cleaned.split(',');

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(maxPages, parseInt(rangeMatch[2], 10));
      if (start <= end) {
        for (let p = start; p <= end; p++) {
          const idx = p - 1;
          if (!seen.has(idx)) {
            seen.add(idx);
            result.push(idx);
          }
        }
      } else {
        for (let p = start; p >= end; p--) {
          if (p <= maxPages && p >= 1) {
            const idx = p - 1;
            if (!seen.has(idx)) {
              seen.add(idx);
              result.push(idx);
            }
          }
        }
      }
      continue;
    }

    const singleMatch = /^(\d+)$/.exec(part);
    if (singleMatch) {
      const p = parseInt(singleMatch[1], 10);
      if (p >= 1 && p <= maxPages) {
        const idx = p - 1;
        if (!seen.has(idx)) {
          seen.add(idx);
          result.push(idx);
        }
      }
      continue;
    }

    throw new Error(`Invalid page token "${part}". Use formats like "1-3, 5, 8-10".`);
  }

  return result;
}

export function hexToRgbUnit(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}
