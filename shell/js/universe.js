/* TSF Universe — espaço infinito onde cada aba vira um cartão que pode ser arrastado,
   conectado a outros e agrupado em zonas. Estado salvo por workspace em S.universe. */
'use strict';

const Universe = (() => {
  const CW = 248, CH = 196;            // tamanho do cartão (coordenadas do mundo)
  const GROUP_COLORS = ['#695CFF', '#25D9F2', '#C26BFF', '#2BD4A0', '#FFB547', '#FF6FB5'];
  let root = null, U = null, space = null, world = null, cleanup = [];

  function state() {
    const id = S.activeWs;
    if (!S.universe[id]) S.universe[id] = { cards: {}, links: [], groups: [], view: { x: 40, y: 30, z: 1 }, fresh: true };
    const u = S.universe[id];
    u.cards = u.cards || {}; u.links = u.links || []; u.groups = u.groups || []; u.view = u.view || { x: 40, y: 30, z: 1 };
    return u;
  }

  function placeNew() {
    const tabs = wsTabs();
    const ids = new Set(tabs.map(t => t.id));
    for (const k of Object.keys(U.cards)) if (!ids.has(k)) delete U.cards[k];
    U.links = U.links.filter(([a, b]) => ids.has(a) && ids.has(b));
    let n = 0;
    for (const t of tabs) {
      if (U.cards[t.id]) continue;
      let x, y;
      do { x = 40 + (n % 4) * (CW + 48); y = 40 + Math.floor(n / 4) * (CH + 56); n++; }
      while (Object.values(U.cards).some(c => Math.abs(c.x - x) < CW * 0.6 && Math.abs(c.y - y) < CH * 0.6));
      U.cards[t.id] = { x, y };
    }
  }

  function cardHtml(t) {
    const c = U.cards[t.id];
    const cur = curTab();
    const internal = isInternal(t.url);
    const thumb = internal
      ? `<div class="thumb nothumb"><div class="thumb-ph">${favHtml(t.url, '', t.title)}</div></div>`
      : thumbHtml(t.url, t.favicon, t.title);
    return `<div class="u-card ${cur && cur.id === t.id ? 'current' : ''}" data-card="${esc(t.id)}" style="transform:translate(${c.x}px,${c.y}px)">
      <div class="u-head" data-drag="card">${favHtml(t.url, t.favicon, t.title)}<span>${esc(t.title || titleFor(t.url))}</span>
        <button class="u-x" data-uclose="${esc(t.id)}" title="Fechar aba">${icon('x')}</button></div>
      <div class="u-body" title="Duplo clique para abrir">${thumb}</div>
      <div class="u-foot"><span>${esc(internal ? 'tsf://' + internalPage(t.url) : hostOf(t.url))}</span>
        <button class="u-port" data-port="${esc(t.id)}" title="Arraste até outro cartão para conectar">${icon('link', 'sm')}</button></div>
    </div>`;
  }

  function groupHtml(g) {
    return `<div class="u-group" data-group="${esc(g.id)}" style="transform:translate(${g.x}px,${g.y}px);width:${g.w}px;height:${g.h}px;--g:${esc(g.color)}">
      <div class="u-ghead" data-drag="group"><span class="u-gdot" data-gcolor="${esc(g.id)}" title="Trocar cor"></span>
        <b data-gname="${esc(g.id)}" title="Duplo clique para renomear">${esc(g.name)}</b>
        <button class="u-x" data-gdel="${esc(g.id)}" title="Remover grupo (as abas ficam)">${icon('x')}</button></div>
      <span class="u-resize" data-drag="resize"></span>
    </div>`;
  }

  const center = id => { const c = U.cards[id]; return c ? { x: c.x + CW / 2, y: c.y + CH / 2 } : null; };
  function linksSvg(temp) {
    const parts = U.links.map(([a, b], i) => {
      const p = center(a), q = center(b);
      if (!p || !q) return '';
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const d = `M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`;
      return `<path class="u-link" d="${d}"/><path class="u-hit" d="${d}" data-link="${i}"><title>Clique para remover a conexão</title></path>`;
    });
    if (temp) parts.push(`<path class="u-link temp" d="M${temp.x1},${temp.y1} L${temp.x2},${temp.y2}"/>`);
    return parts.join('');
  }

  function drawLinks(temp) { $('#uLinks', root).innerHTML = linksSvg(temp); }
  function applyView() {
    world.style.transform = `translate(${U.view.x}px,${U.view.y}px) scale(${U.view.z})`;
    space.style.backgroundPosition = `${U.view.x}px ${U.view.y}px`;
    space.style.backgroundSize = `${28 * U.view.z}px ${28 * U.view.z}px`;
    const z = $('#uZoom', root); if (z) z.textContent = Math.round(U.view.z * 100) + '%';
  }
  function draw() {
    placeNew();
    $('#uGroups', root).innerHTML = U.groups.map(groupHtml).join('');
    $('#uCards', root).innerHTML = wsTabs().map(cardHtml).join('');
    drawLinks();
    applyView();
  }

  const toWorld = (cx, cy) => {
    const r = space.getBoundingClientRect();
    return { x: (cx - r.left - U.view.x) / U.view.z, y: (cy - r.top - U.view.y) / U.view.z };
  };

  function arrange() {
    // agrupa cartões dentro das zonas e organiza o resto em grade
    let n = 0;
    const inGroup = new Set();
    for (const g of U.groups) {
      const members = wsTabs().filter(t => { const c = center(t.id); return c && c.x > g.x && c.x < g.x + g.w && c.y > g.y && c.y < g.y + g.h; });
      const cols = Math.max(1, Math.floor((g.w - 24) / (CW + 20)));
      members.forEach((t, i) => { U.cards[t.id] = { x: g.x + 16 + (i % cols) * (CW + 20), y: g.y + 52 + Math.floor(i / cols) * (CH + 20) }; inGroup.add(t.id); });
      g.h = Math.max(g.h, 70 + Math.ceil(members.length / cols) * (CH + 20));
    }
    const maxY = U.groups.reduce((m, g) => Math.max(m, g.y + g.h), 0);
    for (const t of wsTabs()) {
      if (inGroup.has(t.id)) continue;
      U.cards[t.id] = { x: 40 + (n % 4) * (CW + 48), y: (U.groups.length ? maxY + 60 : 40) + Math.floor(n / 4) * (CH + 56) };
      n++;
    }
    draw(); save();
  }

  function fit() {
    const pts = Object.values(U.cards).concat(U.groups.map(g => ({ x: g.x, y: g.y })), U.groups.map(g => ({ x: g.x + g.w - CW, y: g.y + g.h - CH })));
    if (!pts.length) return;
    const minX = Math.min(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y));
    const maxX = Math.max(...pts.map(p => p.x + CW)), maxY = Math.max(...pts.map(p => p.y + CH));
    const r = space.getBoundingClientRect();
    const z = clamp(Math.min((r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY)), 0.25, 1.4);
    U.view = { z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z };
    applyView(); save();
  }

  function addGroup() {
    openCommand({
      prompt: 'Nome do grupo…', label: 'Criar grupo', hint: 'Ex.: Pesquisa, Backend, Referências', icon: 'frame',
      onSubmit: name => {
        const r = space.getBoundingClientRect();
        const p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
        U.groups.push({ id: uid('g'), name: name.slice(0, 40), x: Math.round(p.x - 300), y: Math.round(p.y - 180), w: 600, h: 360, color: GROUP_COLORS[U.groups.length % GROUP_COLORS.length] });
        draw(); save();
      },
    });
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest('button:not(.u-port)') || target.closest('[data-gcolor]')) return;
    const startX = e.clientX, startY = e.clientY;
    const z = U.view.z;
    let move, up;
    const port = target.closest('[data-port]');
    const drag = target.closest('[data-drag]');

    if (port) {
      const from = port.dataset.port;
      const c = center(from);
      move = ev => { const p = toWorld(ev.clientX, ev.clientY); drawLinks({ x1: c.x, y1: c.y, x2: p.x, y2: p.y }); };
      up = ev => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const card = el && el.closest('[data-card]');
        const to = card && card.dataset.card;
        if (to && to !== from && !U.links.some(([a, b]) => (a === from && b === to) || (a === to && b === from))) { U.links.push([from, to]); save(); }
        drawLinks();
      };
    } else if (drag && drag.dataset.drag === 'card') {
      const id = drag.closest('[data-card]').dataset.card;
      const el = drag.closest('[data-card]');
      const c0 = Object.assign({}, U.cards[id]);
      el.classList.add('dragging');
      move = ev => {
        U.cards[id] = { x: Math.round(c0.x + (ev.clientX - startX) / z), y: Math.round(c0.y + (ev.clientY - startY) / z) };
        el.style.transform = `translate(${U.cards[id].x}px,${U.cards[id].y}px)`;
        drawLinks();
      };
      up = () => { el.classList.remove('dragging'); save(); };
    } else if (drag && drag.dataset.drag === 'group') {
      const gel = drag.closest('[data-group]');
      const g = U.groups.find(x => x.id === gel.dataset.group);
      const g0 = { x: g.x, y: g.y };
      const members = Object.entries(U.cards).filter(([id]) => { const c = center(id); return c.x > g.x && c.x < g.x + g.w && c.y > g.y && c.y < g.y + g.h; })
        .map(([id, c]) => ({ id, x: c.x, y: c.y }));
      move = ev => {
        const dx = (ev.clientX - startX) / z, dy = (ev.clientY - startY) / z;
        g.x = Math.round(g0.x + dx); g.y = Math.round(g0.y + dy);
        gel.style.transform = `translate(${g.x}px,${g.y}px)`;
        for (const m of members) {
          U.cards[m.id] = { x: Math.round(m.x + dx), y: Math.round(m.y + dy) };
          const ce = root.querySelector(`[data-card="${cssq(m.id)}"]`);
          if (ce) ce.style.transform = `translate(${U.cards[m.id].x}px,${U.cards[m.id].y}px)`;
        }
        drawLinks();
      };
      up = () => save();
    } else if (drag && drag.dataset.drag === 'resize') {
      const gel = drag.closest('[data-group]');
      const g = U.groups.find(x => x.id === gel.dataset.group);
      const w0 = g.w, h0 = g.h;
      move = ev => {
        g.w = Math.max(280, Math.round(w0 + (ev.clientX - startX) / z)); g.h = Math.max(160, Math.round(h0 + (ev.clientY - startY) / z));
        gel.style.width = g.w + 'px'; gel.style.height = g.h + 'px';
      };
      up = () => save();
    } else if (target === space || target === world || target.closest('#uGroups') && !target.closest('.u-ghead')) {
      const v0 = Object.assign({}, U.view);
      space.classList.add('panning');
      move = ev => { U.view.x = v0.x + ev.clientX - startX; U.view.y = v0.y + ev.clientY - startY; applyView(); };
      up = () => { space.classList.remove('panning'); save(); };
    } else return;

    e.preventDefault();
    space.setPointerCapture(e.pointerId);
    const mv = ev => move(ev);
    const finish = ev => { space.removeEventListener('pointermove', mv); space.removeEventListener('pointerup', finish); space.removeEventListener('pointercancel', finish); up(ev); };
    space.addEventListener('pointermove', mv);
    space.addEventListener('pointerup', finish);
    space.addEventListener('pointercancel', finish);
  }

  function onWheel(e) {
    e.preventDefault();
    const r = space.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const z0 = U.view.z;
    const z = clamp(z0 * Math.exp(-e.deltaY * 0.0012), 0.2, 2);
    U.view.x = mx - (mx - U.view.x) * (z / z0);
    U.view.y = my - (my - U.view.y) * (z / z0);
    U.view.z = z;
    applyView();
    clearTimeout(onWheel.t); onWheel.t = setTimeout(save, 400);
  }

  function onClick(e) {
    const close = e.target.closest('[data-uclose]');
    if (close) { closeTab(close.dataset.uclose); return; }
    const hit = e.target.closest('[data-link]');
    if (hit) { U.links.splice(Number(hit.dataset.link), 1); drawLinks(); save(); return; }
    const gdel = e.target.closest('[data-gdel]');
    if (gdel) { U.groups = U.groups.filter(g => g.id !== gdel.dataset.gdel); draw(); save(); return; }
    const gc = e.target.closest('[data-gcolor]');
    if (gc) {
      const g = U.groups.find(x => x.id === gc.dataset.gcolor);
      g.color = GROUP_COLORS[(GROUP_COLORS.indexOf(g.color) + 1) % GROUP_COLORS.length];
      draw(); save(); return;
    }
    const b = e.target.closest('[data-uact]');
    if (b) ({ group: addGroup, arrange, fit, newtab: () => newTab() })[b.dataset.uact]();
  }

  function onDbl(e) {
    const gname = e.target.closest('[data-gname]');
    if (gname) {
      const g = U.groups.find(x => x.id === gname.dataset.gname);
      openCommand({ prompt: 'Novo nome do grupo…', value: g.name, label: 'Renomear para', icon: 'frame', onSubmit: v => { g.name = v.slice(0, 40); draw(); save(); } });
      return;
    }
    const card = e.target.closest('[data-card]');
    if (card && !e.target.closest('button')) activateTab(card.dataset.card);
  }

  return {
    render() {
      const w = ws();
      return `<div class="uni">
        <div class="uni-bar">
          <div class="uni-title">${icon('orbit', 'lg')}<div><b>TSF Universe</b><span>${esc(w.name)} · ${wsTabs().length} páginas</span></div></div>
          <div class="toolbar">
            <button class="btn" data-uact="newtab">${icon('plus')}Página</button>
            <button class="btn" data-uact="group">${icon('frame')}Novo grupo</button>
            <button class="btn" data-uact="arrange">${icon('grid')}Organizar</button>
            <button class="btn" data-uact="fit">${icon('focus')}Enquadrar</button>
            <span class="mono" id="uZoom">100%</span>
          </div>
        </div>
        <div class="uni-space" id="uSpace">
          <div class="uni-world" id="uWorld">
            <div id="uGroups"></div>
            <svg class="uni-links" id="uLinks" width="1" height="1"></svg>
            <div id="uCards"></div>
          </div>
          <div class="uni-help">Arraste o fundo para navegar · roda do mouse para zoom · ${icon('link', 'sm')} conecta cartões · duplo clique abre a página</div>
        </div>
      </div>`;
    },
    mount(r) {
      root = r; U = state();
      space = $('#uSpace', root); world = $('#uWorld', root);
      draw();
      if (U.fresh) { delete U.fresh; requestAnimationFrame(fit); }
      const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); cleanup.push(() => el.removeEventListener(ev, fn, o)); };
      on(space, 'pointerdown', onPointerDown);
      on(space, 'wheel', onWheel, { passive: false });
      on(root, 'click', onClick);
      on(root, 'dblclick', onDbl);
    },
    unmount() { cleanup.forEach(f => f()); cleanup = []; root = null; },
    onThumb(m) {
      if (!root) return;
      const t = tabById(m.id);
      if (!t) return;
      const card = root.querySelector(`[data-card="${cssq(t.id)}"] .u-body`);
      if (card) card.innerHTML = thumbHtml(t.url, t.favicon, t.title);
    },
  };
})();
PAGES.universe = Universe;
