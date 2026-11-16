// TSF Browser — processo principal (Electron).
// A interface (shell/) roda na janela principal e conversa com este processo por IPC.
// Cada aba e cada dispositivo do Responsive Lab é um WebContentsView próprio; o shell envia um
// "layout" com os retângulos onde cada view aparece (aba única, Split View, Lab...).
// Cada workspace usa uma partição persistente isolada (cookies, logins e armazenamento separados).
import {
  app, BrowserWindow, WebContentsView, ipcMain, session, protocol, net, Menu, shell as eshell,
  dialog, nativeTheme, screen, type Session, type WebContents, type Input,
} from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nodeNet from 'node:net';
import { pathToFileURL } from 'node:url';
import { autoUpdater } from 'electron-updater';

// ------------------------------------------------------------------ caminhos e configuração
const DEBUG = process.env.TSF_DEBUG === '1';
const LOCAL = process.env.LOCALAPPDATA || app.getPath('appData');
const DATA = DEBUG && process.env.TSF_DATA ? process.env.TSF_DATA : path.join(LOCAL, 'TSFBrowser');
const THUMBS = path.join(DATA, 'thumbs');
const SHOTS = path.join(app.getPath('pictures'), 'TSF Browser');
const SHELL_DIR = path.join(__dirname, '..', 'shell');
const SAVE_FILES = new Set(['state', 'history', 'sessions']);
const WIN_BUILD = process.platform === 'win32' ? Number(os.release().split('.')[2] || 0) : 0;
const NATIVE_GLASS = WIN_BUILD >= 22621; // Acrylic/Mica do sistema: Windows 11 22H2+

app.setPath('userData', path.join(DATA, 'Electron'));
app.setAppUserModelId('TSF.Browser');
fs.mkdirSync(THUMBS, { recursive: true });

protocol.registerSchemesAsPrivileged([
  { scheme: 'tsf-shell', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'tsf-thumb', privileges: { standard: true, secure: true } },
]);

const args = process.argv.slice(app.isPackaged ? 1 : 2);
const runScript = DEBUG ? (args.find(a => a.startsWith('--run=')) || '').slice(6) || null : null;
const startUrl = () => args.filter(a => !a.startsWith('-') && !a.endsWith('.js') && a !== '.').join(' ') || null;

if (!DEBUG && !app.requestSingleInstanceLock()) app.quit();

// ------------------------------------------------------------------ estado
type View = {
  id: string; ws: string; view: WebContentsView; wc: WebContents; lab: boolean;
  inspect: boolean; debuggerOn: boolean; thumbing: boolean; visible: boolean; failed?: boolean;
};
type LayoutItem = { id: string; x: number; y: number; w: number; h: number; r: number; zoom?: number };

let win: BrowserWindow | null = null;
const views = new Map<string, View>();
let layout: LayoutItem[] = [];
let primaryId: string | null = null;
let overlay = false, fullScreenId: string | null = null, shellReady = false, closeAllowed = false;
let glassOn = NATIVE_GLASS;
let installUpdateOnClose = false;
let updateState: Record<string, unknown> = { state: 'idle' };
const keys = new Set<string>();
const configured = new WeakSet<Session>();
const permDecisions = new Map<string, boolean>();

function post(type: string, data: Record<string, unknown> = {}) {
  if (!shellReady || !win || win.isDestroyed()) return;
  if (DEBUG && !['net', 'snapshot', 'status', 'init'].includes(type)) log('-> ' + JSON.stringify({ type, ...data }).slice(0, 300));
  win.webContents.send('host', { type, ...data });
}
const toast = (text: string) => post('toast', { text });
function log(line: string) {
  if (DEBUG) fs.appendFile(path.join(DATA, 'debug.log'), `${new Date().toISOString().slice(11, 23)} ${line}\n`, () => {});
}

