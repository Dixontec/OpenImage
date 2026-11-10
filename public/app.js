// OpenImage — cliente. Sem frameworks; estado em localStorage, histórico em IndexedDB.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ------------------------------------------------------------------ ícones */
const ICONS = {
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  layers: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  text: '<path d="M4 6h16M4 12h10M4 18h14"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M12 8v4M12 15.5v.01"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14-4M4 5v4h4M4 13a8 8 0 0 0 14 4M20 19v-4h-4"/>',
};
const icon = (n) => `<i data-i="${n}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg></i>`;
const hydrate = (root = document) =>
  $$('i[data-i]:not(:has(svg))', root).forEach((el) => (el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[el.dataset.i]}</svg>`));

/* ------------------------------------------------------------------ catálogo
   Preços: https://developers.cloudflare.com/workers-ai/platform/pricing/
   Tudo em "neurônios". A cota gratuita é de 10.000 por dia (reinicia 00:00 UTC). */
const DAILY = 10000;
const tiles = (w, h) => Math.ceil(w / 512) * Math.ceil(h / 512);
const mpOf = (w, h) => (w * h) / 1048576;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

const MODELS = [
  {
    id: '@cf/black-forest-labs/flux-2-klein-4b', name: 'FLUX.2 Klein 4B', badge: 'Recomendado', refs: 4, kind: 'form',
    desc: 'Rápido e barato. Gera e edita com até 4 referências. Passos fixos.',
    cost: ({ w, h, refs }) => tiles(w, h) * 26.05 + sum(refs, (r) => tiles(r.w, r.h) * 5.37),
  },
  {
    id: '@cf/black-forest-labs/flux-2-klein-9b', name: 'FLUX.2 Klein 9B', refs: 4, kind: 'form',
    desc: 'Mais detalhe e fidelidade que o 4B, com custo bem maior por imagem.',
    cost: ({ w, h, refs }) =>
      1363.64 + Math.max(0, Math.ceil(mpOf(w, h)) - 1) * 181.82 + sum(refs, (r) => Math.max(1, Math.ceil(mpOf(r.w, r.h))) * 181.82),
  },
  {
    id: '@cf/black-forest-labs/flux-2-dev', name: 'FLUX.2 Dev', refs: 4, kind: 'form', steps: { min: 4, max: 50, def: 20 },
    desc: 'Topo de linha da família FLUX.2. Cobra por passo: esgota a cota rápido.',
    cost: ({ w, h, refs, steps }) => steps * (tiles(w, h) * 37.5 + sum(refs, (r) => tiles(r.w, r.h) * 18.75)),
  },
  {
    id: '@cf/black-forest-labs/flux-1-schnell', name: 'FLUX.1 Schnell', refs: 0, kind: 'json-min', fixed: { w: 1024, h: 1024 }, steps: { min: 1, max: 8, def: 4 },
    desc: 'O clássico: só texto, sempre 1024², muito econômico.',
    cost: ({ w, h, steps }) => tiles(w, h) * 4.8 + steps * 9.6,
  },
  {
    id: '@cf/leonardo/lucid-origin', name: 'Lucid Origin', refs: 0, kind: 'json', steps: { min: 1, max: 40, def: 4 },
    desc: 'Estética Leonardo, limpa e realista. Só texto. Caro por tile.',
    cost: ({ w, h, steps }) => tiles(w, h) * 636 + steps * 12,
  },
  {
    id: '@cf/leonardo/phoenix-1.0', name: 'Phoenix 1.0', refs: 0, kind: 'json', steps: { min: 1, max: 50, def: 25 },
    desc: 'Boa aderência ao prompt e texto legível dentro da imagem. Só texto.',
    cost: ({ w, h, steps }) => tiles(w, h) * 530 + steps * 10,
  },
];
const modelById = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

const RATIOS = [
  ['1:1', 1, 1], ['4:5', 4, 5], ['3:4', 3, 4], ['2:3', 2, 3], ['9:16', 9, 16],
  ['5:4', 5, 4], ['4:3', 4, 3], ['3:2', 3, 2], ['16:9', 16, 9], ['21:9', 21, 9],
];
const TIERS = [
  { id: '0.5', label: 'Rascunho', mp: 0.5 },
  { id: '1', label: 'Padrão', mp: 1 },
  { id: '2', label: 'Alto', mp: 2 },
];
const ROLES = {
  free: { label: 'Referência', line: (n) => `Use image ${n} as a reference.` },
  character: { label: 'Personagem', line: (n) => `Image ${n} is the character reference: keep the same person, face, hair and outfit.` },
  style: { label: 'Estilo', line: (n) => `Image ${n} is the style reference: follow its look, palette and rendering.` },
  scene: { label: 'Cenário', line: (n) => `Image ${n} is the setting reference: use its environment and mood.` },
};
const ROLE_ORDER = ['free', 'character', 'style', 'scene'];

/* ------------------------------------------------------------------ persistência */
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } };

// Migração única: o app se chamava "Vitrine" e guardava dados com outro prefixo.
try {
  for (const k of ['state', 'creds', 'ledger']) {
    const old = localStorage.getItem(`vitrine.${k}`);
    if (old !== null && localStorage.getItem(`openimage.${k}`) === null) localStorage.setItem(`openimage.${k}`, old);
    localStorage.removeItem(`vitrine.${k}`);
  }
} catch { /* armazenamento indisponível */ }

const S = Object.assign(
  { model: MODELS[0].id, ratio: '1:1', tier: '1', steps: {}, seed: '', roleNote: true, prompt: '' },
  lsGet('openimage.state', {}),
);
const saveState = () => { S.prompt = $('#prompt').value; lsSet('openimage.state', S); };
let creds = lsGet('openimage.creds', { account: '', token: '' });

/* ledger diário (UTC) */
const utcDay = () => new Date().toISOString().slice(0, 10);
const ledger = () => {
  let L = lsGet('openimage.ledger', null);
  if (!L || L.day !== utcDay()) { L = { day: utcDay(), local: 0, remote: null, since: 0 }; lsSet('openimage.ledger', L); }
  return L;
};
const used = () => { const L = ledger(); return Math.max(L.local, L.remote ? L.remote.v + L.since : 0); };
const remaining = () => Math.max(0, DAILY - used());
const addUsed = (n) => { const L = ledger(); L.local += n; L.since += n; lsSet('openimage.ledger', L); };
let syncInfo = { at: 0, error: '', busy: false };

/* ------------------------------------------------------------------ IndexedDB */
const dbp = new Promise((res) => {
  try {
    const r = indexedDB.open('vitrine', 1) /* nome legado mantido para preservar o histórico de quem já usava */;
    r.onupgradeneeded = () => r.result.createObjectStore('gens', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  } catch { res(null); }
});
const tx = async (mode, fn) => {
  const db = await dbp; if (!db) return null;
  return new Promise((res) => { const t = db.transaction('gens', mode); const r = fn(t.objectStore('gens')); t.oncomplete = () => res(r?.result ?? null); t.onerror = () => res(null); });
};
const dbAll = () => tx('readonly', (s) => s.getAll()).then((a) => a || []);
const dbPut = (v) => tx('readwrite', (s) => s.put(v));
const dbDel = (id) => tx('readwrite', (s) => s.delete(id));

/* ------------------------------------------------------------------ estado de execução */
let refs = [];            // { id, blob, url, w, h, role }
let history = [];         // { id, blob, url, prompt, model, w, h, ratio, tier, cost, t }
let shown = null;         // item exibido no palco
let busy = false;
let controller = null;
let timerId = 0;

/* ------------------------------------------------------------------ cálculo */
const model = () => modelById(S.model);
const stepsFor = (m) => (m.steps ? Math.min(m.steps.max, Math.max(m.steps.min, Number(S.steps[m.id] ?? m.steps.def))) : 0);
const ratioDef = () => RATIOS.find((r) => r[0] === S.ratio) || RATIOS[0];

function dimsFor(m = model()) {
  if (m.fixed) return { ...m.fixed };
  const [, rw, rh] = ratioDef();
  const tier = TIERS.find((t) => t.id === S.tier) || TIERS[1];
  const px = tier.mp * 1048576;
  const w = Math.sqrt((px * rw) / rh);
  const top = m.kind === 'form' ? 1920 : 2048; // FLUX.2 aceita 256–1920
  const r16 = (v) => Math.min(top, Math.max(256, Math.round(v / 16) * 16));
  return { w: r16(w), h: r16(w * rh / rw) };
}
const activeRefs = (m = model()) => refs.slice(0, m.refs);
const costFor = (m = model()) => {
  const d = dimsFor(m);
  return m.cost({ ...d, refs: activeRefs(m), steps: stepsFor(m) });
};
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

/* ------------------------------------------------------------------ UI: palco */
function fitFrame() {
  const st = $('#stage'); const cs = getComputedStyle(st);
  const w = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 26;
  const d = dimsFor();
  const ar = shown && !busy ? shown.w / shown.h : d.w / d.h;
  const fw = Math.max(120, Math.min(w, h * ar)); const fh = fw / ar;
  const f = $('#frame');
  f.style.width = `${fw}px`; f.style.height = `${fh}px`;
  f.toggleAttribute('data-compact', fh < 340 || fw < 300);
  const rd = shown && !busy ? shown : d;
  $('#readout').textContent = `${rd.w} × ${rd.h}`;
}

// Decodifica as imagens recentes em segundo plano para que o clique na miniatura já encontre tudo pronto.
const warmDecode = (items) => {
  const run = () => items.forEach((it) => { const i = new Image(); i.src = it.url; i.decode?.().catch(() => {}); });
  (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(run);
};
const setBg = (item) => { const bg = $('#bgimg'); bg.style.backgroundImage = `url("${item.url}")`; bg.classList.add('on'); };

function showItem(item, { instant = false, bg = true } = {}) {
  resetView();
  shown = item;
  const img = $('#out');
  img.classList.remove('show');
  $('#frame').classList.remove('is-empty');
  $('#frame').classList.add('has-img');
  $('#tools').hidden = false;
  if (instant) { img.onload = null; img.style.transition = 'none'; img.classList.add('show'); }
  else img.onload = () => requestAnimationFrame(() => img.classList.add('show'));
  img.src = item.url;
  if (bg) setBg(item);
  $$('.thumb').forEach((t) => t.classList.toggle('active', t.dataset.id === item.id));
  fitFrame();
}

function resetStage() {
  resetView();
  shown = null;
  const img = $('#out'); img.classList.remove('show'); img.removeAttribute('src');
  $('#frame').classList.add('is-empty'); $('#frame').classList.remove('has-img');
  $('#tools').hidden = true;
  $$('.thumb').forEach((t) => t.classList.remove('active'));
  fitFrame();
}

/* Animação de "voo": a imagem do palco encolhe até a miniatura no histórico e vice-versa. */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLY_MS = reduceMotion ? 1 : 480;
const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
const thumbOf = (id) => $(`.thumb[data-id="${id}"]`);
let anims = [];     // animações do voo em curso
let flight = null;  // promessa do voo em curso

function flyClone(src, from, to, rFrom, rTo, delay = 0) {
  const el = document.createElement('img'); el.className = 'fly'; el.src = src; el.alt = ''; el.decoding = 'sync';
  const kf = (r, rad) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: rad });
  Object.assign(el.style, kf(from, rFrom));
  document.body.append(el);
  const anim = el.animate([kf(from, rFrom), kf(to, rTo)], { duration: FLY_MS, delay: reduceMotion ? 0 : delay, easing: 'cubic-bezier(.16,.84,.24,1)', fill: 'both' });
  anims.push(anim);
  return { el, done: anim.finished };
}
const pulse = (el) => el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });

// Um clique novo nunca espera o voo anterior: ele é concluído na hora e o próximo começa.
function runFlight(fn) {
  const p = (async () => {
    if (flight) { anims.forEach((a) => { try { a.finish(); } catch { /* já terminou */ } }); await flight; }
    document.body.classList.add('flying');
    try { await fn(); } finally { anims = []; document.body.classList.remove('flying'); }
  })();
  flight = p;
  p.finally(() => { if (flight === p) flight = null; });
  return p;
}
const reveal = (fr, ...hidden) => { fr.style.visibility = ''; $('#out').style.transition = ''; hidden.forEach((t) => t && (t.style.visibility = '')); };

const collapseToHistory = () => runFlight(async () => {
  if (!shown || busy) return;
  const th = thumbOf(shown.id); if (!th) return;
  resetView();
  th.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const fr = $('#frame'); const item = shown;
  const c = flyClone(item.url, rectOf(fr), rectOf(th), '6px', '10px');
  fr.style.visibility = 'hidden'; th.style.visibility = 'hidden';
  await c.done;
  resetStage(); reveal(fr, th);
  fr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' });
  c.el.remove(); pulse(th);
});

const openFromThumb = (item, thB) => runFlight(async () => {
  if (busy || shown?.id === item.id) return;
  if (thB.closest('.thumb')) thB.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  resetView();
  const cur = shown; const thA = cur && thumbOf(cur.id);
  const fr = $('#frame');
  const fromA = cur && rectOf(fr); const toA = thA && rectOf(thA); const fromB = rectOf(thB);
  fr.style.transition = 'none';
  showItem(item, { instant: true, bg: false });
  const toB = rectOf(fr);                         // geometria final, sem animar o tamanho do quadro
  fr.style.visibility = 'hidden'; void fr.offsetWidth; fr.style.transition = '';
  // a imagem atual encolhe até o histórico enquanto a nova cresce até o centro
  const A = thA ? flyClone(cur.url, fromA, toA, '6px', '10px') : null;
  const B = flyClone(item.url, fromB, toB, '10px', '6px', thA ? 60 : 0);
  if (thA) thA.style.visibility = 'hidden';
  thB.style.visibility = 'hidden';
  await Promise.all([A?.done, B.done]);
  reveal(fr, thA, thB);
  A?.el.remove(); B.el.remove();
  setBg(item); if (thA) pulse(thA);
});

// clique no fundo desfocado (fora do quadro, do histórico e do dock) recolhe a imagem
let popWasOpen = false; // o clique que fecha um menu não deve recolher a imagem
document.addEventListener('click', () => { popWasOpen = !!$('.anchor.open'); }, true);
document.addEventListener('click', (e) => {
  if (!shown || popWasOpen || $('#settings').open) return;
  if (['BODY', 'HTML'].includes(e.target.tagName) || e.target.matches('#stage, .top, #history')) collapseToHistory();
});

/* ------------------------------------------------------------------ zoom da imagem */
const view = { s: 1, x: 0, y: 0 };
const MAX_ZOOM = 8;
let overscroll = 0, lastWheel = 0, lockUntil = 0;

function applyView() {
  const img = $('#out'), fr = $('#frame');
  img.style.scale = view.s === 1 ? '' : String(view.s);
  img.style.translate = view.s === 1 ? '' : `${view.x}px ${view.y}px`;
  fr.classList.toggle('zoomed', view.s > 1);
  const b = $('#zoomBadge'); b.hidden = view.s <= 1; b.textContent = `${Math.round(view.s * 100)}%  ×`;
}
function resetView() { if (view.s === 1 && !view.x && !view.y) return; view.s = 1; view.x = 0; view.y = 0; applyView(); }
function clampPan() {
  const fr = $('#frame'); const mx = ((view.s - 1) * fr.clientWidth) / 2, my = ((view.s - 1) * fr.clientHeight) / 2;
  view.x = Math.min(mx, Math.max(-mx, view.x)); view.y = Math.min(my, Math.max(-my, view.y));
}
function zoomAt(newS, cx, cy) {
  const r = $('#frame').getBoundingClientRect();
  const px = Math.max(-r.width / 2, Math.min(r.width / 2, cx - (r.left + r.width / 2)));
  const py = Math.max(-r.height / 2, Math.min(r.height / 2, cy - (r.top + r.height / 2)));
  const s2 = Math.min(MAX_ZOOM, Math.max(1, newS)); const k = s2 / view.s;
  view.x = px - (px - view.x) * k; view.y = py - (py - view.y) * k; view.s = s2;
  if (s2 === 1) { view.x = 0; view.y = 0; } else clampPan();
  applyView();
}
const wheelDelta = (e) => e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);

$('#stage').addEventListener('wheel', (e) => {
  if (!shown || busy || flight || wallOpen) return;
  e.preventDefault();
  const now = performance.now(); const dy = wheelDelta(e);
  if (dy < 0) { overscroll = 0; zoomAt(view.s * Math.exp(-dy * 0.0016), e.clientX, e.clientY); }
  else if (view.s > 1.001) {
    zoomAt(view.s * Math.exp(-dy * 0.0016), e.clientX, e.clientY);
    if (view.s <= 1.001) { lockUntil = now + 600; overscroll = 0; }
  } else if (now >= lockUntil) {
    // já no tamanho normal: continuar afastando abre o mural
    if (now - lastWheel > 350) overscroll = 0;
    overscroll += dy;
    if (overscroll > 260) { overscroll = 0; openWall(); }
  }
  lastWheel = now;
}, { passive: false });

(() => { // arrastar com a imagem ampliada + duplo clique
  const fr = $('#frame'); let drag = null;
  fr.addEventListener('pointerdown', (e) => {
    if (view.s <= 1 || e.button !== 0 || e.target.closest('#tools, #zoomBadge')) return;
    drag = { x: e.clientX, y: e.clientY }; fr.setPointerCapture(e.pointerId); fr.classList.add('dragging');
  });
  fr.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.x += e.clientX - drag.x; view.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
    clampPan(); applyView();
  });
  const end = () => { drag = null; fr.classList.remove('dragging'); };
  fr.addEventListener('pointerup', end); fr.addEventListener('pointercancel', end);
  fr.addEventListener('dblclick', (e) => {
    if (!shown || busy || e.target.closest('#tools, #zoomBadge')) return;
    if (view.s > 1) resetView(); else zoomAt(2.5, e.clientX, e.clientY);
  });
  $('#zoomBadge').onclick = resetView;
})();

/* ------------------------------------------------------------------ mural infinito */
const wallEl = $('#wall'), worldEl = $('#wallWorld');
let wallOpen = false, wallClosing = false;
const W = { z: 0.8, zt: 0.8, cx: 0, cy: 0, anchor: null, vx: 0, vy: 0, dragging: false, layout: null, tiles: new Map(), raf: 0, dirty: true };
const TILE_W = 260, GAP = 14;

function layoutWall(items) {
  const n = items.length; const M = Math.max(12, n);
  const cells = Array.from({ length: M }, (_, k) => items[k % n]);
  const C = Math.min(7, Math.max(3, Math.round(Math.sqrt(M * 1.4))));
  const cols = Array.from({ length: C }, () => ({ h: 0, list: [] }));
  for (const it of cells) {
    const ar = Math.min(2, Math.max(0.5, it.w / it.h)); const th = TILE_W / ar;
    const c = cols.reduce((a, b) => (b.h < a.h ? b : a));
    c.list.push({ item: it, h: th }); c.h += th + GAP;
  }
  const H = Math.max(...cols.map((c) => c.h));
  const out = [];
  cols.forEach((c, ci) => {            // iguala a altura das colunas para o mural emendar sem buracos
    const k = (H - c.list.length * GAP) / c.list.reduce((s, t) => s + t.h, 0); let y = 0;
    for (const t of c.list) { const h = t.h * k; out.push({ item: t.item, x: ci * (TILE_W + GAP), y, w: TILE_W, h }); y += h + GAP; }
  });
  return { cells: out, W: C * (TILE_W + GAP), H };
}
const wallMinZoom = () => { const L = W.layout; return Math.max(0.3, innerWidth / (3 * L.W), innerHeight / (3 * L.H)); };

async function makeWallThumb(it) {   // miniatura leve para o mural (evita desenhar dezenas de imagens grandes)
  if (it.wurl || it.wpending) return; it.wpending = true;
  try {
    const bmp = await createImageBitmap(it.blob, { resizeWidth: 480, resizeQuality: 'medium' });
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82)); it.wurl = URL.createObjectURL(b);
    for (const [, t] of W.tiles) if (t.dataset.id === it.id) t.firstChild.src = it.wurl;
  } catch { /* SVG ou formato sem suporte: segue com a imagem original */ }
}

function renderWall() {
  const L = W.layout; if (!L) return;
  const vw = innerWidth, vh = innerHeight; const hw = vw / (2 * W.z) + 60, hh = vh / (2 * W.z) + 60;
  worldEl.style.transform = `translate(${vw / 2}px, ${vh / 2}px) scale(${W.z}) translate(${-W.cx}px, ${-W.cy}px)`;
  const need = new Set();
  const i0 = Math.floor((W.cx - hw) / L.W), i1 = Math.floor((W.cx + hw) / L.W);
  const j0 = Math.floor((W.cy - hh) / L.H), j1 = Math.floor((W.cy + hh) / L.H);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    L.cells.forEach((c, k) => {
      const x = c.x + i * L.W, y = c.y + j * L.H;
      if (x > W.cx + hw || x + c.w < W.cx - hw || y > W.cy + hh || y + c.h < W.cy - hh) return;
      const key = `${i}|${j}|${k}`; need.add(key);
      if (W.tiles.has(key)) return;
      const el = document.createElement('div'); el.className = `wtile${c.item.id === shown?.id ? ' current' : ''}`; el.dataset.id = c.item.id;
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${c.w}px`, height: `${c.h}px` });
      const im = document.createElement('img'); im.src = c.item.wurl || c.item.url; im.alt = ''; im.draggable = false; el.append(im);
      worldEl.append(el); W.tiles.set(key, el);
    });
  }
  for (const [key, el] of W.tiles) if (!need.has(key)) { el.remove(); W.tiles.delete(key); }
}

