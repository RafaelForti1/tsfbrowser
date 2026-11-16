/* TSF Browser — núcleo do shell: estado, abas, workspaces, layout, Split View, Command Center.
   Os scripts do shell compartilham o escopo global (scripts clássicos, carregados em ordem). */
'use strict';

// ============================================================ utilidades
const host = window.tsfHost || (window.chrome && window.chrome.webview);   // Electron (preload) ou WebView2
const send = (type, data) => { if (host) host.postMessage(Object.assign({ type }, data || {})); };
// Só pede foco ao host quando a interface ainda NÃO tem o foco do Windows.
// (Pedir sempre causava um laço foco -> pedido -> foco que travava o navegador.)
let focusReqAt = 0;
function focusShell() {
  if (document.hasFocus()) return;
  const now = Date.now();
  if (now - focusReqAt < 300) return;
  focusReqAt = now;
  send('focus', { target: 'shell' });
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cssq = s => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');

function fnv(s) {
  s = String(s || '').split('#')[0];
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const THUMBV = {};
function thumbUrl(url) {
  if (!host || !/^https?:/i.test(url || '')) return '';
  const n = fnv(url);
  return `${INFO.thumbBase || 'https://tsf.thumbs/'}${n}.jpg${THUMBV[n] ? '?v=' + THUMBV[n] : ''}`;
}

const ICONS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M3 12.5h18"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  code: '<path d="m15.5 17.5 5.5-5.5-5.5-5.5"/><path d="M8.5 6.5 3 12l5.5 5.5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20"/><path d="M8.5 7.5h7"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6.2L4.8 18.4A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3"/><path d="M7.2 15h9.6"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9.5 3 2.5-3 2.5"/><path d="M12.5 15h4.5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.9 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A3.7 3.7 0 0 0 21 10.8C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10.5" cy="7.2" r="1.1"/><circle cx="15" cy="7.4" r="1.1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
  rocket: '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.8-.9.7-2.2-.1-2.9a2.1 2.1 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0"/><path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
  heart: '<path d="M19.5 13.6 12 21l-7.5-7.4A4.9 4.9 0 0 1 12 6.7a4.9 4.9 0 0 1 7.5 6.9z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  back: '<path d="M19 12H5"/><path d="m11.5 18.5-6.5-6.5 6.5-6.5"/>',
  forward: '<path d="M5 12h14"/><path d="m12.5 5.5 6.5 6.5-6.5 6.5"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5V9h-4.5"/>',
  x: '<path d="M17.5 6.5l-11 11"/><path d="M6.5 6.5l11 11"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  starFill: '<path fill="currentColor" d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  sparkle: '<path d="M12 3c.5 4.6 2.4 6.5 7 7-4.6.5-6.5 2.4-7 7-.5-4.6-2.4-6.5-7-7 4.6-.5 6.5-2.4 7-7z"/><path d="M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z"/>',
  more: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  download: '<path d="M12 3.5v11.5"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20.5h14"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9.5 4v16"/><path d="m15.5 10-2 2 2 2"/>',
  sidebarOpen: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9.5 4v16"/><path d="m13.5 10 2 2-2 2"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M14.5 4v16"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 4v16"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5"/><path d="M12 17.3v.2"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="m6 7 1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M9 7V4.5h6V7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  focus: '<circle cx="12" cy="12" r="3"/><path d="M3.5 8V5.5a2 2 0 0 1 2-2H8"/><path d="M16 3.5h2.5a2 2 0 0 1 2 2V8"/><path d="M20.5 16v2.5a2 2 0 0 1-2 2H16"/><path d="M8 20.5H5.5a2 2 0 0 1-2-2V16"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/><path d="M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/><path d="M8 11h6"/>',
  printer: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  command: '<path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H17.5A2.5 2.5 0 1 0 15 6.5v11A2.5 2.5 0 1 0 17.5 15h-11A2.5 2.5 0 1 0 9 17.5z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  note: '<path d="M5.5 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5z"/><path d="M14.5 3.5v4h4"/><path d="M8.5 12h7"/><path d="M8.5 16h4.5"/>',
  chevron: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  send: '<path d="M4 12 20 4l-4 16-4-6.5z"/><path d="m12 13.5 8-9.5"/>',
  min: '<path d="M5 12h14"/>',
  max: '<rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>',
  restore: '<rect x="5" y="8.5" width="10.5" height="10.5" rx="1.5"/><path d="M8.5 8.5V6.5A1.5 1.5 0 0 1 10 5h7.5A1.5 1.5 0 0 1 19 6.5V14a1.5 1.5 0 0 1-1.5 1.5h-2"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H10"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  folder: '<path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  orbit: '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-30 12 12)"/><circle cx="19.6" cy="7.3" r="1.3" fill="currentColor"/>',
  timeline: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4.5H8"/><path d="M12 7.5V12l3 2"/>',
  devices: '<rect x="2.5" y="5" width="13" height="10" rx="1.5"/><path d="M6 19h6"/><path d="M9 15v4"/><rect x="17" y="8" width="4.5" height="11" rx="1.2"/>',
  server: '<rect x="3.5" y="4" width="17" height="6.5" rx="1.8"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.8"/><path d="M7 7.3h.01M7 16.8h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>',
  gamepad: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M7 10v4M5 12h4"/><circle cx="15.5" cy="11" r=".9" fill="currentColor"/><circle cx="17.8" cy="13.2" r=".9" fill="currentColor"/>',
  swap: '<path d="M7 7h13l-3.5-3.5"/><path d="M17 17H4l3.5 3.5"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  frame: '<rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-dasharray="3 2.5"/>',
  rotate: '<rect x="4" y="8" width="16" height="10" rx="2"/><path d="M7.5 5.5A9 9 0 0 1 17 5"/><path d="m15.2 3.2 1.8 1.8-1.9 1.6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/>',
  tablet: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M11 18h2"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.8"/><path d="M8.5 20h7M12 16v4"/>',
  sync: '<path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4"/><path d="M6 21v-4h4"/>',
  rec: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
  play: '<path d="M7 5v14l12-7z"/>',
};
const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const LOGO = `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <path d="M15 18.5h34M32 18.5V49" stroke="url(#tsfGrad)" stroke-width="6.5" stroke-linecap="round"/>
  <ellipse cx="32" cy="35" rx="25" ry="9" transform="rotate(-24 32 35)" stroke="url(#tsfGrad)" stroke-width="2.4" opacity=".9"/>
  <circle cx="53.5" cy="25.5" r="2.6" fill="var(--accent)"/>
</svg>`;

const WS_ICONS = ['home', 'briefcase', 'grid', 'code', 'terminal', 'book', 'flask', 'palette', 'rocket', 'globe', 'heart', 'star'];
const WS_COLORS = ['#695CFF', '#8B5CF6', '#C26BFF', '#FF6FB5', '#25D9F2', '#2BD4A0', '#FFB547', '#FF6B6B'];

const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
};

const INTERNAL = {
  newtab: { t: 'Nova aba', i: 'sparkle' },
  settings: { t: 'Configurações', i: 'gear' },
  history: { t: 'Histórico', i: 'clock' },
  universe: { t: 'TSF Universe', i: 'orbit' },
  timemachine: { t: 'Time Machine', i: 'timeline' },
  lab: { t: 'Responsive Lab', i: 'devices' },
  localhost: { t: 'Localhost', i: 'server' },
};
const TOOLS = [
  { id: 'universe', k: 'Ctrl+Shift+U', s: 'Universe' },
  { id: 'timemachine', k: 'Ctrl+Shift+H', s: 'Tempo' },
  { id: 'lab', k: 'Ctrl+Shift+L', s: 'Lab' },
  { id: 'localhost', k: 'Ctrl+Shift+O', s: 'Local' },
];

const PAGES = {};   // páginas internas registradas pelos outros scripts: { render(t), mount(root,t), unmount() }

// ============================================================ estado
let S = null;              // estado persistido
let H = [];                // histórico
let SESS = [];             // snapshots de sessão (Time Machine)
let INFO = {};
const RT = new Map();
let saveTimer = 0, histTimer = 0, sessTimer = 0;

function defaultState() {
  const tab = { id: uid('t'), ws: 'home', url: 'tsf://newtab', title: 'Nova aba', favicon: '' };
  return {
    v: 2,
    workspaces: [
      { id: 'home', name: 'Início', icon: 'home', color: '#695CFF' },
      { id: 'work', name: 'Trabalho', icon: 'briefcase', color: '#25D9F2' },
      { id: 'creative', name: 'Criativo', icon: 'grid', color: '#C26BFF' },
    ],
    activeWs: 'home',
    activeTab: { home: tab.id },
    tabs: [tab],
    favorites: [],
    notes: {},
    split: {},
    closed: [],
    universe: {},
    localhost: [],
    atmo: { mode: 'nebula', sound: false, soundType: '', volume: 0.35 },
    settings: { engine: 'google', sidebar: true, panel: true, panelTab: 'ai', focus: false },
  };
}

function migrate(st) {
  const d = defaultState();
  if (!st || typeof st !== 'object' || !Array.isArray(st.workspaces) || !st.workspaces.length) return d;
  const s = Object.assign({}, d, st);
  s.workspaces = st.workspaces.filter(w => w && w.id).map(w => ({
    id: String(w.id), name: String(w.name || 'Workspace'), icon: WS_ICONS.includes(w.icon) ? w.icon : 'grid', color: w.color || '#695CFF',
  }));
  const wsIds = new Set(s.workspaces.map(w => w.id));
  s.tabs = (Array.isArray(st.tabs) ? st.tabs : []).filter(t => t && t.id && wsIds.has(t.ws))
    .map(t => Object.assign({}, t, { id: String(t.id), url: String(t.url || 'tsf://newtab'), title: String(t.title || ''), favicon: String(t.favicon || '') }));
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const arr = v => Array.isArray(v) ? v : [];
  s.favorites = arr(st.favorites).filter(f => f && f.url);
  s.notes = obj(st.notes);
  s.split = obj(st.split);
  s.closed = arr(st.closed).filter(c => c && c.url);
  s.universe = obj(st.universe);
  s.localhost = arr(st.localhost).filter(p => p && p.url);
  s.atmo = Object.assign({}, d.atmo, obj(st.atmo));
  s.settings = Object.assign({}, d.settings, obj(st.settings));
  if (!ENGINES[s.settings.engine]) s.settings.engine = 'google';
  s.activeTab = obj(st.activeTab);
  if (!wsIds.has(s.activeWs)) s.activeWs = s.workspaces[0].id;
  return s;
}

