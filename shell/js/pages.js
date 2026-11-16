/* TSF Browser — páginas internas: Nova aba, Histórico, Configurações, Time Machine, Localhost. */
'use strict';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
function timeFmt(ts) { return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
function dayLabel(ts) {
  const d = new Date(ts); const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}
function agoFmt(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

const SUGGESTED = [
  { url: 'http://localhost:3000', title: 'localhost:3000' },
  { url: 'http://localhost:5173', title: 'Vite dev server' },
  { url: 'https://github.com', title: 'GitHub' },
  { url: 'https://developer.mozilla.org', title: 'MDN Web Docs' },
  { url: 'https://stackoverflow.com', title: 'Stack Overflow' },
];

// ============================================================ Nova aba
PAGES.newtab = {
  render() {
    const w = ws();
    const favs = S.favorites.filter(f => f.ws === w.id);
    const seen = new Set();
    const recent = [];
    for (let i = H.length - 1; i >= 0 && recent.length < 6; i--) {
      const h = H[i];
      if (h.ws !== w.id || seen.has(h.u)) continue;
      seen.add(h.u); recent.push(h);
    }
    const tiles = favs.length
      ? favs.map(f => `<button class="tile" data-open="${esc(f.url)}" title="${esc(f.url)}">
          ${favHtml(f.url, f.favicon, f.title)}<div><b>${esc(f.title || hostOf(f.url))}</b><span>${esc(hostOf(f.url))}</span></div>
          <span class="rm" data-act="unfav" data-url="${esc(f.url)}" title="Remover dos favoritos">${icon('x')}</span></button>`).join('')
      : SUGGESTED.map(f => `<button class="tile" data-open="${esc(f.url)}" title="${esc(f.url)}">
          ${favHtml(f.url, '', f.title)}<div><b>${esc(f.title)}</b><span>${esc(prettyUrl(f.url))}</span></div></button>`).join('');
    const tools = TOOLS.map(x => `<button class="tool-card" data-cmd="${x.id}">${icon(INTERNAL[x.id].i, 'lg')}<b>${esc(INTERNAL[x.id].t)}</b><kbd>${esc(x.k)}</kbd></button>`).join('');
    return `<div class="ntp">
      <div class="ntp-logo">${LOGO}</div>
      <h1>${greeting()}, <b>dev</b>.</h1>
      <p class="sub">Workspace <b style="color:${esc(w.color)}">${esc(w.name)}</b> · ${wsTabs().length} ${wsTabs().length === 1 ? 'aba' : 'abas'} · ${ENGINES[S.settings.engine].name}</p>
      <form class="ntp-search" data-form="ntp">
        ${icon('search')}<input name="q" data-autofocus spellcheck="false" autocomplete="off" placeholder="Pesquise ou digite um endereço — ex.: localhost:3000">
        <kbd>Enter</kbd>
      </form>
      <div class="ntp-hints">
        <span><kbd>Ctrl</kbd><kbd>K</kbd> Command Center</span>
        <span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>D</kbd> Split View</span>
        <span><kbd>Alt</kbd><kbd>1-9</kbd> Workspaces</span>
        <span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>M</kbd> Atmosphere</span>
      </div>
      <section class="ntp-section"><div class="tool-cards">${tools}</div></section>
      <section class="ntp-section"><h2>${favs.length ? 'Favoritos do workspace' : 'Atalhos sugeridos'}</h2><div class="tiles">${tiles}</div></section>
      ${recent.length ? `<section class="ntp-section"><h2>Visitados recentemente</h2><div class="rows">${recent.map(h => `
        <button class="row" data-open="${esc(h.u)}">${favHtml(h.u, h.f, h.t)}<div class="t"><b>${esc(h.t || hostOf(h.u))}</b><span>${esc(prettyUrl(h.u))}</span></div>
        <time>${timeFmt(h.ts)}</time></button>`).join('')}</div></section>` : ''}
    </div>`;
  },
  mount(root) {
    const f = root.querySelector('form');
    f.addEventListener('submit', e => {
      e.preventDefault();
      const url = toUrl(f.q.value);
      if (url) { if (isInternal(url)) openInternal(url); else openUrl(url); }
    });
  },
};

// ============================================================ Histórico
function historyList(q, wsFilter) {
  const nq = norm(q);
  const out = [];
  let lastDay = '';
  for (let i = H.length - 1; i >= 0 && out.length < 400; i--) {
    const h = H[i];
    if (wsFilter && h.ws !== wsFilter) continue;
    if (nq && !norm(h.t + ' ' + h.u).includes(nq)) continue;
    const day = dayLabel(h.ts);
    if (day !== lastDay) { out.push(`<h2>${esc(day)}</h2>`); lastDay = day; }
    const w = ws(h.ws);
    out.push(`<div class="row" data-open="${esc(h.u)}" role="button">${favHtml(h.u, h.f, h.t)}
      <div class="t"><b>${esc(h.t || hostOf(h.u))}</b><span>${esc(prettyUrl(h.u))}</span></div>
      ${w ? `<span class="dot-ws" style="--ws:${esc(w.color)}" title="${esc(w.name)}"></span>` : ''}
      <time>${timeFmt(h.ts)}</time>
      <button class="rm" data-act="histDel" data-ts="${h.ts}" title="Remover">${icon('x')}</button></div>`);
  }
  return out.length ? `<div class="rows">${out.join('')}</div>` : `<div class="empty" style="margin-top:24px">Nada encontrado.</div>`;
}

PAGES.history = {
  render() {
    return `<div class="page">
      <h1>Histórico</h1>
      <p class="lead">Tudo fica só neste computador. ${H.length} ${H.length === 1 ? 'registro' : 'registros'}. Para a linha do tempo visual, abra a <button class="linkish" data-cmd="timemachine">Time Machine</button>.</p>
      <div class="toolbar">
        <input class="field" style="flex:1" id="histQ" data-autofocus placeholder="Pesquisar por título ou domínio…" spellcheck="false">
        <select class="field" id="histWs">
          <option value="">Todos os workspaces</option>
          ${S.workspaces.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}
        </select>
        <button class="btn danger" data-act="clearHistory">${icon('trash')}Limpar</button>
      </div>
      <div id="histList">${historyList('', '')}</div>
    </div>`;
  },
  mount(root) {
    const q = $('#histQ', root), sel = $('#histWs', root);
    const upd = () => { $('#histList', root).innerHTML = historyList(q.value, sel.value); };
    q.addEventListener('input', upd);
    sel.addEventListener('change', upd);
  },
};

// ============================================================ Configurações
PAGES.settings = {
  render() {
    const engines = Object.entries(ENGINES).map(([k, e]) => `<option value="${k}" ${S.settings.engine === k ? 'selected' : ''}>${e.name}</option>`).join('');
    const atmo = typeof Atmo !== 'undefined' ? Atmo.current() : null;
    return `<div class="page">
      <h1>Configurações</h1>
      <p class="lead">TSF Browser ${esc(INFO.version || '')} · Chromium ${esc(INFO.engine || '')}${INFO.electron ? ' · Electron ' + esc(INFO.electron) : ''}</p>

      <h2>Atualizações</h2>
      <div class="set-card">
        <div class="set-row"><div class="lbl"><b>TSF Browser ${esc(INFO.version || '')}</b><span id="updStatus">${esc(updateText())}</span></div>
          <button class="btn primary" id="updRestart" data-cmd="installUpdate" ${UPDATE.state === 'ready' ? '' : 'hidden'}>${icon('reload')}Reiniciar e atualizar</button>
          <button class="btn" data-cmd="checkUpdate" ${INFO.updates ? '' : 'disabled'}>${icon('sync')}Verificar agora</button></div>
      </div>

      <h2>Workspaces</h2>
      <div class="set-card">
        ${S.workspaces.map(w => `<div class="ws-edit" style="--ws:${esc(w.color)}">
          <span class="badge">${icon(w.icon)}</span>
          <input class="field" value="${esc(w.name)}" maxlength="32" data-wsname="${esc(w.id)}" spellcheck="false">
          <div class="icons-pick">${WS_ICONS.slice(0, 8).map(ic => `<button class="${w.icon === ic ? 'on' : ''}" data-act="wsIcon" data-id="${esc(w.id)}" data-v="${ic}" title="${ic}">${icon(ic)}</button>`).join('')}</div>
          <div class="swatches">${WS_COLORS.map(c => `<button class="swatch ${w.color === c ? 'on' : ''}" style="--c:${c}" data-act="wsColor" data-id="${esc(w.id)}" data-v="${c}" title="${c}"></button>`).join('')}</div>
          <button class="ib sm" data-act="wsDelete" data-id="${esc(w.id)}" title="Excluir workspace" ${S.workspaces.length < 2 ? 'disabled' : ''}>${icon('trash')}</button>
        </div>`).join('')}
        <div class="ws-edit"><button class="btn" data-cmd="newWorkspace">${icon('plus')}Novo workspace</button>
          <span class="mono">Cada workspace tem cookies, logins e armazenamento isolados.</span></div>
      </div>

      <h2>Aparência e ambiente</h2>
      <div class="set-card">
        <div class="set-row"><div class="lbl"><b>TSF Atmosphere</b><span>Atual: ${esc(atmo ? atmo.name : '')}. Cores, fundo animado e sons ambientes.</span></div>
          <button class="btn" data-cmd="atmosphere">${icon('sun')}Escolher atmosfera</button></div>
        <div class="set-row"><div class="lbl"><b>Vidro do Windows (Acrylic)</b><span>${INFO.glassSupported
          ? 'A área de trabalho aparece desfocada através da janela.'
          : 'Exige Windows 11 22H2 ou mais recente — aqui o vidro é simulado na interface.'}</span></div>
          <label class="switch"><input type="checkbox" id="setGlass" ${INFO.glass ? 'checked' : ''} ${INFO.glassSupported ? '' : 'disabled'}><i></i></label></div>
        <div class="set-row"><div class="lbl"><b>Sidebar expandida</b><span>Ctrl+B alterna.</span></div>
          <button class="btn" data-cmd="toggleSidebar">${S.settings.sidebar ? 'Recolher' : 'Expandir'}</button></div>
        <div class="set-row"><div class="lbl"><b>Painel TSF AI</b><span>Contexto da página e Quick Notes. Ctrl+Shift+A alterna.</span></div>
          <button class="btn" data-cmd="togglePanel">${S.settings.panel ? 'Ocultar' : 'Mostrar'}</button></div>
      </div>

      <h2>Navegação</h2>
      <div class="set-card">
        <div class="set-row"><div class="lbl"><b>Mecanismo de pesquisa</b><span>Usado na barra de endereço e na nova aba.</span></div>
          <select class="field" id="setEngine">${engines}</select></div>
        <div class="set-row"><div class="lbl"><b>Capturas de tela</b><span class="mono">${esc(INFO.shots || '')}</span></div>
          <button class="btn" data-act="openShots">${icon('folder')}Abrir pasta</button></div>
      </div>

      <h2>Privacidade</h2>
      <div class="set-card">
        <div class="set-row"><div class="lbl"><b>Histórico</b><span>${H.length} registros salvos localmente.</span></div>
          <button class="btn danger" data-act="clearHistory">${icon('trash')}Limpar histórico</button></div>
        <div class="set-row"><div class="lbl"><b>Time Machine</b><span>${SESS.length} sessões gravadas e ${S.closed.length} abas fechadas guardadas.</span></div>
          <button class="btn danger" data-act="clearSessions">${icon('trash')}Apagar linha do tempo</button></div>
        <div class="set-row"><div class="lbl"><b>Dados do workspace "${esc(ws().name)}"</b><span>Cookies, cache, logins e armazenamento local deste workspace.</span></div>
          <button class="btn danger" data-cmd="clearWsData">${icon('trash')}Limpar dados</button></div>
      </div>
    </div>`;
  },
  mount(root) {
    const g = $('#setGlass', root);
    if (g) g.addEventListener('change', () => { INFO.glass = g.checked; body.classList.toggle('os-glass', g.checked); send('glass', { on: g.checked }); });
    $('#setEngine', root).addEventListener('change', e => { S.settings.engine = e.target.value; save(); toast(`Pesquisa: ${ENGINES[e.target.value].name}.`); });
    $$('[data-wsname]', root).forEach(inp => inp.addEventListener('change', () => {
      const w = ws(inp.dataset.wsname); const v = inp.value.trim();
      if (w && v) { w.name = v.slice(0, 32); save(); renderWorkspaces(); renderStatus(); }
    }));
  },
};

// ============================================================ Time Machine
const TM = { idx: -1 };
function sessionCards(tabs) {
  return tabs.map(x => `<button class="tm-card" data-open="${esc(x.u)}" title="${esc(x.u)}">
    ${thumbHtml(x.u, x.f, x.t)}<div class="tm-meta">${favHtml(x.u, x.f, x.t)}<div><b>${esc(x.t || hostOf(x.u))}</b><span>${esc(hostOf(x.u))}</span></div></div></button>`).join('');
}
function tmSnapshotHtml(i) {
  const s = SESS[i];
  if (!s) return `<div class="empty">Nenhuma sessão gravada ainda. A Time Machine registra o estado das suas abas a cada poucos minutos.</div>`;
  const byWs = {};
  for (const x of s.tabs) (byWs[x.w] = byWs[x.w] || []).push(x);
  const wsInfo = id => (s.ws || []).find(w => w.id === id) || ws(id) || { n: 'Workspace', c: '#695CFF' };
  const d = new Date(s.ts);
  return `<div class="tm-head">
      <div><b>${esc(dayLabel(s.ts))} · ${timeFmt(s.ts)}</b><span>${d.toLocaleDateString('pt-BR')} · ${Object.keys(byWs).length} workspace(s) · ${s.tabs.length} abas · ${agoFmt(s.ts)}</span></div>
      <div class="toolbar">
        <button class="btn" data-act="tmOpenAll">${icon('plus')}Abrir aqui</button>
        <button class="btn primary" data-act="tmRestore">${icon('undo')}Restaurar como workspace</button>
      </div>
    </div>` +
    Object.entries(byWs).map(([id, tabs]) => {
      const w = wsInfo(id);
      return `<div class="tm-ws"><span class="dot-ws" style="--ws:${esc(w.c || w.color)}"></span>${esc(w.n || w.name)}<small>${tabs.length}</small></div><div class="tm-grid">${sessionCards(tabs)}</div>`;
    }).join('');
}
function tmTrackHtml() {
  if (!SESS.length) return '';
  const n = SESS.length;
  let marks = '', lastDay = '';
  SESS.forEach((s, i) => {
    const day = new Date(s.ts).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      const pct = n === 1 ? 50 : (i / (n - 1)) * 100;
      marks += `<span class="tm-day" style="left:${pct}%">${esc(new Date(s.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }))}</span>`;
    }
  });
  const ticks = SESS.map((s, i) => `<i style="left:${n === 1 ? 50 : (i / (n - 1)) * 100}%"></i>`).join('');
  return `<div class="tm-track"><div class="tm-ticks">${ticks}</div>
    <input type="range" id="tmRange" min="0" max="${n - 1}" value="${TM.idx}" step="1">
    <div class="tm-days">${marks}</div></div>`;
}
function tmSearch(q) {
  const nq = norm(q);
  if (!nq) return '';
  const seen = new Set(); const res = [];
  for (let i = H.length - 1; i >= 0 && res.length < 48; i--) {
    const h = H[i];
    if (seen.has(h.u) || !norm(h.t + ' ' + h.u).includes(nq)) continue;
    seen.add(h.u); res.push(h);
  }
  if (!res.length) return `<div class="empty">Nada encontrado para "${esc(q)}".</div>`;
  return `<div class="tm-grid">${res.map(h => `<button class="tm-card" data-open="${esc(h.u)}" title="${esc(h.u)}">
    ${thumbHtml(h.u, h.f, h.t)}<div class="tm-meta">${favHtml(h.u, h.f, h.t)}<div><b>${esc(h.t || hostOf(h.u))}</b><span>${esc(dayLabel(h.ts))} · ${timeFmt(h.ts)}</span></div></div></button>`).join('')}</div>`;
}

PAGES.timemachine = {
  render() {
    snapshotSession(true);
    TM.idx = SESS.length - 1;
    const closed = S.closed.slice().reverse();
    return `<div class="page wide tm">
      <h1>${icon('timeline', 'lg')} Time Machine</h1>
      <p class="lead">Arraste pela linha do tempo para ver como estavam suas abas. ${SESS.length} sessões gravadas — tudo fica só neste computador.</p>
      ${tmTrackHtml()}
      <div id="tmSnap">${tmSnapshotHtml(TM.idx)}</div>

      <h2>Abas fechadas recentemente</h2>
      ${closed.length ? `<div class="tm-grid">${closed.slice(0, 16).map((c, i) => `<button class="tm-card" data-act="tmReopen" data-i="${S.closed.length - 1 - i}" title="${esc(c.url)}">
        ${thumbHtml(c.url, c.favicon, c.title)}<div class="tm-meta">${favHtml(c.url, c.favicon, c.title)}<div><b>${esc(c.title || hostOf(c.url))}</b><span>fechada ${agoFmt(c.ts)}</span></div></div></button>`).join('')}</div>`
        : `<div class="empty">Nenhuma aba fechada guardada.</div>`}

      <h2>Encontrar algo que você viu</h2>
      <div class="toolbar"><input class="field" style="flex:1" id="tmQ" placeholder="Busque por título ou site — procura em todo o histórico, inclusive semanas atrás…" spellcheck="false"></div>
      <div id="tmRes" style="margin-top:14px"></div>
    </div>`;
  },
  mount(root) {
    const range = $('#tmRange', root);
    if (range) range.addEventListener('input', () => { TM.idx = Number(range.value); $('#tmSnap', root).innerHTML = tmSnapshotHtml(TM.idx); });
    const q = $('#tmQ', root);
    let tmr = 0;
    q.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { $('#tmRes', root).innerHTML = tmSearch(q.value); }, 150); });
  },
};

