// For the Date — the page. Logic lives in clim-logic.js; this file fetches, reads and draws.
import * as L from './clim-logic.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const PAST = 60, AHEAD = 7;
const KEYS = { hi: 'temperature_2m_max', lo: 'temperature_2m_min' };
const RAIN = 'precipitation_sum', CHANCE = 'precipitation_probability_max';
let PLACES = [], ZONES = [], DEF_UNIT = 'C';
const state = { at: null, date: null, low: false, unit: 'C', data: null };
const cache = new Map();

const key = () => KEYS[state.low ? 'lo' : 'hi'];

async function getJSON(base, params) {
  const r = await fetch(`${base}?${new URLSearchParams(params)}`);
  if (!r.ok) throw new Error(`${r.status} from ${new URL(base).host}`);
  const j = await r.json();
  if (j.error || !j.daily) throw new Error(j.reason || 'no daily data');
  return j.daily;
}

// Three requests, all at once: the 30 years, the forecast with its own last 60 days, and
// the archive's version of those 60 days. The last two give the gap between the models.
function load(place) {
  const k = place.label;
  if (cache.has(k)) return cache.get(k);
  const base = { latitude: place.lat, longitude: place.lon, daily: `${KEYS.hi},${KEYS.lo},${RAIN}`, timezone: place.tz };
  const today = L.ymdIn(Date.now(), place.tz);
  const utc = L.ymdIn(Date.now(), 'UTC');
  const end = L.addDays(today, -1);
  const p = Promise.all([
    getJSON(ARCHIVE, { ...base, start_date: L.climRange().start, end_date: L.climRange().end }),
    getJSON(FORECAST, { ...base, daily: `${base.daily},${CHANCE}`, past_days: PAST, forecast_days: AHEAD }),
    getJSON(ARCHIVE, { ...base, start_date: L.iso(L.addDays(today, -PAST)), end_date: L.iso(L.iso(end) > L.iso(utc) ? utc : end) }),
  ]).then(([clim, fc, recent]) => ({ clim, fc, recent, off: { hi: L.offset(fc, recent, KEYS.hi), lo: L.offset(fc, recent, KEYS.lo) } }));
  p.catch(() => cache.delete(k));
  cache.set(k, p);
  return p;
}

// The forecast's own calendar, worked out by Open-Meteo in the town's zone: its last
// AHEAD days are today onward.
const weekOf = (fc) => fc.time.slice(-AHEAD).map(L.parseIso);
const today = () => (state.data ? weekOf(state.data.fc)[0] : null);
const theDate = () => state.date || today();

function dayFacts(d, date) {
  const k = key(), off = d.off[state.low ? 'lo' : 'hi'];
  const i = d.fc.time.indexOf(L.iso(date));
  const raw = i < 0 ? null : d.fc[k][i];
  const x = raw == null ? null : raw - off.by;
  const samples = L.sameDates(d.clim, k, [date[1], date[2]]);
  const sum = L.summary(samples);
  const pct = x == null ? null : L.percentile(samples, x);
  return { raw, x, samples, sum, pct, off, v: x == null ? { band: 'none', words: 'no forecast for this day' } : L.verdict(pct, x, sum) };
}

function sync() {
  history.replaceState(null, '', location.pathname + L.encodeState({
    at: state.at.label, date: state.date, today: today(), low: state.low, unit: state.unit, defUnit: DEF_UNIT,
  }));
}

function drawWeek() {
  const ul = $('week'); ul.replaceChildren();
  const d = state.data, sel = L.iso(theDate());
  weekOf(d.fc).forEach((date, n) => {
    const f = dayFacts(d, date);
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.dataset.d = L.iso(date); b.dataset.band = f.v.band;
    b.setAttribute('aria-pressed', String(L.iso(date) === sel));
    const day = document.createElement('small'); day.textContent = n === 0 ? 'Today' : `${L.weekday(date)} ${date[2]}`;
    const t = document.createElement('b'); t.textContent = f.x == null ? '—' : L.deg(f.x, state.unit);
    const w = document.createElement('small'); w.textContent = f.pct == null ? '' : `${Math.round(f.pct)}%`;
    b.setAttribute('aria-label', `${n === 0 ? 'Today' : L.weekday(date)} ${L.dateWords(date)}: ${t.textContent}, ${f.v.words}`);
    b.append(day, t, w);
    b.addEventListener('click', () => setDate(date));
    li.append(b); ul.append(li);
  });
}