function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flushState, 350); }
function flushState() { clearTimeout(saveTimer); if (S) send('save', { file: 'state', data: JSON.stringify(S) }); }
function saveHist() { clearTimeout(histTimer); histTimer = setTimeout(flushHist, 1500); }
function flushHist() { clearTimeout(histTimer); send('save', { file: 'history', data: JSON.stringify(H) }); }
function saveSessions() { clearTimeout(sessTimer); sessTimer = setTimeout(flushSessions, 1500); }
function flushSessions() { clearTimeout(sessTimer); send('save', { file: 'sessions', data: JSON.stringify(SESS) }); }

const ws = id => S.workspaces.find(w => w.id === (id || S.activeWs));
const tabById = id => S.tabs.find(t => t.id === id);
const wsTabs = (id = S.activeWs) => S.tabs.filter(t => t.ws === id);
const curTab = () => { const t = tabById(S.activeTab[S.activeWs]); return t && t.ws === S.activeWs ? t : null; };
const isInternal = url => !url || url.startsWith('tsf://');
const internalPage = url => (url || '').replace(/^tsf:\/\//, '').split(/[/?#]/)[0] || 'newtab';
const internalParams = url => new URLSearchParams((String(url || '').split('?')[1] || '').split('#')[0]);
function rt(id) {
  if (!RT.has(id)) RT.set(id, { loading: false, canBack: false, canFwd: false, hasView: false, zoom: 1 });
  return RT.get(id);
}
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const prettyUrl = url => {
  if (!url) return '';
  try { const u = new URL(url); return (u.protocol === 'https:' ? '' : u.protocol + '//') + u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + u.search; }
  catch (e) { return url; }
};

function toUrl(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^tsf:\/\//i.test(t)) return t;
  if (/^(https?|file|edge|ftp):\/\//i.test(t) || /^(about|data|view-source):/i.test(t)) return t;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) return 'http://' + t;
  if (/^:\d{2,5}$/.test(t)) return 'http://localhost' + t;
  if (!/\s/.test(t) && /^[^\s/:]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return 'https://' + t;
  return ENGINES[S.settings.engine].url + encodeURIComponent(t);
}

function titleFor(url) {
  if (isInternal(url)) return (INTERNAL[internalPage(url)] || INTERNAL.newtab).t;
  return hostOf(url) || url;
}

function letterColor(s) {
  let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return WS_COLORS[h % WS_COLORS.length];
}
function favHtml(url, favicon, title, extra = '') {
  if (isInternal(url)) {
    const p = INTERNAL[internalPage(url)] || INTERNAL.newtab;
    return `<span class="fav internal-fav ${extra}">${icon(p.i, 'sm')}</span>`;
  }
  const name = hostOf(url) || title || '?';
  const letter = esc(name.charAt(0).toUpperCase());
  if (favicon && /^https?:|^data:/.test(favicon)) {
    return `<span class="fav ${extra}"><img src="${esc(favicon)}" alt="" data-letter="${letter}" data-c="${letterColor(name)}"></span>`;
  }
  return `<span class="fav letter ${extra}" style="--c:${letterColor(name)}">${letter}</span>`;
}
function thumbHtml(url, favicon, title) {
  const src = thumbUrl(url);
  return `<div class="thumb ${src ? '' : 'nothumb'}">${src ? `<img src="${esc(src)}" alt="" data-thumb="1" loading="lazy">` : ''}<div class="thumb-ph">${favHtml(url, favicon, title)}</div></div>`;
}
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  if (img.dataset.letter) {
    const box = img.parentElement;
    box.classList.add('letter'); box.style.setProperty('--c', img.dataset.c); box.textContent = img.dataset.letter;
  } else if (img.dataset.thumb) {
    img.parentElement.classList.add('nothumb'); img.remove();
  }
}, true);

// ============================================================ abas e workspaces
function newTab(url = 'tsf://newtab', opts = {}) {
  const wsId = opts.ws || S.activeWs;
  const t = { id: opts.id || uid('t'), ws: wsId, url, title: opts.title || titleFor(url), favicon: opts.favicon || '' };
  const cur = curTab();
  const idx = cur && cur.ws === wsId ? S.tabs.indexOf(cur) + 1 : S.tabs.length;
  S.tabs.splice(idx, 0, t);
  if (opts.hasView) rt(t.id).hasView = true;
  if (opts.activate !== false) activateTab(t.id);
  else { renderTabs(); renderWorkspaces(); save(); }
  return t;
}

function ensureView(t) {
  if (!t) return;
  const r = rt(t.id);
  if (r.hasView || isInternal(t.url)) return;
  r.hasView = true; r.loading = true;
  send('tab:create', { id: t.id, ws: t.ws, url: t.url });
}

function activateTab(id, { focus = true } = {}) {
  const t = tabById(id);
  if (!t) return;
  S.activeWs = t.ws;
  S.activeTab[t.ws] = t.id;
  $('#linkHint').textContent = '';
  ensureView(t);
  const sp = splitOf(t);
  if (sp) { ensureView(tabById(sp.a)); ensureView(tabById(sp.b)); }
  renderAll();
  save();
  if (focus && !isInternal(t.url)) setTimeout(() => send('focus', { target: 'content' }), 30);
}

function navigate(t, url) {
  if (!t || !url) return;
  if (isInternal(url)) {
    if (isInternal(t.url) && internalPage(t.url) === 'newtab') { t.url = url; t.title = titleFor(url); t.favicon = ''; renderAll(); save(); }
    else openInternal(url);
    return;
  }
  const r = rt(t.id);
  if (isInternal(t.url)) { t.title = titleFor(url); t.favicon = ''; }
  t.url = url;
  r.error = null;
  if (!r.hasView) { r.hasView = true; send('tab:create', { id: t.id, ws: t.ws, url }); }
  else send('tab:navigate', { id: t.id, url });
  r.loading = true;
  renderAll();
  save();
  if (t === curTab()) setTimeout(() => send('focus', { target: 'content' }), 30);
}

function openUrl(url, newTabToo = false) {
  if (!url) return;
  const t = curTab();
  if (newTabToo || !t || (isInternal(t.url) && !['newtab', 'history'].includes(internalPage(t.url)))) newTab(url);
  else navigate(t, url);
}

function openInternal(url) {
  const page = internalPage(url);
  const existing = wsTabs().find(t => isInternal(t.url) && internalPage(t.url) === page && page !== 'newtab');
  if (existing) {
    if (url.includes('?') && existing.url !== url) { existing.url = url; internalKey = ''; }
    return activateTab(existing.id);
  }
  const t = curTab();
  if (t && isInternal(t.url) && internalPage(t.url) === 'newtab') navigate(t, url);
  else newTab(url);
}

function closeTab(id) {
  const t = tabById(id);
  if (!t) return;
  snapshotSession(true);
  const list = wsTabs(t.ws);
  const pos = list.indexOf(t);
  const wasActive = S.activeTab[t.ws] === t.id;
  if (!isInternal(t.url)) {
    S.closed.push({ ws: t.ws, url: t.url, title: t.title, favicon: t.favicon, ts: Date.now() });
    if (S.closed.length > 40) S.closed.splice(0, S.closed.length - 40);
  }
  if (internalPage(t.url) === 'lab' && typeof Lab !== 'undefined') Lab.dispose(t);
  const sp = S.split[t.ws];
  if (sp && (sp.a === id || sp.b === id)) {
    delete S.split[t.ws];
    if (wasActive) { S.activeTab[t.ws] = sp.a === id ? sp.b : sp.a; }
  }
  S.tabs.splice(S.tabs.indexOf(t), 1);
  if (rt(id).hasView) send('tab:close', { id });
  RT.delete(id);
  if (wasActive && S.activeTab[t.ws] === id) {
    const rest = wsTabs(t.ws);
    if (!rest.length) { delete S.activeTab[t.ws]; if (t.ws === S.activeWs) return newTab('tsf://newtab', { ws: t.ws }); }
    else {
      const next = rest[Math.min(pos, rest.length - 1)];
      if (t.ws === S.activeWs) return activateTab(next.id);
      S.activeTab[t.ws] = next.id;
    }
  } else if (wasActive && t.ws === S.activeWs) return activateTab(S.activeTab[t.ws]);
  renderAll();
  save();
}

// Volta a aba atual para a página inicial (Nova aba).
function goHome() {
  const t = curTab();
  if (!t) return newTab();
  if (isInternal(t.url) && internalPage(t.url) === 'newtab') { refreshInternal(); return; }
  if (internalPage(t.url) === 'lab' && isInternal(t.url) && typeof Lab !== 'undefined') Lab.dispose(t);
  if (!isInternal(t.url)) {
    const sp = S.split[t.ws];
    if (sp && (sp.a === t.id || sp.b === t.id)) delete S.split[t.ws];
    const r = rt(t.id);
    if (r.hasView) send('tab:close', { id: t.id });
    Object.assign(r, { hasView: false, loading: false, canBack: false, canFwd: false });
  }
  t.url = 'tsf://newtab'; t.title = 'Nova aba'; t.favicon = '';
  renderAll(); save();
}

function reopenTab(entry) {
  const c = entry || S.closed.pop();
  if (!c) return toast('Nenhuma aba fechada recentemente.');
  if (entry) { const i = S.closed.indexOf(entry); if (i >= 0) S.closed.splice(i, 1); }
  const target = ws(c.ws) ? c.ws : S.activeWs;
  if (target !== S.activeWs) S.activeWs = target;
  newTab(c.url, { ws: target, title: c.title, favicon: c.favicon });
}

function cycleTab(d) {
  const list = wsTabs();
  if (list.length < 2) return;
  const i = list.indexOf(curTab());
  activateTab(list[(i + d + list.length) % list.length].id);
}

function switchWs(id) {
  const w = ws(id);
  if (!w) return;
  S.activeWs = w.id;
  const list = wsTabs(w.id);
  if (!list.length) return newTab('tsf://newtab', { ws: w.id });
  activateTab((tabById(S.activeTab[w.id]) || list[0]).id);
}

function createWorkspace(name, opts = {}) {
  name = String(name || '').trim();
  if (!name) return null;
  const used = new Set(S.workspaces.map(w => w.color));
  const w = { id: uid('w'), name: name.slice(0, 32), icon: opts.icon || WS_ICONS[S.workspaces.length % WS_ICONS.length], color: WS_COLORS.find(c => !used.has(c)) || WS_COLORS[S.workspaces.length % WS_COLORS.length] };
  S.workspaces.push(w);
  if (opts.silent) { save(); return w; }
  switchWs(w.id);
  toast(`Workspace "${w.name}" criado — com cookies e logins isolados.`);
  return w;
}

function deleteWorkspace(id) {
  if (S.workspaces.length < 2) return toast('É preciso manter pelo menos um workspace.');
  const w = ws(id);
  for (const t of wsTabs(id)) {
    if (internalPage(t.url) === 'lab' && typeof Lab !== 'undefined') Lab.dispose(t);
    if (rt(t.id).hasView) send('tab:close', { id: t.id });
    RT.delete(t.id);
  }
  S.tabs = S.tabs.filter(t => t.ws !== id);
  S.favorites = S.favorites.filter(f => f.ws !== id);
  S.workspaces = S.workspaces.filter(x => x.id !== id);
  delete S.activeTab[id]; delete S.split[id]; delete S.universe[id];
  send('clear', { ws: id });
  if (S.activeWs === id) switchWs(S.workspaces[0].id);
  else { renderAll(); save(); }
  toast(`Workspace "${w.name}" removido.`);
}

// ============================================================ Split View
function splitOf(t) {
  if (!t || !S.split) return null;
  const sp = S.split[t.ws];
  if (!sp || (sp.a !== t.id && sp.b !== t.id)) return null;
  const a = tabById(sp.a), b = tabById(sp.b);
  if (!a || !b || a.ws !== b.ws || isInternal(a.url) || isInternal(b.url)) return null;
  return sp;
}
function splitWith(otherId) {
  const t = curTab(), o = tabById(otherId);
  if (!t || !o || t.id === o.id) return;
  if (isInternal(t.url) || isInternal(o.url)) return toast('O Split View funciona com duas páginas web.');
  S.split[t.ws] = { a: t.id, b: o.id, ratio: 0.5 };
  ensureView(o);
  renderAll(); save();
  toast('Split View ativo — arraste a divisória para ajustar. Ctrl+Shift+D desfaz.');
}
function unsplit() {
  const t = curTab();
  if (t && S.split[t.ws]) { delete S.split[t.ws]; renderAll(); save(); toast('Split View desfeito.'); }
}
function swapSplit() {
  const t = curTab(); const sp = splitOf(t);
  if (!sp) return;
  [sp.a, sp.b] = [sp.b, sp.a]; sp.ratio = 1 - sp.ratio;
  stageKey = ''; renderStage(); save();
}
function pickSplit() {
  const t = curTab();
  if (!t || isInternal(t.url)) return toast('Abra uma página web para dividir a tela.');
  if (splitOf(t)) return unsplit();
  openCommand({
    placeholder: 'Escolha a aba para o outro lado — ou digite uma URL…', icon: 'columns',
    source: q => {
      const nq = norm(q);
      const groups = [];
      if (q.trim()) {
        const u = toUrl(q);
        groups.push({ g: 'Abrir ao lado', items: [{ i: 'columns', t: `Abrir ${prettyUrl(u)} ao lado`, k: 'Enter', run: () => { const n = newTab(u, { activate: false }); ensureView(n); splitWith(n.id); } }] });
      }
      const items = wsTabs().filter(o => o.id !== t.id && !isInternal(o.url) && (!nq || norm(o.title + ' ' + o.url).includes(nq)))
        .map(o => ({ fav: favHtml(o.url, o.favicon, o.title), t: o.title || hostOf(o.url), sub: hostOf(o.url), run: () => splitWith(o.id) }));
      if (items.length) groups.push({ g: 'Abas deste workspace', items });
      if (!groups.length) groups.push({ g: 'Dica', items: [{ i: 'globe', t: 'Digite uma URL para abrir ao lado', run: () => {} }] });
      return groups;
    },
  });
}

// ============================================================ favoritos, histórico, sessões
const favIndex = url => S.favorites.findIndex(f => f.url === url && f.ws === S.activeWs);
function toggleFav() {
  const t = curTab();
  if (!t || isInternal(t.url)) return toast('Abra uma página web para favoritar.');
  const i = favIndex(t.url);
  if (i >= 0) { S.favorites.splice(i, 1); toast('Removido dos favoritos.'); }
  else { S.favorites.push({ url: t.url, title: t.title || hostOf(t.url), favicon: t.favicon, ws: S.activeWs }); toast(`Favoritado em ${ws().name}.`); }
  renderToolbar(); refreshInternal(); save();
}

function addHistory(t, url, title) {
  if (!/^https?:/i.test(url)) return;
  const last = H[H.length - 1];
  const now = Date.now();
  if (last && last.u === url && now - last.ts < 30000) { if (title) last.t = title; }
  else H.push({ u: url, t: title || '', f: t.favicon || '', ws: t.ws, ts: now });
  rt(t.id).hist = H[H.length - 1];
  if (H.length > 8000) H.splice(0, H.length - 7000);
  saveHist();
}

function snapshotSession(force) {
  if (!S) return;
  const tabs = S.tabs.filter(t => !isInternal(t.url)).map(t => ({ w: t.ws, u: t.url, t: t.title, f: t.favicon }));
  if (!tabs.length) return;
  const sig = x => x.map(a => a.w + '|' + a.u).join('\n');
  const last = SESS[SESS.length - 1];
  if (last) {
    if (sig(last.tabs) === sig(tabs)) return;
    if (Date.now() - last.ts < (force ? 20000 : 180000)) return;
  }
  SESS.push({ ts: Date.now(), ws: S.workspaces.map(w => ({ id: w.id, n: w.name, c: w.color, i: w.icon })), tabs });
  if (SESS.length > 400) SESS.splice(0, SESS.length - 400);
  saveSessions();
}
setInterval(() => snapshotSession(false), 60000);

// ============================================================ renderização
const body = document.body;
const internalBox = $('#internal');
const viewport = $('#viewport');
const stageWeb = $('#stageWeb');
let internalKey = '', curPage = null, stageKey = '';
let waveColors = ['#7B6CFF', '#4F7BFF', '#25D9F2'];

function renderAll() {
  if (!S) return;
  renderWorkspaces(); renderTools(); renderTabs(); renderToolbar(); renderStage(); renderInternal(); renderPanel(); renderStatus(); applyLayout();
  if (typeof Inspector !== 'undefined') Inspector.sync();
}

function applyLayout() {
  body.classList.toggle('side-collapsed', !S.settings.sidebar);
  body.classList.toggle('no-panel', !S.settings.panel);
  body.classList.toggle('focus-mode', !!S.settings.focus);
  const w = ws();
  document.documentElement.style.setProperty('--ws', w.color);
  $('#btnCollapse').innerHTML = icon(S.settings.sidebar ? 'sidebar' : 'sidebarOpen');
  $('#btnCollapse').title = S.settings.sidebar ? 'Recolher sidebar (Ctrl+B)' : 'Expandir sidebar (Ctrl+B)';
  $('#btnPanel').classList.toggle('on', !!S.settings.panel && !S.settings.focus);
  scheduleLayout();
}

function renderWorkspaces() {
  $('#wsList').innerHTML = S.workspaces.map((w, i) => `
    <button class="ws-item ${w.id === S.activeWs ? 'active' : ''}" style="--ws:${esc(w.color)}" data-ws="${esc(w.id)}" title="${esc(w.name)}${i < 9 ? ` (Alt+${i + 1})` : ''}">
      ${icon(w.icon)}<span class="name">${esc(w.name)}</span><span class="count">${wsTabs(w.id).length}</span>
    </button>`).join('');
  const w = ws();
  const av = $('#wsAvatar');
  av.textContent = w.name.charAt(0).toUpperCase();
  av.style.setProperty('--ws', w.color);
  av.title = `Workspace: ${w.name}`;
}

function renderTools() {
  const t = curTab();
  const page = t && isInternal(t.url) ? internalPage(t.url) : '';
  $('#tools').innerHTML = TOOLS.map(x => `<button class="tool ${page === x.id ? 'on' : ''}" data-cmd="${x.id}" title="${esc(INTERNAL[x.id].t)} (${x.k})">${icon(INTERNAL[x.id].i)}<span>${esc(x.s)}</span></button>`).join('');
}

function renderTabs() {
  const cur = curTab();
  const sp = cur ? S.split[cur.ws] : null;
  const list = wsTabs();
  $('#tabList').innerHTML = list.map(t => {
    const r = rt(t.id);
    const inSplit = sp && (sp.a === t.id || sp.b === t.id) && splitOf(t);
    return `<div class="tab-item ${cur && t.id === cur.id ? 'active' : ''} ${inSplit ? 'in-split' : ''}" data-tab="${esc(t.id)}" title="${esc(t.title)}\n${esc(isInternal(t.url) ? '' : prettyUrl(t.url))}\nCtrl+clique: abrir em Split View">
      ${favHtml(t.url, t.favicon, t.title, r.loading && r.hasView ? 'loading' : '')}
      <span class="title">${esc(t.title || titleFor(t.url))}</span>
      ${inSplit ? `<span class="split-mark" title="Em Split View">${icon('columns', 'sm')}</span>` : ''}
      <button class="x" data-close="${esc(t.id)}" title="Fechar aba (Ctrl+W)">${icon('x')}</button>
    </div>`;
  }).join('') + `<button class="tab-new" data-cmd="newTab" title="Nova aba (Ctrl+T)">${icon('plus')}<span>Nova aba</span></button>`;
}

function renderToolbar() {
  const t = curTab();
  const r = t ? rt(t.id) : null;
  const web = t && !isInternal(t.url);
  const subPage = t && isInternal(t.url) && internalPage(t.url) !== 'newtab';
  $('#btnBack').disabled = !((web && r.canBack) || subPage);
  $('#btnBack').title = subPage ? 'Voltar ao início (Alt+←)' : 'Voltar (Alt+←)';
  $('#btnFwd').disabled = !(web && r.canFwd);
  const loading = web && r.loading;
  $('#btnReload').innerHTML = icon(loading ? 'x' : 'reload');
  $('#btnReload').title = loading ? 'Parar (Esc)' : 'Recarregar (F5)';
  $('#btnReload').dataset.cmd = loading ? 'stop' : 'reload';
  $('#btnReload').disabled = !web;
  const fav = web && favIndex(t.url) >= 0;
  $('#btnStar').innerHTML = icon(fav ? 'starFill' : 'star');
  $('#btnStar').classList.toggle('star-on', !!fav);
  $('#btnDev').disabled = !web;
  $('#btnSplit').classList.toggle('on', !!splitOf(t));
  $('#btnInspector').classList.toggle('on', typeof Inspector !== 'undefined' && Inspector.isOpen());
  $('#progress').classList.toggle('on', !!loading);

  const oi = $('#omniIcon');
  let cls = '', ic = 'search';
  if (web) {
    if (t.url.startsWith('https:')) { cls = 'secure'; ic = 'lock'; }
    else if (t.url.startsWith('http:')) { cls = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(t.url) ? '' : 'insecure'; ic = cls ? 'warn' : 'terminal'; }
  } else if (t && internalPage(t.url) !== 'newtab') { cls = 'tsfpage'; ic = (INTERNAL[internalPage(t.url)] || INTERNAL.newtab).i; }
  oi.className = 'omni-ic ' + cls;
  oi.innerHTML = icon(ic, 'sm');
  oi.title = cls === 'secure' ? 'Conexão segura (HTTPS)' : cls === 'insecure' ? 'Conexão não segura' : '';
  const input = $('#omniInput');
  if (document.activeElement !== input) input.value = web ? prettyUrl(t.url) : (t && internalPage(t.url) !== 'newtab' ? 'tsf://' + internalPage(t.url) : '');
  document.title = (t && t.title ? t.title + ' — ' : '') + 'TSF Browser';
}

function renderStatus() {
  const pill = $('#statusPill');
  if (pill.classList.contains('toast')) return;
  const w = ws();
  const n = wsTabs().length;
  const t = curTab();
  pill.innerHTML = `<span class="live"></span> Workspace: <b>${esc(w.name)}</b><span class="dot"></span>${n} ${n === 1 ? 'aba' : 'abas'}` +
    (splitOf(t) ? `<span class="dot"></span>Split View` : '') +
    (typeof Inspector !== 'undefined' && Inspector.isOpen() ? `<span class="dot"></span>Inspector` : '');
}

// ---- atualização automática
let UPDATE = { state: 'idle' };
function updateText() {
  const u = UPDATE;
  switch (u.state) {
    case 'checking': return 'Procurando atualizações…';
    case 'latest': return `Você está na versão mais recente (${INFO.version}).`;
    case 'downloading': return `Baixando a versão ${u.version || ''}… ${u.percent || 0}%`;
    case 'ready': return `Versão ${u.version} baixada — reinicie para instalar.`;
    case 'error': return `Não foi possível verificar: ${u.message || 'erro desconhecido'}`;
    default: return INFO.updates ? 'Verificação automática a cada 4 horas.' : 'Atualizações automáticas só funcionam na versão instalada.';
  }
}
function renderUpdate() {
  const chip = $('#updateChip');
  const show = UPDATE.state === 'ready' || UPDATE.state === 'downloading';
  chip.hidden = !show;
  chip.classList.toggle('ready', UPDATE.state === 'ready');
  chip.innerHTML = UPDATE.state === 'ready'
    ? `${icon('download', 'sm')}<span>Atualização ${esc(UPDATE.version)} · <b>Reiniciar</b></span>`
    : `${icon('download', 'sm')}<span>Baixando ${esc(UPDATE.version || '')} · ${UPDATE.percent || 0}%</span>`;
  chip.title = UPDATE.state === 'ready' ? 'Salva suas abas, instala a atualização e reabre o navegador' : 'Baixando em segundo plano';
  const s = $('#updStatus');
  if (s) s.textContent = updateText();
  const b = $('#updRestart');
  if (b) b.hidden = UPDATE.state !== 'ready';
}

let toastTimer = 0;
function toast(text) {
  const pill = $('#statusPill');
  pill.classList.add('toast');
  pill.innerHTML = `${icon('sparkle', 'sm')} ${esc(text)}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { pill.classList.remove('toast'); renderStatus(); }, 3400);
}

// ---- área de conteúdo (aba única / Split View)
const paneHtml = (id, solo) => `<div class="pane${solo ? ' solo' : ''}" data-pane="${esc(id)}"><div class="surface" data-view="${esc(id)}"><img class="snap" alt="" hidden></div></div>`;
function renderStage() {
  const t = curTab();
  let key = '', html = '';
  const sp = splitOf(t);
  if (t && !isInternal(t.url)) {
    if (sp) {
      key = 'split|' + sp.a + '|' + sp.b;
      html = `<div class="split" id="split">${paneHtml(sp.a)}<div class="divider" id="divider" title="Arraste para redimensionar · duplo clique: inverter lados"><i></i></div>${paneHtml(sp.b)}</div>`;
    } else {
      key = 'one|' + t.id;
      html = `<div class="solo-wrap">${paneHtml(t.id, true)}</div>`;
    }
  }
  if (key !== stageKey) { stageKey = key; stageWeb.innerHTML = html; }
  if (sp) {
    $('#split').style.setProperty('--ratio', sp.ratio);
    $$('.pane', stageWeb).forEach(p => p.classList.toggle('active', p.dataset.pane === t.id));
  }
  paintErrors();
  scheduleLayout();
}

// Página de erro própria: esconde a view nativa e mostra um cartão no lugar.
function paintErrors() {
  $$('.surface[data-view]', stageWeb).forEach(s => {
    const err = rt(s.dataset.view).error;
    let card = s.querySelector('.err-card');
    s.dataset.off = err ? '1' : '';
    if (!err) { if (card) card.remove(); return; }
    if (!card) { card = document.createElement('div'); card.className = 'err-card'; s.appendChild(card); }
    const offline = /INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION/i.test(err.desc || '');
    card.innerHTML = `<div class="err-in">
      <span class="err-ic">${icon(offline ? 'globe' : 'warn', 'lg')}</span>
      <h2>Não foi possível abrir esta página</h2>
      <p>${esc(hostOf(err.url) || err.url)} ${offline ? 'não respondeu. Verifique a conexão ou o endereço.' : 'retornou um erro.'}</p>
      <code>${esc(err.desc || 'ERRO')} (${esc(err.code)})</code>
      <div class="acts"><button class="btn primary" data-err-retry="${esc(s.dataset.view)}">${icon('reload')}Tentar novamente</button>
      <button class="btn" data-err-search="${esc(hostOf(err.url) || err.url)}">${icon('search')}Pesquisar</button></div></div>`;
  });
}
stageWeb.addEventListener('click', e => {
  const r = e.target.closest('[data-err-retry]');
  if (r) { const id = r.dataset.errRetry; rt(id).error = null; paintErrors(); scheduleLayout(); send('tab:reload', { id }); return; }
  const q = e.target.closest('[data-err-search]');
  if (q) openUrl(ENGINES[S.settings.engine].url + encodeURIComponent(q.dataset.errSearch));
});

stageWeb.addEventListener('pointerdown', e => {
  const d = e.target.closest('#divider');
  if (!d || e.button !== 0) return;
  const t = curTab(); const sp = splitOf(t);
  if (!sp) return;
  e.preventDefault();
  d.setPointerCapture(e.pointerId);
  d.classList.add('drag');
  const box = $('#split').getBoundingClientRect();
  const move = ev => {
    sp.ratio = clamp((ev.clientX - box.left) / box.width, 0.18, 0.82);
    $('#split').style.setProperty('--ratio', sp.ratio);
    reportLayout();
  };
  const up = () => { d.classList.remove('drag'); d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); save(); };
  d.addEventListener('pointermove', move);
  d.addEventListener('pointerup', up);
});
stageWeb.addEventListener('dblclick', e => { if (e.target.closest('#divider')) swapSplit(); });

// ---- páginas internas
function renderInternal(force) {
  const t = curTab();
  if (!t || !isInternal(t.url)) {
    unmountPage();
    internalBox.hidden = true; internalBox.innerHTML = ''; internalKey = '';
    return;
  }
  const page = internalPage(t.url);
  const key = page + '|' + t.id + '|' + S.activeWs;
  internalBox.hidden = false;
  if (key === internalKey && !force) return;
  unmountPage();
  internalKey = key;
  const P = PAGES[page] || PAGES.newtab;
  internalBox.className = 'internal page-' + page;
  internalBox.innerHTML = P.render(t);
  internalBox.scrollTop = 0;
  curPage = P;
  if (P.mount) P.mount(internalBox, t);
  const auto = internalBox.querySelector('[data-autofocus]');
  if (auto) setTimeout(() => { if (!overlayOpen) { focusShell(); auto.focus(); } }, 30);
  scheduleLayout();
}
function unmountPage() { if (curPage && curPage.unmount) { try { curPage.unmount(); } catch (e) { console.error(e); } } curPage = null; }
function refreshInternal() { const t = curTab(); if (t && isInternal(t.url)) renderInternal(true); }

// ============================================================ layout nativo (onde cada WebView aparece)
let lastLayout = '', layoutCount = 0;
function reportLayout() {
  if (!S) return;
  const dpr = devicePixelRatio || 1;
  const items = [];
  $$('[data-view]', viewport).forEach(el => {
    if (el.dataset.off === '1') return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const it = { id: el.dataset.view, x: Math.round(r.left * dpr), y: Math.round(r.top * dpr), w: Math.round(r.width * dpr), h: Math.round(r.height * dpr), r: Math.round((el.dataset.r ? Number(el.dataset.r) : 12) * dpr) };
    if (el.dataset.zoom) it.zoom = Number(el.dataset.zoom);
    items.push(it);
  });
  const t = curTab();
  const msg = { items, dpr, primary: t && !isInternal(t.url) ? t.id : (items[0] ? items[0].id : null) };
  layoutCount = items.length;
  const key = JSON.stringify(msg);
  if (key === lastLayout) return;
  lastLayout = key;
  send('layout', msg);
}
let layoutRaf = 0, layoutUntil = 0;
function scheduleLayout() {
  layoutUntil = performance.now() + 360;
  if (layoutRaf) return;
  const loop = () => { reportLayout(); layoutRaf = performance.now() < layoutUntil ? requestAnimationFrame(loop) : 0; };
  layoutRaf = requestAnimationFrame(loop);
}
new ResizeObserver(() => scheduleLayout()).observe(viewport);
addEventListener('resize', reportLayout);

// ============================================================ painel lateral
const notesText = $('#notesText');
let notesKey = '', notesTimer = 0;

function renderPanel() {
  $('#ptabAi').innerHTML = `${icon('sparkle')} TSF AI`;
  $('#ptabNotes').innerHTML = `${icon('note')} Notas`;
  $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.ptab === S.settings.panelTab));
  $$('.ptab').forEach(p => { p.hidden = p.dataset.pane !== S.settings.panelTab; });

  const t = curTab();
  const web = t && !isInternal(t.url);
  const w = ws();
  const r = t ? rt(t.id) : null;
  let sec = '<b>Página interna</b>';
  if (web) {
    if (t.url.startsWith('https:')) sec = `<b class="ok">${icon('lock', 'sm')}HTTPS</b>`;
    else if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(t.url)) sec = `<b>${icon('terminal', 'sm')}Servidor local</b>`;
    else sec = `<b class="warn">${icon('warn', 'sm')}Não segura</b>`;
  }
  $('#aiCtx').innerHTML = `
    <div class="ctx-top">${t ? favHtml(t.url, t.favicon, t.title) : ''}<div class="t"><b>${esc(t ? t.title || titleFor(t.url) : '—')}</b><span>${esc(web ? hostOf(t.url) : 'tsf://' + (t ? internalPage(t.url) : ''))}</span></div></div>
    <div class="ctx-row"><span>Conexão</span>${sec}</div>
    <div class="ctx-row"><span>Workspace</span><b><span class="dot-ws" style="--ws:${esc(w.color)}"></span>${esc(w.name)}</b></div>
    <div class="ctx-row"><span>Zoom</span><b>${Math.round((r ? r.zoom : 1) * 100)}%</b></div>`;

  const key = web ? hostOf(t.url) : '';
  if (key !== notesKey && (document.activeElement !== notesText || !notesKey)) {
    notesKey = key;
    notesText.value = key ? S.notes[key] || '' : '';
    notesText.disabled = !key;
    $('#notesHead').innerHTML = key ? `${icon('note', 'sm')} Notas de <b>${esc(key)}</b>` : `${icon('note', 'sm')} Abra um site para anotar`;
    $('#notesFoot').textContent = key ? 'Salvo automaticamente · só neste computador' : '';
  }
  wave.update();
}

notesText.addEventListener('input', () => {
  if (!notesKey) return;
  const v = notesText.value;
  if (v.trim()) S.notes[notesKey] = v; else delete S.notes[notesKey];
  clearTimeout(notesTimer);
  $('#notesFoot').textContent = 'Salvando…';
  notesTimer = setTimeout(() => { save(); $('#notesFoot').textContent = 'Salvo automaticamente · só neste computador'; }, 500);
});
notesText.addEventListener('focus', () => focusShell());
notesText.addEventListener('blur', () => renderPanel());
$('.seg').addEventListener('click', e => {
  const b = e.target.closest('[data-ptab]');
  if (!b) return;
  S.settings.panelTab = b.dataset.ptab; save(); renderPanel();
});

const wave = (() => {
  const cv = $('#wave');
  const ctx = cv.getContext('2d');
  let raf = 0, last = 0;
  const t0 = performance.now();
  const visible = () => S && S.settings.panel && !S.settings.focus && S.settings.panelTab === 'ai' && !document.hidden && innerWidth > 1100 && !overlayOpen;
  function frame(now) {
    raf = 0;
    if (!visible()) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    last = now;
    const dpr = devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = (now - t0) / 1000;
    const mid = h / 2;
    const [c1, c2, c3] = waveColors;
    const glow = ctx.createRadialGradient(w / 2, mid, 0, w / 2, mid, w * .55);
    glow.addColorStop(0, c1 + '38'); glow.addColorStop(1, c1 + '00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, c1 + '00'); grad.addColorStop(.3, c1); grad.addColorStop(.6, c2); grad.addColorStop(.8, c3); grad.addColorStop(1, c3 + '00');
    ctx.strokeStyle = grad;
    ctx.shadowColor = c1;
    const lines = 14;
    for (let i = 0; i < lines; i++) {
      const p = i / lines;
      ctx.globalAlpha = .18 + .55 * Math.sin(Math.PI * p);
      ctx.lineWidth = i === lines >> 1 ? 1.6 : .8;
      ctx.shadowBlur = i === lines >> 1 ? 12 : 0;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const u = x / w;
        const env = Math.exp(-Math.pow((u - .5) / .2, 2));
        const y = mid + env * h * .26 * (Math.sin(u * 9 + t * 1.6 + p * 2.4) * .6 + Math.sin(u * 17 - t * 2.3 + p * 4) * .25 + Math.sin(u * 4 + t * .7) * .3) * (1 - p * .35);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  return { update() { if (!raf && visible()) raf = requestAnimationFrame(frame); } };
})();
document.addEventListener('visibilitychange', () => wave.update());

// ============================================================ overlay (Command Center, menus, diálogos)
const overlayEl = $('#overlay');
let overlayOpen = null;

function openOverlay(html, { clear = false, onKey, onClose, cls = '' } = {}) {
  if (overlayOpen) closeOverlay(true);
  hideSuggest();
  overlayEl.className = 'overlay' + (clear ? ' clear' : '') + (cls ? ' ' + cls : '');
  overlayEl.innerHTML = html;
  overlayEl.hidden = false;
  overlayOpen = { onKey, onClose };
  if (layoutCount > 0) {
    send('overlay', { on: true });
    clearTimeout(openOverlay.timer);
    openOverlay.timer = setTimeout(() => overlayEl.classList.add('ready'), 300);
  } else {
    focusShell();
    requestAnimationFrame(() => overlayEl.classList.add('ready'));
  }
  return overlayEl;
}

function hideSnaps() { setTimeout(() => { if (!overlayOpen && !suggestOpen) $$('.snap').forEach(i => { i.hidden = true; i.removeAttribute('src'); }); }, 140); }

function closeOverlay(silent) {
  if (!overlayOpen) return;
  const o = overlayOpen;
  overlayOpen = null;
  clearTimeout(openOverlay.timer);
  overlayEl.hidden = true;
  overlayEl.innerHTML = '';
  overlayEl.classList.remove('ready');
  if (!silent) {
    send('overlay', { on: false });
    hideSnaps();
    const t = curTab();
    if (t && !isInternal(t.url)) send('focus', { target: 'content' });
  }
  if (o.onClose) o.onClose();
  wave.update();
}
overlayEl.addEventListener('mousedown', e => { if (e.target === overlayEl) closeOverlay(); });

// ---- Command Center
const ACTIONS = [
  { id: 'newTab', t: 'Nova aba', i: 'plus', k: 'Ctrl+T' },
  { id: 'closeTab', t: 'Fechar aba', i: 'x', k: 'Ctrl+W' },
  { id: 'reopenTab', t: 'Reabrir aba fechada', i: 'undo', k: 'Ctrl+Shift+T' },
  { id: 'universe', t: 'TSF Universe — mapa visual das abas', i: 'orbit', k: 'Ctrl+Shift+U', kw: 'canvas espaço cartões' },
  { id: 'timemachine', t: 'Time Machine — linha do tempo da navegação', i: 'timeline', k: 'Ctrl+Shift+H', kw: 'sessões passado restaurar' },
  { id: 'lab', t: 'Responsive Lab — ver em vários dispositivos', i: 'devices', k: 'Ctrl+Shift+L', kw: 'responsividade mobile celular tablet' },
  { id: 'localhost', t: 'Localhost — servidores locais', i: 'server', k: 'Ctrl+Shift+O', kw: 'portas dev projetos' },
  { id: 'splitView', t: 'Split View — duas páginas lado a lado', i: 'columns', k: 'Ctrl+Shift+D', kw: 'dividir tela' },
  { id: 'inspector', t: 'TSF Inspector — requisições HTTP', i: 'activity', k: 'Ctrl+Shift+E', kw: 'network api rede curl' },
  { id: 'atmosphere', t: 'TSF Atmosphere — ambiente e sons', i: 'sun', k: 'Ctrl+Shift+M', kw: 'tema humor relaxar foco jogos estudos' },
  { id: 'newWorkspace', t: 'Criar workspace', i: 'layers', kw: 'novo workspace' },
  { id: 'toggleFav', t: 'Favoritar página', i: 'star', k: 'Ctrl+D' },
  { id: 'history', t: 'Histórico', i: 'clock', k: 'Ctrl+H', kw: 'history' },
  { id: 'devtools', t: 'Abrir DevTools', i: 'code', k: 'F12', kw: 'inspecionar console' },
  { id: 'screenshot', t: 'Tirar screenshot da página', i: 'camera', k: 'Ctrl+Shift+S', kw: 'captura' },
  { id: 'toggleFocus', t: 'Alternar modo foco', i: 'focus', k: 'Ctrl+Shift+F', kw: 'focus' },
  { id: 'toggleSidebar', t: 'Alternar sidebar', i: 'sidebar', k: 'Ctrl+B' },
  { id: 'togglePanel', t: 'Alternar painel TSF AI', i: 'sparkle', k: 'Ctrl+Shift+A' },
  { id: 'notes', t: 'Criar anotação para este site', i: 'note', kw: 'quick notes nota' },
  { id: 'downloads', t: 'Downloads', i: 'download', k: 'Ctrl+J' },
  { id: 'clearWsData', t: 'Limpar cookies e cache deste workspace', i: 'trash', kw: 'cache cookies dados' },
  { id: 'zoomIn', t: 'Aumentar zoom', i: 'zoomIn', k: 'Ctrl++' },
  { id: 'zoomOut', t: 'Diminuir zoom', i: 'zoomOut', k: 'Ctrl+-' },
  { id: 'zoomReset', t: 'Zoom 100%', i: 'search', k: 'Ctrl+0' },
  { id: 'print', t: 'Imprimir', i: 'printer', k: 'Ctrl+P' },
  { id: 'settings', t: 'Configurações', i: 'gear', k: 'Ctrl+,' },
  { id: 'localhost3000', t: 'Abrir localhost:3000', i: 'terminal', kw: 'dev server local' },
];

function scoreText(text, nq) {
  if (!nq) return 1;
  const n = norm(text);
  if (n.startsWith(nq)) return 3;
  if (n.includes(' ' + nq)) return 2.5;
  if (n.includes(nq)) return 2;
  return nq.split(/\s+/).every(w => n.includes(w)) ? 1.2 : 0;
}

function commandResults(q) {
  const nq = norm(q.trim());
  const groups = [];
  if (nq) {
    const url = toUrl(q);
    const isSearch = url && url.startsWith(ENGINES[S.settings.engine].url);
    const go = [{ i: isSearch ? 'search' : 'globe', t: isSearch ? `Pesquisar "${q.trim()}"` : `Abrir ${prettyUrl(url)}`, sub: isSearch ? ENGINES[S.settings.engine].name : '', k: 'Enter', run: () => openUrl(url) }];
    if (/^\d{2,5}$/.test(nq)) go.push({ i: 'terminal', t: `Abrir localhost:${nq}`, run: () => openUrl('http://localhost:' + nq) });
    groups.push({ g: 'Ir', items: go });
  }
  const acts = ACTIONS.map(a => ({ a, s: scoreText(a.t + ' ' + (a.kw || ''), nq) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s)
    .slice(0, nq ? 7 : 9).map(({ a }) => ({ i: a.i, t: a.t, k: a.k, run: () => runCmd(a.id) }));
  const wsItems = S.workspaces.map((w, idx) => ({ w, idx, s: scoreText('workspace ' + w.name, nq) })).filter(x => x.s > 0 && (nq || x.w.id !== S.activeWs))
    .map(({ w, idx }) => ({ i: w.icon, t: `Ir para workspace: ${w.name}`, k: idx < 9 ? `Alt+${idx + 1}` : '', color: w.color, run: () => switchWs(w.id) }));
  const atmo = typeof Atmo !== 'undefined' && nq ? Atmo.commandItems(nq) : [];
  const local = nq ? S.localhost.filter(p => scoreText(p.name + ' ' + p.url, nq) > 0).slice(0, 4)
    .map(p => ({ i: 'server', t: `Abrir ${p.name}`, sub: prettyUrl(p.url), run: () => openUrl(p.url) })) : [];
  if (acts.length || wsItems.length || atmo.length || local.length) groups.push({ g: 'Comandos', items: acts.concat(local, atmo, nq ? wsItems : wsItems.slice(0, 3)) });

  const tabs = S.tabs.map(t => ({ t, s: scoreText(t.title + ' ' + t.url, nq) })).filter(x => x.s > 0 && (nq || x.t.ws === S.activeWs))
    .slice(0, nq ? 6 : 5).map(({ t }) => ({ fav: favHtml(t.url, t.favicon, t.title), t: t.title || titleFor(t.url), sub: (t.ws !== S.activeWs ? ws(t.ws).name + ' · ' : '') + (isInternal(t.url) ? '' : hostOf(t.url)), k: 'Aba', run: () => activateTab(t.id) }));
  if (tabs.length) groups.push({ g: nq ? 'Abas abertas' : 'Abas deste workspace', items: tabs });

  if (nq) {
    const favs = S.favorites.map(f => ({ f, s: scoreText(f.title + ' ' + f.url, nq) })).filter(x => x.s > 0).slice(0, 4)
      .map(({ f }) => ({ fav: favHtml(f.url, f.favicon, f.title), t: f.title || hostOf(f.url), sub: hostOf(f.url), run: () => openUrl(f.url) }));
    if (favs.length) groups.push({ g: 'Favoritos', items: favs });
    const seen = new Set(); const hist = [];
    for (let i = H.length - 1; i >= 0 && hist.length < 5; i--) {
      const h = H[i];
      if (seen.has(h.u)) continue;
      if (scoreText(h.t + ' ' + h.u, nq) > 0) { seen.add(h.u); hist.push({ fav: favHtml(h.u, h.f, h.t), t: h.t || hostOf(h.u), sub: prettyUrl(h.u), run: () => openUrl(h.u) }); }
    }
    if (hist.length) groups.push({ g: 'Histórico', items: hist });
  }
  return groups;
}

function openCommand(opts = {}) {
  const prompt = opts.prompt;
  const source = opts.source || commandResults;
  const el = openOverlay(`<div class="cmd" role="dialog" aria-label="Command Center">
      <div class="cmd-in">${icon(opts.icon || (prompt ? 'layers' : 'command'))}<input id="cmdInput" spellcheck="false" autocomplete="off" placeholder="${esc(prompt || opts.placeholder || 'Digite um comando, busque abas, histórico ou cole uma URL…')}"></div>
      <div class="cmd-list" id="cmdList"></div>
      <div class="cmd-foot">${prompt ? `<span><kbd>Enter</kbd> confirmar</span><span><kbd>Esc</kbd> cancelar</span>`
        : `<span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> executar</span><span><kbd>Esc</kbd> fechar</span><span style="margin-left:auto">TSF Command Center</span>`}</div>
    </div>`, { onKey: key });
  const input = $('#cmdInput', el);
  const list = $('#cmdList', el);
  let items = [], sel = 0;

  function draw() {
    if (prompt) {
      list.innerHTML = input.value.trim()
        ? `<button class="cmd-item sel">${icon(opts.icon || 'plus')}<span class="t">${esc(opts.label || 'Criar')} "${esc(input.value.trim())}"</span><kbd>Enter</kbd></button>`
        : `<div class="cmd-empty">${esc(opts.hint || 'Digite um nome')}</div>`;
      return;
    }
    const groups = source(input.value);
    items = [];
    list.innerHTML = groups.map(g => `<div class="cmd-group">${esc(g.g)}</div>` + g.items.map(it => {
      const n = items.push(it) - 1;
      const lead = it.fav || (it.color ? `<span style="color:${esc(it.color)}">${icon(it.i)}</span>` : icon(it.i));
      return `<button class="cmd-item" data-n="${n}">${lead}<span class="t">${esc(it.t)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.k ? `<kbd>${esc(it.k)}</kbd>` : ''}</button>`;
    }).join('')).join('') || `<div class="cmd-empty">Nenhum resultado.</div>`;
    sel = clamp(sel, 0, Math.max(0, items.length - 1));
    mark();
  }
  function mark() {
    $$('.cmd-item', list).forEach(b => b.classList.toggle('sel', Number(b.dataset.n) === sel));
    const s = $('.cmd-item.sel', list);
    if (s) s.scrollIntoView({ block: 'nearest' });
  }
  function exec(n) {
    if (prompt) { const v = input.value.trim(); if (!v) return; closeOverlay(); opts.onSubmit(v); return; }
    const it = items[n];
    if (!it) return;
    closeOverlay();
    it.run();
  }
  function key(e) {
    if (e.key === 'ArrowDown') { sel = (sel + 1) % Math.max(1, items.length); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % Math.max(1, items.length); mark(); e.preventDefault(); }
    else if (e.key === 'Enter') { exec(sel); e.preventDefault(); }
  }
  input.addEventListener('input', () => { sel = 0; draw(); });
  list.addEventListener('click', e => { const b = e.target.closest('.cmd-item'); if (b) exec(prompt ? 0 : Number(b.dataset.n)); });
  list.addEventListener('mousemove', e => { const b = e.target.closest('[data-n]'); if (b && Number(b.dataset.n) !== sel) { sel = Number(b.dataset.n); mark(); } });
  if (opts.value) input.value = opts.value;
  draw();
  setTimeout(() => input.focus(), 0);
}

function confirmDialog(title, text, okLabel, onOk) {
  const el = openOverlay(`<div class="dialog" role="alertdialog">
    <h3>${esc(title)}</h3><p>${esc(text)}</p>
    <div class="acts"><button class="btn" data-x="cancel">Cancelar</button><button class="btn danger" data-x="ok">${esc(okLabel)}</button></div></div>`,
    { onKey: e => { if (e.key === 'Enter') { e.preventDefault(); closeOverlay(); onOk(); } } });
  el.querySelector('[data-x="cancel"]').onclick = () => closeOverlay();
  el.querySelector('[data-x="ok"]').onclick = () => { closeOverlay(); onOk(); };
  setTimeout(() => el.querySelector('[data-x="cancel"]').focus(), 0);
}

// ---- menus suspensos
function openMenu(anchor, html) {
  const r = anchor.getBoundingClientRect();
  const el = openOverlay(`<div class="menu" style="top:${Math.round(r.bottom + 8)}px;right:${Math.max(8, Math.round(innerWidth - r.right))}px">${html}</div>`, { clear: true });
  el.querySelector('.menu').addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const [kind, v] = b.dataset.m.split(':');
    if (kind === 'zoom') { runCmd(v); return; }
    closeOverlay();
    if (kind === 'cmd') runCmd(v);
    else if (kind === 'ws') switchWs(v);
  });
}
const mi = (m, ic, label, k = '', extra = '') => `<button class="menu-item ${extra}" data-m="${m}">${ic}<span>${esc(label)}</span>${k ? `<kbd>${esc(k)}</kbd>` : ''}</button>`;

function mainMenu() {
  const t = curTab();
  const z = t ? Math.round(rt(t.id).zoom * 100) : 100;
  openMenu($('#btnMenu'),
    mi('cmd:command', icon('command'), 'Command Center', 'Ctrl+K') +
    mi('cmd:newTab', icon('plus'), 'Nova aba', 'Ctrl+T') +
    mi('cmd:newWorkspace', icon('layers'), 'Novo workspace') +
    '<div class="menu-sep"></div>' +
    mi('cmd:universe', icon('orbit'), 'TSF Universe', 'Ctrl+Shift+U') +
    mi('cmd:timemachine', icon('timeline'), 'Time Machine', 'Ctrl+Shift+H') +
    mi('cmd:lab', icon('devices'), 'Responsive Lab', 'Ctrl+Shift+L') +
    mi('cmd:localhost', icon('server'), 'Localhost', 'Ctrl+Shift+O') +
    mi('cmd:atmosphere', icon('sun'), 'Atmosphere', 'Ctrl+Shift+M') +
    '<div class="menu-sep"></div>' +
    mi('cmd:history', icon('clock'), 'Histórico', 'Ctrl+H') +
    mi('cmd:downloads', icon('download'), 'Downloads', 'Ctrl+J') +
    mi('cmd:screenshot', icon('camera'), 'Capturar página', 'Ctrl+Shift+S') +
    mi('cmd:print', icon('printer'), 'Imprimir', 'Ctrl+P') +
    `<div class="menu-zoom"><span>Zoom</span><button data-m="zoom:zoomOut" title="Diminuir">${icon('min', 'sm')}</button><b id="menuZoom" class="mono" style="width:44px;text-align:center">${z}%</b><button data-m="zoom:zoomIn" title="Aumentar">${icon('plus', 'sm')}</button></div>` +
    '<div class="menu-sep"></div>' +
    mi('cmd:toggleFocus', icon('focus'), 'Modo foco', 'Ctrl+Shift+F') +
    mi('cmd:settings', icon('gear'), 'Configurações', 'Ctrl+,'));
}

function wsMenu() {
  openMenu($('#wsAvatar'), S.workspaces.map((w, i) =>
    mi('ws:' + w.id, `<span class="dot-ws" style="--ws:${esc(w.color)}"></span>`, w.name, i < 9 ? `Alt+${i + 1}` : '', w.id === S.activeWs ? 'active' : '')).join('') +
    '<div class="menu-sep"></div>' + mi('cmd:newWorkspace', icon('plus'), 'Novo workspace'));
}

// ---- sugestões da barra de endereço
const omniInput = $('#omniInput');
const suggestEl = $('#suggest');
let suggestOpen = false, sugItems = [], sugSel = -1;

function showSuggest(groups) {
  sugItems = groups.flatMap(g => g.items).slice(0, 8);
  if (!sugItems.length) return hideSuggest();
  suggestEl.innerHTML = sugItems.map((it, n) =>
    `<button class="cmd-item ${n === sugSel ? 'sel' : ''}" data-n="${n}" tabindex="-1">${it.fav || icon(it.i)}<span class="t">${esc(it.t)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('');
  suggestEl.hidden = false;
  if (!suggestOpen) {
    suggestOpen = true;
    if (layoutCount > 0) send('overlay', { on: true });
  }
}
function hideSuggest() {
  if (!suggestOpen) { suggestEl.hidden = true; return; }
  suggestOpen = false; sugSel = -1;
  suggestEl.hidden = true;
  suggestEl.innerHTML = '';
  if (!overlayOpen) { send('overlay', { on: false }); hideSnaps(); }
}
function updateSuggest() {
  const q = omniInput.value;
  if (!q.trim()) return hideSuggest();
  sugSel = 0;
  showSuggest(commandResults(q).filter(g => g.g !== 'Comandos'));
}

$('#omni').addEventListener('submit', e => {
  e.preventDefault();
  if (sugSel > 0 && sugItems[sugSel]) { const it = sugItems[sugSel]; hideSuggest(); omniInput.blur(); it.run(); return; }
  const url = toUrl(omniInput.value);
  hideSuggest();
  if (!url) return;
  omniInput.blur();
  if (isInternal(url)) openInternal(url);
  else openUrl(url, omniInput._alt);
});
omniInput.addEventListener('focus', () => { focusShell(); setTimeout(() => omniInput.select(), 0); });
omniInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== omniInput) { hideSuggest(); renderToolbar(); } }, 150));
omniInput.addEventListener('input', updateSuggest);
omniInput.addEventListener('keydown', e => {
  omniInput._alt = e.altKey;
  if (e.key === 'ArrowDown' && suggestOpen) { sugSel = (sugSel + 1) % sugItems.length; showSuggest([{ items: sugItems }]); e.preventDefault(); }
  else if (e.key === 'ArrowUp' && suggestOpen) { sugSel = (sugSel - 1 + sugItems.length) % sugItems.length; showSuggest([{ items: sugItems }]); e.preventDefault(); }
  else if (e.key === 'Escape') {
    e.preventDefault(); hideSuggest(); omniInput.blur(); renderToolbar();
    const t = curTab(); if (t && !isInternal(t.url)) send('focus', { target: 'content' });
  }
});
suggestEl.addEventListener('mousedown', e => {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  e.preventDefault();
  const it = sugItems[Number(b.dataset.n)];
  hideSuggest(); omniInput.blur();
  if (it) it.run();
});