function wallTick() {
  if (!wallOpen) return;
  const vw = innerWidth, vh = innerHeight;
  if (Math.abs(W.zt - W.z) > 0.0004) {
    W.z += (W.zt - W.z) * 0.2; W.dirty = true;
    if (W.anchor) { W.cx = W.anchor.wx - (W.anchor.sx - vw / 2) / W.z; W.cy = W.anchor.wy - (W.anchor.sy - vh / 2) / W.z; }
  } else if (W.z !== W.zt) { W.z = W.zt; W.dirty = true; }
  if (!W.dragging && (Math.abs(W.vx) > 0.15 || Math.abs(W.vy) > 0.15)) {
    W.cx -= W.vx / W.z; W.cy -= W.vy / W.z; W.vx *= 0.94; W.vy *= 0.94; W.dirty = true;
  }
  if (W.dirty) { W.dirty = false; renderWall(); }
  W.raf = requestAnimationFrame(wallTick);
}
function wallZoomTo(zt, sx = innerWidth / 2, sy = innerHeight / 2) {
  W.zt = Math.min(2.4, Math.max(wallMinZoom(), zt));
  W.anchor = { sx, sy, wx: W.cx + (sx - innerWidth / 2) / W.z, wy: W.cy + (sy - innerHeight / 2) / W.z };
}