function restoreSession(s, asWorkspace) {
  if (!s) return;
  const tabs = s.tabs.filter(x => /^https?:/i.test(x.u));
  if (!tabs.length) return;
  let target = S.activeWs;
  if (asWorkspace) {
    const d = new Date(s.ts);
    const w = createWorkspace(`Sessão ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${timeFmt(s.ts)}`, { icon: 'clock', silent: true });
    target = w.id;
  }
  let first = null;
  for (const x of tabs) {
    const t = { id: uid('t'), ws: target, url: x.u, title: x.t || hostOf(x.u), favicon: x.f || '' };
    S.tabs.push(t);
    if (!first) first = t;
  }
  activateTab(first.id);
  toast(asWorkspace ? `Sessão restaurada em um novo workspace (${tabs.length} abas).` : `${tabs.length} abas abertas.`);
}

// ============================================================ Localhost
const Localhost = {
  status: {}, timer: 0, found: null,
  portOf(url) { try { const u = new URL(url); return Number(u.port) || (u.protocol === 'https:' ? 443 : 80); } catch (e) { return 0; } },
  isLocal(url) { return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?/i.test(url); },
  probe(ports, req) { if (ports.length) send('probe', { ports, req }); },
  refresh() { const ports = S.localhost.filter(p => this.isLocal(p.url)).map(p => this.portOf(p.url)); this.probe(ports, 'list'); },
  onProbe(m) {
    const r = m.results || {};
    if (m.req === 'scan') {
      this.found = Object.keys(r).filter(p => r[p]).map(Number).filter(p => !S.localhost.some(x => this.portOf(x.url) === p));
      const box = $('#lhFound');
      if (box) box.innerHTML = this.foundHtml();
      return;
    }
    Object.assign(this.status, r);
    $$('[data-lhport]').forEach(el => {
      const st = this.status[el.dataset.lhport];
      el.className = 'lh-dot ' + (st === true ? 'on' : st === false ? 'off' : '');
      el.title = st === true ? 'Online' : st === false ? 'Offline' : 'Verificando…';
      const lbl = el.parentElement.querySelector('.lh-state');
      if (lbl) lbl.textContent = st === true ? 'Online' : st === false ? 'Offline' : '…';
    });
  },
  foundHtml() {
    if (this.found == null) return '';
    if (!this.found.length) return `<div class="empty">Nenhum servidor novo encontrado nas portas comuns.</div>`;
    return `<div class="rows">${this.found.map(p => `<div class="row"><span class="lh-dot on"></span><div class="t"><b>localhost:${p}</b><span>respondendo agora</span></div>
      <button class="btn" data-act="lhAddPort" data-port="${p}">${icon('plus')}Adicionar</button></div>`).join('')}</div>`;
  },
};
const COMMON_PORTS = [3000, 3001, 4000, 4200, 5000, 5173, 5174, 8000, 8080, 8081, 8888, 9000];