// ============================================================ comandos e atalhos
const curWeb = () => { const t = curTab(); return t && !isInternal(t.url) ? t : null; };

const CMD = {
  command: () => overlayOpen ? closeOverlay() : openCommand(),
  newTab: () => newTab(),
  closeTab: () => { const t = curTab(); if (t) closeTab(t.id); },
  reopenTab: () => reopenTab(),
  focusOmni: () => { focusShell(); omniInput.focus(); omniInput.select(); },
  nextTab: () => cycleTab(1),
  prevTab: () => cycleTab(-1),
  toggleFav,
  history: () => openInternal('tsf://history'),
  settings: () => openInternal('tsf://settings'),
  universe: () => openInternal('tsf://universe'),
  timemachine: () => openInternal('tsf://timemachine'),
  localhost: () => openInternal('tsf://localhost'),
  lab: () => Lab.open(),
  splitView: pickSplit,
  inspector: () => Inspector.toggle(),
  atmosphere: () => Atmo.openPicker(),
  downloads: () => send('downloads'),
  toggleSidebar: () => { S.settings.focus = false; S.settings.sidebar = !S.settings.sidebar; applyLayout(); save(); },
  togglePanel: () => { S.settings.focus = false; S.settings.panel = !S.settings.panel; applyLayout(); renderPanel(); save(); },
  toggleFocus: () => { S.settings.focus = !S.settings.focus; applyLayout(); wave.update(); save(); toast(S.settings.focus ? 'Modo foco ativado — Ctrl+Shift+F para sair.' : 'Modo foco desativado.'); },
  notes: () => { S.settings.focus = false; S.settings.panel = true; S.settings.panelTab = 'notes'; applyLayout(); renderPanel(); save(); setTimeout(() => { if (!notesText.disabled) { focusShell(); notesText.focus(); } }, 280); },
  back: () => {
    const t = curTab();
    if (!t) return;
    if (!isInternal(t.url)) send('tab:back', { id: t.id });
    else if (internalPage(t.url) !== 'newtab') goHome();
  },
  home: goHome,
  forward: () => { const t = curWeb(); if (t) send('tab:forward', { id: t.id }); },
  reload: () => { const t = curWeb(); if (t) send('tab:reload', { id: t.id }); else if (curTab() && internalPage(curTab().url) === 'lab') Lab.reloadAll(); },
  stop: () => { const t = curWeb(); if (t) send('tab:stop', { id: t.id }); },
  devtools: () => { const t = curWeb(); if (t) send('tab:devtools', { id: t.id }); else toast('DevTools funcionam em páginas web.'); },
  zoomIn: () => { const t = curWeb(); if (t) send('tab:zoom', { id: t.id, delta: .1 }); },
  zoomOut: () => { const t = curWeb(); if (t) send('tab:zoom', { id: t.id, delta: -.1 }); },
  zoomReset: () => { const t = curWeb(); if (t) send('tab:zoom', { id: t.id, reset: true }); },
  print: () => { const t = curWeb(); if (t) send('tab:print', { id: t.id }); },
  screenshot: () => { const t = curWeb(); if (t) send('tab:screenshot', { id: t.id }); else toast('Capturas funcionam em páginas web.'); },
  newWorkspace: () => openCommand({ prompt: 'Nome do novo workspace…', label: 'Criar workspace', hint: 'Ex.: Projeto X, Estudos, Cliente Y', icon: 'layers', onSubmit: n => createWorkspace(n) }),
  clearWsData: () => confirmDialog(`Limpar dados de "${ws().name}"?`, 'Cookies, cache, logins e armazenamento local deste workspace serão apagados. Você sairá das contas abertas nele.', 'Limpar dados', () => send('clear', { ws: S.activeWs })),
  localhost3000: () => openUrl('http://localhost:3000'),
  installUpdate: () => { if (UPDATE.state === 'ready') { toast('Salvando abas e instalando a atualização…'); send('update:install'); } },
  checkUpdate: () => send('update:check'),
  menu: mainMenu,
  wsMenu,
};
function runCmd(name, arg) { const f = CMD[name]; if (f) f(arg); }