// ------------------------------------------------------------------ janela principal
function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: Math.min(1440, workAreaSize.width - 40),
    height: Math.min(900, workAreaSize.height - 40),
    minWidth: 860, minHeight: 560,
    frame: false,
    show: false,
    title: 'TSF Browser',
    icon: path.join(__dirname, '..', 'assets', 'tsf.ico'),
    backgroundColor: glassOn ? '#00000000' : '#090B12',
    ...(glassOn ? { backgroundMaterial: 'acrylic' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: DEBUG,
    },
  });
  nativeTheme.themeSource = 'dark';
  const wc = win.webContents;
  wc.on('will-navigate', e => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('before-input-event', (e, input) => onKey(e, input));
  wc.on('render-process-gone', (_e, d) => { log('SHELL GONE ' + d.reason); shellReady = false; wc.reload(); });
  if (DEBUG) wc.on('console-message', (e: any) => { if (e.level === 'error' || e.level === 'warning' || e.level >= 2) log(`CONSOLE ${e.message} @${e.sourceId}:${e.lineNumber}`); });
  wc.loadURL('tsf-shell://app/index.html');
  win.once('ready-to-show', () => win!.show());

  const winState = () => post('win', { maximized: win!.isMaximized(), fullscreen: !!fullScreenId });
  win.on('maximize', winState);
  win.on('unmaximize', winState);
  win.on('close', e => {
    if (closeAllowed || !shellReady) return;
    e.preventDefault();
    post('flush');
    setTimeout(() => { closeAllowed = true; win?.close(); }, 1200);
  });
  win.on('closed', () => { win = null; });
}

// ------------------------------------------------------------------ mensagens do shell
ipcMain.on('shell', (e, m: any) => {
  if (!win || e.sender !== win.webContents || !m || typeof m.type !== 'string') return;
  if (m.type !== 'save') log(JSON.stringify(m).slice(0, 600));
  const t = typeof m.id === 'string' ? views.get(m.id) : undefined;
  switch (m.type) {
    case 'ready': {
      keys.clear();
      if (Array.isArray(m.keys)) m.keys.forEach((k: unknown) => keys.add(String(k)));
      shellReady = true;
      const read = (f: string) => { try { return fs.readFileSync(path.join(DATA, f + '.json'), 'utf8'); } catch { return null; } };
      post('init', {
        state: read('state'), history: read('history'), sessions: read('sessions'),
        nativeDrag: true, maximized: win.isMaximized(), engine: process.versions.chrome,
        electron: process.versions.electron, version: app.getVersion(), shots: SHOTS,
        thumbBase: 'tsf-thumb://t/', glass: glassOn, glassSupported: NATIVE_GLASS,
        debug: DEBUG, run: runScript, startUrl: startUrl(), platform: process.platform,
        updates: app.isPackaged,
      });
      if (updateState.state !== 'idle') post('update', updateState);
      break;
    }
    case 'layout':
      layout = (Array.isArray(m.items) ? m.items : []).map((it: any) => {
        const d = Number(m.dpr) || 1;
        return { id: String(it.id), x: Math.round(it.x / d), y: Math.round(it.y / d), w: Math.round(it.w / d), h: Math.round(it.h / d), r: Math.round((it.r || 0) / d), zoom: it.zoom ? Number(it.zoom) : undefined };
      });
      primaryId = m.primary || null;
      updateVisibility();
      break;
    case 'tab:create':
      if (typeof m.id === 'string' && !views.has(m.id)) {
        const v = createView(m.id, String(m.ws || 'home'), m.ua ? String(m.ua) : '');
        if (m.url) navigate(v, String(m.url));
      }
      break;
    case 'tab:navigate': if (t) navigate(t, String(m.url || '')); break;
    case 'tab:back': if (t && t.wc.navigationHistory.canGoBack()) t.wc.navigationHistory.goBack(); break;
    case 'tab:forward': if (t && t.wc.navigationHistory.canGoForward()) t.wc.navigationHistory.goForward(); break;
    case 'tab:reload': t?.wc.reload(); break;
    case 'tab:stop': t?.wc.stop(); break;
    case 'tab:close': if (t) destroyView(t); break;
    case 'tab:devtools': t?.wc.openDevTools({ mode: 'detach' }); break;
    case 'tab:print': t?.wc.print({}, () => {}); break;
    case 'tab:zoom':
      if (t) {
        const z = m.reset ? 1 : Math.max(0.25, Math.min(5, Math.round((t.wc.getZoomFactor() + Number(m.delta || 0)) * 100) / 100));
        t.wc.setZoomFactor(z);
        post('zoom', { id: t.id, value: z });
      }
      break;
    case 'tab:screenshot': if (t) screenshot(t); break;
    case 'inspect': if (t) setInspect(t, !!m.on); break;
    case 'net:body': if (t) netBody(t, String(m.rid)); break;
    case 'probe': probe((Array.isArray(m.ports) ? m.ports : []).map(Number).filter((p: number) => p > 0 && p < 65536).slice(0, 64), m.req); break;
    case 'overlay': if (m.on) beginOverlay(); else { overlay = false; updateVisibility(); } break;
    case 'focus':
      if (m.target === 'content') { const a = primaryId ? views.get(primaryId) : undefined; if (a?.visible && !a.wc.isFocused()) a.wc.focus(); }
      else if (!win.webContents.isFocused()) win.webContents.focus();
      break;
    case 'save':
      if (SAVE_FILES.has(m.file) && typeof m.data === 'string') writeAtomic(path.join(DATA, m.file + '.json'), m.data);
      break;
    case 'downloads': eshell.openPath(app.getPath('downloads')); break;
    case 'clear': clearWorkspace(String(m.ws || '')); break;
    case 'open-shots': fs.mkdirSync(SHOTS, { recursive: true }); eshell.openPath(SHOTS); break;
    case 'glass': setGlass(!!m.on); break;
    case 'update:check': checkForUpdates(true); break;
    case 'update:install':
      if (updateState.state === 'ready') { installUpdateOnClose = true; post('flush'); } // o shell salva e responde close-now
      break;
    case 'win':
      switch (m.action) {
        case 'min': win.minimize(); break;
        case 'max': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
        case 'close': win.close(); break;
        case 'close-now':
          closeAllowed = true;
          if (installUpdateOnClose) autoUpdater.quitAndInstall(false, true); // instala e reabre
          else win.close();
          break;
      }
      break;
  }
});

