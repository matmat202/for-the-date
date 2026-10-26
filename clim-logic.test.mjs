// node site/clim-logic.test.mjs — the window, percentile and trend against values computed
// independently in Python (fixtures/facts.py) from a real Open-Meteo archive download, then
// the page's small logic, then the shipped towns. Exit 1 on any failure.
//   test/plant.sh   # mutates a copy of the logic; each mutant must FAIL this suite
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const L = await import(process.env.LOGIC ? pathToFileURL(process.env.LOGIC).href : './clim-logic.js');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const near = (name, a, b, tol = 1e-9) => ok(name, a != null && Math.abs(a - b) <= tol, `got ${a} want ${b}`);

// --- against Python, on Palo Alto's real archive (fixtures exist only in the source tree) --
const FX = here('../fixtures/');
if (existsSync(FX + 'facts.json')) {
  const facts = JSON.parse(readFileSync(FX + 'facts.json', 'utf8'));
  const clim = JSON.parse(readFileSync(FX + 'palo-alto-clim.json', 'utf8')).daily;
  eq('the fixture is the range the page asks for', [clim.time[0], clim.time.at(-1)], [L.climRange().start, L.climRange().end]);
  for (const [name, key, md] of [['oct26_hi', 'temperature_2m_max', [10, 26]], ['oct26_lo', 'temperature_2m_min', [10, 26]],
    ['feb29_hi', 'temperature_2m_max', [2, 29]], ['jan2_hi', 'temperature_2m_max', [1, 2]], ['dec31_lo', 'temperature_2m_min', [12, 31]]]) {
    const f = facts[name], w = L.sameDates(clim, key, md), s = L.summary(w), t = L.trend(w);
    eq(`${name}: ${f.n} days`, w.length, f.n);
    eq(`${name}: years`, [w[0].year, w.at(-1).year], f.years);
    eq(`${name}: min and max`, [s.min, s.max], [f.min, f.max]);
    near(`${name}: mean`, s.mean, f.mean);
    near(`${name}: median`, s.median, f.median);
    near(`${name}: percentile of ${f.x}`, L.percentile(w, f.x), f.pct);
    near(`${name}: per decade`, t.perDecade, f.perDecade);
    eq(`${name}: 30 yearly means`, t.pts.length, 30);
  }
  const fc = JSON.parse(readFileSync(FX + 'palo-alto-forecast.json', 'utf8')).daily;
  const rc = JSON.parse(readFileSync(FX + 'palo-alto-recent.json', 'utf8')).daily;
  for (const k of ['max', 'min']) {
    const o = L.offset(fc, rc, `temperature_2m_${k}`), f = facts[`offset_${k}`];
    near(`offset ${k}`, o.by, f.by); eq(`offset ${k} days`, o.n, f.n);
  }
} else console.log('(fixtures not present: the Python cross-check is skipped)');