const KEYMAP = {
  'ctrl+k': 'command', 'ctrl+shift+p': 'command', 'ctrl+t': 'newTab', 'ctrl+w': 'closeTab', 'ctrl+shift+t': 'reopenTab',
  'ctrl+l': 'focusOmni', 'alt+d': 'focusOmni', 'f6': 'focusOmni',
  'ctrl+tab': 'nextTab', 'ctrl+pagedown': 'nextTab', 'ctrl+shift+tab': 'prevTab', 'ctrl+pageup': 'prevTab',
  'ctrl+d': 'toggleFav', 'ctrl+h': 'history', 'ctrl+j': 'downloads', 'ctrl+b': 'toggleSidebar',
  'ctrl+shift+a': 'togglePanel', 'ctrl+shift+f': 'toggleFocus', 'ctrl+shift+s': 'screenshot', 'ctrl+comma': 'settings',
  'ctrl+shift+d': 'splitView', 'ctrl+shift+e': 'inspector', 'ctrl+shift+m': 'atmosphere',
  'ctrl+shift+u': 'universe', 'ctrl+shift+h': 'timemachine', 'ctrl+shift+l': 'lab', 'ctrl+shift+o': 'localhost',
  'f5': 'reload', 'ctrl+r': 'reload', 'ctrl+shift+r': 'reload', 'f12': 'devtools', 'ctrl+shift+i': 'devtools',
  'alt+left': 'back', 'alt+right': 'forward', 'alt+home': 'home',
  'ctrl+plus': 'zoomIn', 'ctrl+shift+plus': 'zoomIn', 'ctrl+minus': 'zoomOut', 'ctrl+0': 'zoomReset',
};
for (let i = 1; i <= 9; i++) { KEYMAP['alt+' + i] = 'ws' + i; KEYMAP['ctrl+' + i] = 'tab' + i; }

