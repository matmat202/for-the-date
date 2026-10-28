// For the Date — the logic, with no DOM, so node can test it (clim-logic.test.mjs).
//
// The question: is this day's high (or low) here warm or cold *for the date*? The answer
// compares it with the same stretch of the calendar in each of 30 past years: the 15 days
// centred on this date, 1991-2020, which is the window climatologists call a "normal".

export const FROM = 1991, TO = 2020, HALF = 7;

const DAY = 86400e3;
export function addDays([y, m, d], n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const same = (a, b) => cmp(a, b) === 0;
export const iso = (k) => k.map((x, i) => String(x).padStart(i ? 2 : 4, '0')).join('-');
export const parseIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; };
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const ymdFmt = new Map();
// The calendar date an instant falls on in IANA zone `tz`, as [y, m, d].
export function ymdIn(ms, tz) {
  if (!ymdFmt.has(tz)) ymdFmt.set(tz, new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }));
  const [y, m, d] = ymdFmt.get(tz).format(new Date(ms)).split('-').map(Number);
  return [y, m, d];
}

// What the page asks the archive for: the whole of FROM..TO plus HALF days either side, so
// a date in early January still gets 15 days in 1991 and late December 15 in 2020.
export function climRange() {
  return { start: iso(addDays([FROM, 1, 1], -HALF)), end: iso(addDays([TO, 12, 31], HALF)) };
}

// Every value from the same days of the calendar in each year FROM..TO: for year Y, the
// 15 days centred on (Y, m, d). 29 February becomes the 28th in a year without one.
// `daily` is Open-Meteo's {time: [...], <key>: [...]}; nulls are skipped, not zeroed.
export function sameDates(daily, key, [m, d], { from = FROM, to = TO, half = HALF } = {}) {
  const at = new Map(daily.time.map((t, i) => [t, daily[key][i]]));
  const out = [];
  for (let y = from; y <= to; y++) {
    const centre = m === 2 && d === 29 && !isLeap(y) ? [y, 2, 28] : [y, m, d];
    for (let k = -half; k <= half; k++) {
      const v = at.get(iso(addDays(centre, k)));
      if (v != null && Number.isFinite(v)) out.push({ year: y, off: k, v });
    }
  }
  return out;
}

// The calendar date a sample from sameDates fell on.
export function sampleDate(s, [m, d]) {
  return addDays(m === 2 && d === 29 && !isLeap(s.year) ? [s.year, 2, 28] : [s.year, m, d], s.off);
}

// The share of past days that were colder than x, as a percentage; a tie counts half,
// so a value equal to every sample sits at 50, not 0 or 100.
export function percentile(samples, x) {
  let below = 0, tie = 0;
  for (const s of samples) { if (s.v < x) below++; else if (s.v === x) tie++; }
  return samples.length ? (100 * (below + tie / 2)) / samples.length : null;
}

export function summary(samples) {
  const vs = samples.map((s) => s.v).sort((a, b) => a - b);
  const n = vs.length;
  if (!n) return null;
  const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i); return vs[lo] + (vs[Math.min(n - 1, lo + 1)] - vs[lo]) * (i - lo); };
  const warm = samples.reduce((a, s) => (s.v > a.v ? s : a)), cold = samples.reduce((a, s) => (s.v < a.v ? s : a));
  return { n, min: vs[0], max: vs[n - 1], median: q(0.5), p10: q(0.1), p90: q(0.9), mean: vs.reduce((a, b) => a + b, 0) / n, warm, cold };
}

// Five bands and two records. The words are about the day, so they read for a low too:
// a "warm" low is a warm night.
export function verdict(pct, x, sum) {
  if (pct == null || !sum) return { band: 'none', words: 'no record to compare with' };
  if (x > sum.max) return { band: 'record-warm', words: `warmer than any of the ${sum.n} past days` };
  if (x < sum.min) return { band: 'record-cold', words: `colder than any of the ${sum.n} past days` };
  if (pct >= 90) return { band: 'much-warmer', words: 'much warmer than usual' };
  if (pct >= 70) return { band: 'warmer', words: 'warmer than usual' };
  if (pct > 30) return { band: 'usual', words: 'about usual' };
  if (pct > 10) return { band: 'cooler', words: 'cooler than usual' };
  return { band: 'much-cooler', words: 'much cooler than usual' };
}