// ------------------------------------------------------------------ views (abas e dispositivos do Lab)
function partitionFor(ws: string, lab: boolean, id: string) {
  // Dispositivos do Lab ficam em partições próprias: o zoom do Chromium é por origem dentro da
  // partição, e cada aparelho precisa de um zoom diferente.
  if (lab) return 'lab-' + id.split('-').pop();
  return 'persist:ws_' + ws.replace(/[^\w-]/g, '');
}

function createView(id: string, ws: string, ua: string): View {
  const lab = id.startsWith('lab-');
  const partition = partitionFor(ws, lab, id);
  const ses = session.fromPartition(partition);
  configureSession(ses);
  const view = new WebContentsView({
    webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true },
  });
  view.setBackgroundColor('#090B12');
  view.setVisible(false);
  const v: View = { id, ws, view, wc: view.webContents, lab, inspect: false, debuggerOn: false, thumbing: false, visible: false };
  views.set(id, v);
  win!.contentView.addChildView(view);
  if (ua) v.wc.setUserAgent(ua);
  wireView(v);
  return v;
}

function sendState(v: View) {
  const wc = v.wc;
  if (wc.isDestroyed()) return;
  post('tab:state', {
    id: v.id, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(),
    canBack: wc.navigationHistory.canGoBack(), canFwd: wc.navigationHistory.canGoForward(),
  });
}