// --- the window, by hand -----------------------------------------------------------------
{
  // A synthetic archive where every day's value is its own day of the month: the window
  // for 3 March in each year is 24 Feb..10 March, so it must hold 24..28/29 and 1..10.
  const time = [], v = [];
  for (let k = [2000, 2, 1]; k[0] === 2000 && k[1] <= 3; k = L.addDays(k, 1)) { time.push(L.iso(k)); v.push(k[2]); }
  const w = L.sameDates({ time, v }, 'v', [3, 3], { from: 2000, to: 2000 });
  eq('window is 15 days centred on the date', w.map((s) => s.v), [25, 26, 27, 28, 29, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  eq('window offsets run -7..7', [w[0].off, w.at(-1).off], [-7, 7]);
  const nul = L.sameDates({ time, v: v.map((x, i) => (i === 31 ? null : x)) }, 'v', [3, 3], { from: 2000, to: 2000 });
  eq('a null is skipped, not counted as zero', nul.length, 14);
  // 29 Feb in a year without one: centred on the 28th, still 15 days.
  const t2 = [], v2 = [];
  for (let k = [2001, 2, 1]; k[1] <= 3; k = L.addDays(k, 1)) { t2.push(L.iso(k)); v2.push(k[1] * 100 + k[2]); }
  const w2 = L.sameDates({ time: t2, v: v2 }, 'v', [2, 29], { from: 2001, to: 2001 });
  eq('29 Feb in 2001 centres on the 28th', [w2.length, w2[7].v], [15, 228]);
  const t3 = [], v3 = [];
  for (let k = [1900, 2, 20]; k[1] <= 3; k = L.addDays(k, 1)) { t3.push(L.iso(k)); v3.push(k[1] * 100 + k[2]); }
  eq('1900 had no 29 Feb (century rule)', L.sameDates({ time: t3, v: v3 }, 'v', [2, 29], { from: 1900, to: 1900 })[7].v, 228);
  eq('sampleDate: 29 Feb, 1900 is the 28th', L.sampleDate({ year: 1900, off: 0 }, [2, 29]), [1900, 2, 28]);
  eq('sampleDate: 29 Feb, 2001, three days on', L.sampleDate({ year: 2001, off: 3 }, [2, 29]), [2001, 3, 3]);
  eq('sampleDate: 29 Feb, 2004', L.sampleDate({ year: 2004, off: 0 }, [2, 29]), [2004, 2, 29]);
  eq('sampleDate: across the year end', L.sampleDate({ year: 2020, off: 5 }, [12, 30]), [2021, 1, 4]);
}

// --- percentile, verdict ------------------------------------------------------------------
{
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v }));
  eq('percentile: below all', L.percentile(s, 0), 0);
  eq('percentile: above all', L.percentile(s, 11), 100);
  eq('percentile: a tie counts half', L.percentile(s, 5), 45);
  eq('percentile: between', L.percentile(s, 5.5), 50);
  eq('percentile of nothing', L.percentile([], 3), null);
  const sum = L.summary(s);
  eq('summary', [sum.n, sum.min, sum.max, sum.median, sum.mean], [10, 1, 10, 5.5, 5.5]);
  near('p90 interpolates', sum.p90, 9.1);
  eq('verdict: record warm', L.verdict(100, 11, sum).band, 'record-warm');
  eq('verdict: equal to the warmest is not a record', L.verdict(95, 10, sum).band, 'much-warmer');
  eq('verdict: record cold', L.verdict(0, 0, sum).band, 'record-cold');
  eq('verdict: 90 is much warmer', L.verdict(90, 9.5, sum).band, 'much-warmer');
  eq('verdict: 85 is only warmer', L.verdict(85, 9, sum).band, 'warmer');
  eq('verdict: 70 is warmer', L.verdict(70, 7.5, sum).band, 'warmer');
  eq('verdict: 50 is usual', L.verdict(50, 5.5, sum).band, 'usual');
  eq('verdict: 30 is cooler', L.verdict(30, 3.5, sum).band, 'cooler');
  eq('verdict: 10 is much cooler', L.verdict(10, 1.5, sum).band, 'much-cooler');
  ok('verdict: record words name the count', /any of the 10 past days/.test(L.verdict(100, 11, sum).words));
}

// --- offset -----------------------------------------------------------------------------
{
  const days = Array.from({ length: 12 }, (_, i) => L.iso(L.addDays([2026, 10, 1], i)));
  const fc = { time: days, t: days.map((_, i) => 10 + i) };
  const ar = { time: days, t: days.map((_, i) => 9 + i) };
  eq('offset: forecast 1° warm', L.offset(fc, ar, 't'), { by: 1, n: 12 });
  const holes = { time: days, t: days.map((_, i) => (i < 3 ? null : 9 + i)) };
  eq('offset: too few shared days is flagged, not used', L.offset(fc, holes, 't'), { by: 0, n: 9, short: true });
  const shifted = { time: days.slice(2), t: days.slice(2).map((_, i) => 12 + i) }; // same values, matched by date
  eq('offset: matched by date, not position', L.offset(fc, { time: [...shifted.time, '2026-10-13'], t: [...shifted.t, 0] }, 't'), { by: 0, n: 10 });
}