function drawCard() {
  const d = state.data, date = theDate(), f = dayFacts(d, date), u = state.unit;
  const isToday = L.iso(date) === L.iso(today());
  const what = state.low ? 'low' : 'high';
  $('head').textContent = `${state.at.label} · ${isToday ? 'today' : L.weekday(date)}, ${L.dateWords(date)}`;
  const big = $('big'); big.replaceChildren();
  if (f.x == null || !f.sum) { big.textContent = f.v.words; $('facts').hidden = true; $('more').textContent = ''; return f; }
  const b = document.createElement('b'); b.textContent = L.deg(f.x, u);
  const w = document.createElement('span'); w.className = 'w'; w.dataset.band = f.v.band; w.textContent = f.v.words;
  big.append(`${isToday ? 'Today' : `${L.weekday(date)}`}'s ${what} of `, b, ' is ', w, '.');
  const colder = Math.round(f.pct);
  $('facts').hidden = false;
  $('fMed').textContent = L.deg(f.sum.median, u);
  $('fRange').textContent = `${L.deg(f.sum.p10, u)} – ${L.deg(f.sum.p90, u)}`;
  $('fWarm').textContent = L.deg(f.sum.max, u);
  $('fWarmY').textContent = `warmest, ${L.dateWords(L.sampleDate(f.sum.warm, [date[1], date[2]]))} ${f.sum.warm.year}`;
  $('fCold').textContent = L.deg(f.sum.min, u);
  $('fColdY').textContent = `coldest, ${L.dateWords(L.sampleDate(f.sum.cold, [date[1], date[2]]))} ${f.sum.cold.year}`;
  const gap = f.off.short
    ? `There were too few days on which both models had a value (${f.off.n}) to measure the gap between them here, so the forecast is used as it stands.`
    : `Over the last ${f.off.n} days the forecast model ran ${L.degDiff(f.off.by, u)} against the record here, so the forecast's ${L.deg(f.raw, u)} is read as ${L.deg(f.x, u)}.`;
  $('more').textContent = `Warmer than ${colder}% of the ${f.sum.n} ${what}s from ${L.dateWords(L.addDays(date, -7))} to ${L.dateWords(L.addDays(date, 7))} in 1991–2020. ${gap}`;
  return f;
}

// Rain is compared as it stands: on the same past days the two models agreed on wet or dry
// 92% of the time (ftd-rain, 20 towns), and a mean gap is no help for amounts that are mostly 0.
function drawRain(date) {
  const d = state.data, u = state.unit, p = $('rain');
  const i = d.fc.time.indexOf(L.iso(date));
  const x = i < 0 || !d.fc[RAIN] ? null : d.fc[RAIN][i];
  const chance = i < 0 || !d.fc[CHANCE] ? null : d.fc[CHANCE][i];
  const r = L.rain(L.sameDates(d.clim, RAIN, [date[1], date[2]]), x);
  p.dataset.band = r.band;
  if (r.band === 'none') { p.hidden = true; return; }
  p.hidden = false;
  const b = document.createElement('b'); b.textContent = L.amount(x, u);
  const odds = chance == null ? '' : ` (${Math.round(chance)}% chance of rain)`;
  const past = `Around ${L.dateWords(date)}, ${r.wet} of the ${r.n} past days (${Math.round(r.pWet)}%) were wet, meaning ${L.amount(L.WET, u)} or more`;
  const rank = r.rank == null ? '' : `; ${L.amount(x, u)} is more than ${Math.round(r.rank)}% of those wet days`;
  p.replaceChildren('Rain forecast: ', b, `${odds}, ${r.words}. ${past}${rank}.`);
}