function wireView(v: View) {
  const wc = v.wc;
  const st = () => sendState(v);
  wc.on('did-start-loading', st);
  wc.on('did-stop-loading', st);
  wc.on('did-navigate', st);
  wc.on('did-navigate-in-page', st);
  wc.on('page-title-updated', st);
  // A página de erro interna do Chromium também dispara did-finish-load: só limpa o erro
  // quando uma navegação nova de verdade começa.
  wc.on('did-start-navigation', (d: any) => {
    if (d.isMainFrame && !d.isSameDocument && !String(d.url).startsWith('chrome-error:')) {
      if (v.failed) { v.failed = false; post('tab:error', { id: v.id, error: null }); }
    }
  });
  wc.on('did-finish-load', () => {
    st();
    if (v.failed) return;
    post('tab:nav', { id: v.id, url: wc.getURL(), title: wc.getTitle(), ok: true });
    if (!v.lab) setTimeout(() => { if (views.has(v.id) && v.visible && !overlay) captureThumb(v); }, 1400);
  });
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = navegação cancelada
    v.failed = true;
    post('tab:error', { id: v.id, error: { code, desc, url } });
    post('tab:nav', { id: v.id, url, title: '', ok: false });
  });
  wc.on('page-favicon-updated', (_e, favs) => post('tab:favicon', { id: v.id, url: favs[0] || '' }));
  wc.on('update-target-url', (_e, url) => post('status', { id: v.id, text: url }));
  wc.on('focus', () => post('view:focus', { id: v.id }));
  wc.on('render-process-gone', (_e, d) => post('tab:crashed', { id: v.id, kind: d.reason }));
  wc.on('before-input-event', (e, input) => onKey(e, input));
  wc.on('enter-html-full-screen', () => setFullScreen(v, true));
  wc.on('leave-html-full-screen', () => setFullScreen(v, false));
  wc.on('destroyed', () => views.delete(v.id));
  wc.setWindowOpenHandler(({ url, disposition }) => {
    // Pop-ups e links "_blank" viram abas no mesmo workspace.
    if (/^(https?|about|data):/i.test(url)) {
      const nid = 't' + Math.random().toString(36).slice(2, 14);
      const nv = createView(nid, v.ws, '');
      navigate(nv, url);
      post('tab:opened', { id: nid, ws: v.ws, opener: v.id, url, background: disposition === 'background-tab' });
    }
    return { action: 'deny' };
  });
}

function navigate(v: View, url: string) {
  if (!url) return;
  if (!/^(https?|file|about|data|view-source):/i.test(url)) { toast('Endereço não suportado: ' + url); return; }
  v.wc.loadURL(url).catch(() => { /* erros chegam por did-fail-load */ });
}

function destroyView(v: View) {
  views.delete(v.id);
  if (fullScreenId === v.id) setFullScreen(v, false);
  try { win?.contentView.removeChildView(v.view); } catch { /* já removida */ }
  try { if (v.debuggerOn) v.wc.debugger.detach(); } catch { /* ok */ }
  if (!v.wc.isDestroyed()) v.wc.close();
}

function updateVisibility() {
  if (!win) return;
  const show = new Map<string, LayoutItem>();
  if (fullScreenId) {
    const [w, h] = win.getContentSize();
    if (views.has(fullScreenId)) show.set(fullScreenId, { id: fullScreenId, x: 0, y: 0, w, h, r: 0 });
  } else if (!overlay) {
    for (const it of layout) if (views.has(it.id)) show.set(it.id, it);
  }
  for (const [id, it] of show) {
    const v = views.get(id)!;
    v.view.setBounds({ x: it.x, y: it.y, width: Math.max(1, it.w), height: Math.max(1, it.h) });
    const anyView = v.view as unknown as { setBorderRadius?: (r: number) => void };
    if (anyView.setBorderRadius) anyView.setBorderRadius(fullScreenId ? 0 : it.r);
    if (it.zoom && Math.abs(v.wc.getZoomFactor() - it.zoom) > 0.001) v.wc.setZoomFactor(it.zoom);
    if (!v.visible) {
      v.visible = true;
      win.contentView.addChildView(v.view); // traz para frente
      v.view.setVisible(true);
    }
  }
  for (const v of views.values()) {
    if (show.has(v.id) || !v.visible) continue;
    if (!overlay && !fullScreenId && !v.lab) hideAfterThumb(v);
    else { v.visible = false; v.view.setVisible(false); }
  }
}