function openWall() {
  if (wallOpen || wallClosing || !history.length) return;
  closePops(); resetView(); wallOpen = true;
  W.layout = layoutWall(history); W.tiles.clear(); worldEl.innerHTML = '';
  const cur = W.layout.cells.find((c) => c.item.id === shown?.id) || W.layout.cells[0];
  W.cx = cur.x + cur.w / 2; W.cy = cur.y + cur.h / 2; W.vx = W.vy = 0; W.anchor = null;
  const target = Math.max(wallMinZoom(), innerWidth < 820 ? 0.7 : 0.85);
  W.z = Math.min(2.4, target * 1.5); W.zt = target; W.dirty = true;
  document.body.classList.add('walling'); wallEl.hidden = false; void wallEl.offsetWidth; wallEl.classList.add('open');
  renderWall(); cancelAnimationFrame(W.raf); W.raf = requestAnimationFrame(wallTick);
  history.forEach((it) => makeWallThumb(it));
}

function closeWall(item, tileEl) {
  if (!wallOpen || wallClosing) return Promise.resolve();
  wallClosing = true; W.anchor = null; W.zt = Math.min(2.4, W.z * 1.25);
  wallEl.classList.remove('open');
  const fin = () => {
    wallOpen = false; wallClosing = false; cancelAnimationFrame(W.raf);
    wallEl.hidden = true; worldEl.innerHTML = ''; W.tiles.clear(); document.body.classList.remove('walling');
  };
  const wait = new Promise((r) => setTimeout(r, 460));
  if (item && tileEl && !busy) {
    return openFromThumb(item, tileEl).then(() => wait).then(fin);
  }
  if (item && busy) toast('Aguarde a geração terminar para abrir outra imagem.');
  return wait.then(fin);
}