function handleCombo(combo) {
  const name = KEYMAP[combo];
  if (!name) return false;
  let m;
  if ((m = /^ws(\d)$/.exec(name))) { const w = S.workspaces[Number(m[1]) - 1]; if (w) { closeOverlay(); switchWs(w.id); } return true; }
  if ((m = /^tab(\d)$/.exec(name))) { const list = wsTabs(); const n = Number(m[1]); const t = n === 9 ? list[list.length - 1] : list[n - 1]; if (t) activateTab(t.id); return true; }
  if (overlayOpen && name !== 'command') closeOverlay();
  runCmd(name);
  return true;
}

function comboOf(e) {
  let k = e.key.toLowerCase();
  if (k === '+' || k === '=') k = 'plus'; else if (k === '-' || k === '_') k = 'minus'; else if (k === ',') k = 'comma';
  else if (k === 'arrowleft') k = 'left'; else if (k === 'arrowright') k = 'right';
  else if (/^digit\d$/i.test(e.code)) k = e.code.slice(5);
  else if (/^key[a-z]$/i.test(e.code)) k = e.code.slice(3).toLowerCase();
  return (e.ctrlKey ? 'ctrl+' : '') + (e.shiftKey ? 'shift+' : '') + (e.altKey ? 'alt+' : '') + k;
}

