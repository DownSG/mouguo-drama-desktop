const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  session,
  screen,
  clipboard,
  powerSaveBlocker
} = require('electron');
const path = require('path');
const fs = require('fs');

const HOME_URL = 'https://hongguoduanju.com/category/real-drama';

let win = null;
let statePath = null;
let saveTimer = null;
let sleepBlockerId = null;

const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'fullscreen']);

function keepDisplayAwake(active) {
  if (active && sleepBlockerId === null) {
    sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!active && sleepBlockerId !== null) {
    powerSaveBlocker.stop(sleepBlockerId);
    sleepBlockerId = null;
  }
}

function zoomTo(contents, delta) {
  const next = Math.min(2, Math.max(0.6, contents.getZoomFactor() + delta));
  contents.setZoomFactor(Number(next.toFixed(2)));
}

function buildGuestMenu(contents, params) {
  const template = [];

  if (params.linkURL) {
    template.push(
      { label: '在浏览器中打开链接', click: () => openExternal(params.linkURL) },
      { label: '复制链接地址', click: () => clipboard.writeText(params.linkURL) },
      { type: 'separator' }
    );
  }

  if (params.isEditable) {
    const flags = params.editFlags || {};
    template.push(
      { label: '撤销', role: 'undo', enabled: Boolean(flags.canUndo) },
      { label: '重做', role: 'redo', enabled: Boolean(flags.canRedo) },
      { type: 'separator' },
      { label: '剪切', role: 'cut', enabled: Boolean(flags.canCut) },
      { label: '复制', role: 'copy', enabled: Boolean(flags.canCopy) },
      { label: '粘贴', role: 'paste', enabled: Boolean(flags.canPaste) },
      { label: '全选', role: 'selectAll', enabled: Boolean(flags.canSelectAll) },
      { type: 'separator' }
    );
  } else if (params.selectionText) {
    template.push({ label: '复制', role: 'copy' }, { type: 'separator' });
  }

  template.push(
    {
      label: '后退',
      enabled: contents.navigationHistory.canGoBack(),
      click: () => contents.navigationHistory.goBack()
    },
    {
      label: '前进',
      enabled: contents.navigationHistory.canGoForward(),
      click: () => contents.navigationHistory.goForward()
    },
    { label: '刷新', click: () => contents.reload() }
  );

  Menu.buildFromTemplate(template).popup({ window: win });
}

function setupGuest(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSiteUrl(url)) {
      contents.loadURL(url);
    } else {
      openExternal(url);
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      event.preventDefault();
      openExternal(url);
    }
  });

  contents.on('will-redirect', (event, url) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      event.preventDefault();
      openExternal(url);
    }
  });

  // Keyboard shortcuts must be handled here: when the page has focus,
  // key events never reach the shell renderer.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key;
    const ctrl = input.control || input.meta;

    if ((ctrl && key.toLowerCase() === 'r') || key === 'F5') {
      event.preventDefault();
      contents.reload();
    } else if (input.alt && key === 'ArrowLeft') {
      event.preventDefault();
      if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    } else if (input.alt && key === 'ArrowRight') {
      event.preventDefault();
      if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    } else if (ctrl && (key === '=' || key === '+')) {
      event.preventDefault();
      zoomTo(contents, 0.1);
    } else if (ctrl && key === '-') {
      event.preventDefault();
      zoomTo(contents, -0.1);
    } else if (ctrl && key === '0') {
      event.preventDefault();
      contents.setZoomFactor(1);
    } else if (key === 'F11') {
      event.preventDefault();
      if (win) win.setFullScreen(!win.isFullScreen());
    }
  });

  contents.on('context-menu', (_event, params) => {
    buildGuestMenu(contents, params);
  });

  contents.on('media-started-playing', () => keepDisplayAwake(true));
  contents.on('media-paused', () => keepDisplayAwake(false));
}

const defaultState = {
  width: 1200,
  height: 800,
  x: undefined,
  y: undefined,
  maximized: false
};

function readState() {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return { ...defaultState };
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch {
    /* ignore persistence errors */
  }
}

function persistWindowState() {
  if (!win || win.isDestroyed()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    const bounds = win.getNormalBounds();
    writeState({ ...bounds, maximized: win.isMaximized() });
  }, 250);
}

function isSafeExternal(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function openExternal(url) {
  if (isSafeExternal(url)) shell.openExternal(url);
}

function isSiteUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'hongguoduanju.com' || host.endsWith('.hongguoduanju.com');
  } catch {
    return false;
  }
}

function createWindow() {
  const state = readState();
  const area = screen.getPrimaryDisplay().workArea;

  // Keep the window inside the visible work area, with a small breathing margin.
  const margin = 24;
  const width = Math.min(state.width, area.width - margin * 2);
  const height = Math.min(state.height, area.height - margin * 2);
  let x = state.x;
  let y = state.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    x = area.x + Math.round((area.width - width) / 2);
    y = area.y + Math.round((area.height - height) / 2);
  } else {
    x = Math.min(Math.max(x, area.x + margin), area.x + area.width - width - margin);
    y = Math.min(Math.max(y, area.y + margin), area.y + area.height - height - margin);
  }

  win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#0b0b10',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: '某果短剧自用端',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));

  win.once('ready-to-show', () => {
    if (state.maximized) win.maximize();
    win.show();
  });

  win.on('maximize', () => {
    win.webContents.send('win:maximized-changed', true);
    persistWindowState();
  });
  win.on('unmaximize', () => {
    win.webContents.send('win:maximized-changed', false);
    persistWindowState();
  });
  win.on('resize', persistWindowState);
  win.on('move', persistWindowState);
  win.on('enter-full-screen', () => {
    win.webContents.send('win:fullscreen-changed', true);
  });
  win.on('leave-full-screen', () => {
    win.webContents.send('win:fullscreen-changed', false);
  });
  win.on('closed', () => {
    win = null;
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== HOME_URL && !url.startsWith('file://')) {
      // Only the local shell may navigate itself.
      event.preventDefault();
    }
  });
}

app.setAppUserModelId('com.mouguo.drama.desktop');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    statePath = path.join(app.getPath('userData'), 'window-state.json');
    Menu.setApplicationMenu(null);

    const partition = session.fromPartition('persist:main');

    // Deny sensitive guest permissions; allow only what the app genuinely needs.
    partition.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission));
    });
    partition.setPermissionCheckHandler((_wc, permission) => {
      return ALLOWED_PERMISSIONS.has(permission);
    });

    app.on('web-contents-created', (_event, contents) => {
      if (contents.getType() !== 'webview') return;
      setupGuest(contents);
    });

    createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:close', () => win?.close());
ipcMain.handle('win:toggle-maximize', () => {
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('win:is-maximized', () => Boolean(win?.isMaximized()));
ipcMain.handle('win:toggle-fullscreen', () => {
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('win:set-fullscreen', (_event, value) => {
  if (!win) return false;
  win.setFullScreen(Boolean(value));
  return win.isFullScreen();
});
ipcMain.handle('win:is-fullscreen', () => Boolean(win?.isFullScreen()));
ipcMain.handle('app:open-external', (_event, url) => {
  openExternal(url);
});
ipcMain.handle('app:version', () => app.getVersion());