(() => { // arrastar, inércia, clique
  let p = null;
  wallEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.wall-ui') || wallClosing) return;
    p = { x: e.clientX, y: e.clientY, moved: 0 }; W.dragging = true; W.vx = W.vy = 0; W.anchor = null;
    wallEl.setPointerCapture(e.pointerId); wallEl.classList.add('dragging');
  });
  wallEl.addEventListener('pointermove', (e) => {
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
    W.cx -= dx / W.z; W.cy -= dy / W.z; W.vx = dx; W.vy = dy; W.dirty = true;
  });
  const up = (e) => {
    if (!p) return; const q = p; p = null; W.dragging = false; wallEl.classList.remove('dragging');
    if (q.moved < 6 && e.type === 'pointerup') {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el?.closest('.wall-ui')) return;
      const tile = el?.closest('.wtile');
      const item = tile && history.find((h) => h.id === tile.dataset.id);
      closeWall(item || null, item ? tile : null);   // clicar numa imagem abre; clicar fora volta ao normal
    }
  };
  wallEl.addEventListener('pointerup', up); wallEl.addEventListener('pointercancel', up);
  wallEl.addEventListener('wheel', (e) => {
    e.preventDefault(); if (wallClosing) return;
    wallZoomTo(W.zt * Math.exp(-wheelDelta(e) * 0.0018), e.clientX, e.clientY);
  }, { passive: false });
  $('#wallIn').onclick = () => wallZoomTo(W.zt * 1.35);
  $('#wallOut').onclick = () => wallZoomTo(W.zt / 1.35);
  window.addEventListener('resize', () => { if (wallOpen) W.dirty = true; });
})();