document.addEventListener('keydown', e => {
  if (overlayOpen && e.key === 'Escape') { e.preventDefault(); return closeOverlay(); }
  if (overlayOpen && overlayOpen.onKey && !e.ctrlKey && !e.altKey) { overlayOpen.onKey(e); if (e.defaultPrevented) return; }
  if (e.key === 'Escape' && document.activeElement === notesText) { notesText.blur(); return; }
  if (e.key === 'Escape') { const t = curWeb(); if (t && rt(t.id).loading) runCmd('stop'); return; }
  if ((e.ctrlKey || e.altKey || /^F\d+$/.test(e.key)) && KEYMAP[comboOf(e)]) {
    e.preventDefault();
    handleCombo(comboOf(e));
  }
});

// ============================================================ cliques da interface
document.addEventListener('click', e => {
  const w = e.target.closest('[data-win]');
  if (w) return send('win', { action: w.dataset.win });
  const c = e.target.closest('[data-cmd]');
  if (c && !c.disabled) runCmd(c.dataset.cmd);
});

$('#wsList').addEventListener('click', e => { const b = e.target.closest('[data-ws]'); if (b) switchWs(b.dataset.ws); });
$('#wsList').addEventListener('contextmenu', e => { e.preventDefault(); runCmd('settings'); });

