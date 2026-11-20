# FolioPDF — 100% Local PDF Studio

FolioPDF is a privacy-first, client-side PDF studio built to replace paid PDF tools for teams. Every PDF operation runs completely on your own machine in the browser — documents never leave your device.

## Quick Install & Run (For Colleagues)

**Prerequisite:** [Node.js LTS](https://nodejs.org/) and Git.

```bash
git clone https://github.com/JB3261/foliopdf.git
cd foliopdf
npm install
npm run dev -- --open
```

- **Windows one-click launch:** After cloning, double-click **`start.bat`** (it automatically installs dependencies on first run and opens FolioPDF in your browser).
- **macOS / Linux:** Run `./start.sh`.

## Updating Later

Whenever new features (e.g. Annotate & Sign, OCR, Redaction) are added, colleagues just pull the latest version:

```bash
cd foliopdf
git pull
npm install
```

## Features (V1 — Core Studio)

- **View & Read**: High-DPI PDF viewer (`pdfjs-dist` with bundled local worker), zoom controls, Fit Width, quick rotate, keyboard navigation.
- **Organize Pages**: Visual thumbnail grid with drag-and-drop reorder, batch selection (All / Odd / Even), rotate (`-90°` / `+90°`), duplicate, delete, insert blank pages, and extract selected pages.
- **Merge PDFs & Images**: Combine multiple PDFs and PNG/JPG/WebP images in any order, open directly in the studio or download immediately.
- **Split & Extract**: Extract custom page ranges (`1-3, 5, 8-10`), split every page, or split every N pages into a ZIP archive.
- **Compress & Optimize**: Lossless object-stream rebuild or Balanced / Maximum / Custom DPI + JPEG quality optimization with before/after size comparison.
- **Convert Images**: Images → PDF (A4, US Letter, or exact fit) and PDF → PNG/JPEG ZIP export.
- **Watermark & Page Numbers**: Customizable diagonal text watermarks and header/footer page numbering.
- **Properties**: Inspect and edit PDF Title, Author, Subject, Keywords, and Creator metadata.
- **Undo / Redo & Themes**: Full undo/redo history (`Ctrl+Z` / `Ctrl+Y`), export (`Ctrl+S`), and system-aware Light/Dark mode.

## Planned Roadmap

- **Phase 2 — Annotate & Sign**: Highlight, underline, freehand ink, sticky notes, stamps, e-signatures, interactive AcroForm filling.
- **Phase 3 — Convert & Create**: Markdown/HTML → PDF, Office document conversions.
- **Phase 4 — Edit & Security**: Redaction, password encryption/decryption, local browser OCR (Tesseract.js WASM).