let toastTimer = 0;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast glass${err ? ' err' : ''}`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), err ? 9000 : 3500);
}

/* ------------------------------------------------------------------ UI: histórico */
function renderHistory() {
  const box = $('#history');
  if (!history.length) { box.innerHTML = '<span class="history-empty">Histórico</span>'; return; }
  box.innerHTML = '';
  const wb = document.createElement('button'); wb.className = 'wall-btn glass'; wb.title = 'Mural de imagens'; wb.setAttribute('aria-label', 'Abrir mural'); wb.innerHTML = icon('grid'); wb.onclick = openWall; box.append(wb);
  for (const it of history) {
    const d = document.createElement('div');
    d.className = `thumb${shown?.id === it.id ? ' active' : ''}`; d.dataset.id = it.id; d.style.aspectRatio = '1';
    d.innerHTML = `<img src="${it.url}" alt="" loading="lazy" decoding="async"><button class="open" aria-label="Abrir imagem"></button><button class="x" aria-label="Excluir">${icon('x')}</button>`;
    d.querySelector('.open').onclick = () => openFromThumb(it, d);
    d.querySelector('.x').onclick = (e) => { e.stopPropagation(); removeItem(it); };
    box.append(d);
  }
}
async function removeItem(it) {
  history = history.filter((h) => h.id !== it.id);
  await dbDel(it.id);
  if (shown?.id === it.id) {
    resetStage(); $('#bgimg').classList.remove('on');
    if (history[0]) showItem(history[0]);
  }
  URL.revokeObjectURL(it.url);
  renderHistory(); fitFrame();
}

/* ------------------------------------------------------------------ UI: referências */
const MAX_REFS = 4;
async function processImage(file) {
  const bmp = await createImageBitmap(file);
  const max = 512; const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(16, Math.round(bmp.width * k)); const h = Math.max(16, Math.round(bmp.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), w, h, role: 'free' };
}
async function addFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return;
  if (!model().refs) {
    S.model = MODELS[0].id;
    toast(`Troquei para ${MODELS[0].name}, que aceita imagens de referência.`);
  }
  let skipped = 0;
  for (const f of imgs) {
    if (refs.length >= MAX_REFS) { skipped++; continue; }
    try { refs.push(await processImage(f)); } catch { toast('Não consegui ler essa imagem.', true); }
  }
  if (skipped) toast(`Máximo de ${MAX_REFS} referências.`);
  refresh();
}
function renderRefs() {
  const box = $('#refs'); const m = model();
  box.hidden = !refs.length;
  box.innerHTML = '';
  refs.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = `ref${i >= m.refs ? ' ignored' : ''}`;
    el.innerHTML = `<img src="${r.url}" alt="Referência ${i + 1}"><button class="role" title="Clique para trocar o papel">${ROLES[r.role].label}<small>imagem ${i + 1}</small></button><button class="rm" aria-label="Remover">${icon('x')}</button>`;
    el.querySelector('.role').onclick = () => { r.role = ROLE_ORDER[(ROLE_ORDER.indexOf(r.role) + 1) % ROLE_ORDER.length]; renderRefs(); };
    el.querySelector('.rm').onclick = () => { URL.revokeObjectURL(r.url); refs = refs.filter((x) => x !== r); refresh(); };
    box.append(el);
  });
}

/* ------------------------------------------------------------------ UI: chips, popovers */
function renderChips() {
  const m = model(); const d = dimsFor(m);
  $('#modelName').textContent = m.name;
  const [name, rw, rh] = m.fixed ? ['1:1', 1, 1] : ratioDef();
  $('#ratioName').textContent = name;
  const k = 15 / Math.max(rw, rh);
  const sh = $('#ratioShape'); sh.style.width = `${Math.round(rw * k) + 3}px`; sh.style.height = `${Math.round(rh * k) + 3}px`;
  const cost = costFor(m);
  const go = $('#goCost'); go.textContent = `≈ ${fmt(cost)}`;
  $('#goBtn').classList.toggle('over', cost > remaining());
  $('#goBtn').title = cost > remaining() ? 'Acima do que resta na cota gratuita de hoje' : `≈ ${fmt(cost)} neurônios`;
  $('#addRefBtn').classList.toggle('warn', refs.length > 0 && !m.refs);
}

function renderModelPop() {
  const pop = $('#modelPop'); const rem = remaining();
  pop.innerHTML = '<h3>Modelo · custo por imagem agora</h3>';
  for (const m of MODELS) {
    const c = costFor(m); const n = Math.floor(rem / c);
    const b = document.createElement('button');
    b.className = `mcard${n < 1 ? ' off' : ''}`; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(m.id === S.model));
    b.innerHTML = `<span class="radio"></span>
      <span class="nm">${m.name}${m.badge ? `<span class="tag ok">${m.badge}</span>` : ''}${m.refs ? '<span class="tag">referências</span>' : '<span class="tag">só texto</span>'}</span>
      <span class="ds">${m.desc}</span>
      <span class="cost"><b>${fmt(c)}</b><small>${n < 1 ? 'acima da cota' : `≈ ${n.toLocaleString('pt-BR')} imgs hoje`}</small></span>`;
    b.onclick = () => { S.model = m.id; closePops(); refresh(); };
    pop.append(b);
  }
}

function renderRatioPop() {
  const m = model(); const pop = $('#ratioPop'); const d = dimsFor(m);
  const items = RATIOS.map(([n, w, h]) => {
    const k = 28 / Math.max(w, h);
    return `<button class="ratio" data-r="${n}" aria-pressed="${n === S.ratio && !m.fixed}"><span class="box"><span style="width:${w * k}px;height:${h * k}px"></span></span>${n}</button>`;
  }).join('');
  const tiers = TIERS.map((t) => {
    const dd = m.fixed ? m.fixed : (() => { const keep = S.tier; S.tier = t.id; const x = dimsFor(m); S.tier = keep; return x; })();
    return `<button data-t="${t.id}" aria-pressed="${t.id === S.tier}">${t.label}<small>${dd.w}×${dd.h}</small></button>`;
  }).join('');
  pop.innerHTML = `<h3>Proporção</h3><div class="ratios${m.fixed ? ' disabled' : ''}">${items}</div>
    <h3>Tamanho</h3><div class="seg${m.fixed ? ' disabled' : ''}" style="${m.fixed ? 'opacity:.35;pointer-events:none' : ''}">${tiers}</div>
    <p class="note${m.fixed ? ' warn' : ''}">${m.fixed ? `${m.name} gera sempre ${m.fixed.w}×${m.fixed.h}.` : `${d.w} × ${d.h} · ${mpOf(d.w, d.h).toFixed(2).replace('.', ',')} MP. Maior = mais neurônios.`}</p>`;
  $$('.ratio', pop).forEach((b) => (b.onclick = () => { S.ratio = b.dataset.r; refresh(); }));
  $$('.seg button', pop).forEach((b) => (b.onclick = () => { S.tier = b.dataset.t; refresh(); }));
}

function renderAdvPop() {
  const m = model(); const pop = $('#advPop');
  const stepsHtml = m.steps
    ? `<div class="field"><div class="lbl"><span>Passos</span><span class="mono" id="stepVal">${stepsFor(m)}</span></div><input type="range" id="stepIn" min="${m.steps.min}" max="${m.steps.max}" value="${stepsFor(m)}"></div>`
    : `<div class="field"><div class="lbl"><span>Passos</span><span class="mono">fixos</span></div><p class="note" style="padding:0">${m.name} é destilado e roda com número fixo de passos.</p></div>`;
  pop.innerHTML = `${stepsHtml}
    <div class="field"><label for="seedIn"><span>Seed</span><span class="mono">${S.seed === '' ? 'aleatória' : ''}</span></label><input type="number" id="seedIn" min="0" step="1" placeholder="vazio = aleatória" value="${S.seed}"></div>
    <label class="switch"><input type="checkbox" id="roleIn" ${S.roleNote ? 'checked' : ''}><span>Anotar papéis das referências<small>Acrescenta ao prompt “a imagem 1 é o personagem…”.</small></span></label>`;
  const si = $('#stepIn', pop);
  if (si) si.oninput = () => { S.steps[m.id] = Number(si.value); $('#stepVal', pop).textContent = si.value; renderChips(); saveState(); };
  $('#seedIn', pop).oninput = (e) => { S.seed = e.target.value; saveState(); };
  $('#roleIn', pop).onchange = (e) => { S.roleNote = e.target.checked; saveState(); };
}

/* ------------------------------------------------------------------ UI: crédito */
const level = (pct) => (pct > 0.4 ? 'ok' : pct > 0.15 ? 'mid' : 'low');
function nextReset() {
  const n = new Date(); const t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
  const ms = t - n.getTime(); const h = Math.floor(ms / 3.6e6); const m = Math.floor((ms % 3.6e6) / 6e4);
  return { h, m, local: new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
}
function renderCredit() {
  const rem = remaining(); const pct = rem / DAILY; const lv = level(pct);
  $('#creditText').textContent = fmt(rem);
  $('#creditBtn').dataset.level = lv;
  $('#ringFg').style.strokeDashoffset = String(100 - pct * 100);

  const L = ledger(); const rs = nextReset();
  const d = dimsFor(); const rows = MODELS.map((m) => {
    const c = costFor(m); return `<div><span>${m.name}</span><span>≈ ${Math.floor(rem / c).toLocaleString('pt-BR')} imgs · ${fmt(c)}</span></div>`;
  }).join('');
  const live = L.remote && syncInfo.at;
  const src = syncInfo.busy ? 'Sincronizando…'
    : live ? `Sincronizado às ${new Date(syncInfo.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : syncInfo.error ? 'Estimativa local' : 'Estimativa local';
  const pop = $('#creditPop');
  pop.innerHTML = `
    <h3 style="padding-left:0">Cota gratuita de hoje</h3>
    <div class="credit-big"><span class="mono" style="font-family:var(--serif);letter-spacing:-.03em">${fmt(rem)}</span><small>de ${fmt(DAILY)} neurônios</small></div>
    <div class="bar"><i data-level="${lv}" style="width:${(pct * 100).toFixed(1)}%"></i></div>
    <div class="credit-row"><span>Usados: <span class="mono">${fmt(used())}</span></span><span>Reinicia em ${rs.h}h${String(rs.m).padStart(2, '0')} (${rs.local})</span></div>
    <div class="credit-list"><h4>Quanto rende · ${d.w}×${d.h}${refs.length ? ` · ${refs.length} ref.` : ''}</h4>${rows}</div>
    <div class="credit-foot"><span class="src" title="${syncInfo.error ? syncInfo.error.replace(/"/g, '') : ''}"><i class="dot${live ? ' live' : ''}"></i><span>${src}</span></span>
      <button id="syncBtn" class="${syncInfo.busy ? 'spin' : ''}">${icon('sync')}Sincronizar</button></div>
    ${syncInfo.error && !live ? `<p class="note" style="padding:8px 0 0">Para ler o consumo real, o token precisa de <i>Account Analytics · Read</i>. Até lá, conto o que este app gera.</p>` : ''}`;
  $('#syncBtn', pop).onclick = () => syncUsage(true);
}

async function syncUsage(force = false) {
  if (!creds.account || !creds.token || syncInfo.busy) return;
  if (!force && Date.now() - syncInfo.at < 60000) return;
  syncInfo.busy = true; renderCredit();
  try {
    const r = await fetch('/api/usage', { method: 'POST', headers: credHeaders() });
    const j = await r.json();
    if (typeof j.neurons === 'number') {
      const L = ledger(); L.remote = { v: j.neurons }; L.since = 0; lsSet('openimage.ledger', L);
      syncInfo.at = Date.now(); syncInfo.error = '';
    } else syncInfo.error = j.error || 'Sem dados de consumo.';
  } catch (e) { syncInfo.error = e.message; }
  syncInfo.busy = false; refresh();
}

/* ------------------------------------------------------------------ popovers: abrir/fechar */
const ANCHORS = { creditAnchor: renderCredit, modelAnchor: renderModelPop, ratioAnchor: renderRatioPop, advAnchor: renderAdvPop };
function closePops(except) { $$('.anchor.open').forEach((a) => a.id !== except && (a.classList.remove('open'), $('button', a)?.setAttribute('aria-expanded', 'false'))); }
function togglePop(id) {
  const a = $('#' + id); const open = !a.classList.contains('open');
  closePops(open ? id : undefined);
  if (open) { ANCHORS[id](); if (id === 'creditAnchor') syncUsage(); }
  a.classList.toggle('open', open); $('button', a).setAttribute('aria-expanded', String(open));
}
for (const [id, btn] of [['creditAnchor', '#creditBtn'], ['modelAnchor', '#modelBtn'], ['ratioAnchor', '#ratioBtn'], ['advAnchor', '#advBtn']]) {
  $(btn).addEventListener('click', (e) => { e.stopPropagation(); togglePop(id); });
}
document.addEventListener('click', (e) => { if (!e.target.closest('.anchor')) closePops(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (wallOpen) closeWall(); else closePops(); } });

/* ------------------------------------------------------------------ refresh geral */
function refresh() {
  renderChips(); renderRefs(); renderCredit(); fitFrame();
  const open = $('.anchor.open'); if (open && open.id !== 'creditAnchor') ANCHORS[open.id]();
  if (open?.id === 'creditAnchor') renderCredit();
  $('#settingsBtn').classList.toggle('attn', !(creds.account && creds.token));
  const cb = $('#connectBtn'); if (cb) cb.hidden = !!(creds.account && creds.token);
  saveState();
}

/* ------------------------------------------------------------------ geração */
const credHeaders = () => ({ 'x-cf-account': creds.account, 'x-cf-token': creds.token });

function b64ToBlob(b64) {
  const type = b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('UklG') ? 'image/webp' : 'image/png';
  const bin = atob(b64.replace(/^data:[^,]+,/, '')); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}

const MODERATION_RE = /nsfw|safety|safe[- ]?search|moderat|flagg?ed|polic(y|ies)|prohibit|disallow|not allowed|inappropriate|sensitive|violat|explicit|censor|blocked|harmful/i;

async function readImage(res) {
  const ct = res.headers.get('content-type') || '';
  if (res.ok && ct.startsWith('image/')) return res.blob();
  const txt = await res.text(); let j;
  try { j = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 240) || `Erro ${res.status}`); }
  const e = j.errors?.[0]; const msg = e?.message || j.error || '';
  if (!res.ok || j.success === false || j.error) {
    if (/neuron|allocation|quota|daily|10,?000/i.test(msg) || e?.code === 4006) {
      const rs = nextReset();
      throw new Error(`A cota gratuita de hoje acabou. Ela reinicia às ${rs.local} (00:00 UTC).`);
    }
    if (e?.code === 3030 || MODERATION_RE.test(msg)) { const er = new Error(msg); er.moderation = true; throw er; }
    if (res.status === 401 || res.status === 403 || /auth|permission|forbidden/i.test(msg)) throw new Error(`A Cloudflare recusou as credenciais${msg ? `: ${msg}` : ''}. Confira o token e o Account ID.`);
    throw new Error(msg || `Erro ${res.status}`);
  }
  const b64 = j.result?.image ?? j.image ?? (typeof j.result === 'string' ? j.result : null);
  if (!b64) throw new Error('A resposta não trouxe imagem.');
  return b64ToBlob(b64);
}

