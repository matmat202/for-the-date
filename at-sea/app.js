// At Sea on This Date: the page. Logic lives in sea-logic.js (tested); this file fetches and draws.
import * as L from './sea-logic.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const KNOWN = new Set(['BRITISH', 'DUTCH', 'SPANISH', 'FRENCH']);
const FIRST_WORDS = 25;

let VOY = null, WORLD = null, DAY = null, EN = null;
const state = { key: L.dateKey(location.search, new Date()), year: null, pick: null, all: false };
{
  const y = +new URLSearchParams(location.search).get('y');
  if (y) state.year = y;
}

const natClass = (n) => `n-${KNOWN.has(n) ? n : 'OTHER'}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => n.toLocaleString('en-US');

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function fillDateControls() {
  const [mo, dy] = state.key.split('-').map(Number);
  $('mo').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}"${i + 1 === mo ? ' selected' : ''}>${m}</option>`).join('');
  let d = '';
  for (let i = 1; i <= DAYS_IN[mo - 1]; i++) d += `<option value="${i}"${i === dy ? ' selected' : ''}>${i}</option>`;
  $('dy').innerHTML = d;
}

function fillYears() {
  const ys = L.years(DAY.rows);
  if (state.year != null && !ys.includes(state.year)) state.year = null;
  $('yr').innerHTML = `<option value="">Every year (${ys.length})</option>` +
    ys.map((y) => `<option value="${y}"${y === state.year ? ' selected' : ''}>${y}</option>`).join('');
}

function shipName(r) {
  const v = VOY[r[L.V]];
  return L.title(v[0]) || 'An unnamed ship';
}
function shipMeta(r) {
  const v = VOY[r[L.V]];
  const bits = [L.nationName(v[1])];
  if (v[2]) bits.push(L.sentence(v[2]));
  if (v[3]) bits.push(v[3]);
  let s = bits.join(' · ');
  if (v[4] || v[5]) s += ` · ${L.title(v[4]) || '?'} to ${L.title(v[5]) || '?'}`;
  if (v[6]) s += ` · ${L.title(v[6])}`;
  return s;
}

// One logged phrase: English as written; otherwise the translation, then the original.
function said(text, lang) {
  const p = L.phrase(text, lang, EN);
  if (!p) return null;
  const tag = lang === 'ENGLISH' ? '' : `<span class="lang">${esc(L.languageName(lang))}${p.orig ? ', machine-translated' : ''}</span>`;
  return `<q>${esc(L.sentence(p.text))}</q>${tag}` + (p.orig ? `<br><span class="orig">${esc(L.sentence(p.orig))}</span>` : '');
}

// One ship's day, as HTML.
function shipHTML(r, opts = {}) {
  const v = VOY[r[L.V]];
  const wind = L.windLine(r), ww = said(r[L.WW], v[7]), wx = said(r[L.WX], v[7]);
  const parts = [];
  if (wind || ww) parts.push(`${esc(wind || 'Wind')}${ww ? `: ${ww}` : ''}`);
  if (wx) parts.push(`Weather: ${wx}`);
  const rm = opts.remark !== false && said(r[L.R], v[7]);
  if (rm) parts.push(rm);
  return `<p class="ship"><span class="who">${esc(shipName(r))}</span>, ${r[L.Y]} · ${esc(L.fmtPos(r[L.LA], r[L.LO]))}` +
    (opts.go ? `<button type="button" class="go" data-i="${opts.go}">on the map</button>` : '') +
    `<br><span class="meta">${esc(shipMeta(r))}</span>` +
    (parts.length ? `<br>${parts.join('<br>')}` : '') + '</p>';
}

function dotR(r) {
  const f = L.beaufort(r[L.W]);
  return f == null ? 0.9 : 0.8 + f * 0.22;
}

function drawMap(rows) {
  const box = $('map');
  box.textContent = '';
  const svg = el('svg', { viewBox: '-180 -80 360 160' });
  el('rect', { class: 'sea', x: -180, y: -80, width: 360, height: 160 }, svg);
  if (WORLD) el('path', { class: 'land', d: WORLD.land }, svg);
  const g = el('g', {}, svg);
  rows.forEach((r, i) => {
    if (r[L.LA] > 80 || r[L.LA] < -80) return;
    const c = el('circle', { class: `${natClass(VOY[r[L.V]][1])}${state.pick === r ? ' on' : ''}`,
      cx: r[L.LO], cy: -r[L.LA], r: dotR(r).toFixed(2), 'data-i': i }, g);
    el('title', {}, c).textContent = `${shipName(r)}, ${r[L.Y]}`;
  });
  svg.addEventListener('click', (ev) => {
    const i = ev.target.getAttribute && ev.target.getAttribute('data-i');
    if (i == null) return;
    pick(rows[+i]);
  });
  box.appendChild(svg);
}

function pick(r) {
  state.pick = r;
  $('pick').hidden = false;
  $('pickBody').innerHTML = shipHTML(r);
  for (const c of document.querySelectorAll('#map circle.on')) c.classList.remove('on');
  const rows = L.inYear(DAY.rows, state.year);
  const i = rows.indexOf(r);
  const dot = document.querySelector(`#map circle[data-i="${i}"]`);
  if (dot) { dot.classList.add('on'); dot.parentNode.appendChild(dot); }
}