function shouldShow(id: string) {
  if (fullScreenId) return id === fullScreenId;
  return !overlay && layout.some(i => i.id === id);
}

async function hideAfterThumb(v: View) {
  if (v.thumbing) return;
  v.thumbing = true;
  try { await captureThumb(v); } catch { /* ok */ }
  v.thumbing = false;
  if (views.has(v.id) && !shouldShow(v.id)) { v.visible = false; v.view.setVisible(false); }
}

async function beginOverlay() {
  overlay = true;
  if (!fullScreenId) {
    for (const v of [...views.values()]) {
      if (!v.visible) continue;
      try {
        const img = await v.wc.capturePage();
        if (overlay) post('snapshot', { id: v.id, data: img.toDataURL() });
      } catch { /* ok */ }
    }
  }
  if (overlay) {
    updateVisibility();
    win?.webContents.focus();
    post('overlay:ready');
  }
}

function setFullScreen(v: View, on: boolean) {
  if (!win) return;
  if (on) { fullScreenId = v.id; win.setFullScreen(true); }
  else { fullScreenId = null; win.setFullScreen(false); }
  setTimeout(updateVisibility, 50);
  post('win', { maximized: win.isMaximized(), fullscreen: on });
}

// ------------------------------------------------------------------ sessões e permissões
const PERM_LABELS: Record<string, string> = {
  media: 'usar a câmera e/ou o microfone', geolocation: 'saber sua localização', notifications: 'mostrar notificações',
  midi: 'acessar dispositivos MIDI', 'display-capture': 'capturar sua tela', clipboard: 'ler sua área de transferência',
  'idle-detection': 'saber quando você está ausente', 'window-management': 'gerenciar janelas',
};
const ALWAYS = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock']);

function configureSession(ses: Session) {
  if (configured.has(ses)) return;
  configured.add(ses);
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    if (ALWAYS.has(permission)) return cb(true);
    const label = PERM_LABELS[permission];
    if (!label || !win) return cb(false);
    let origin = '';
    try { origin = new URL(details.requestingUrl || wc.getURL()).origin; } catch { return cb(false); }
    const key = origin + '|' + permission;
    if (permDecisions.has(key)) return cb(permDecisions.get(key)!);
    dialog.showMessageBox(win, {
      type: 'question', buttons: ['Bloquear', 'Permitir'], defaultId: 0, cancelId: 0, noLink: true,
      title: 'Permissão do site', message: `${origin} quer ${label}.`,
      detail: 'A decisão vale até você fechar o TSF Browser.',
    }).then(r => { const ok = r.response === 1; permDecisions.set(key, ok); cb(ok); });
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => ALWAYS.has(permission) || permDecisions.get(origin + '|' + permission) === true);
  ses.on('will-download', (_e, item) => {
    item.once('done', (_ev, state) => {
      if (state === 'completed') toast(`Download concluído: ${path.basename(item.getSavePath())}`);
      else if (state === 'interrupted') toast(`Download interrompido: ${item.getFilename()}`);
    });
  });
}

async function clearWorkspace(ws: string) {
  if (!ws) return;
  try {
    const ses = session.fromPartition('persist:ws_' + ws.replace(/[^\w-]/g, ''));
    await ses.clearStorageData();
    await ses.clearCache();
    toast('Cookies, cache e armazenamento do workspace foram apagados.');
  } catch (e) { toast('Falha ao limpar dados: ' + (e as Error).message); }
}