function buildRequest(m, d, prompt) {
  const seed = S.seed !== '' && Number.isFinite(Number(S.seed)) ? Math.max(0, Math.floor(Number(S.seed))) : null;
  if (m.kind === 'form') {
    const fd = new FormData();
    fd.append('prompt', prompt); fd.append('width', String(d.w)); fd.append('height', String(d.h));
    if (m.steps) fd.append('steps', String(stepsFor(m)));
    if (seed !== null) fd.append('seed', String(seed));
    activeRefs(m).forEach((r, i) => fd.append(`input_image_${i}`, r.blob, `ref${i}.jpg`));
    return { body: fd, headers: {} };
  }
  const o = { prompt };
  if (m.kind === 'json') { o.width = d.w; o.height = d.h; }
  if (m.steps) o.steps = stepsFor(m);
  if (seed !== null) o.seed = seed;
  return { body: JSON.stringify(o), headers: { 'content-type': 'application/json' } };
}

function composePrompt(m, text) {
  const act = activeRefs(m);
  if (!act.length || !S.roleNote) return text;
  return `${text}\n\n${act.map((r, i) => ROLES[r.role].line(i + 1)).join(' ')}`;
}

function showError(msg) {
  const b = $('#errbox'); b.querySelector('p').textContent = msg; b.hidden = false;
  $('#frame').classList.add('failed'); toast(msg, true);
}
let policyTimer = 0;
function showPolicy() { const p = $('#policy'); p.hidden = false; clearTimeout(policyTimer); policyTimer = setTimeout(() => (p.hidden = true), 14000); }
const hidePolicy = () => { $('#policy').hidden = true; clearTimeout(policyTimer); };
function clearError() { hidePolicy(); $('#errbox').hidden = true; $('#frame').classList.remove('failed'); }

