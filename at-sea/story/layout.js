/* Where every mark sits on each step of the story. Pure: no DOM, so test/story.test.mjs
 * runs every layout at several plot sizes. Modelled on whos-off/site/story.
 *
 *   "decades": every ship's median day's run, decade by decade (nautical miles, noon to noon)
 *   "cells":   each 10-degree square of sea: its 1750-79 median across, its 1830-55 median up
 *   "fleets":  the decade line again, one per fleet: British, Dutch, Spanish
 *   "batavia": every Dutch passage from home to Batavia logged whole, its length in days
 */
export const STEPS = { decades: 'decades', cells: 'cells', fleets: 'fleets', batavia: 'batavia' };
export const FLEET_CLS = { ALL: 'all', BRITISH: 'brit', DUTCH: 'dutch', SPANISH: 'span' };
const mid = (xs) => {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const up = (cs) => cs.filter((c) => c[5] > c[3]).length;
const wratio = (cs) => Math.exp(cs.reduce((s, c) => s + Math.log(c[5] / c[3]) * c[2], 0) / cs.reduce((s, c) => s + c[2], 0));

const memo = new WeakMap();
/* -> the numbers the story quotes; build_story.py's `check` holds the same */
export function stats(D) {
  if (memo.has(D)) return memo.get(D);
  const E = D.era, P = D.passages;
  const old = P.filter((p) => p[0] < 1810), nu = P.filter((p) => p[0] >= 1820);
  const c = D.cells.ALL, cb = D.cells.BRITISH, cs = D.cells.SPANISH;
  const S = {
    early: E.ALL.early[1], late: E.ALL.late[1], ratio: E.ALL.late[1] / E.ALL.early[1],
    cells: c.length, cells_up: up(c), cell_ratio: wratio(c),
    brit_early: E.BRITISH.early[1], brit_late: E.BRITISH.late[1], brit_cells: cb.length, brit_up: up(cb),
    span_early: E.SPANISH.early[1], span_late: E.SPANISH.late[1], span_cells: cs.length, span_up: up(cs),
    wind_early: D.wind[0], wind_late: D.wind[1],
    old_n: old.length, old_voc: old.filter((p) => p[2] === 'VOC').length, old_days: mid(old.map((p) => p[3])), old_sail: mid(old.map((p) => p[4])),
    new_n: nu.length, new_days: mid(nu.map((p) => p[3])), new_sail: mid(nu.map((p) => p[4])),
  };
  memo.set(D, S);
  return S;
}

/* -> {X, Y, x0, x1, y0, y1, base, left, top, right, marks: [{kind,cls,...}], xt, yt} in px of w x h */
export function layout(name, D, w, h) {
  if (!STEPS[name]) throw new Error(`unknown step ${name}`);
  const left = 40, right = w - 10, top = 26, base = h - 22;
  let x0, x1, y0, y1;
  if (name === 'cells') { x0 = 0; x1 = 200; y0 = 0; y1 = 200; }
  else if (name === 'batavia') { x0 = 1670; x1 = 1860; y0 = 0; y1 = 260; }
  else { x0 = 1745; x1 = 1860; y0 = 0; y1 = 140; }
  // the cells chart is square: the side is the shorter of the two
  let L = left, R = right, T = top, B = base;
  if (name === 'cells') { const s = Math.min(R - L, B - T); R = L + s; T = B - s; }
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (R - L);
  const Y = (v) => B - ((v - y0) / (y1 - y0)) * (B - T);
  const marks = [];
  const line = (pts, cls, label) => marks.push({ kind: 'line', cls, label, pts: pts.map(([a, b]) => [X(a), Y(b)]) });
  if (name === 'decades' || name === 'fleets') {
    const fleets = name === 'decades' ? ['ALL'] : ['BRITISH', 'DUTCH', 'SPANISH'];
    for (const f of fleets) {
      const ds = D.decades[f];
      line(ds.map((d) => [d[0] + 5, d[2]]), FLEET_CLS[f], f);
      for (const d of ds) marks.push({ kind: 'dot', cls: FLEET_CLS[f], x: X(d[0] + 5), y: Y(d[2]), r: 4,
        tip: `${f === 'ALL' ? 'All ships' : f[0] + f.slice(1).toLowerCase()}, ${d[0]}s: ${Math.round(d[2])} nm a day (${d[1].toLocaleString('en-US')} days' runs)` });
    }
    // bands go under the line: unshift, since the line is already in marks
    if (name === 'decades') for (const [k, e] of [['early', D.era.ALL.span[0]], ['late', D.era.ALL.span[1]]])
      marks.unshift({ kind: 'band', cls: 'band', x: X(e[0]), w: X(e[1] + 1) - X(e[0]), y: T, h: B - T, label: k });
  } else if (name === 'cells') {
    line([[0, 0], [200, 200]], 'diag', 'same speed');
    for (const c of D.cells.ALL) marks.push({ kind: 'dot', cls: c[5] > c[3] ? 'hit' : 'miss', x: X(c[3]), y: Y(c[5]), r: 3 + Math.min(5, Math.sqrt(c[2]) / 12),
      tip: `${Math.abs(c[0])}–${Math.abs(c[0] + 10)}°${c[0] < 0 ? 'S' : 'N'}, ${Math.abs(c[1])}–${Math.abs(c[1] + 10)}°${c[1] < 0 ? 'W' : 'E'}: ${Math.round(c[3])} nm then, ${Math.round(c[5])} later` });
  } else {
    for (const p of D.passages) marks.push({ kind: 'dot', cls: p[0] < 1810 ? 'hit' : 'miss', x: X(p[0]), y: Y(p[3]), r: p[0] < 1810 ? 5 : 3,
      tip: `${p[1]} (${p[0]}): ${p[3]} days to Batavia, ${p[4]} of them under sail` });
  }
  const xt = name === 'cells' ? [0, 50, 100, 150, 200] : name === 'batavia' ? [1700, 1750, 1800, 1850] : [1750, 1775, 1800, 1825, 1850];
  const yt = name === 'cells' ? [50, 100, 150, 200] : name === 'batavia' ? [100, 200] : [50, 100];
  return { kind: name, X, Y, L, R, T, B, xt, yt, marks };
}