PAGES.localhost = {
  render() {
    const cards = S.localhost.map(p => {
      const port = Localhost.portOf(p.url);
      const st = Localhost.status[port];
      const w = ws(p.ws);
      return `<div class="lh-card">
        <div class="lh-top"><span class="lh-dot ${st === true ? 'on' : st === false ? 'off' : ''}" data-lhport="${port}"></span><span class="lh-state">${st === true ? 'Online' : st === false ? 'Offline' : '…'}</span>
          ${w ? `<span class="lh-ws"><span class="dot-ws" style="--ws:${esc(w.color)}"></span>${esc(w.name)}</span>` : ''}</div>
        <b>${esc(p.name)}</b><span class="mono">${esc(prettyUrl(p.url))}</span>
        <div class="lh-acts">
          <button class="btn primary" data-act="lhOpen" data-id="${esc(p.id)}">${icon('external')}Abrir</button>
          <button class="ib sm" data-act="lhLab" data-id="${esc(p.id)}" title="Abrir no Responsive Lab">${icon('devices')}</button>
          <button class="ib sm" data-act="lhDel" data-id="${esc(p.id)}" title="Remover">${icon('trash')}</button>
        </div></div>`;
    }).join('');
    return `<div class="page wide">
      <h1>${icon('server', 'lg')} Localhost</h1>
      <p class="lead">Seus servidores de desenvolvimento. Só as portas que você cadastrar são verificadas — nada de varrer a rede.</p>
      <form class="toolbar" id="lhForm">
        <input class="field" name="name" placeholder="Nome (ex.: API Node)" style="width:220px" spellcheck="false">
        <input class="field" name="url" placeholder="Porta ou endereço (ex.: 3000, localhost:5173)" style="flex:1" spellcheck="false" data-autofocus>
        <button class="btn primary" type="submit">${icon('plus')}Adicionar</button>
      </form>
      <div class="lh-grid">${cards || `<div class="empty" style="grid-column:1/-1">Nenhum projeto cadastrado. Adicione uma porta acima ou procure servidores rodando nas portas comuns.</div>`}</div>
      <h2>Descobrir</h2>
      <div class="toolbar"><button class="btn" data-act="lhScan">${icon('search')}Verificar portas comuns</button>
        <span class="mono">${COMMON_PORTS.join(' · ')}</span></div>
      <div id="lhFound" style="margin-top:12px">${Localhost.foundHtml()}</div>
    </div>`;
  },
  mount(root) {
    const f = $('#lhForm', root);
    f.addEventListener('submit', e => {
      e.preventDefault();
      let v = f.url.value.trim();
      if (!v) return;
      if (/^\d{2,5}$/.test(v)) v = 'localhost:' + v;
      const url = /^https?:\/\//i.test(v) ? v : 'http://' + v;
      try { new URL(url); } catch (err) { return toast('Endereço inválido.'); }
      S.localhost.push({ id: uid('p'), name: f.name.value.trim() || prettyUrl(url), url, ws: S.activeWs });
      save(); refreshInternal(); Localhost.refresh();
    });
    Localhost.refresh();
    Localhost.timer = setInterval(() => Localhost.refresh(), 4000);
  },
  unmount() { clearInterval(Localhost.timer); },
};