// ---- the last 30 days -------------------------------------------------------------------
// Each of the last MONTH days on record against its own date's 450 days. The record is the
// archive, the same model as the 30 years, so there is no gap to subtract. It runs a few
// days behind, so the strip ends at the newest day it has; a null inside is kept as a blank
// day rather than skipped, so the cells stay one per calendar day.
export const MONTH = 30;
export function month(clim, recent, key, n = MONTH) {
  let end = recent.time.length - 1;
  while (end >= 0 && !Number.isFinite(recent[key][end])) end--;
  const days = [];
  for (let i = Math.max(0, end - n + 1); i <= end; i++) {
    const date = parseIso(recent.time[i]), x = recent[key][i];
    if (!Number.isFinite(x)) { days.push({ date, x: null, pct: null, band: 'none' }); continue; }
    const samples = sameDates(clim, key, [date[1], date[2]]);
    const pct = percentile(samples, x);
    days.push({ date, x, pct, band: verdict(pct, x, summary(samples)).band });
  }
  const had = days.filter((d) => d.pct != null);
  return {
    days, n: had.length,
    above: had.filter((d) => d.pct > 50).length,
    warm: had.filter((d) => d.pct >= 70).length,
    cool: had.filter((d) => d.pct <= 30).length,
  };
}

// ---- rain ------------------------------------------------------------------------------
// Most days have no rain, so a percentile of the amount says nothing. The question splits
// in two: how often is a day around this date wet at all, and when it is, how wet. "Wet"
// is 2.5 mm (a tenth of an inch) or more, because below that the archive is not a fair
// record: against NOAA's 1991-2020 station normals for 30 US cities (ftd-rain, 2026-10-28)
// it counted days of 0.01 inch or more 6.3 points too often at the median, and 36 of 120
// cells were 10+ points out; at 0.10 inch the median gap was 3.0 points and none was 20+.
export const WET = 2.5;
// An outcome is unusual for the date when fewer than this share of past days had it.
export const RARE = 20;
export function rain(samples, x) {
  const n = samples.length;
  if (!n) return { band: 'none', words: 'no record to compare with' };
  const wet = samples.filter((s) => s.v >= WET);
  const pWet = (100 * wet.length) / n;
  const out = { n, wet: wet.length, pWet, wetSum: wet.length ? summary(wet) : null };
  if (x == null) return { ...out, band: 'none', words: 'no rain forecast for this day' };
  if (x >= WET) {
    out.rank = percentile(wet, x); // null when no past day was wet
    if (pWet < RARE) return { ...out, band: 'wet-rare', words: 'a wet day, which is unusual for the date' };
    return { ...out, band: 'wet', words: 'a wet day, as is usual for the date' };
  }
  if (100 - pWet < RARE) return { ...out, band: 'dry-rare', words: 'a dry day, which is unusual for the date' };
  return { ...out, band: 'dry', words: 'a dry day, as is usual for the date' };
}
// An amount in the reader's unit: millimetres, or inches where the page shows °F.
export function amount(mm, unit) {
  if (unit === 'F') return `${(mm / 25.4).toFixed(2)} in`;
  return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
}

// The forecast model and the archive are different models, and on 2026-10-26 they
// disagreed by up to 1.6 °C on the same past days (Reykjavík's lows). So the page measures
// that gap for this town over the days both cover, and takes it off the forecast before
// comparing. Fewer than 10 shared days and it says so instead of guessing.
export const MIN_SHARED = 10;
export function offset(forecast, archive, key) {
  const a = new Map(archive.time.map((t, i) => [t, archive[key][i]]));
  let sum = 0, n = 0;
  forecast.time.forEach((t, i) => {
    const f = forecast[key][i], r = a.get(t);
    if (f != null && r != null && Number.isFinite(f) && Number.isFinite(r)) { sum += f - r; n++; }
  });
  return n >= MIN_SHARED ? { by: sum / n, n } : { by: 0, n, short: true };
}

