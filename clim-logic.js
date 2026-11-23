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
export function sameDates(daily, key, [m, d], { from = FROM, to = TO, half = HALF, at = byDate(daily, key) } = {}) {
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

// date -> value, for a caller asking sameDates many times over one record.
export const byDate = (daily, key) => new Map(daily.time.map((t, i) => [t, daily[key][i]]));

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

// ---- 2021-2025 ---------------------------------------------------------------------------
// Every day of the RECENT years, each against its own date's 450 days by the verdict's rule:
// warmer than usual at the 70th percentile or above, cooler at the 30th or below, so in
// 1991-2020 itself each holds about 30% of days by design (29.8% in the story's 30 cities).
// The chart's trend line is one fortnight's straight-line fit over 1991-2020; this is every
// day since. Measured 2026-11-16 (research/recent_measure.mjs): over 30 cities x 12 dates x
// highs and lows the two point opposite ways on 122 of 720 cards (Santiago 22 of 24). A town
// with less than RECENT_MIN of the days on record shows nothing rather than a partial count.
export const RECENT = [2021, 2025], RECENT_MIN = 0.9;
export const recentRange = () => ({ start: `${RECENT[0]}-01-01`, end: `${RECENT[1]}-12-31` });
export function recentYears(clim, past, key) {
  const memo = new Map(), at = byDate(clim, key);
  let n = 0, warm = 0, cool = 0, days = 0;
  for (let i = 0; i < past.time.length; i++) {
    const t = parseIso(past.time[i]), x = past[key][i];
    if (!t || t[0] < RECENT[0] || t[0] > RECENT[1]) continue;
    days++;
    if (!Number.isFinite(x)) continue;
    const md = `${t[1]}-${t[2]}`;
    if (!memo.has(md)) memo.set(md, sameDates(clim, key, [t[1], t[2]], { at }));
    const pct = percentile(memo.get(md), x);
    if (pct == null) continue;
    n++; warm += pct >= 70; cool += pct <= 30;
  }
  const full = (Date.UTC(RECENT[1] + 1, 0, 1) - Date.UTC(RECENT[0], 0, 1)) / DAY;
  return { n, warm, cool, days, full, enough: n >= RECENT_MIN * full };
}
// When the chart's trend (perDecade, at least TREND_MIN either way) and the five years' shares
// as shown lean opposite ways, one clause says why both can be true; 73 of the 720 cards above.
export const TREND_MIN = 0.1;
export function recentWords(r, low, perDecade = null) {
  if (!r || !r.enough) return null;
  const pc = (k) => Math.round((100 * k) / r.n);
  const w = pc(r.warm), c = pc(r.cool);
  const odd = Math.abs(perDecade) >= TREND_MIN && w !== c && (w > c) !== (perDecade > 0);
  return `In ${RECENT[0]}–${RECENT[1]}, ${w}% of ${low ? 'nights' : 'days'} here were warmer than usual for their date and ${c}% cooler (in 1991–2020 itself, about 30% and 30%, by design).${odd
    ? ` That leans the other way from the trend above, and both can hold: the trend is one fortnight's 30 years, these are every date of the five since.` : ''}`;
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
// ---- the last 30 days' rain (ftd-rain-month) --------------------------------------------
// One day's rain is mostly zero, so the month card ranks the TOTAL: the last n days on
// record, against the same calendar days in each year FROM..TO. A day missing from the
// recent record is left out of every past year too, so the sums stay like for like, and a
// past year with a gap on one of those days is dropped rather than summed short. Measured
// before building (state/scratch/ftd-rain-month/measure.py, 23 towns): 22 had a total that
// varies year to year; Karachi's late September was under 2.5 mm in 23 of 30 years, which
// is why "dry, as usual" is its own verdict and not "drier than usual".
export function monthRain(clim, recent, key, n = MONTH) {
  let end = recent.time.length - 1;
  while (end >= 0 && !Number.isFinite(recent[key][end])) end--;
  if (end < 0) return { band: 'none' };
  const lo = Math.max(0, end - n + 1), first = parseIso(recent.time[lo]), offs = [];
  let x = 0;
  for (let i = lo; i <= end; i++) if (Number.isFinite(recent[key][i])) { offs.push(i - lo); x += recent[key][i]; }
  const at = new Map(clim.time.map((t, i) => [t, clim[key][i]]));
  const past = [];
  for (let y = FROM; y <= TO; y++) {
    const start = first[1] === 2 && first[2] === 29 && !isLeap(y) ? [y, 2, 28] : [y, first[1], first[2]];
    let s = 0;
    for (const k of offs) { const v = at.get(iso(addDays(start, k))); if (!Number.isFinite(v)) { s = null; break; } s += v; }
    if (s != null) past.push({ year: y, v: s });
  }
  const out = { x, first, last: parseIso(recent.time[end]), days: end - lo + 1, had: offs.length, n: past.length };
  if (!past.length) return { ...out, band: 'none' };
  const sum = summary(past);
  out.less = past.filter((p) => p.v < x).length; // years that brought less than this
  out.more = past.filter((p) => p.v > x).length;
  out.median = sum.median; out.pct = percentile(past, x);
  if (x < WET && sum.median < WET) return { ...out, band: 'dry-usual', words: 'dry, as these days usually are here' };
  if (x > sum.max) return { ...out, band: 'record-wet', words: `the wettest of the ${past.length} years` };
  if (x < sum.min) return { ...out, band: 'record-dry', words: `the driest of the ${past.length} years` };
  if (out.pct >= 80) return { ...out, band: 'wet', words: 'wetter than usual' };
  if (out.pct <= 20) return { ...out, band: 'dry', words: 'drier than usual' };
  return { ...out, band: 'usual', words: 'about usual' };
}

// An amount in the reader's unit: millimetres, or inches where the page shows °F.
export function amount(mm, unit) {
  if (unit === 'F') return `${(mm / 25.4).toFixed(2)} in`;
  return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
}

// ---- snow ------------------------------------------------------------------------------
// The same split as rain, on snowfall. "Snowy" is an inch (2.54 cm) or more, again measured:
// against NOAA's 1991-2020 snowfall normals for 11 snowy US stations x 4 winter dates
// (ftd-snow, 2026-10-30), the archive's share of days at 0.1 inch or more ran +4.2 points at
// the median with 4 of 44 cells 20+ points out (Anchorage +23); at 1 inch the median gap was
// -0.9 points and none was 10+. A town where snowy days are rarer than SHOW in 100 around the
// date gets no snow line unless snow is forecast: Singapore does not need telling.
export const SNOWY = 2.54;
export const SHOW = 5;
export function snow(samples, x) {
  const n = samples.length;
  if (!n) return { band: 'none', words: 'no record to compare with' };
  const snowy = samples.filter((s) => s.v >= SNOWY);
  const pSnowy = (100 * snowy.length) / n;
  const out = { n, snowy: snowy.length, pSnowy };
  if (x == null) return { ...out, band: 'none', words: 'no snow forecast for this day' };
  if (x >= SNOWY) {
    out.rank = percentile(snowy, x); // null when no past day was snowy
    if (pSnowy < RARE) return { ...out, band: 'snowy-rare', words: 'a snowy day, which is unusual for the date' };
    return { ...out, band: 'snowy', words: 'a snowy day, as is usual for the date' };
  }
  if (pSnowy < SHOW) return { ...out, band: 'none', words: 'snow is rare here for the date' };
  if (100 - pSnowy < RARE) return { ...out, band: 'clear-rare', words: 'no snow, which is unusual for the date' };
  return { ...out, band: 'clear', words: 'no snow, as is usual for the date' };
}
// The snow record is a second request, because a fourth variable on the 30-year one made a
// second town inside a minute fail: Open-Meteo answered 429 to the 2nd 4-variable load, and
// 200 to three 3-variable ones (ftd-snow, 2026-10-30). So the page asks only where snow is
// possible, from the record it already has. A snowy day was never one with under 2 mm of
// precipitation (at most 1.04 cm of snow fell per mm) or a low above 4.3 °C: 0 of 3,805
// snowy days at 11 US stations break DAMP and COLD. So this share bounds the snowy share
// from above; under SHOW, a day with no snow forecast would get no line anyway. Palo Alto's
// highest, over every date of the year, is 4.9% (fixtures/facts.json may_max).
export const DAMP = 2, COLD = 5;
export function maySnow(clim, md) {
  const lo = new Map(sameDates(clim, 'temperature_2m_min', md).map((s) => [`${s.year}:${s.off}`, s.v]));
  const pr = sameDates(clim, 'precipitation_sum', md);
  if (!pr.length) return 0;
  return (100 * pr.filter((s) => s.v >= DAMP && lo.has(`${s.year}:${s.off}`) && lo.get(`${s.year}:${s.off}`) <= COLD).length) / pr.length;
}
// Whether the page should fetch the snow record for these dates: snow forecast on any of
// them, or snow possible (maySnow) on any of them.
export function wantSnow(fc, clim, dates, key = 'snowfall_sum') {
  const fcSnow = dates.some((date) => { const i = fc.time.indexOf(iso(date)); return i >= 0 && !!fc[key] && fc[key][i] >= SNOWY; });
  return fcSnow || dates.some((date) => maySnow(clim, [date[1], date[2]]) >= SHOW);
}
// Snow in centimetres, or inches where the page shows °F.
export function snowAmount(cm, unit) {
  if (unit === 'F') return `${(cm / 2.54).toFixed(1)} in`;
  return `${cm < 10 ? cm.toFixed(1) : Math.round(cm)} cm`;
}

// ---- wind ------------------------------------------------------------------------------
// The day's strongest wind (wind_speed_10m_max, km/h) ranked among the same 450 days.
// ERA5 reads low against anemometers (median 0.65 of ASOS's fastest 2-minute wind), but it
// ranks days the way the ground does: over 12 US stations x 2023-24, median Spearman 0.77
// against GHCN WSF2, 0.87 against the daily mean wind (ftd-wind, 2026-10-31). So the page
// says how the day ranks and never claims a speed you would measure. The forecast model
// reads high (+0.9 m/s at the median of those 12 places), so it gets the same offset as the
// temperatures; without it SFO would have had 51% of its last 60 days in the top fifth.
export function wind(samples, x) {
  const sum = summary(samples);
  if (!sum) return { band: 'none', words: 'no record to compare with' };
  if (x == null) return { band: 'none', words: 'no wind forecast for this day', sum };
  const pct = percentile(samples, x), out = { pct, sum };
  if (x > sum.max) return { ...out, band: 'record-windy', words: `windier than any of the ${sum.n} past days` };
  if (pct >= 90) return { ...out, band: 'much-windier', words: 'much windier than usual' };
  if (pct >= 70) return { ...out, band: 'windier', words: 'windier than usual' };
  if (pct > 30) return { ...out, band: 'usual', words: 'about as windy as usual' };
  return { ...out, band: 'calmer', words: 'calmer than usual' };
}
// A speed in the reader's unit: km/h, or mph where the page shows °F.
export function speed(kmh, unit) {
  return unit === 'F' ? `${Math.round(kmh / 1.609344)} mph` : `${Math.round(kmh)} km/h`;
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

// How far ahead the verdict can be trusted, measured rather than guessed (projects/ftd-trust):
// for 8 towns over 1 Aug - 30 Oct 2026, each forecast run's high and low N days before the
// day (Open-Meteo Previous Runs), banded as above after the gap, against the band of what
// happened (ERA5). [n, held] per lead 0..6; `call` is a warmer/cooler/record verdict, held
// when the day landed on the same side; `usual` held when it landed "about usual".
// Same-side is the test because a wrong side is rare (6% at most) and a wrong shade is not.
export const HOLD = {
  hi: { call: [[509, 447], [520, 442], [519, 413], [516, 418], [521, 396], [521, 386], [522, 363]],
    usual: [[219, 161], [208, 150], [209, 127], [212, 140], [207, 115], [207, 108], [206, 93]] },
  lo: { call: [[480, 411], [503, 391], [501, 337], [499, 339], [500, 334], [505, 330], [497, 312]],
    usual: [[248, 187], [225, 155], [227, 115], [229, 115], [228, 116], [223, 117], [231, 110]] },
};
const SIDE = { 'record-warm': 1, 'much-warmer': 1, warmer: 1, usual: 0, cooler: -1, 'much-cooler': -1, 'record-cold': -1 };
// The sentence for a day `lead` days ahead (0 = today, which needs none), or null.
export function trust(lead, band, key = 'hi') {
  const t = HOLD[key], s = SIDE[band];
  if (!t || s === undefined || !(lead >= 1) || lead >= t.call.length) return null;
  const [n, held] = (s ? t.call : t.usual)[lead];
  const tenths = Math.round((10 * held) / n);
  const what = s ? (s > 0 ? 'a warm call' : 'a cold call') : 'an “about usual”';
  return { tenths, words: `This is a forecast ${lead} day${lead === 1 ? '' : 's'} out. In 8 towns this autumn, ${what} made that far ahead held ${tenths} times in 10${s ? '' : ' (the rest turned warm or cold)'}.` };
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

// Where the chart's "N° this day" label sits, as a text baseline in the chart's own units.
// Above its line by default; below when the yearly-average line passes within LAB_GAP of the
// label's box over the label's width (Monterrey at 390 px: the label sat on the line), or when
// above would leave the plot. Whichever side is clearer wins when neither is clear.
// lineY: the line's y; pts: the average line's vertices [{x, y}], in x order; x0..x1: the
// label's span; top..bottom: the plot. A box runs from 9 above its baseline to 2 below.
export const LAB_GAP = 4;
export function labelY(lineY, pts, x0, x1, top, bottom) {
  const a = labelClear(lineY - 5, pts, x0, x1, top, bottom);
  return a >= LAB_GAP || a >= labelClear(lineY + 12, pts, x0, x1, top, bottom) ? lineY - 5 : lineY + 12;
}
// How far a label with this baseline over x0..x1 stays from the average line (0 = touching or
// crossing it, -Infinity = outside the plot).
export function labelClear(base, pts, x0, x1, top, bottom) {
  const bt = base - 9, bb = base + 2;
  if (bt < top || bb > bottom) return -Infinity;
  const ys = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    if (p.x >= x0 && p.x <= x1) ys.push(p.y);
    if (q) for (const x of [x0, x1]) if ((p.x < x && q.x > x)) ys.push(p.y + ((q.y - p.y) * (x - p.x)) / (q.x - p.x));
  }
  return ys.length ? Math.max(0, Math.min(...ys) - bb, bt - Math.max(...ys)) : Infinity;
}
// Where a label of width w goes along its line, between xLeft and xRight: {x: its right end, y:
// its baseline}. At the right end where that is clear (labelY), else slid left in steps of 8 to
// the first clear span, above or below (Reykjavík at 390 px: the average zig-zags through both
// sides of the label at the right end); where nothing is clear, the right end (the page then
// relies on the label's halo), marked crowded.
export function labelSpot(lineY, pts, w, xLeft, xRight, top, bottom) {
  for (let x = xRight; x - w >= xLeft; x -= 8)
    for (const y of [lineY - 5, lineY + 12])
      if (labelClear(y, pts, x - w, x, top, bottom) >= LAB_GAP) return { x, y, crowded: false };
  return { x: xRight, y: labelY(lineY, pts, xRight - w, xRight, top, bottom), crowded: true };
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

// `near` is there only when a bigger town already has this label (two Hayes in England):
// Daylight's build.py names the nearest town, so every label, and every ?at= link, is one town.
export const P = { NAME: 0, A1: 1, CC: 2, LAT: 3, LON: 4, POP: 5, TZ: 6, NEAR: 7 };

const LETTERS = { '\u00f8': 'o', '\u00e6': 'ae', '\u0153': 'oe', '\u00df': 'ss', '\u0142': 'l', '\u0111': 'd', '\u00f0': 'd', '\u00fe': 'th', '\u0131': 'i', '\u0127': 'h' };
export function fold(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[\u00f8\u00e6\u0153\u00df\u0142\u0111\u00f0\u00fe\u0131\u0127]/g, (c) => LETTERS[c]).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function placeLabel(p) {
  const parts = [p[P.NEAR] ? `${p[P.NAME]} (near ${p[P.NEAR]})` : p[P.NAME]];
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

// ---- sharing the day ------------------------------------------------------------------
// The link a share carries names the day and the unit outright, unlike the page's own URL,
// which drops both when they are the default: the reader's default may not be the sender's,
// and the text quotes the sender's number. A day already past when the link is opened falls
// back to that reader's today, as any stale ?d= does.
export function shareQuery({ at, date, low, unit }) {
  const q = new URLSearchParams();
  q.set('at', at); q.set('d', iso(date)); if (low) q.set('lo', '1'); q.set('u', unit);
  return `?${q}`;
}

// One sentence about the shown day, in the card's own words, then the ranking behind it
// (left off for a record, where "than any of the 450" already says it).
export function shareText({ at, date, isToday, low, unit, x, pct, v, n }) {
  const what = low ? 'low' : 'high', when = isToday ? `today, ${dateWords(date)}` : `${weekday(date)} ${dateWords(date)}`;
  const head = `${at}, ${when}: a ${what} of ${deg(x, unit)}, ${v.words} for the date.`;
  if (v.band === 'record-warm' || v.band === 'record-cold') return head;
  return `${head} Warmer than ${Math.round(pct)}% of the ${n} ${what}s from ${dateWords(addDays(date, -HALF))} to ${dateWords(addDays(date, HALF))} in ${FROM}–${TO}.`;
}