function drawChart(f) {
  if (!f.sum || f.x == null) { $('chartCard').hidden = true; return; }
  $('chartCard').hidden = false;
  const u = state.unit, cv = (c) => (u === 'F' ? L.toF(c) : c);
  const narrow = $('chart').clientWidth < 560; // a phone: fewer, bigger units, so the labels stay legible
  const W = narrow ? 400 : 730, H = narrow ? 300 : 260, top = 10, bot = 22, left = 30, right = 6;
  const lo = Math.floor(Math.min(cv(f.sum.min), cv(f.x)) - 1), hi = Math.ceil(Math.max(cv(f.sum.max), cv(f.x)) + 1);
  const X = (y) => left + ((y - L.FROM + 0.5) / (L.TO - L.FROM + 1)) * (W - left - right);
  const Y = (c) => top + (1 - (cv(c) - lo) / (hi - lo)) * (H - top - bot);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
  const step = hi - lo > 30 ? 10 : 5;
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    const y = top + (1 - (t - lo) / (hi - lo)) * (H - top - bot);
    el('line', { class: 'grid', x1: left, x2: W - right, y1: y, y2: y });
    el('text', { x: left - 4, y: y + 4, 'text-anchor': 'end' }).textContent = `${t}°`;
  }
  for (const y of narrow ? [1991, 2005, 2020] : [1991, 2000, 2010, 2020]) el('text', { x: X(y), y: H - 6, 'text-anchor': 'middle' }).textContent = y;
  const slot = (W - left - right) / (L.TO - L.FROM + 1);
  for (const s of f.samples) el('circle', { class: 'd', cx: (X(s.year) + (s.off / 16) * slot).toFixed(1), cy: Y(s.v).toFixed(1), r: narrow ? 1.8 : 2.4 });
  const t = L.trend(f.samples);
  el('path', { class: 'mean', d: t.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.year).toFixed(1)},${Y(p.mean).toFixed(1)}`).join('') });
  el('line', { class: 'now', x1: left, x2: W - right, y1: Y(f.x), y2: Y(f.x) });
  const lab = el('text', { class: 'lab', x: W - right - 2, y: Y(f.x) - 5, 'text-anchor': 'end' });
  lab.textContent = `${L.deg(f.x, u)} this ${L.iso(theDate()) === L.iso(today()) ? 'day' : L.weekday(theDate())}`;
  const what = state.low ? 'lows' : 'highs';
  svg.setAttribute('aria-label', `${f.sum.n} past ${what} around ${L.dateWords(theDate())} in ${state.at.label}, 1991 to 2020, with this day's ${L.deg(f.x, u)}`);
  $('chart').replaceChildren(svg);
  $('cTitle').textContent = `${state.low ? 'Lows' : 'Highs'} around ${L.dateWords(theDate())}, 1991–2020`;
  $('trend').textContent = t.perDecade == null ? ''
    : `Around this date, the yearly average of these ${what} changed by ${L.degDiff(t.perDecade, u)} a decade over the 30 years (a straight-line fit; one place's fortnight is noisy, so read it as a hint rather than a measurement).`;
}

function draw() {
  $('hi').setAttribute('aria-pressed', String(!state.low));
  $('lo').setAttribute('aria-pressed', String(state.low));
  $('unit').textContent = `°${state.unit}`;
  $('unit').setAttribute('aria-label', `Show °${state.unit === 'C' ? 'F' : 'C'}`);
  if (!state.data) return;
  drawWeek();
  drawChart(drawCard());
  drawRain(theDate());
  sync();
}

function setDate(k) {
  state.date = k && L.iso(k) !== L.iso(today()) ? k : null;
  draw();
}

