# JT.pdf — 100% Local PDF Studio

JT.pdf is a privacy-first, client-side PDF studio built to replace paid PDF tools for teams. Every PDF operation runs completely on your own machine in the browser — documents never leave your device.

## Quick Install & Run (For Colleagues)

**Prerequisite:** [Node.js LTS](https://nodejs.org/) and Git.

```bash
git clone https://github.com/JB3261/JT.pdf.git
cd JT.pdf
npm install
npm run dev -- --open
```

- **Windows one-click launch:** After cloning, double-click **`start.bat`** (it automatically installs dependencies on first run and opens JT.pdf in your browser).
- **macOS / Linux:** Run `./start.sh`.

## Updating Later

Whenever new features (e.g. Annotate & Sign, OCR, Redaction) are added, colleagues just pull the latest version:

```bash
cd JT.pdf
git pull
npm install
```

## Features

### Core Studio (V1)
- **View & Read**: High-DPI PDF viewer (`pdfjs-dist` with bundled local worker), zoom controls, Fit Width, quick rotate, keyboard navigation.
- **Organize Pages**: Visual thumbnail grid with drag-and-drop reorder, batch selection (All / Odd / Even), rotate (`-90°` / `+90°`), duplicate, delete, insert blank pages, and extract selected pages.
- **Merge PDFs & Images**: Combine multiple PDFs and PNG/JPG/WebP images in any order, open directly in the studio or download immediately.
- **Split & Extract**: Extract custom page ranges (`1-3, 5, 8-10`), split every page, or split every N pages into a ZIP archive.
- **Compress & Optimize**: Lossless object-stream rebuild or Balanced / Maximum / Custom DPI + JPEG quality optimization with before/after size comparison.
- **Convert Images**: Images → PDF (A4, US Letter, or exact fit) and PDF → PNG/JPEG ZIP export.
- **Watermark & Page Numbers**: Customizable diagonal text watermarks and header/footer page numbering.
- **Properties**: Inspect and edit PDF Title, Author, Subject, Keywords, and Creator metadata.
- **Undo / Redo & Themes**: Full undo/redo history (`Ctrl+Z` / `Ctrl+Y`), export (`Ctrl+S`), and system-aware Light/Dark mode.

### Annotate, Sign & Forms (Phase 2)
- **Annotate & Sign**: Interactive page overlay with Highlight, Freehand Pen, Text Box, Sticky Notes, Boxes, Arrows, Stamps (`APPROVED`, `CONFIDENTIAL`, `DRAFT`, `REVIEWED`, `PAID`, `URGENT`), and drag-to-move/resize before burning cleanly into the PDF.
- **E-Signatures**: Draw on a touch/mouse pad, type with script presets, or upload a signature image — saved locally in the browser for quick reuse.
- **Fill Forms**: Automatically detects interactive PDF AcroForm fields (text inputs, checkboxes, dropdowns, radio groups) with optional **Flatten Form** to lock values permanently.

### Convert & Create (Phase 3)
- **Create PDF from Markdown / Word / Text**: Write or paste Markdown, or import `.docx` (via `mammoth`), `.md`, or `.txt` files to generate clean vector, selectable-text PDFs with customizable A4/Letter sizing and page numbers.
- **Export PDF → Word (`.docx`), Markdown (`.md`), or Plain Text (`.txt`)**: Extracts text cleanly per page and generates real OOXML `.docx` files directly in the browser.

### Edit, Redact, Security & Local OCR (Phase 4)
- **True Permanent Redaction**: Draw redaction boxes over sensitive text or images; redacted pages are rasterized with solid opaque black bars so hidden text cannot be copied or recovered.
- **Password Protection & Permissions**: 128-bit PDF encryption (`@pdfsmaller/pdf-encrypt-lite`) with Document Open password, Owner password, and granular Print / Copy / Modify / Annotate permission flags.
- **Sanitize Hidden Metadata**: One-click scrub of Author, Title, Subject, Keywords, Creator, Producer, and timestamps.
- **100% Local Browser OCR**: WebAssembly OCR (`tesseract.js`) supporting English, Portuguese, Spanish, French, and German — extracts text with confidence scores and optionally embeds an invisible searchable text layer to create a **Searchable PDF**.