// ============================================================ ações das páginas internas
function pageAction(act, el, e) {
  const id = el.dataset.id;
  switch (act) {
    case 'unfav': {
      const i = S.favorites.findIndex(f => f.url === el.dataset.url && f.ws === S.activeWs);
      if (i >= 0) { S.favorites.splice(i, 1); save(); refreshInternal(); renderToolbar(); }
      break;
    }
    case 'wsIcon': { const w = ws(id); if (w) { w.icon = el.dataset.v; save(); renderWorkspaces(); refreshInternal(); } break; }
    case 'wsColor': { const w = ws(id); if (w) { w.color = el.dataset.v; save(); renderAll(); refreshInternal(); } break; }
    case 'wsDelete': {
      const w = ws(id);
      if (w) confirmDialog(`Excluir "${w.name}"?`, 'As abas, favoritos e dados de navegação (cookies, logins) deste workspace serão apagados.', 'Excluir', () => { deleteWorkspace(w.id); refreshInternal(); });
      break;
    }
    case 'clearHistory':
      confirmDialog('Limpar todo o histórico?', 'Isso remove os registros de páginas visitadas de todos os workspaces.', 'Limpar', () => { H = []; flushHist(); refreshInternal(); toast('Histórico apagado.'); });
      break;
    case 'clearSessions':
      confirmDialog('Apagar a linha do tempo?', 'Remove as sessões gravadas e a lista de abas fechadas da Time Machine.', 'Apagar', () => { SESS = []; S.closed = []; flushSessions(); save(); refreshInternal(); toast('Linha do tempo apagada.'); });
      break;
    case 'histDel': {
      const ts = Number(el.dataset.ts);
      const i = H.findIndex(h => h.ts === ts);
      if (i >= 0) { H.splice(i, 1); saveHist(); el.closest('.row').remove(); }
      break;
    }
    case 'openShots': send('open-shots'); break;
    case 'tmRestore': restoreSession(SESS[TM.idx], true); break;
    case 'tmOpenAll': restoreSession(SESS[TM.idx], false); break;
    case 'tmReopen': { const c = S.closed[Number(el.dataset.i)]; if (c) reopenTab(c); break; }
    case 'lhOpen': { const p = S.localhost.find(x => x.id === id); if (p) openUrl(p.url, true); break; }
    case 'lhLab': { const p = S.localhost.find(x => x.id === id); if (p) Lab.open(p.url); break; }
    case 'lhDel': S.localhost = S.localhost.filter(x => x.id !== id); save(); refreshInternal(); break;
    case 'lhScan': Localhost.found = null; $('#lhFound').innerHTML = `<div class="empty">Verificando…</div>`; Localhost.probe(COMMON_PORTS, 'scan'); break;
    case 'lhAddPort': {
      const p = Number(el.dataset.port);
      S.localhost.push({ id: uid('p'), name: `localhost:${p}`, url: `http://localhost:${p}`, ws: S.activeWs });
      Localhost.found = (Localhost.found || []).filter(x => x !== p);
      save(); refreshInternal(); Localhost.refresh();
      break;
    }
  }
}