async function choose(place) {
  state.at = place; $('at').value = place.label;
  const asked = place.label;
  $('head').textContent = place.label;
  $('big').replaceChildren(Object.assign(document.createElement('span'), { className: 'msg', textContent: 'Fetching 30 years of weather…' }));
  $('facts').hidden = true; $('rain').hidden = true; $('more').textContent = '';
  try {
    const data = await load(place);
    if (state.at.label !== asked) return; // a later pick won
    state.data = data;
    const week = weekOf(data.fc).map(L.iso);
    if (state.date && !week.includes(L.iso(state.date))) state.date = null;
    draw();
  } catch (e) {
    if (state.at.label !== asked) return;
    state.data = null; $('week').replaceChildren(); $('chartCard').hidden = true; $('rain').hidden = true;
    $('big').replaceChildren(Object.assign(document.createElement('span'), { className: 'msg', textContent: `Could not reach Open-Meteo (${e.message}). Try again in a moment.` }));
  }
}

// ---- the town box (as in Daylight) ----------------------------------------------------

function combo(boxId, listId, onPick) {
  const box = $(boxId), ul = $(listId);
  let opts = [], active = -1;
  const close = () => { opts = []; active = -1; ul.hidden = true; box.setAttribute('aria-expanded', 'false'); box.removeAttribute('aria-activedescendant'); };
  const drawOpts = () => {
    ul.replaceChildren();
    opts.forEach((p, i) => {
      const li = document.createElement('li');
      li.id = `${listId}${i}`; li.setAttribute('role', 'option'); li.dataset.i = i;
      li.setAttribute('aria-selected', String(i === active));
      li.textContent = L.placeLabel(p);
      ul.append(li);
    });
    if (!opts.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'No town by that name. Try a bigger place nearby.'; ul.append(li); }
    ul.hidden = false;
    box.setAttribute('aria-expanded', 'true');
    if (active >= 0) { box.setAttribute('aria-activedescendant', `${listId}${active}`); $(`${listId}${active}`).scrollIntoView({ block: 'nearest' }); }
  };
  const pick = (p) => { close(); onPick(L.toPlace(p, ZONES)); };
  box.addEventListener('input', () => {
    if (!box.value.trim()) { close(); return; }
    opts = L.matchPlaces(PLACES, box.value); active = opts.length ? 0 : -1; drawOpts();
  });
  box.addEventListener('keydown', (e) => {
    if (ul.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opts.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length; drawOpts(); e.preventDefault();
    } else if (e.key === 'Enter') { if (opts[active]) pick(opts[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); e.preventDefault(); }
  });
  ul.addEventListener('mousedown', (e) => e.preventDefault());
  ul.addEventListener('click', (e) => { const i = e.target.closest('li[data-i]')?.dataset.i; if (i != null && opts[i]) pick(opts[i]); });
  return { close, box };
}

function wire() {
  const a = combo('at', 'atList', (p) => { state.date = null; choose(p); });
  a.box.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== a.box) { a.close(); a.box.value = state.at.label; } }, 150));
  $('hi').addEventListener('click', () => { state.low = false; draw(); });
  $('lo').addEventListener('click', () => { state.low = true; draw(); });
  $('unit').addEventListener('click', () => { state.unit = state.unit === 'C' ? 'F' : 'C'; draw(); });
}

async function main() {
  DEF_UNIT = L.unitFor(navigator.language);
  let doc;
  try {
    const r = await fetch('data/places.json');
    if (!r.ok) throw new Error(r.status);
    doc = await r.json();
  } catch (e) { $('big').textContent = `Could not load the list of towns (${e.message}). Reload to try again.`; return; }
  PLACES = doc.places; ZONES = doc.zones;
  const want = L.decodeState(location.search);
  const find = (label) => { const p = label && L.placeByLabel(PLACES, label); return p ? L.toPlace(p, ZONES) : null; };
  let mine = null;
  try { mine = L.biggestIn(PLACES, ZONES, Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* no zone: London */ }
  state.date = want.date; state.low = want.low; state.unit = want.unit || DEF_UNIT;
  wire();
  draw();
  await choose(find(want.at) || (mine && L.toPlace(mine, ZONES)) || find('London, England, United Kingdom'));
}
main();
