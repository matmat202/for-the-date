/* Where every mark sits on each step of the story. Pure: no DOM, so test/warm-story.test.mjs
 * runs every layout at several plot sizes. Modelled on site/at-sea/story/layout.js.
 *
 *   "years":    every city's highs pooled, year by year: the share the page would call warmer
 *               than usual (red) and cooler (grey); 30% is what 1991-2020 gives by design
 *   "cities":   each city, 2021-2025: % of days cooler than usual across, warmer up
 *   "stations": the same for 30 US thermometers against their own 1991-2020
 *   "seam":     Bogota's nights, year by year: the archive without a model, and pinned to one
 */
export const STEPS = { years: 'years', cities: 'cities', stations: 'stations', seam: 'seam' };
export const SEAM = ['Bogotá', 'lo'];
export const SQ = 70; // the scatter's % axes: no city or station passes 61% warm or 37% cool
const sum = (rs, i) => rs.reduce((s, r) => s + r[i], 0);

const memo = new WeakMap();
/* -> the numbers the story quotes; build_warm_story.py's `check` holds the same */
export function stats(D) {
  if (memo.has(D)) return memo.get(D);
  const C = D.cities, S = D.stations, base = D.years.filter((y) => y[0] <= 2020);
  const n = sum(C, 2), nl = sum(C, 7), sn = sum(S, 1), snl = sum(S, 4);
  const R = {
    warm: sum(C, 3) / n, cool: sum(C, 4) / n, warm_lo: sum(C, 8) / nl, cool_lo: sum(C, 9) / nl,
    much_warm: sum(C, 5) / n, record: sum(C, 6) / n,
    cities_more_warm: C.filter((r) => r[3] > r[4]).length,
    st_warm: sum(S, 2) / sn, st_cool: sum(S, 3) / sn, st_warm_lo: sum(S, 5) / snl, st_cool_lo: sum(S, 6) / snl,
    st_more_warm: S.filter((r) => r[2] > r[3]).length,
    base_warm: sum(base, 2) / sum(base, 1),
  };
  memo.set(D, R);
  return R;
}

/* the seam row for one town and variable: [name, key, y0, best[], pinned[]] */
export const seamOf = (D, [name, key] = SEAM) => D.seam.find((s) => s[0] === name && s[1] === key);

/* -> {X, Y, L, R, T, B, marks: [{kind,cls,...}], xt, yt} in px of w x h */
export function layout(name, D, w, h) {
  if (!STEPS[name]) throw new Error(`unknown step ${name}`);
  const left = 40, right = w - 10, top = 26, base = h - 22;
  let x0, x1, y0, y1, L = left, R = right, T = top, B = base;
  const sq = name === 'cities' || name === 'stations';
  let sm;
  if (sq) { x0 = 0; x1 = SQ; y0 = 0; y1 = SQ; const s = Math.min(R - L, B - T); R = L + s; T = B - s; }
  else if (name === 'years') { x0 = 1990; x1 = 2026; y0 = 0; y1 = 60; }
  else {
    sm = seamOf(D); x0 = 1990; x1 = 2026;
    const vs = [...sm[3], ...sm[4]];
    y0 = Math.floor(Math.min(...vs)) - 1; y1 = Math.ceil(Math.max(...vs)) + 1;
  }
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (R - L);
  const Y = (v) => B - ((v - y0) / (y1 - y0)) * (B - T);
  const marks = [];
  const line = (pts, cls, label) => marks.push({ kind: 'line', cls, label, pts: pts.map(([a, b]) => [X(a), Y(b)]) });
  const pc = (a, b) => (100 * a) / b;
  if (name === 'years') {
    marks.push({ kind: 'band', cls: 'band', x: X(2020.5), w: X(2025.5) - X(2020.5), y: T, h: B - T, label: 'since' });
    line([[1990, 30], [2026, 30]], 'design', 'by design');
    for (const [k, i, cls] of [['warmer', 2, 'warm'], ['cooler', 3, 'cool']]) {
      line(D.years.map((y) => [y[0], pc(y[i], y[1])]), cls, k);
      for (const y of D.years) marks.push({ kind: 'dot', cls, x: X(y[0]), y: Y(pc(y[i], y[1])), r: y[0] > 2020 ? 4 : 2.5,
        tip: `${y[0]}: ${Math.round(pc(y[i], y[1]))}% of days ${k} than usual, 30 cities` });
    }
  } else if (sq) {
    line([[0, 0], [SQ, SQ]], 'diag', 'as many warm as cool');
    const rows = name === 'cities' ? D.cities : D.stations, o = name === 'cities' ? 2 : 1;
    for (const r of rows) {
      const wp = pc(r[o + 1], r[o]), cp = pc(r[o + 2], r[o]);
      marks.push({ kind: 'dot', cls: wp > cp ? 'hit' : 'miss', x: X(cp), y: Y(wp), r: 4,
        tip: `${r[0]}: ${Math.round(wp)}% of days warmer than usual, ${Math.round(cp)}% cooler (2021–2025)` });
    }
    marks.push({ kind: 'dot', cls: 'design', x: X(30), y: Y(30), r: 6, tip: '1991–2020 itself: 30% warmer, 30% cooler, by design' });
  } else {
    line(sm[3].map((v, i) => [sm[2] + i, v]), 'best', 'no model named');
    line(sm[4].map((v, i) => [sm[2] + i, v]), 'pinned', 'one model');
    sm[3].forEach((v, i) => marks.push({ kind: 'dot', cls: 'best', x: X(sm[2] + i), y: Y(v), r: 3, tip: `${sm[2] + i}, no model named: nights averaged ${v.toFixed(1)} °C` }));
    sm[4].forEach((v, i) => marks.push({ kind: 'dot', cls: 'pinned', x: X(sm[2] + i), y: Y(v), r: 3, tip: `${sm[2] + i}, one model: nights averaged ${v.toFixed(1)} °C` }));
  }
  const xt = sq ? [0, 20, 40, 60] : [1995, 2005, 2015, 2025];
  const yt = sq ? [20, 40, 60] : name === 'years' ? [15, 30, 45, 60] : [y0 + 1, Math.round((y0 + y1) / 2), y1 - 1];
  return { kind: name, X, Y, L, R, T, B, xt, yt, marks };
}
