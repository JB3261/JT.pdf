import {
  CheckSquare,
  Combine,
  Eye,
  EyeOff,
  FileCode2,
  FileImage,
  FileSliders,
  LayoutGrid,
  Lock,
  Minimize2,
  PenTool,
  ScanText,
  Scissors,
  Stamp,
} from 'lucide-react';
import type { ToolId } from '../types/pdf';

interface SidebarProps {
  activeTool: ToolId;
  hasDocument: boolean;
  onSelectTool: (tool: ToolId) => void;
}

interface NavEntry {
  id: ToolId;
  label: string;
  icon: typeof Eye;
  requiresDoc: boolean;
}

const CORE_TOOLS: NavEntry[] = [
  { id: 'view', label: 'View & Read', icon: Eye, requiresDoc: true },
  { id: 'annotate', label: 'Annotate & Sign', icon: PenTool, requiresDoc: true },
  { id: 'forms', label: 'Fill Forms', icon: CheckSquare, requiresDoc: true },
  { id: 'organize', label: 'Organize Pages', icon: LayoutGrid, requiresDoc: true },
  { id: 'merge', label: 'Merge PDFs', icon: Combine, requiresDoc: false },
  { id: 'split', label: 'Split & Extract', icon: Scissors, requiresDoc: true },
  { id: 'compress', label: 'Compress PDF', icon: Minimize2, requiresDoc: true },
];

const CREATE_CONVERT_TOOLS: NavEntry[] = [
  { id: 'create', label: 'Create / Word & MD', icon: FileCode2, requiresDoc: false },
  { id: 'convert', label: 'Convert Images', icon: FileImage, requiresDoc: false },
  { id: 'enhance', label: 'Watermark & Numbers', icon: Stamp, requiresDoc: true },
];

const SECURITY_OCR_TOOLS: NavEntry[] = [
  { id: 'redact', label: 'Redact Sensitive', icon: EyeOff, requiresDoc: true },
  { id: 'security', label: 'Protect & Sanitize', icon: Lock, requiresDoc: true },
  { id: 'ocr', label: 'Local OCR', icon: ScanText, requiresDoc: true },
  { id: 'metadata', label: 'Properties', icon: FileSliders, requiresDoc: true },
];

export function Sidebar({ activeTool, hasDocument, onSelectTool }: SidebarProps) {
  const renderList = (items: NavEntry[]) => (
    <div className="nav-list">
      {items.map((item) => {
        const Icon = item.icon;
        const disabled = item.requiresDoc && !hasDocument;
        return (
          <button
            key={item.id}
            type="button"
            className="nav-item"
            disabled={disabled}
            aria-current={activeTool === item.id ? 'page' : undefined}
            onClick={() => onSelectTool(item.id)}
            title={disabled ? 'Open a PDF first to use this tool' : item.label}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <aside className="app-sidebar" aria-label="PDF tools">
      <div>
        <div className="sidebar-section-label">Core Studio</div>
        {renderList(CORE_TOOLS)}

        <div className="sidebar-section-label">Create &amp; Convert</div>
        {renderList(CREATE_CONVERT_TOOLS)}

        <div className="sidebar-section-label">Security &amp; OCR</div>
        {renderList(SECURITY_OCR_TOOLS)}
      </div>

      <div className="sidebar-footer">
        <strong>Zero-Upload Privacy</strong>
        Every page is processed in-memory on your device. Works offline once loaded.
      </div>
    </aside>
  );
}
