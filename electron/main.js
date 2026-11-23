// OpenImage — casca desktop (Electron). Sobe o servidor local embutido e abre a
// interface numa janela própria, sem navegador.
import { app, BrowserWindow, Menu, shell, screen } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { startServer } from '../server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ICON = join(HERE, '..', 'build', 'icon.png');
const PORT = 3210; // porta fixa: localStorage/IndexedDB são presos à origem (localhost:porta)
const APP_ID = 'openimage';

// AppImage não consegue instalar o chrome-sandbox com setuid; sem isso o Chromium
// aborta em distros com userns restrito. O app só carrega conteúdo local.
app.commandLine.appendSwitch('no-sandbox');
app.setName('OpenImage');

if (!app.requestSingleInstanceLock()) app.quit();

let win;
let origin;

// ---------- estado da janela ----------
const stateFile = () => join(app.getPath('userData'), 'window-state.json');
const loadState = () => {
  try { return JSON.parse(readFileSync(stateFile(), 'utf8')); } catch { return {}; }
};
const saveState = () => {
  if (!win || win.isDestroyed()) return;
  try {
    writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() }));
  } catch { /* ignora */ }
};

// ---------- integração com o menu do sistema (só quando rodando como AppImage) ----------
function integrateDesktop() {
  const appimage = process.env.APPIMAGE;
  if (!appimage || process.platform !== 'linux') return;
  try {
    const share = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'));
    const appsDir = join(share, 'applications');
    mkdirSync(appsDir, { recursive: true });
    // Ícone em vários tamanhos no tema hicolor; o .desktop aponta para o caminho absoluto
    // do maior, assim o GNOME não depende de cache de ícones.
    for (const sz of [48, 64, 128, 256, 512]) {
      const dir = join(share, 'icons', 'hicolor', `${sz}x${sz}`, 'apps');
      mkdirSync(dir, { recursive: true });
      copyFileSync(join(HERE, '..', 'build', `icon-${sz}.png`), join(dir, `${APP_ID}.png`));
    }
    const iconDst = join(share, 'icons', 'hicolor', '512x512', 'apps', `${APP_ID}.png`);
    const desktop = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=OpenImage',
      'GenericName=Gerador de imagens',
      'Comment=Gerador de imagens com Cloudflare Workers AI',
      'Comment[pt_BR]=Gerador de imagens com Cloudflare Workers AI',
      `Exec="${appimage}" %U`,
      `Icon=${iconDst}`,
      'Terminal=false',
      'Categories=Graphics;2DGraphics;',
      'Keywords=image;ai;flux;cloudflare;imagem;',
      `StartupWMClass=${APP_ID}`,
      '',
    ].join('\n');
    const dst = join(appsDir, `${APP_ID}.desktop`);
    let cur = '';
    try { cur = readFileSync(dst, 'utf8'); } catch { /* novo */ }
    if (cur !== desktop) {
      writeFileSync(dst, desktop, { mode: 0o755 });
      spawn('update-desktop-database', [appsDir], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    }
  } catch (e) {
    console.error('Integração com o menu falhou:', e.message);
  }
}

// ---------- janela ----------
function createWindow() {
  const st = loadState();
  const wa = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(st.width || 1280, wa.width),
    height: Math.min(st.height || 860, wa.height),
    ...(Number.isFinite(st.x) && Number.isFinite(st.y) ? { x: st.x, y: st.y } : {}),
    minWidth: 380,
    minHeight: 560,
    title: 'OpenImage',
    icon: ICON,
    backgroundColor: '#0c0e0d',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.on('page-title-updated', (e) => e.preventDefault()); // título fixo: OpenImage
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveState);

  // Links externos abrem no navegador padrão; a app nunca navega para fora.
  const isLocal = (u) => u.startsWith(origin);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isLocal(url)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.loadURL(origin);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await startServer(PORT);
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    // Porta ocupada por outro programa: cai para uma porta livre (o histórico local
    // fica associado à porta, então esse caso é só um plano B).
    const s = await startServer(0);
    origin = `http://127.0.0.1:${s.address().port}`;
  }
  origin ||= `http://localhost:${PORT}`;
  integrateDesktop();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
