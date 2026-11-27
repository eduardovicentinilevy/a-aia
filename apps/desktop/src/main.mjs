// Electron "main process" of the AçaIA desktop app.
// It starts the AçaIA API inside this process (listening only on 127.0.0.1, SQLite file in the
// user's AppData folder) and opens a window on it. On the first run it asks for the Gemini key.
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, safeStorage, shell } from 'electron';
import { appendLogLine, checkApiKey, DEFAULT_MODEL, isConfigured, readSettings, serverEnv, writeSettings } from './settings.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const ICON = join(appRoot, 'resources', 'icon.png');
/** The chat site: next to the app when installed, in build/ while developing. */
const WEB_DIR = app.isPackaged ? join(process.resourcesPath, 'web') : join(appRoot, 'build', 'web');

const userDataDir = app.getPath('userData'); // e.g. C:\Users\<you>\AppData\Roaming\AçaIA
const settingsFile = join(userDataDir, 'settings.json');
const logFile = join(userDataDir, 'logs', 'acaia.log');

/** @type {{ url: string, close: () => Promise<void> } | null} */
let server = null;
/** @type {BrowserWindow|null} */
let mainWindow = null;
/** @type {BrowserWindow|null} */
let setupWindow = null;

const background = () => (nativeTheme.shouldUseDarkColors ? '#110517' : '#fcf8fe');

// Only one AçaIA at a time (two would fight over the same database file).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = mainWindow ?? setupWindow;
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(start);
}

async function start() {
  Menu.setApplicationMenu(buildMenu());
  const settings = readSettings(settingsFile, safeStorage);
  if (isConfigured(settings)) await openMain();
  else openSetup();
}

/** Starts the embedded API (bundled by scripts/build.mjs) and opens the chat window. */
async function openMain() {
  if (!existsSync(join(WEB_DIR, 'index.html'))) {
    dialog.showErrorBox('AçaIA', 'Os arquivos do chat não foram encontrados. Rode "npm run build" em apps/desktop.');
    app.quit();
    return;
  }
  const api = await import('../build/server/index.mjs');
  const settings = readSettings(settingsFile, safeStorage);
  try {
    const config = api.loadConfig(serverEnv({ settings, userDataDir, webDir: WEB_DIR }));
    const logger = api.createLogger({ level: config.logLevel, sink: (line) => appendLogLine(logFile, line) });
    server = await api.startServer(config, { logger });
  } catch (err) {
    appendLogLine(logFile, JSON.stringify({ severity: 'ERROR', message: 'desktop_start_failed', error: String(err) }));
    dialog.showErrorBox('AçaIA não conseguiu iniciar', `${err instanceof Error ? err.message : err}\n\nDetalhes em: ${logFile}`);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 520,
    title: 'AçaIA',
    icon: ICON,
    backgroundColor: background(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  lockNavigation(mainWindow, server.url);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(server.url);
}

/** First run (or "Trocar chave"): a small window to paste the Gemini key. */
function openSetup() {
  if (setupWindow) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 560,
    height: 700,
    resizable: false,
    maximizable: false,
    title: 'AçaIA: configuração',
    icon: ICON,
    backgroundColor: background(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(here, 'preload.cjs'),
    },
  });
  setupWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  setupWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  setupWindow.once('ready-to-show', () => setupWindow?.show());
  setupWindow.on('closed', () => {
    setupWindow = null;
    // Closed without configuring anything (and no chat open): nothing left to show.
    if (!mainWindow) app.quit();
  });
  setupWindow.loadFile(join(here, 'setup.html'));
}

/**
 * The chat window only shows our own pages: links open in the default browser, and the
 * window never navigates away from the local API.
 * @param {BrowserWindow} window
 * @param {string} origin
 */
function lockNavigation(window, origin) {
  const isExternal = (/** @type {string} */ url) => /^https?:\/\//i.test(url) && !url.startsWith(origin);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(origin)) return;
    event.preventDefault();
    if (isExternal(url)) shell.openExternal(url);
  });
}

// ---- Messages from the setup window (preload.cjs) ----------------------------------------

/** Only the setup page (a local file) may call these handlers. */
const fromSetup = (/** @type {Electron.IpcMainInvokeEvent} */ event) =>
  setupWindow !== null && event.sender === setupWindow.webContents && event.senderFrame?.url.startsWith('file:');