$('#tabList').addEventListener('click', e => {
  const x = e.target.closest('[data-close]');
  if (x) { e.stopPropagation(); return closeTab(x.dataset.close); }
  const t = e.target.closest('[data-tab]');
  if (!t) return;
  if (e.ctrlKey) { const c = curTab(); if (c && c.id !== t.dataset.tab) return splitWith(t.dataset.tab); }
  activateTab(t.dataset.tab);
});
$('#tabList').addEventListener('auxclick', e => {
  const t = e.target.closest('[data-tab]');
  if (t && e.button === 1) { e.preventDefault(); closeTab(t.dataset.tab); }
});
$('#tabList').addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });

internalBox.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act && internalBox.contains(act)) { e.stopPropagation(); return pageAction(act.dataset.act, act, e); }
  const open = e.target.closest('[data-open]');
  if (open) openUrl(open.dataset.open, e.ctrlKey);
});
internalBox.addEventListener('auxclick', e => {
  const open = e.target.closest('[data-open]');
  if (open && e.button === 1) { e.preventDefault(); newTab(open.dataset.open, { activate: false }); toast('Aberto em segundo plano.'); }
});

$('.topbar').addEventListener('mousedown', e => {
  if (e.button !== 0 || body.classList.contains('native-drag')) return;
  if (e.target.closest('button, input, a, .no-drag, kbd')) return;
  if (e.detail === 2) send('win', { action: 'max' });
  else send('win', { action: 'drag' });
});
document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });

// ============================================================ mensagens do host
function onHost(m) {
  if (!m || !m.type) return;
  const t = m.id ? tabById(m.id) : null;
  const isLab = m.id && String(m.id).startsWith('lab-');
  switch (m.type) {
    case 'init': return init(m);
    case 'tab:state': {
      if (isLab) return Lab.onState(m);
      if (!t) return;
      const r = rt(t.id);
      r.loading = !!m.loading; r.canBack = !!m.canBack; r.canFwd = !!m.canFwd;
      if (m.url && m.url !== 'about:blank') t.url = m.url;
      if (m.title && m.title !== 'about:blank') { t.title = m.title; if (r.hist && r.hist.u === t.url) { r.hist.t = m.title; saveHist(); } }
      renderTabs();
      if (t === curTab()) { renderToolbar(); renderPanel(); }
      save();
      break;
    }
    case 'tab:favicon':
      if (!t) return;
      t.favicon = m.url || '';
      if (rt(t.id).hist) rt(t.id).hist.f = t.favicon;
      renderTabs(); if (t === curTab()) renderPanel(); save();
      break;
    case 'tab:nav':
      if (isLab) return Lab.onNav(m);
      if (t && m.ok) addHistory(t, m.url, m.title);
      break;
    case 'tab:opened': {
      if (tabById(m.id)) return;
      const opener = tabById(m.opener);
      if (opener && opener.ws !== S.activeWs) S.activeWs = opener.ws;
      newTab(m.url || 'about:blank', { id: m.id, ws: m.ws, hasView: true, title: 'Carregando…', activate: !m.background });
      if (m.background) toast('Link aberto em uma nova aba.');
      break;
    }
    case 'tab:close-request': if (t) closeTab(t.id); break;
    case 'tab:error':
      if (!t) return;
      if (!m.error && !rt(t.id).error) return;
      rt(t.id).error = m.error;
      if (m.error && m.error.url) t.url = m.error.url;
      if (m.error) { t.title = hostOf(m.error.url) || t.title; rt(t.id).loading = false; }
      paintErrors(); scheduleLayout(); renderTabs(); if (t === curTab()) renderToolbar();
      break;
    case 'open': { const u = toUrl(m.url); if (u) newTab(u); break; }
    case 'tab:crashed': if (t) toast(`"${t.title || titleFor(t.url)}" parou de responder (${m.kind}). Recarregue a aba.`); break;
    case 'view:focus': {
      const c = curTab();
      if (!c || !t || c.id === t.id) break;
      const sp = splitOf(c);
      if (sp && (t.id === sp.a || t.id === sp.b)) {
        S.activeTab[S.activeWs] = t.id;
        renderTabs(); renderToolbar(); renderPanel(); renderStage(); renderStatus();
        if (typeof Inspector !== 'undefined') Inspector.sync();
        save();
      }
      break;
    }
    case 'status': {
      const c = curTab();
      if (t && c && t.id === c.id) $('#linkHint').textContent = m.text || '';
      break;
    }
    case 'key': handleCombo(m.combo); break;
    case 'snapshot':
      if (overlayOpen || suggestOpen) {
        const img = $(`[data-view="${cssq(m.id)}"] .snap`);
        if (img) { img.src = m.data; img.hidden = false; }
      }
      break;
    case 'overlay:ready':
      if (overlayOpen) { overlayEl.classList.add('ready'); const f = overlayEl.querySelector('input:not([type=range]), [data-x="cancel"]'); if (f) f.focus(); }
      else if (suggestOpen) omniInput.focus();
      break;
    case 'thumb':
      THUMBV[m.name] = m.v;
      if (curPage && curPage.onThumb) curPage.onThumb(m);
      break;
    case 'net': Inspector.onNet(m); break;
    case 'net:body': Inspector.onBody(m); break;
    case 'probe:result': if (typeof Localhost !== 'undefined') Localhost.onProbe(m); break;
    case 'win':
      body.classList.toggle('maximized', !!m.maximized);
      $('#wMax').innerHTML = icon(m.maximized ? 'restore' : 'max');
      $('#wMax').title = m.maximized ? 'Restaurar' : 'Maximizar';
      scheduleLayout();
      break;
    case 'zoom':
      if (t) { rt(t.id).zoom = m.value; if (t === curTab()) renderPanel(); }
      { const mz = $('#menuZoom'); if (mz) mz.textContent = Math.round(m.value * 100) + '%'; }
      toast(`Zoom ${Math.round(m.value * 100)}%`);
      break;
    case 'shot': toast('Captura salva em Imagens\\TSF Browser.'); break;
    case 'update': {
      const was = UPDATE.state;
      UPDATE = m;
      renderUpdate();
      if (m.state === 'ready' && was !== 'ready') toast(`TSF Browser ${m.version} pronto — clique em "Reiniciar" no rodapé para atualizar.`);
      break;
    }
    case 'toast': toast(m.text); break;
    case 'flush': snapshotSession(true); flushState(); flushHist(); flushSessions(); send('win', { action: 'close-now' }); break;
  }
}

function parseJson(text, fallback) {
  try { const v = text ? JSON.parse(text) : fallback; return v == null ? fallback : v; } catch (e) { return fallback; }
}

function init(m) {
  S = migrate(parseJson(m.state, null));
  H = parseJson(m.history, []); if (!Array.isArray(H)) H = [];
  SESS = parseJson(m.sessions, []); if (!Array.isArray(SESS)) SESS = [];
  INFO = {
    version: m.version || 'dev', engine: m.engine || '', electron: m.electron || '', shots: m.shots || '',
    thumbBase: m.thumbBase || '', glass: !!m.glass, glassSupported: !!m.glassSupported, updates: !!m.updates,
  };
  body.classList.toggle('os-glass', INFO.glass);
  body.classList.toggle('electron', !!m.electron);
  body.classList.toggle('native-drag', !!m.nativeDrag);
  body.classList.toggle('maximized', !!m.maximized);
  $('#wMax').innerHTML = icon(m.maximized ? 'restore' : 'max');
  if (typeof Atmo !== 'undefined') Atmo.apply(false);
  if (m.startUrl) { const u = toUrl(m.startUrl); if (u) newTab(u); }
  const list = wsTabs();
  if (!list.length) newTab('tsf://newtab');
  else activateTab((curTab() || list[0]).id, { focus: false });
  reportLayout();
  body.classList.add('ready');
  if (m.debug && m.run) debugRun(m.run);
}

// Roteiro de teste (só com TSF_DEBUG=1): --run=url:example.com;wait:3000;cmd:splitView;key:ctrl+k;type:texto;enter
function debugRun(script) {
  const steps = script.split(';').map(s => s.trim()).filter(Boolean);
  window.onerror = (msg, src, line) => toast(`JS: ${msg} (${String(src).split('/').pop()}:${line})`);
  const next = () => {
    const s = steps.shift();
    if (!s) return;
    const i = s.indexOf(':');
    const [k, v] = i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
    let delay = 600;
    try {
      if (k === 'wait') delay = Number(v);
      else if (k === 'url') openUrl(toUrl(v));
      else if (k === 'internal') openInternal(v);
      else if (k === 'cmd') runCmd(v);
      else if (k === 'key') handleCombo(v);
      else if (k === 'type') { const el = document.activeElement; if (el && 'value' in el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }
      else if (k === 'enter') { const el = document.activeElement; const f = el && el.closest('form'); if (f) f.requestSubmit(); else if (overlayOpen && overlayOpen.onKey) overlayOpen.onKey(new KeyboardEvent('keydown', { key: 'Enter' })); }
      else if (k === 'click') { const el = $(v); if (el) el.click(); }
      else if (k === 'focus') { const el = $(v); if (el) el.focus(); }
      else if (k === 'atmo') Atmo.setMode(v);
    } catch (err) { toast('debugRun: ' + err.message); }
    setTimeout(next, delay);
  };
  setTimeout(next, 800);
}