// --- trend ------------------------------------------------------------------------------
{
  const s = [];
  for (let y = 2000; y <= 2009; y++) for (let k = 0; k < 3; k++) s.push({ year: y, v: (y - 2000) * 0.2 + k });
  near('trend: 0.2°/yr is 2°/decade', L.trend(s).perDecade, 2);
  eq('trend: too few years', L.trend(s.filter((x) => x.year < 2002)).perDecade, null);
}

// --- units, words, URL --------------------------------------------------------------------
eq('deg C', L.deg(20.4, 'C'), '20°C');
eq('deg F', L.deg(20, 'F'), '68°F');
eq('deg F rounds', L.deg(-40, 'F'), '-40°F');
eq('a difference scales and keeps its sign', [L.degDiff(1.2, 'C'), L.degDiff(-1, 'F'), L.degDiff(0, 'C')], ['+1.2°C', '−1.8°F', '±0.0°C']);
eq('unit: en-US is F', L.unitFor('en-US'), 'F');
eq('unit: bare en is F (the US is its likely region)', L.unitFor('en'), 'F');
eq('unit: en-GB is C', L.unitFor('en-GB'), 'C');
eq('unit: rubbish is C', L.unitFor('!!'), 'C');
eq('dateWords', L.dateWords([2026, 10, 26]), '26 October');
eq('weekday', L.weekday([2026, 10, 26]), 'Mon');
eq('climRange', L.climRange(), { start: '1990-12-25', end: '2021-01-07' });
{
  const s = L.encodeState({ at: 'Reykjavík, Capital Region, Iceland', date: [2026, 10, 28], today: [2026, 10, 26], low: true, unit: 'F', defUnit: 'C' });
  eq('encode', s, '?at=Reykjav%C3%ADk%2C+Capital+Region%2C+Iceland&d=2026-10-28&lo=1&u=F');
  eq('decode', L.decodeState(s), { at: 'Reykjavík, Capital Region, Iceland', date: [2026, 10, 28], low: true, unit: 'F' });
  eq('encode: today and the default unit drop out', L.encodeState({ at: 'X', date: [2026, 10, 26], today: [2026, 10, 26], low: false, unit: 'C', defUnit: 'C' }), '?at=X');
  eq('decode: a bad date and unit are dropped', L.decodeState('?d=2026-02-30&u=K'), { at: null, date: null, low: false, unit: null });
}

// --- the towns: same as Daylight's, and the picker finds them ------------------------------
{
  const doc = JSON.parse(readFileSync(here('data/places.json'), 'utf8'));
  ok('places: 30,000+ towns', doc.places.length > 30000, doc.places.length);
  eq('"tromso" finds Tromsø', L.placeLabel(L.matchPlaces(doc.places, 'tromso')[0]), 'Tromsø, Troms, Norway');
  eq('"reykjavik" finds Reykjavík', L.placeLabel(L.matchPlaces(doc.places, 'reykjavik')[0]), 'Reykjavík, Capital Region, Iceland');
  eq('"palo alto, cal" narrows by region', L.placeLabel(L.matchPlaces(doc.places, 'palo alto, cal')[0]), 'Palo Alto, California, United States');
  const pa = L.placeByLabel(doc.places, 'palo alto, california, united states');
  eq('placeByLabel folds case', pa && L.toPlace(pa, doc.zones).tz, 'America/Los_Angeles');
  eq('biggestIn Europe/London is London', L.placeLabel(L.biggestIn(doc.places, doc.zones, 'Europe/London')), 'London, England, United Kingdom');
}

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