// The mean of each year's window, and the least-squares slope through them in degrees per
// decade. Years with no values are left out of both.
export function trend(samples) {
  const by = new Map();
  for (const s of samples) { const e = by.get(s.year) || [0, 0]; e[0] += s.v; e[1]++; by.set(s.year, e); }
  const pts = [...by].map(([y, [t, n]]) => ({ year: y, mean: t / n })).sort((a, b) => a.year - b.year);
  if (pts.length < 3) return { pts, perDecade: null };
  const mx = pts.reduce((a, p) => a + p.year, 0) / pts.length, my = pts.reduce((a, p) => a + p.mean, 0) / pts.length;
  let sxy = 0, sxx = 0;
  for (const p of pts) { sxy += (p.year - mx) * (p.mean - my); sxx += (p.year - mx) ** 2; }
  return { pts, perDecade: (10 * sxy) / sxx };
}

export const toF = (c) => (c * 9) / 5 + 32;
// A temperature in the reader's unit, to whole degrees; a difference scales but does not shift.
export function deg(c, unit) { return `${Math.round(unit === 'F' ? toF(c) : c)}°${unit}`; }
export function degDiff(c, unit, digits = 1) {
  const v = unit === 'F' ? (c * 9) / 5 : c;
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r).toFixed(digits)}°${unit}`;
}
// Fahrenheit where the reader's locale is in a country that uses it.
export function unitFor(locale) {
  try { const r = new Intl.Locale(locale).maximize().region; return ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'].includes(r) ? 'F' : 'C'; }
  catch { return 'C'; }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dateWords([, m, d]) { return `${d} ${MONTHS[m - 1]}`; }
export function weekday([y, m, d]) { return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; }

// ---- the towns (the same list and rules as Daylight) ----------------------------------

export const P = { NAME: 0, A1: 1, CC: 2, LAT: 3, LON: 4, POP: 5, TZ: 6 };

const LETTERS = { '\u00f8': 'o', '\u00e6': 'ae', '\u0153': 'oe', '\u00df': 'ss', '\u0142': 'l', '\u0111': 'd', '\u00f0': 'd', '\u00fe': 'th', '\u0131': 'i', '\u0127': 'h' };
export function fold(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[\u00f8\u00e6\u0153\u00df\u0142\u0111\u00f0\u00fe\u0131\u0127]/g, (c) => LETTERS[c]).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function placeLabel(p) {
  const parts = [p[P.NAME]];
  if (p[P.A1] && p[P.A1] !== p[P.NAME]) parts.push(p[P.A1]);
  parts.push(p[P.CC]);
  return parts.join(', ');
}

// Same rules as Shaken's box: the part before the first comma starts the name; each later
// part starts the region or the country. Whole-name matches first, then the list's order.
export function matchPlaces(places, q, limit = 8) {
  const [head, ...rest] = String(q).split(',').map(fold);
  if (!head) return [];
  const exact = [], prefix = [];
  for (const p of places) {
    const n = fold(p[P.NAME]);
    if (!n.startsWith(head)) continue;
    if (rest.some((r) => r && !(fold(p[P.A1]).startsWith(r) || fold(p[P.CC]).startsWith(r)))) continue;
    (n === head ? exact : prefix).push(p);
    if (exact.length >= limit) break;
  }
  return exact.concat(prefix).slice(0, limit);
}

export function placeByLabel(places, label) {
  const f = fold(label);
  return places.find((p) => fold(placeLabel(p)) === f) || null;
}

// The biggest town in a time zone: where the page starts when nothing else says.
export function biggestIn(places, zones, tz) {
  const i = zones.indexOf(tz);
  return i < 0 ? null : places.find((p) => p[P.TZ] === i) || null;
}

export const toPlace = (p, zones) => ({ label: placeLabel(p), lat: p[P.LAT], lon: p[P.LON], tz: zones[p[P.TZ]] });

// ?at=Reykjavík, Capital Region, Iceland&d=2026-10-28&lo=1&u=F
export function encodeState({ at, date, today, low, unit, defUnit }) {
  const q = new URLSearchParams();
  if (at) q.set('at', at);
  if (date && today && !same(date, today)) q.set('d', iso(date));
  if (low) q.set('lo', '1');
  if (unit && unit !== defUnit) q.set('u', unit);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function decodeState(search) {
  const q = new URLSearchParams(search || '');
  const clip = (v) => (v || '').slice(0, 120).trim() || null;
  let date = parseIso(q.get('d'));
  if (date && !same(addDays(date, 0), date)) date = null;
  const u = q.get('u');
  return { at: clip(q.get('at')), date, low: q.get('lo') === '1', unit: u === 'F' || u === 'C' ? u : null };
}
