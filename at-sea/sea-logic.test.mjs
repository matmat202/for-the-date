// node site/at-sea/sea-logic.test.mjs  (from projects/for-the-date)
// Checks sea-logic.js on the built data against projects/at-sea/fixtures/facts.json, which
// SQL computed from the CLIWOC geopackage without going through build.py.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// LOGIC= points the suite at a mutant (test/plant-sea.sh).
const L = await import(process.env.LOGIC ? pathToFileURL(process.env.LOGIC).href : './sea-logic.js');

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL', msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }

const voyages = JSON.parse(readFileSync(join(HERE, 'data/voyages.json'), 'utf8')).voyages;
const factsPath = join(HERE, '../../../at-sea/fixtures/facts.json');
// The staged copy in .publish has no fixtures beside it; it still runs the hand cases.
const facts = existsSync(factsPath) ? JSON.parse(readFileSync(factsPath, 'utf8')) : null;

if (facts) {
  for (const [k, f] of Object.entries(facts)) {
    if (k.startsWith('_')) continue;
    const day = JSON.parse(readFileSync(join(HERE, `data/${k}.json`), 'utf8'));
    eq(day.date, k, `${k} file names its date`);
    const s = L.summary(day.rows, voyages);
    eq(s.ships, f.ships, `${k} ship-days`);
    eq(s.years, f.years, `${k} distinct years`);
    eq([s.first, s.last], [f.first, f.last], `${k} year span`);
    eq(s.storm && s.storm[L.W], f.stormW, `${k} strongest wind`);
    eq(s.storm && s.storm[L.Y], f.stormYear, `${k} strongest wind's year (earliest on a tie)`);
    eq(s.calm, f.calm, `${k} ship-days in a dead calm`);
    eq(s.gales, f.gales, `${k} ship-days in a gale or worse (force 8+)`);
    eq(s.nations, f.nations, `${k} ships by nation`);
    eq(L.years(day.rows).length, f.years, `${k} years() agrees`);
    const one = L.inYear(day.rows, f.first);
    ok(one.length > 0 && one.every((r) => r[L.Y] === f.first), `${k} inYear keeps only ${f.first}`);
  }
  for (const [w, force] of facts._beaufort) eq(L.beaufort(w), force, `beaufort(${w / 10} m/s)`);
}

// Hand cases.
eq(L.beaufort(null), null, 'no wind recorded');
eq(L.beaufort(0), 0, 'dead calm');
eq(L.compass(0), 'N', 'north'); eq(L.compass(360), 'N', '360 is north'); eq(L.compass(225), 'SW', 'south-west');
eq(L.compass(11), 'N', '11 rounds to N'); eq(L.compass(12), 'NNE', '12 rounds to NNE');
eq(L.compass(361), 'variable', 'ICOADS 361'); eq(L.compass(null), null, 'no direction');
eq(L.fmtPos(-34.2, -9.9), '34.2°S 9.9°W', 'south-west position');
eq(L.fmtPos(49.8, 103.3), '49.8°N 103.3°E', 'north-east position');
eq(L.sentence('SAW A NUMBER OF LARGE GRAMPUSES'), 'Saw a number of large grampuses', 'sentence case');
eq(L.title('PRINCE RUPERT'), 'Prince Rupert', 'title case'); eq(L.title("ZEEUW'S LUST"), "Zeeuw's Lust", 'title after apostrophe');
eq(L.title('GROOT-ZORG'), 'Groot-Zorg', 'title after hyphen');
eq(L.dateKey('?d=02-29', new Date(2026, 10, 4)), '02-29', 'URL date wins');
eq(L.dateKey('?d=02-30', new Date(2026, 10, 4)), '11-04', 'impossible URL date falls back to today');
eq(L.dateKey('?d=1-4', new Date(2026, 0, 9)), '01-09', 'malformed URL date falls back; single-digit day padded');
eq(L.dateKey('', new Date(2026, 8, 3)), '09-03', 'single-digit month and day padded');
eq(L.dateLabel('11-04'), '4 November', 'label'); eq(L.dateLabel('02-29'), '29 February', 'leap label');
eq(L.allKeys().length, 366, 'calendar has 366 keys');
eq(L.shiftKey('12-31', 1), '01-01', 'next wraps the year');
eq(L.shiftKey('01-01', -1), '12-31', 'previous wraps the year');
eq(L.shiftKey('02-28', 1), '02-29', 'leap day is reachable');
eq(L.shiftKey('02-29', 1), '03-01', 'and leads to March');
eq(L.windLine([1800, 0, 0, 0, 226, 39, 'X', null, null]), 'Force 9, strong gale from the NE', 'wind line');
eq(L.windLine([1800, 0, 0, 0, 0, 361, 'DOOD STIL', null, null]), 'Force 0, calm', 'calm has no direction');
eq(L.windLine([1800, 0, 0, 0, 46, 361, null, null, null]), 'Force 3, gentle breeze, variable', 'variable wind');
eq(L.windLine([1800, 0, 0, 0, null, 90, 'FRESCO', null, null]), null, 'no speed, no line');

// remarks(): English first, then by year, and only rows with a remark. Three rows in the
// wrong order, because a two-element sort compares one pair.
const vs = [['A', 'DUTCH', '', '', '', '', '', 'DUTCH'], ['B', 'BRITISH', '', '', '', '', '', 'ENGLISH']];
const rr = [[1790, 0, 0, 0, null, null, null, null, 'dutch late'], [1780, 1, 0, 0, null, null, null, null, 'english late'],
  [1760, 0, 0, 0, null, null, null, null, 'dutch early'], [1770, 1, 0, 0, null, null, null, null, null],
  [1750, 1, 0, 0, null, null, null, null, 'english early']];
eq(L.remarks(rr, vs).map((r) => r[L.R]), ['english early', 'english late', 'dutch early', 'dutch late'], 'remark order');
const s2 = L.summary(rr, vs);
eq(s2.nations, [['BRITISH', 3], ['DUTCH', 2]], 'nations, largest first');
eq(s2.storm, null, 'no wind anywhere -> no storm');

// phrase(): translation beside the original; English untouched; bare numbers dropped.
const en = { 'MATROOS OVERLEDEN': 'A sailor died', 'GOED WEER': 'Fine weather' };
eq(L.phrase('FRESH GALES', 'ENGLISH', en), { text: 'FRESH GALES', orig: null, missing: 0 }, 'English as logged');
eq(L.phrase('MATROOS OVERLEDEN', 'DUTCH', en), { text: 'A sailor died', orig: 'MATROOS OVERLEDEN', missing: 0 }, 'translated');
eq(L.phrase('MATROOS OVERLEDEN · ZIEN LAND', 'DUTCH', en), { text: 'A sailor died · ZIEN LAND', orig: 'MATROOS OVERLEDEN · ZIEN LAND', missing: 1 }, 'part translated');
eq(L.phrase('ZIEN LAND', 'DUTCH', en), { text: 'ZIEN LAND', orig: null, missing: 1 }, 'untranslated shows original only');
eq(L.phrase('ZIEN LAND', 'DUTCH', null), { text: 'ZIEN LAND', orig: null, missing: 1 }, 'no translation file');
eq(L.phrase('11', 'DUTCH', en), null, 'a bare Beaufort number is not words');
eq(L.phrase('', 'DUTCH', en), null, 'empty');

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed${facts ? '' : ' (no fixtures: hand cases only)'}`);
process.exit(fail ? 1 : 0);
