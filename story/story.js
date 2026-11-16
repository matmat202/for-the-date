/* The scrolling story: each <section class="step"> names a layout in data-step; as the
 * reader scrolls into a step, the chart redraws in that layout. Numbers in the prose are
 * not typed in: a <b data-fact="..."> is computed here from story.json, and
 * test/warm-story.test.mjs checks each against the `check` block build_warm_story.py
 * computed in python. Modelled on site/at-sea/story. */
import { layout, stats, seamOf, STEPS } from './layout.js';

const fmt = (n) => n.toLocaleString('en-US');
const pc = (v) => `${Math.round(v * 100)}%`;
const pc1 = (v) => `${(v * 100).toFixed(1)}%`;
const words = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const inWords = (n) => words[n] || fmt(n);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
/* a seam line's mean over the 4 years before the join (2013-16) and the 4 after (2017-20) */
export function seamStep(D, which) {
  const s = seamOf(D), v = s[which === 'best' ? 3 : 4], at = (y) => v[y - s[2]];
  const before = mean([2013, 2014, 2015, 2016].map(at)), after = mean([2017, 2018, 2019, 2020].map(at));
  return { before, after, step: after - before };
}
/* the share of 2021-2025 the page used to call warmer (i=1) or cooler (2), asked without a model */
export const old = (D, name, key, i) => { const t = seamOf(D, [name, key])[5]; return t[i] / t[0]; };
const deg = (v) => `${v.toFixed(1)} °C`;

/* Unknown names throw: a typo must not render as blank */
export function fact(D, f) {
  const S = stats(D);
  switch (f) {
    case 'warm': case 'cool': case 'warm_lo': case 'cool_lo': case 'much_warm':
    case 'st_warm': case 'st_cool': case 'st_warm_lo': case 'st_cool_lo': case 'base_warm': return pc(S[f]);
    case 'record': return pc1(S[f]);
    case 'days': return fmt(D.cities.reduce((s, r) => s + r[2], 0));
    case 'cities': return inWords(D.cities.length);
    case 'stations': return inWords(D.stations.length);
    case 'cities_more_warm': case 'st_more_warm': return fmt(S[f]);
    case 'seam_before': return deg(seamStep(D, 'best').before);
    case 'seam_after': return deg(seamStep(D, 'best').after);
    case 'seam_step': return deg(Math.abs(seamStep(D, 'best').step));
    case 'pin_step': return deg(Math.abs(seamStep(D, 'pinned').step));
    case 'new_cool': { const r = D.cities.find((c) => c[0] === 'Bogotá'); return pc(r[9] / r[7]); }
    case 'old_cool': return pc(old(D, 'Bogotá', 'lo', 2));
    case 'old_warm': return pc(old(D, 'Bogotá', 'lo', 1));
    case 'jak_old': return pc(old(D, 'Jakarta', 'hi', 1));
    case 'lima_old': return pc(old(D, 'Lima', 'hi', 2));
    default: throw new Error(`unknown fact ${f}`);
  }
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const e of document.querySelectorAll('[data-fact]')) e.textContent = fact(D, e.dataset.fact);
  const steps = [...document.querySelectorAll('.step')];
  for (const s of steps) if (!STEPS[s.dataset.step]) throw new Error(`unknown step ${s.dataset.step}`);
  const plot = document.getElementById('plot');
  const svg = el('svg', { id: 'chart' });
  const gAxis = el('g', { class: 'axis' }), gS = el('g');
  svg.append(gAxis, gS);
  plot.append(svg);
  const tick = (x, y, text, cls = 'tick') => { const t = el('text', { x, y, class: cls }); t.textContent = text; gAxis.append(t); };
  const grid = (x1, y1, x2, y2, cls = 'grid') => gAxis.append(el('line', { x1, x2, y1, y2, class: cls }));

  let shown = -1;
  const draw = (i) => {
    const name = steps[i].dataset.step;
    const box = plot.getBoundingClientRect(), W = box.width, H = box.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = layout(name, D, W, H);
    const narrow = W < 420;
    gAxis.replaceChildren();
    for (const v of L.yt) { grid(L.L, L.Y(v), L.R, L.Y(v)); tick(L.L - 4, L.Y(v) + 4, String(v), 'tick end'); }
    for (const v of L.xt) tick(L.X(v), L.B + 15, String(v), 'tick mid');
    grid(L.L, L.B, L.R, L.B, 'grid axisline');
    const cap = {
      years: narrow ? '% of days, 30 cities' : '% of days the page calls warmer (red) or cooler than usual, 30 cities',
      cities: narrow ? '% cooler across, warmer up' : 'each city, 2021–2025: % of days cooler than usual across, warmer up',
      stations: narrow ? 'thermometers, % cooler / warmer' : '30 US thermometers, 2021–2025: % of days cooler across, warmer up',
      seam: narrow ? 'Bogotá nights, mean °C' : 'Bogotá’s nights, mean low each year (°C): no model named (red), one model',
    }[name];
    tick(L.L, L.T - 10, cap, 'tick cat');
    gS.replaceChildren();
    for (const m of L.marks) {
      let e;
      if (m.kind === 'band') { e = el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, class: m.cls }); tick(m.x + 3, m.y + 14, 'since', 'tick lab'); }
      else if (m.kind === 'line') e = el('polyline', { points: m.pts.map((p) => p.join(',')).join(' '), class: `ln ${m.cls}` });
      else { e = el('circle', { cx: m.x, cy: m.y, r: m.r, class: `dot ${m.cls}` }); e.append(el('title')); e.firstChild.textContent = m.tip; }
      gS.append(e);
    }
    if (name === 'years') tick(L.X(1991), L.Y(30) - 6, 'by design: 30%', 'tick');
    if (name === 'cities' || name === 'stations') { tick(L.X(30) + 9, L.Y(30) + 4, '1991–2020', 'tick'); tick(L.X(3), L.Y(64), 'more warm days ↖', 'tick'); }
    if (name === 'seam') tick(L.X(2017), L.T + 12, '2017: the model changes', 'tick mid red');
    document.body.dataset.step = i;
    window.__story = { step: i, name, shown: L.marks.filter((m) => m.kind === 'dot').length };
  };

  const pick = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    if (i !== shown) { shown = i; draw(i); }
  };
  addEventListener('scroll', pick, { passive: true });
  addEventListener('resize', () => { shown = -1; pick(); });
  pick();
}

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