ipcMain.handle('setup:get', (event) => {
  if (!fromSetup(event)) return null;
  const settings = readSettings(settingsFile, safeStorage);
  return { hasKey: Boolean(settings.apiKey), model: settings.model, defaultModel: DEFAULT_MODEL };
});

ipcMain.handle('setup:save', async (event, input) => {
  if (!fromSetup(event)) return { ok: false, message: 'Acesso negado.' };
  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
  const model = typeof input?.model === 'string' && /^[\w.\-]{1,80}$/.test(input.model.trim()) ? input.model.trim() : DEFAULT_MODEL;
  const check = await checkApiKey({ apiKey });
  if (!check.ok) return check;
  writeSettings(settingsFile, { apiKey, model, demo: false }, safeStorage);
  await applySettings();
  return { ok: true };
});

ipcMain.handle('setup:demo', async (event) => {
  if (!fromSetup(event)) return { ok: false };
  const current = readSettings(settingsFile, safeStorage);
  writeSettings(settingsFile, { ...current, apiKey: null, demo: true }, safeStorage);
  await applySettings();
  return { ok: true };
});

ipcMain.handle('open-external', (event, url) => {
  if (!fromSetup(event)) return;
  // Only the pages the setup screen links to.
  if (typeof url === 'string' && /^https:\/\/(aistudio\.google\.com|ai\.google\.dev)\//.test(url)) shell.openExternal(url);
});

/** New settings: (re)start the API with them and show the chat. */
async function applySettings() {
  const wasSetup = setupWindow;
  if (server || mainWindow) {
    // Changing the key while the chat is open: simplest and safest is a clean restart.
    app.relaunch();
    app.exit(0);
    return;
  }
  await openMain();
  wasSetup?.close();
}

// ---- Menu (Alt shows it) ------------------------------------------------------------------

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    {
      label: 'AçaIA',
      submenu: [
        { label: 'Trocar chave do Gemini…', click: () => openSetup() },
        { label: 'Abrir pasta dos meus dados', click: () => shell.openPath(userDataDir) },
        { type: 'separator' },
        { label: 'Apagar todos os meus dados…', click: () => eraseEverything() },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer', role: 'undo' },
        { label: 'Refazer', role: 'redo' },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Colar', role: 'paste' },
        { label: 'Selecionar tudo', role: 'selectAll' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Recarregar', role: 'reload' },
        { type: 'separator' },
        { label: 'Aumentar zoom', role: 'zoomIn' },
        { label: 'Diminuir zoom', role: 'zoomOut' },
        { label: 'Zoom normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Tela cheia', role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ label: 'Ferramentas de desenvolvedor', role: /** @type {const} */ ('toggleDevTools') }]),
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre a AçaIA',
          click: () =>
            dialog.showMessageBox({
              type: 'info',
              title: 'Sobre a AçaIA',
              message: `AçaIA ${app.getVersion()}`,
              detail:
                'Assistente de IA brasileira, com chat e Humanizar texto.\n\n' +
                `Suas conversas ficam só neste computador, em:\n${userDataDir}\n\n` +
                'As mensagens são enviadas ao Gemini (Google) para gerar as respostas.',
            }),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

/** LGPD on the desktop: deletes the database, the settings (key) and the logs, then restarts. */
async function eraseEverything() {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancelar', 'Apagar tudo'],
    defaultId: 0,
    cancelId: 0,
    title: 'Apagar todos os meus dados',
    message: 'Apagar todas as conversas, a chave do Gemini e os registros deste computador?',
    detail: 'Isso não pode ser desfeito.',
  });
  if (response !== 1) return;
  await server?.close();
  server = null;
  for (const name of ['acaia.db', 'acaia.db-wal', 'acaia.db-shm', 'settings.json', 'logs']) {
    rmSync(join(userDataDir, name), { recursive: true, force: true });
  }
  app.relaunch();
  app.exit(0);
}

// ---- Lifecycle ------------------------------------------------------------------------------

app.on('window-all-closed', () => app.quit());

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !server) return;
  // Close the API (and the database) cleanly before leaving.
  event.preventDefault();
  quitting = true;
  server.close().finally(() => app.quit());
});