function setBusy(on) {
  busy = on; if (on) clearError();
  $('#frame').classList.toggle('busy', on);
  $('#goBtn').classList.toggle('busy', on);
  $('#goBtn .go-label').textContent = on ? 'Revelando' : 'Gerar';
  clearInterval(timerId);
  if (on) {
    const t0 = Date.now();
    const tick = () => { const s = Math.floor((Date.now() - t0) / 1000); $('#timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
    tick(); timerId = setInterval(tick, 250);
  }
  fitFrame();
}

async function generate() {
  if (busy) return;
  const text = $('#prompt').value.trim();
  if (!text) { toast('Escreva o que quer ver primeiro.'); $('#prompt').focus(); return; }
  if (!creds.account || !creds.token) { openSettings(); return; }
  closePops();
  const m = model(); const d = dimsFor(m); const cost = costFor(m);
  const finalPrompt = composePrompt(m, text);
  const { body, headers } = buildRequest(m, d, finalPrompt);
  controller = new AbortController(); setBusy(true);
  $('#loadingLabel').textContent = 'Revelando…';
  try {
    const res = await fetch('/api/generate', {
      method: 'POST', signal: controller.signal,
      headers: { ...credHeaders(), 'x-cf-model': m.id, 'x-mock-size': `${d.w}x${d.h}`, 'x-mock-seed': encodeURIComponent(text).slice(0, 200), ...headers }, body,
    });
    const blob = await readImage(res);
    const url = URL.createObjectURL(blob);
    const dim = await new Promise((r) => { const i = new Image(); i.onload = () => r({ w: i.naturalWidth || d.w, h: i.naturalHeight || d.h }); i.onerror = () => r(d); i.src = url; });
    const item = { id: crypto.randomUUID(), blob, url, prompt: text, model: m.id, w: dim.w, h: dim.h, ratio: S.ratio, tier: S.tier, cost, t: Date.now(), refs: activeRefs(m).length };
    addUsed(cost);
    history.unshift(item); await dbPut({ ...item, url: undefined });
    for (const old of history.splice(60)) { dbDel(old.id); URL.revokeObjectURL(old.url); }
    setBusy(false); showItem(item); renderHistory(); refresh(); warmDecode([item]);
    setTimeout(() => syncUsage(), 20000);
  } catch (e) {
    setBusy(false);
    if (e.moderation) showPolicy();
    else if (e.name !== 'AbortError') { console.error(e); showError(e.message || 'Algo deu errado.'); }
  } finally { controller = null; }
}

/* ------------------------------------------------------------------ credenciais */
const dlg = $('#settings');
function openSettings() {
  $('#accIn').value = creds.account; $('#tokIn').value = creds.token;
  $('#verifyMsg').textContent = ''; $('#verifyMsg').className = 'status';
  closePops(); dlg.showModal();
  (creds.account ? $('#tokIn') : $('#accIn')).focus();
}
const readCreds = () => ({ account: $('#accIn').value.trim(), token: $('#tokIn').value.trim() });
const credErr = (c) => (!/^[a-f0-9]{32}$/i.test(c.account) ? 'O Account ID tem 32 caracteres (letras a–f e números).' : !c.token ? 'Cole o token da API.' : '');
$('#settingsBtn').onclick = openSettings;
$('#testBtn').onclick = async () => {
  const c = readCreds(); const msg = $('#verifyMsg'); const e = credErr(c);
  if (e) { msg.textContent = e; msg.className = 'status err'; return; }
  msg.textContent = 'Verificando…'; msg.className = 'status';
  try {
    const r = await fetch('/api/verify', { method: 'POST', headers: { 'x-cf-account': c.account, 'x-cf-token': c.token } });
    const j = await r.json();
    msg.textContent = j.ok ? 'Conectado. Token ativo.' : j.error; msg.className = `status ${j.ok ? 'ok' : 'err'}`;
  } catch (er) { msg.textContent = `Não consegui falar com o servidor local: ${er.message}`; msg.className = 'status err'; }
};
$('#clearCreds').onclick = () => { creds = { account: '', token: '' }; lsSet('openimage.creds', creds); $('#accIn').value = ''; $('#tokIn').value = ''; refresh(); $('#verifyMsg').textContent = 'Credenciais removidas deste navegador.'; };
$('#settingsForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const c = readCreds(); const e = credErr(c);
  if (e) { $('#verifyMsg').textContent = e; $('#verifyMsg').className = 'status err'; return; }
  creds = c; lsSet('openimage.creds', creds); dlg.close(); refresh(); syncUsage(true);
});
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

/* ------------------------------------------------------------------ eventos */
$('#goBtn').onclick = () => (busy ? null : generate());
$('#cancelBtn').onclick = () => controller?.abort();
$('#addRefBtn').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };

