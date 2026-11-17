/**
 * Electron main process: window, native menu (File > Open Workspace), IPC bridge to AtsService
 * and the privileged `ats://` protocol that streams project files / thumbnails to the renderer.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AtsService } from '../core/service';
import { RPC_METHODS, type RpcMethod } from '../shared/rpc';

const here = path.dirname(fileURLToPath(import.meta.url));

protocol.registerSchemesAsPrivileged([
  { scheme: 'ats', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

let win: BrowserWindow | null = null;
let service: AtsService;

async function openWorkspaceDialog() {
  const r = await dialog.showOpenDialog(win!, {
    title: 'Open Unity project (folder that contains Assets/)',
    properties: ['openDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try {
    return await service.openWorkspace(r.filePaths[0]);
  } catch (e) {
    dialog.showErrorBox('Cannot open workspace', (e as Error).message);
    return null;
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Workspace…', accelerator: 'CmdOrCtrl+O', click: () => void openWorkspaceDialog() },
        { label: 'Rescan Assets', accelerator: 'F5', click: () => void service.rescan() },
        { type: 'separator' },
        {
          label: 'Reveal ATS_Backup',
          click: async () => {
            const ws = await service.getWorkspace();
            if (ws) void shell.openPath(path.join(ws.root, 'ATS_Backup'));
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo Last Operation',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: async () => {
            try {
              await service.undoOperation();
            } catch (e) {
              dialog.showErrorBox('Undo', (e as Error).message);
            }
          },
        },
        { type: 'separator' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#09090b',
    title: 'Asset Transformation Service',
    webPreferences: {
      preload: path.join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(path.join(here, '../renderer/index.html'));
  win.on('closed', () => (win = null));
}

app.whenReady().then(() => {
  service = new AtsService({ appDataDir: app.getPath('userData') });
  service.on((e) => win?.webContents.send('ats:event', e));

  protocol.handle('ats', async (req) => {
    try {
      const url = new URL(req.url);
      if (url.host === 'thumb') {
        const t = await service.getThumbnail(Number(url.pathname.slice(1)));
        return t ? net.fetch(pathToFileURL(t.path).toString()) : new Response(null, { status: 404 });
      }
      if (url.host === 'file') {
        const rel = url.pathname.slice(1).split('/').map(decodeURIComponent).join('/');
        const r = await service.resolveFile(rel, url.searchParams.get('as') ?? undefined);
        if (r.buffer) return new Response(new Uint8Array(r.buffer), { headers: { 'content-type': r.mime } });
        const res = await net.fetch(pathToFileURL(r.path!).toString(), { headers: req.headers });
        return new Response(res.body, { status: res.status, headers: { 'content-type': r.mime, 'access-control-allow-origin': '*' } });
      }
      return new Response(null, { status: 404 });
    } catch (e) {
      return new Response((e as Error).message, { status: 500 });
    }
  });

  ipcMain.handle('ats:rpc', async (_e, method: RpcMethod, args: unknown[]) => {
    if (!RPC_METHODS.includes(method)) throw new Error(`Unknown method ${method}`);
    return (service[method] as (...a: unknown[]) => Promise<unknown>)(...(args ?? []));
  });
  ipcMain.handle('ats:openDialog', () => openWorkspaceDialog());

  buildMenu();
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', async () => {
  await service?.close();
  if (process.platform !== 'darwin') app.quit();
});
