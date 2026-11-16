/* TSF Inspector — inspetor de requisições HTTP da aba atual (via Chrome DevTools Protocol).
   Lista, filtra, mostra headers/payload/resposta formatada e copia como cURL. */
'use strict';

const Inspector = (() => {
  const el = $('#inspector');
  const data = new Map();         // tabId -> { reqs: Map, order: [], mainFrame }
  const bodies = new Map();       // tabId|rid -> { data | error }
  const recording = new Set();
  const TYPES = [
    { id: 'all', t: 'Tudo' }, { id: 'fetch', t: 'Fetch/XHR' }, { id: 'doc', t: 'Doc' }, { id: 'js', t: 'JS' },
    { id: 'css', t: 'CSS' }, { id: 'img', t: 'Img' }, { id: 'other', t: 'Outros' },
  ];
  let open = false, tabId = null, sel = null, filter = '', type = 'all', preserve = false, detail = 'headers';
  let drawTimer = 0, height = 0;

  const store = id => { if (!data.has(id)) data.set(id, { reqs: new Map(), order: [], mainFrame: null, n: 0 }); return data.get(id); };
  const typeOf = r => {
    const t = r.type || '';
    if (t === 'Fetch' || t === 'XHR') return 'fetch';
    if (t === 'Document') return 'doc';
    if (t === 'Script') return 'js';
    if (t === 'Stylesheet') return 'css';
    if (t === 'Image') return 'img';
    return 'other';
  };
  const fmtSize = n => n == null ? '—' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(2) + ' MB';
  const fmtTime = r => r.end && r.start ? Math.max(0, Math.round((r.end - r.start) * 1000)) + ' ms' : (r.failed ? '—' : '…');
  const statusCls = r => r.failed ? 'err' : !r.status ? 'pend' : r.status >= 400 ? 'err' : r.status >= 300 ? 'redir' : 'ok';

  function onNet(m) {
    let p;
    try { p = JSON.parse(m.data); } catch (e) { return; }
    const st = store(m.id);
    const ev = m.ev.split('.')[1];
    let r = st.reqs.get(p.requestId);
    if (ev === 'requestWillBeSent') {
      const isNav = p.type === 'Document' && p.requestId === p.loaderId && (!st.mainFrame || p.frameId === st.mainFrame) && !p.redirectResponse;
      if (isNav) {
        st.mainFrame = p.frameId;
        if (!preserve) { st.reqs.clear(); st.order = []; if (m.id === tabId) sel = null; }
      }
      if (r && p.redirectResponse) {
        Object.assign(r, { status: p.redirectResponse.status, statusText: p.redirectResponse.statusText, resHeaders: p.redirectResponse.headers, end: p.timestamp, done: true });
        const k = p.requestId + ':' + (++st.n);
        st.reqs.delete(p.requestId); r.key = k; st.reqs.set(k, r);
        st.order[st.order.indexOf(p.requestId)] = k;
      }
      r = {
        key: p.requestId, rid: p.requestId, url: p.request.url, method: p.request.method, type: p.type || 'Other',
        reqHeaders: p.request.headers || {}, postData: p.request.postData || '', hasPostData: !!p.request.hasPostData,
        start: p.timestamp, wall: p.wallTime, initiator: p.initiator && p.initiator.type,
      };
      st.reqs.set(p.requestId, r);
      st.order.push(p.requestId);
      if (st.order.length > 1500) { const drop = st.order.splice(0, st.order.length - 1500); drop.forEach(k => st.reqs.delete(k)); }
    } else if (!r) {
      return;
    } else if (ev === 'responseReceived') {
      const res = p.response || {};
      Object.assign(r, {
        status: res.status, statusText: res.statusText, mime: res.mimeType, resHeaders: res.headers || {}, protocol: res.protocol,
        remote: res.remoteIPAddress ? res.remoteIPAddress + (res.remotePort ? ':' + res.remotePort : '') : '',
        cache: !!(res.fromDiskCache || res.fromServiceWorker || res.fromPrefetchCache), type: p.type || r.type,
      });
      if (res.requestHeaders) r.reqHeaders = res.requestHeaders;
    } else if (ev === 'loadingFinished') {
      Object.assign(r, { end: p.timestamp, size: p.encodedDataLength, done: true });
    } else if (ev === 'loadingFailed') {
      Object.assign(r, { end: p.timestamp, failed: true, error: p.canceled ? 'cancelada' : p.errorText, done: true });
    }
    if (m.id === tabId && open && !drawTimer) drawTimer = setTimeout(() => { drawTimer = 0; drawList(); if (sel === r.key) drawDetail(); }, 180);
  }

  function visibleReqs() {
    const st = tabId ? store(tabId) : null;
    if (!st) return [];
    const nf = filter.toLowerCase();
    return st.order.map(k => st.reqs.get(k)).filter(r => r && (type === 'all' || typeOf(r) === type) && (!nf || r.url.toLowerCase().includes(nf) || String(r.status || '').includes(nf) || r.method.toLowerCase() === nf));
  }

  function nameOf(url) {
    try { const u = new URL(url); const parts = u.pathname.split('/').filter(Boolean); return { name: (parts.pop() || u.host) + u.search, host: u.host }; }
    catch (e) { return { name: url.slice(0, 80), host: '' }; }
  }

  function drawList() {
    if (!open) return;
    const list = $('#inList', el);
    if (!list) return;
    const rows = visibleReqs();
    const st = tabId ? store(tabId) : null;
    const total = st ? st.order.length : 0;
    const bytes = rows.reduce((a, r) => a + (r.size || 0), 0);
    $('#inCount', el).textContent = `${rows.length}${rows.length !== total ? ' / ' + total : ''} requisições · ${fmtSize(bytes)}`;
    if (!tabId) { list.innerHTML = `<div class="in-empty">Abra uma página web — as requisições aparecem aqui em tempo real.</div>`; return; }
    if (!rows.length) { list.innerHTML = `<div class="in-empty">${total ? 'Nenhuma requisição com esse filtro.' : 'Gravando… recarregue a página (F5) para capturar tudo desde o início.'}</div>`; return; }
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
    list.innerHTML = rows.map(r => {
      const n = nameOf(r.url);
      return `<div class="in-row ${sel === r.key ? 'sel' : ''} ${r.failed ? 'failed' : ''}" data-req="${esc(r.key)}">
        <span class="in-st ${statusCls(r)}">${r.failed ? '✕' : r.status || '…'}</span>
        <span class="in-m">${esc(r.method)}</span>
        <span class="in-n" title="${esc(r.url)}">${esc(n.name)}<small>${esc(n.host)}</small></span>
        <span class="in-t">${esc(r.type)}</span>
        <span class="in-s">${r.cache ? 'cache' : fmtSize(r.size)}</span>
        <span class="in-ms">${fmtTime(r)}</span></div>`;
    }).join('');
    if (atBottom && !sel) list.scrollTop = list.scrollHeight;
  }

  function kv(obj) {
    const e = Object.entries(obj || {});
    if (!e.length) return `<div class="in-muted">—</div>`;
    return `<div class="in-kv">${e.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>`;
  }

  function highlightJson(text) {
    return esc(text).replace(/(&quot;(?:\\.|[^&\\]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (m, str, colon, kw, num) => str ? `<span class="${colon ? 'j-k' : 'j-s'}">${str}</span>${colon || ''}` : kw ? `<span class="j-b">${kw}</span>` : `<span class="j-n">${num}</span>`);
  }
  function pretty(text, mime) {
    const t = String(text || '');
    if (/json/.test(mime || '') || /^\s*[[{]/.test(t)) {
      try { return `<pre class="in-code">${highlightJson(JSON.stringify(JSON.parse(t), null, 2).slice(0, 400000))}</pre>`; } catch (e) { /* não é JSON */ }
    }
    return `<pre class="in-code">${esc(t.slice(0, 300000))}${t.length > 300000 ? '\n… (truncado)' : ''}</pre>`;
  }

  function curl(r) {
    const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
    let c = 'curl ' + q(r.url);
    if (r.method !== 'GET') c += ' -X ' + r.method;
    for (const [k, v] of Object.entries(r.reqHeaders || {})) if (!k.startsWith(':')) c += ` \\\n  -H ${q(k + ': ' + v)}`;
    if (r.postData) c += ` \\\n  --data-raw ${q(r.postData)}`;
    return c;
  }

  function current() { const st = tabId ? store(tabId) : null; return st && sel ? st.reqs.get(sel) : null; }

  function drawDetail() {
    const box = $('#inDetail', el);
    if (!box) return;
    const r = current();
    el.classList.toggle('has-detail', !!r);
    if (!r) { box.innerHTML = ''; return; }
    let content = '';
    if (detail === 'headers') {
      content = `<h4>Geral</h4><div class="in-kv"><b>URL</b><span>${esc(r.url)}</span><b>Método</b><span>${esc(r.method)}</span>
        <b>Status</b><span class="in-st ${statusCls(r)}">${r.failed ? 'Falhou: ' + esc(r.error) : esc((r.status || '…') + ' ' + (r.statusText || ''))}</span>
        <b>Tipo</b><span>${esc(r.type)}${r.mime ? ' · ' + esc(r.mime) : ''}</span>
        ${r.remote ? `<b>Servidor</b><span>${esc(r.remote)}${r.protocol ? ' · ' + esc(r.protocol) : ''}</span>` : ''}
        <b>Tempo</b><span>${fmtTime(r)}${r.size != null ? ' · ' + fmtSize(r.size) : ''}${r.cache ? ' · do cache' : ''}</span></div>
        <h4>Headers da resposta</h4>${kv(r.resHeaders)}<h4>Headers da requisição</h4>${kv(r.reqHeaders)}`;
    } else if (detail === 'payload') {
      let qp = [];
      try { qp = Array.from(new URL(r.url).searchParams.entries()); } catch (e) { /* url inválida */ }
      content = (qp.length ? `<h4>Query string</h4><div class="in-kv">${qp.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>` : '') +
        (r.postData ? `<h4>Corpo enviado</h4>${pretty(r.postData, r.reqHeaders['Content-Type'] || r.reqHeaders['content-type'])}`
          : r.hasPostData ? `<div class="in-muted">Corpo grande demais para ser capturado.</div>` : (qp.length ? '' : `<div class="in-muted">Esta requisição não enviou payload.</div>`));
    } else {
      const b = bodies.get(tabId + '|' + r.rid);
      if (!r.done) content = `<div class="in-muted">Aguardando a resposta terminar…</div>`;
      else if (!b) { content = `<div class="in-muted">Carregando resposta…</div>`; bodies.set(tabId + '|' + r.rid, { loading: true }); send('net:body', { id: tabId, rid: r.rid }); }
      else if (b.loading) content = `<div class="in-muted">Carregando resposta…</div>`;
      else if (b.error) content = `<div class="in-muted">Resposta indisponível: ${esc(b.error)}</div>`;
      else if (b.base64) content = /^image\//.test(r.mime || '') ? `<img class="in-img" src="data:${esc(r.mime)};base64,${b.body}" alt="">` : `<div class="in-muted">Conteúdo binário (${esc(r.mime || 'desconhecido')}).</div>`;
      else content = pretty(b.body, r.mime);
    }
    box.innerHTML = `<div class="in-dhead">
        <div class="seg">${['headers', 'payload', 'response'].map(d => `<button data-idet="${d}" class="${detail === d ? 'on' : ''}">${{ headers: 'Headers', payload: 'Payload', response: 'Resposta' }[d]}</button>`).join('')}</div>
        <span class="grow"></span>
        <button class="btn sm" data-iact="curl">${icon('copy', 'sm')}cURL</button>
        <button class="btn sm" data-iact="copyres" ${detail === 'response' ? '' : 'hidden'}>${icon('copy', 'sm')}Resposta</button>
        <button class="ib sm" data-iact="unsel" title="Fechar detalhes">${icon('x')}</button>
      </div><div class="in-dbody">${content}</div>`;
  }

  function onBody(m) {
    let v;
    if (m.error) v = { error: m.error };
    else { try { const p = JSON.parse(m.data); v = { body: p.body, base64: p.base64Encoded }; } catch (e) { v = { error: 'formato inesperado' }; } }
    bodies.set(m.id + '|' + m.rid, v);
    const r = current();
    if (r && r.rid === m.rid && detail === 'response') drawDetail();
  }

  function render() {
    if (!open) return;
    el.innerHTML = `<div class="in-grip" id="inGrip" title="Arraste para redimensionar"></div>
      <div class="in-bar">
        <b class="in-title">${icon('activity', 'sm')}TSF Inspector</b>
        <span class="in-rec" title="Gravando">${icon('rec', 'sm')}</span>
        <input class="field sm" id="inFilter" placeholder="Filtrar URL, status ou método…" value="${esc(filter)}" spellcheck="false">
        <div class="in-types">${TYPES.map(x => `<button class="chip sm ${type === x.id ? 'on' : ''}" data-itype="${x.id}">${x.t}</button>`).join('')}</div>
        <label class="in-check"><input type="checkbox" id="inPreserve" ${preserve ? 'checked' : ''}>Preservar log</label>
        <span class="grow"></span>
        <span class="mono" id="inCount"></span>
        <button class="ib sm" data-iact="clear" title="Limpar">${icon('trash')}</button>
        <button class="ib sm" data-iact="close" title="Fechar (Ctrl+Shift+E)">${icon('x')}</button>
      </div>
      <div class="in-main">
        <div class="in-list-wrap">
          <div class="in-row in-headrow"><span class="in-st">Status</span><span class="in-m">Método</span><span class="in-n">Nome</span><span class="in-t">Tipo</span><span class="in-s">Tamanho</span><span class="in-ms">Tempo</span></div>
          <div class="in-list" id="inList"></div>
        </div>
        <div class="in-detail" id="inDetail"></div>
      </div>`;
    if (height) el.style.height = height + 'px';
    drawList(); drawDetail();
  }

  el.addEventListener('input', e => {
    if (e.target.id === 'inFilter') { filter = e.target.value; drawList(); }
  });
  el.addEventListener('change', e => { if (e.target.id === 'inPreserve') preserve = e.target.checked; });
  el.addEventListener('focusin', e => { if (e.target.matches('input')) focusShell(); });
  el.addEventListener('click', e => {
    const row = e.target.closest('[data-req]');
    if (row) { sel = row.dataset.req; $$('.in-row.sel', el).forEach(x => x.classList.remove('sel')); row.classList.add('sel'); drawDetail(); scheduleLayout(); return; }
    const ty = e.target.closest('[data-itype]');
    if (ty) { type = ty.dataset.itype; $$('[data-itype]', el).forEach(b => b.classList.toggle('on', b === ty)); drawList(); return; }
    const d = e.target.closest('[data-idet]');
    if (d) { detail = d.dataset.idet; drawDetail(); return; }
    const a = e.target.closest('[data-iact]');
    if (!a) return;
    const r = current();
    switch (a.dataset.iact) {
      case 'close': Inspector.toggle(); break;
      case 'clear': if (tabId) { const st = store(tabId); st.reqs.clear(); st.order = []; } sel = null; drawList(); drawDetail(); break;
      case 'unsel': sel = null; drawList(); drawDetail(); break;
      case 'curl': if (r) navigator.clipboard.writeText(curl(r)).then(() => toast('Comando cURL copiado.'), () => toast('Não foi possível copiar.')); break;
      case 'copyres': { const b = r && bodies.get(tabId + '|' + r.rid); if (b && b.body != null && !b.base64) navigator.clipboard.writeText(b.body).then(() => toast('Resposta copiada.')); break; }
    }
  });
  el.addEventListener('pointerdown', e => {
    if (e.target.id !== 'inGrip') return;
    e.preventDefault();
    const g = e.target;
    g.setPointerCapture(e.pointerId);
    const frame = $('#frame').getBoundingClientRect();
    const move = ev => { height = clamp(frame.bottom - ev.clientY - 6, 160, frame.height - 160); el.style.height = height + 'px'; reportLayout(); };
    const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
  });

  return {
    isOpen: () => open,
    toggle() {
      open = !open;
      el.hidden = !open;
      if (open) {
        tabId = null;
        this.sync();
        render();
        if (!curWeb()) toast('O Inspector registra as requisições de páginas web.');
        else toast('Inspector gravando — recarregue (F5) para capturar a página desde o início.');
      } else {
        for (const id of recording) send('inspect', { id, on: false });
        recording.clear(); data.clear(); bodies.clear();
        el.innerHTML = ''; sel = null; tabId = null;
      }
      renderToolbar(); renderStatus(); scheduleLayout();
    },
    sync() {
      if (!open) return;
      const t = curWeb();
      const id = t ? t.id : null;
      if (id === tabId) return;
      tabId = id; sel = null;
      if (id && !recording.has(id)) { recording.add(id); send('inspect', { id, on: true }); }
      render();
    },
    onNet, onBody,
  };
})();
