// At Sea on This Date: the pure part. Everything here is tested in sea-logic.test.mjs
// against facts Python computed straight from the CLIWOC geopackage.
//
// A data file is {date: "MM-DD", rows: [[year, voyage, lat, lon, w, d, windWords, weather, remark]]}
// where w is wind speed in 0.1 m/s (ICOADS W, converted by CLIWOC from the logged words)
// and d is direction in degrees (361 = variable). voyages.json holds
// [ship, nationality, type, company, from, to, captain, language] per voyage index.

export const Y = 0, V = 1, LA = 2, LO = 3, W = 4, D = 5, WW = 6, WX = 7, R = 8;

// Beaufort upper bounds in m/s (WMO). Force n covers [B[n-1], B[n]).
const B = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
export const BF_NAMES = ['calm', 'light air', 'light breeze', 'gentle breeze', 'moderate breeze',
  'fresh breeze', 'strong breeze', 'near gale', 'gale', 'strong gale', 'storm', 'violent storm', 'hurricane'];

export function beaufort(w) {
  if (w == null) return null;
  const ms = w / 10;
  let n = 0;
  while (n < B.length && ms >= B[n]) n++;
  return n;
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compass(d) {
  if (d == null) return null;
  if (d > 360) return 'variable';
  return POINTS[Math.round((d % 360) / 22.5) % 16];
}

export function fmtPos(lat, lon) {
  const a = Math.abs(lat).toFixed(1), b = Math.abs(lon).toFixed(1);
  return `${a}°${lat < 0 ? 'S' : 'N'} ${b}°${lon < 0 ? 'W' : 'E'}`;
}

// Logs are transcribed in capitals. Sentence case reads; Title Case for ship names.
export function sentence(s) {
  if (!s) return s;
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function title(s) {
  if (!s) return s;
  return s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function validKey(k) {
  const m = /^(\d\d)-(\d\d)$/.exec(k || '');
  if (!m) return false;
  const mo = +m[1], dy = +m[2];
  return mo >= 1 && mo <= 12 && dy >= 1 && dy <= DAYS_IN[mo - 1];
}
// ?d=MM-DD wins if valid; otherwise today's date where the reader is.
export function dateKey(search, now) {
  const q = new URLSearchParams(search || '').get('d');
  if (validKey(q)) return q;
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function dateLabel(k) {
  const [mo, dy] = k.split('-').map(Number);
  return `${dy} ${MONTHS[mo - 1]}`;
}
export function shiftKey(k, by) {
  // Walk the 366-day calendar (29 February included), wrapping at the year's ends.
  const keys = allKeys();
  const i = keys.indexOf(k);
  return keys[(i + by + keys.length * 2) % keys.length];
}
let KEYS = null;
export function allKeys() {
  if (KEYS) return KEYS;
  KEYS = [];
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= DAYS_IN[m - 1]; d++)
    KEYS.push(`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return KEYS;
}

export function inYear(rows, year) {
  return year == null ? rows : rows.filter((r) => r[Y] === year);
}

export function years(rows) {
  return [...new Set(rows.map((r) => r[Y]))].sort((a, b) => a - b);
}

// The headline numbers for a set of rows.
export function summary(rows, voyages) {
  const nations = {};
  let storm = null, calm = 0, gales = 0;
  for (const r of rows) {
    const nat = voyages[r[V]][1] || 'unknown';
    nations[nat] = (nations[nat] || 0) + 1;
    if (r[W] != null) {
      if (storm == null || r[W] > storm[W] || (r[W] === storm[W] && r[Y] < storm[Y])) storm = r;
      const f = beaufort(r[W]);
      if (f === 0) calm++;
      if (f >= 8) gales++;
    }
  }
  const ys = years(rows);
  return {
    ships: rows.length,
    years: ys.length,
    first: ys[0] ?? null,
    last: ys[ys.length - 1] ?? null,
    nations: Object.entries(nations).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    storm,
    calm,
    gales,
  };
}

// Remarks worth reading: English first (most readers here read it), then the rest; within
// a language, oldest first. Returns rows, not strings, so the page can say who and where.
export function remarks(rows, voyages) {
  const en = (r) => (voyages[r[V]][7] === 'ENGLISH' ? 0 : 1);
  return rows.filter((r) => r[R]).sort((a, b) => en(a) - en(b) || a[Y] - b[Y] || a[V] - b[V]);
}

export function languageName(code) {
  return { ENGLISH: 'English', DUTCH: 'Dutch', SPANISH: 'Spanish', FRENCH: 'French' }[code] || title(code || '');
}

export function nationName(n) {
  return { BRITISH: 'British', DUTCH: 'Dutch', SPANISH: 'Spanish', FRENCH: 'French', SWEDISH: 'Swedish',
    AMERICAN: 'American', HAMBURG: 'Hamburg', DANISH: 'Danish' }[n] || title(n || 'unknown');
}

// One line saying what the wind did, in numbers anyone reads, then the log's own words.
export function windLine(r) {
  const f = beaufort(r[W]);
  const dir = compass(r[D]);
  if (f == null) return null;
  const from = !dir || f === 0 ? '' : dir === 'variable' ? ', variable' : ` from the ${dir}`;
  return `Force ${f}, ${BF_NAMES[f]}${from}`;
}

// A logged phrase as the page shows it. English logs are quoted as they are. Other languages
// show the machine translation (from en.json) with the original kept beside it; a remark
// joined from several parts (" · ") is translated part by part. `missing` counts parts with
// no translation, which then show in the original only.
const BARE_NUMBER = /^[\d\s.,/:;°'"-]*$/;
export function phrase(text, lang, en) {
  if (!text || BARE_NUMBER.test(text)) return null;
  if (lang === 'ENGLISH' || !en) return { text, orig: null, missing: lang === 'ENGLISH' ? 0 : 1 };
  const parts = text.split(' · ');
  let missing = 0;
  const out = parts.map((p) => {
    const t = en[p];
    if (t == null) { missing++; return p; }
    return t;
  });
  if (missing === parts.length) return { text, orig: null, missing };
  return { text: out.join(' · '), orig: text, missing };
}
