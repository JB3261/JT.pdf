const { app, BrowserWindow, Menu, net, protocol } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Register a privileged custom scheme so ES modules, pdf.js workers, and WASM
// work 100% offline with zero open localhost TCP ports.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'jtpdf',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const DIST_DIR = path.join(__dirname, '..', 'dist');

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 920,
    minHeight: 620,
    title: 'JT.pdf — Built for Bayport',
    backgroundColor: '#0b1120',
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Lock navigation strictly to our local app origin
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('jtpdf://app/')) {
      event.preventDefault();
    }
  });

  const menuTemplate = [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit JT.pdf' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  win.loadURL('jtpdf://app/index.html');
}

app.whenReady().then(() => {
  protocol.handle('jtpdf', (request) => {
    const url = new URL(request.url);
    let relPath = decodeURIComponent(url.pathname);
    if (relPath === '/' || relPath === '') {
      relPath = '/index.html';
    }
    const targetPath = path.normalize(path.join(DIST_DIR, relPath));

    // Prevent directory traversal outside dist/
    if (!targetPath.startsWith(DIST_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(targetPath).toString());
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
