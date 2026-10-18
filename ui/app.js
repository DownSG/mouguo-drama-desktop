const HOME_URL = 'https://hongguoduanju.com/category/real-drama';
const MIN_SPLASH_MS = 1100;

const view = document.getElementById('view');
const splash = document.getElementById('splash');
const splashTip = document.getElementById('splash-tip');
const errorLayer = document.getElementById('error');
const progress = document.getElementById('progress');
const statusDot = document.getElementById('status-dot');

const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnHome = document.getElementById('btn-home');
const btnBrowser = document.getElementById('btn-browser');
const btnMin = document.getElementById('btn-min');
const btnMax = document.getElementById('btn-max');
const btnClose = document.getElementById('btn-close');
const btnRetry = document.getElementById('btn-retry');
const btnErrorBrowser = document.getElementById('btn-error-browser');

const startedAt = performance.now();
let splashDismissed = false;
let everLoaded = false;
let zoomApplied = false;
let currentZoom = Number(localStorage.getItem('zoom') || 1);
let tipTimer = 0;

/* ---------------------------------------------------------
   Chrome (webview) behaviours
   --------------------------------------------------------- */

const SCROLLBAR_CSS = `
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.18);
    border-radius: 8px;
    border: 3px solid transparent;
    background-clip: content-box;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.32);
    background-clip: content-box;
  }
`;

function withView(fn) {
  try {
    return view[fn]();
  } catch {
    return undefined;
  }
}

function updateNav() {
  btnBack.disabled = !withView('canGoBack');
  btnForward.disabled = !withView('canGoForward');
}

function setLoading(active) {
  progress.classList.toggle('active', active);
}

function dismissSplash() {
  if (splashDismissed) return;
  splashDismissed = true;
  clearInterval(tipTimer);
  const elapsed = performance.now() - startedAt;
  const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
  setTimeout(() => {
    splash.classList.add('hidden');
    view.classList.add('ready');
  }, wait);
}

function showError() {
  errorLayer.classList.remove('hidden');
  statusDot.classList.add('offline');
  statusDot.title = '连接失败';
}

function hideError() {
  errorLayer.classList.add('hidden');
  statusDot.classList.remove('offline');
  statusDot.title = '已连接';
}

function reloadPage() {
  hideError();
  if (!splashDismissed) splash.classList.remove('hidden');
  setLoading(true);
  withView('reload');
}

function goHome() {
  hideError();
  try {
    view.loadURL(HOME_URL);
  } catch {
    /* ignore */
  }
}

view.addEventListener('dom-ready', () => {
  try {
    if (!zoomApplied) {
      view.setZoomFactor(currentZoom);
      zoomApplied = true;
    }
    view.insertCSS(SCROLLBAR_CSS);
  } catch {
    /* ignore */
  }
  hideError();
  if (!everLoaded) dismissSplash();
  updateNav();
});

// HTML5 video fullscreen inside a <webview> is not automatic: the guest
// goes fullscreen on its own, but the host window must follow.
view.addEventListener('enter-html-full-screen', () => {
  document.body.classList.add('video-fullscreen');
  window.desktop.setFullscreen(true);
});

view.addEventListener('leave-html-full-screen', () => {
  document.body.classList.remove('video-fullscreen');
  window.desktop.setFullscreen(false);
});

view.addEventListener('did-start-loading', () => {
  setLoading(true);
});

view.addEventListener('did-stop-loading', () => {
  setLoading(false);
  everLoaded = true;
  hideError();
  dismissSplash();
  updateNav();
});

view.addEventListener('did-navigate', updateNav);
view.addEventListener('did-navigate-in-page', updateNav);

view.addEventListener('did-fail-load', (event) => {
  if (event.errorCode === -3) return;
  if (event.isMainFrame === false) return;
  setLoading(false);
  dismissSplash();
  showError();
});

/* ---------------------------------------------------------
   Title bar controls
   --------------------------------------------------------- */

btnBack.addEventListener('click', () => withView('goBack'));
btnForward.addEventListener('click', () => withView('goForward'));
btnReload.addEventListener('click', reloadPage);
btnHome.addEventListener('click', goHome);

btnBrowser.addEventListener('click', () => {
  const url = withView('getURL') || HOME_URL;
  window.desktop.openExternal(url);
});

btnMin.addEventListener('click', () => window.desktop.minimize());
btnMax.addEventListener('click', async () => {
  const maximized = await window.desktop.toggleMaximize();
  document.body.classList.toggle('maximized', maximized);
});
btnClose.addEventListener('click', () => window.desktop.close());

btnRetry.addEventListener('click', reloadPage);
btnErrorBrowser.addEventListener('click', () => {
  window.desktop.openExternal(withView('getURL') || HOME_URL);
});

window.desktop.onMaximizedChange((maximized) => {
  document.body.classList.toggle('maximized', maximized);
});

window.desktop.onFullscreenChange((fullscreen) => {
  document.body.classList.toggle('window-fullscreen', fullscreen);
});

/* ---------------------------------------------------------
   Zoom + shortcuts
   --------------------------------------------------------- */

function applyZoom(next) {
  currentZoom = Math.min(2, Math.max(0.6, Number(next.toFixed(2))));
  localStorage.setItem('zoom', String(currentZoom));
  try {
    view.setZoomFactor(currentZoom);
  } catch {
    /* ignore */
  }
}

window.addEventListener('keydown', (event) => {
  const key = event.key;

  if ((event.ctrlKey && key.toLowerCase() === 'r') || key === 'F5') {
    event.preventDefault();
    reloadPage();
    return;
  }
  if (event.altKey && key === 'ArrowLeft') {
    event.preventDefault();
    withView('goBack');
    return;
  }
  if (event.altKey && key === 'ArrowRight') {
    event.preventDefault();
    withView('goForward');
    return;
  }
  if (event.ctrlKey && (key === '=' || key === '+')) {
    event.preventDefault();
    applyZoom(currentZoom + 0.1);
    return;
  }
  if (event.ctrlKey && key === '-') {
    event.preventDefault();
    applyZoom(currentZoom - 0.1);
    return;
  }
  if (event.ctrlKey && key === '0') {
    event.preventDefault();
    applyZoom(1);
    return;
  }
  if (key === 'F11') {
    event.preventDefault();
    window.desktop.toggleFullscreen();
  }
});

/* ---------------------------------------------------------
   Startup polish
   --------------------------------------------------------- */

(async () => {
  try {
    const maximized = await window.desktop.isMaximized();
    document.body.classList.toggle('maximized', maximized);
  } catch {
    /* ignore */
  }
})();

setTimeout(() => {
  if (!splashDismissed) splashTip.textContent = '马上就好，精彩即将开场';
}, 2600);