// ------------------------------------------------------------------ teclado
function comboOf(input: Input) {
  const c = input.code || '';
  let name: string | null = null;
  if (/^Key[A-Z]$/.test(c)) name = c.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(c)) name = c.slice(5);
  else if (/^Numpad\d$/.test(c)) name = c.slice(6);
  else if (/^F\d{1,2}$/.test(c)) name = c.toLowerCase();
  else name = ({ Tab: 'tab', PageUp: 'pageup', PageDown: 'pagedown', ArrowLeft: 'left', ArrowRight: 'right', Equal: 'plus', NumpadAdd: 'plus', Minus: 'minus', NumpadSubtract: 'minus', Comma: 'comma', Home: 'home' } as Record<string, string>)[c] || null;
  if (!name) return null;
  return (input.control ? 'ctrl+' : '') + (input.shift ? 'shift+' : '') + (input.alt ? 'alt+' : '') + name;
}
function onKey(e: Electron.Event, input: Input) {
  if (input.type !== 'keyDown' || !shellReady) return;
  const combo = comboOf(input);
  if (combo && keys.has(combo)) { e.preventDefault(); post('key', { combo }); }
}

// ------------------------------------------------------------------ miniaturas
function fnv(s: string) {
  s = String(s || '').split('#')[0];
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
async function captureThumb(v: View) {
  if (v.lab || !v.visible || v.wc.isDestroyed()) return;
  const url = v.wc.getURL();
  if (!/^https?:/i.test(url)) return;
  const img = await v.wc.capturePage();
  if (img.isEmpty()) return;
  const size = img.getSize();
  const w = Math.min(560, size.width);
  let thumb = img.resize({ width: w, quality: 'good' });
  const ts = thumb.getSize();
  const h = Math.min(Math.round(w * 0.75), ts.height);
  thumb = thumb.crop({ x: 0, y: 0, width: ts.width, height: h });
  const name = fnv(url);
  await writeAtomic(path.join(THUMBS, name + '.jpg'), thumb.toJPEG(78));
  post('thumb', { id: v.id, name, v: Date.now() });
}
async function pruneThumbs() {
  try {
    const files = await fsp.readdir(THUMBS);
    if (files.length <= 2500) return;
    const stats = await Promise.all(files.map(async f => ({ f, t: (await fsp.stat(path.join(THUMBS, f))).mtimeMs })));
    stats.sort((a, b) => a.t - b.t).slice(0, stats.length - 2000).forEach(s => fsp.unlink(path.join(THUMBS, s.f)).catch(() => {}));
  } catch { /* ok */ }
}

// ------------------------------------------------------------------ Inspector (Chrome DevTools Protocol)
async function setInspect(v: View, on: boolean) {
  v.inspect = on;
  const dbg = v.wc.debugger;
  try {
    if (on && !v.debuggerOn) {
      dbg.attach('1.3');
      v.debuggerOn = true;
      dbg.on('message', (_e, method, params) => {
        if (v.inspect && method.startsWith('Network.')) post('net', { id: v.id, ev: method, data: JSON.stringify(params) });
      });
      dbg.on('detach', () => { v.debuggerOn = false; });
    }
    if (v.debuggerOn) await dbg.sendCommand(on ? 'Network.enable' : 'Network.disable');
  } catch (e) { toast('Inspector indisponível nesta aba: ' + (e as Error).message); }
}
async function netBody(v: View, rid: string) {
  try {
    const r = await v.wc.debugger.sendCommand('Network.getResponseBody', { requestId: rid });
    const data = JSON.stringify(r);
    if (data.length > 3_000_000) post('net:body', { id: v.id, rid, error: `Resposta grande demais para exibir (${Math.round(data.length / 1048576)} MB).` });
    else post('net:body', { id: v.id, rid, data });
  } catch (e) { post('net:body', { id: v.id, rid, error: (e as Error).message }); }
}

// ------------------------------------------------------------------ Localhost: só as portas pedidas
function tryConnect(host: string, port: number) {
  return new Promise<boolean>(resolve => {
    const s = nodeNet.connect({ host, port });
    const done = (ok: boolean) => { s.destroy(); resolve(ok); };
    s.setTimeout(700, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}
async function probe(ports: number[], req: unknown) {
  const results: Record<string, boolean> = {};
  await Promise.all(ports.map(async p => {
    const [a, b] = await Promise.all([tryConnect('127.0.0.1', p), tryConnect('::1', p)]);
    results[p] = a || b;
  }));
  post('probe:result', { req, results });
}

// ------------------------------------------------------------------ outros
async function screenshot(v: View) {
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
    const file = path.join(SHOTS, `TSF-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`);
    const img = await v.wc.capturePage();
    await fsp.writeFile(file, img.toPNG());
    post('shot', { file });
  } catch (e) { toast('Não foi possível salvar a captura: ' + (e as Error).message); }
}

function setGlass(on: boolean) {
  if (!win || !NATIVE_GLASS) { if (on) toast('O vidro do sistema (Acrylic) exige Windows 11 22H2 ou mais recente.'); return; }
  glassOn = on;
  win.setBackgroundColor(on ? '#00000000' : '#090B12');
  try { win.setBackgroundMaterial(on ? 'acrylic' : 'none'); } catch { /* versões antigas */ }
}

async function writeAtomic(file: string, data: string | Buffer) {
  const tmp = file + '.tmp';
  try { await fsp.writeFile(tmp, data); await fsp.rename(tmp, file); } catch (e) { log('write failed ' + file + ' ' + e); }
}

// ------------------------------------------------------------------ atualização automática (GitHub Releases)
function setUpdate(s: Record<string, unknown>) { updateState = s; post('update', s); }
function setupUpdater() {
  if (!app.isPackaged || DEBUG) return; // só na versão instalada
  // O repositório é público: as versões vêm de github.com/RafaelForti1/tsfbrowser/releases
  // (configurado em package.json > build.publish; o electron-builder grava isso no app-update.yml).
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // se o usuário não reiniciar, instala ao fechar
  autoUpdater.on('checking-for-update', () => setUpdate({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setUpdate({ state: 'latest', version: app.getVersion() }));
  autoUpdater.on('update-available', i => setUpdate({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', p => setUpdate({ state: 'downloading', version: (updateState as any).version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => setUpdate({ state: 'ready', version: i.version }));
  autoUpdater.on('error', e => { log('update error ' + e); setUpdate({ state: 'error', message: String(e && e.message || e).split('\n')[0] }); });
  setTimeout(() => checkForUpdates(false), 8000);
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);
}
function checkForUpdates(manual: boolean) {
  if (!app.isPackaged || DEBUG) { if (manual) toast('As atualizações automáticas funcionam na versão instalada.'); return; }
  if (updateState.state === 'downloading' || updateState.state === 'ready') return;
  autoUpdater.checkForUpdates().catch(e => log('update check failed ' + e));
}

// ------------------------------------------------------------------ ciclo de vida
app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const url = argv.slice(1).filter(a => !a.startsWith('-') && !a.endsWith('.exe')).pop();
  if (url) post('open', { url });
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // Apresenta-se como um Chrome comum: sem "Electron/x" nem o nome do app no user agent.
  // Sites como o Google tratam navegadores desconhecidos como suspeitos (resultados piores, login bloqueado).
  // Mesmo formato do Chrome real (versão reduzida "X.0.0.0").
  const chromeMajor = process.versions.chrome.split('.')[0];
  app.userAgentFallback = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
  setupUpdater();
  const serve = (root: string) => (req: Request) => {
    const p = path.normalize(path.join(root, decodeURIComponent(new URL(req.url).pathname)));
    if (!p.startsWith(root)) return new Response('Proibido', { status: 403 });
    return net.fetch(pathToFileURL(p).toString());
  };
  protocol.handle('tsf-shell', serve(SHELL_DIR));
  protocol.handle('tsf-thumb', serve(THUMBS));
  createWindow();
  pruneThumbs();
});
app.on('window-all-closed', () => app.quit());