function drawKey(s) {
  const counts = Object.fromEntries(s.nations);
  const other = s.nations.filter(([n]) => !KNOWN.has(n)).reduce((a, [, c]) => a + c, 0);
  const items = ['DUTCH', 'BRITISH', 'SPANISH', 'FRENCH'].filter((n) => counts[n])
    .map((n) => `<span><i class="${natClass(n)}"></i>${L.nationName(n)} ${fmt(counts[n])}</span>`);
  if (other) items.push(`<span><i class="n-OTHER"></i>Other ${fmt(other)}</span>`);
  $('key').innerHTML = items.join('');
}

function draw() {
  const rows = L.inYear(DAY.rows, state.year);
  const s = L.summary(rows, VOY);
  const label = L.dateLabel(state.key);
  if (!rows.length) {
    $('big').innerHTML = `No surviving log in this collection was kept on ${esc(label)}${state.year ? ` ${state.year}` : ''}.`;
    $('facts').hidden = true;
  } else if (state.year) {
    $('big').innerHTML = `On <b>${esc(label)} ${state.year}</b>, <b>${fmt(s.ships)}</b> ship${s.ships === 1 ? '' : 's'} logged the day at sea.`;
  } else {
    $('big').innerHTML = `On <b>${esc(label)}</b>, in <b>${fmt(s.years)}</b> different years from ${s.first} to ${s.last}, ` +
      `<b>${fmt(s.ships)}</b> ships logged the day at sea.`;
  }
  if (rows.length) {
    $('facts').hidden = false;
    $('fShips').textContent = fmt(s.ships);
    $('fYears').textContent = fmt(s.years);
    $('fCalm').textContent = fmt(s.calm);
    $('fGale').textContent = fmt(s.gales);
  }
  drawKey(s);
  drawMap(rows);
  if (s.storm) {
    $('stormCard').hidden = false;
    $('storm').innerHTML = shipHTML(s.storm);
  } else $('stormCard').hidden = true;
  if (state.pick && !rows.includes(state.pick)) { state.pick = null; $('pick').hidden = true; }
  const notes = L.remarks(rows, VOY);
  const en = notes.filter((r) => VOY[r[L.V]][7] === 'ENGLISH').length;
  $('wordsNote').textContent = notes.length
    ? `${fmt(notes.length)} of these logs wrote down something besides wind and weather${en ? `, ${fmt(en)} of them in English, shown first` : ''}.` +
      (EN && notes.length > en ? ' The rest are machine-translated from Dutch, Spanish and French, with the original beneath.' : '')
    : 'None of these logs wrote down anything besides wind and weather.';
  const show = state.all ? notes : notes.slice(0, FIRST_WORDS);
  $('words').innerHTML = show.map((r) => `<li>${shipHTML(r, { go: String(rows.indexOf(r)) })}</li>`).join('');
  $('more').hidden = state.all || notes.length <= FIRST_WORDS;
  $('more').textContent = `Show all ${fmt(notes.length)}`;
}

function setURL() {
  const q = new URLSearchParams();
  q.set('d', state.key);
  if (state.year) q.set('y', state.year);
  history.replaceState(null, '', `?${q}`);
}

async function load() {
  $('big').innerHTML = '<span class="msg">Loading the logs…</span>';
  fillDateControls();
  const key = state.key;
  try {
    const res = await fetch(`data/${key}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const day = await res.json();
    if (key !== state.key) return; // a newer date was asked for while this one loaded
    DAY = day;
  } catch (e) {
    $('big').innerHTML = `<span class="msg">Could not load the logs for ${esc(L.dateLabel(key))} (${esc(e.message)}).</span>`;
    return;
  }
  state.all = false;
  fillYears();
  setURL();
  draw();
}

function go(key) { state.key = key; state.pick = null; load(); }

$('prev').addEventListener('click', () => go(L.shiftKey(state.key, -1)));
$('next').addEventListener('click', () => go(L.shiftKey(state.key, 1)));
$('today').addEventListener('click', () => { state.year = null; go(L.dateKey('', new Date())); });
$('mo').addEventListener('change', () => {
  const mo = +$('mo').value, dy = Math.min(+$('dy').value, DAYS_IN[mo - 1]);
  go(`${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`);
});
$('dy').addEventListener('change', () => go(`${String($('mo').value).padStart(2, '0')}-${String($('dy').value).padStart(2, '0')}`));
$('yr').addEventListener('change', () => { state.year = $('yr').value ? +$('yr').value : null; state.all = false; setURL(); draw(); });
$('more').addEventListener('click', () => { state.all = true; draw(); });
$('words').addEventListener('click', (ev) => {
  const b = ev.target.closest('button.go');
  if (!b) return;
  pick(L.inYear(DAY.rows, state.year)[+b.dataset.i]);
  $('pick').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

(async () => {
  const [v, w, en] = await Promise.all([
    fetch('data/voyages.json').then((r) => r.json()),
    fetch('data/world.json').then((r) => r.json()).catch(() => null),
    // Without translations the page still works, showing every log in its own language.
    fetch('data/en.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  VOY = v.voyages;
  WORLD = w;
  EN = en;
  await load();
})().catch((e) => { $('big').innerHTML = `<span class="msg">Could not load the voyages (${esc(e.message)}).</span>`; });