const prompt = $('#prompt');
const grow = () => { prompt.style.height = '0px'; prompt.style.height = `${Math.max(58, Math.min(160, prompt.scrollHeight))}px`; fitFrame(); };
document.fonts?.ready.then(grow);
prompt.addEventListener('input', () => { grow(); saveState(); });
prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } });

document.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith('image/'));
  if (f.length) { e.preventDefault(); addFiles(f); }
});
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; $('#dropveil').hidden = false; } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('#dropveil').hidden = true; } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $('#dropveil').hidden = true; addFiles(e.dataTransfer.files); });

$('#tools').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]'); if (!b || !shown) return;
  if (b.dataset.act === 'download') {
    const a = document.createElement('a'); a.href = shown.url;
    const ext = (shown.blob.type.split('/')[1] || 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg');
    a.download = `openimage-${new Date(shown.t).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`; a.click();
  } else if (b.dataset.act === 'asref') {
    if (shown.blob.type === 'image/svg+xml') { toast('SVG de demonstração não pode virar referência.'); return; }
    await addFiles([new File([shown.blob], 'gerada.png', { type: shown.blob.type })]);
    toast('Adicionada às referências.');
  } else if (b.dataset.act === 'reuse') {
    prompt.value = shown.prompt; S.model = shown.model; S.ratio = shown.ratio; S.tier = shown.tier; grow(); refresh(); prompt.focus();
  }
});

$('#empty').insertAdjacentHTML('beforeend', '<button class="ghost" id="connectBtn" style="margin-top:6px">Conectar à Cloudflare →</button>');
$('#connectBtn').onclick = openSettings;

new ResizeObserver(() => fitFrame()).observe($('#stage'));
document.fonts?.ready.then(fitFrame);
setInterval(() => { if ($('#creditAnchor').classList.contains('open')) renderCredit(); }, 30000);

/* ------------------------------------------------------------------ boot */
hydrate();
prompt.value = S.prompt || '';
if (!modelById(S.model) || !MODELS.some((m) => m.id === S.model)) S.model = MODELS[0].id;
grow(); refresh();
dbAll().then((all) => {
  history = all.sort((a, b) => b.t - a.t).map((it) => ({ ...it, url: URL.createObjectURL(it.blob) }));
  renderHistory();
  if (history[0]) showItem(history[0]);
  warmDecode(history.slice(0, 12));
});
syncUsage();
$('#errClose').onclick = clearError;

$('#policyX').onclick = hidePolicy;
