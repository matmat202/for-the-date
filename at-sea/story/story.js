/* The scrolling story: each <section class="step"> names a layout in data-step; as the
 * reader scrolls into a step, the chart redraws in that layout. Numbers in the prose are
 * not typed in: a <b data-fact="..."> is computed here from story.json, and
 * test/story.test.mjs checks each against the `check` block build_story.py computed in
 * python. Modelled on whos-off/site/story. */
import { layout, stats, STEPS } from './layout.js';

const fmt = (n) => n.toLocaleString('en-US');
const nm = (v) => `${Math.round(v)} nautical miles`;
const kn = (v) => `${(v / 24).toFixed(1)} knots`;
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const inWords = (n) => words[n] || fmt(n);
const months = (d) => `${(d / 30.44).toFixed(1).replace(/\.0$/, '')} months`;

/* Unknown names throw: a typo must not render as blank */
export function fact(D, f) {
  const S = stats(D);
  switch (f) {
    case 'runs': return fmt(D.runs);
    case 'voyages': return fmt(D.voyages);
    case 'early': case 'late': case 'brit_early': case 'brit_late': case 'span_early': case 'span_late': return nm(S[f]);
    case 'early_kn': return kn(S.early);
    case 'late_kn': return kn(S.late);
    case 'ratio': case 'cell_ratio': return `${Math.round((S[f] - 1) * 100)}%`;
    case 'cells': case 'cells_up': case 'brit_cells': case 'brit_up': case 'span_cells': case 'span_up': case 'new_n': return fmt(S[f]);
    case 'old_n': case 'old_voc': return inWords(S[f]);
    case 'wind': if (S.wind_early !== S.wind_late) throw new Error('the winds differ: rewrite the sentence'); return `${S.wind_early} m/s`;
    case 'old_days': case 'new_days': case 'old_sail': case 'new_sail': return `${fmt(Math.round(S[f]))} days`;
    case 'old_months': return months(S.old_days);
    case 'new_months': return months(S.new_days);
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
      decades: narrow ? 'nm sailed a day, median' : "a day's run, noon to noon: median nautical miles, every logged ship",
      fleets: narrow ? 'nm a day, by fleet' : "a day's run by fleet: British, Dutch, Spanish (red)",
      cells: narrow ? '1750–79 across, 1830–55 up' : 'each 10° square of sea: 1750–79 median across, 1830–55 up',
      batavia: narrow ? 'days, home to Batavia' : 'days from the Netherlands to Batavia, each passage logged whole',
    }[name];
    tick(L.L, L.T - 10, cap, 'tick cat');
    gS.replaceChildren();
    for (const m of L.marks) {
      let e;
      if (m.kind === 'band') { e = el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, class: m.cls }); tick(m.x + 3, m.y + 14, m.label === 'early' ? '1750–79' : '1830–55', 'tick lab'); }
      else if (m.kind === 'line') e = el('polyline', { points: m.pts.map((p) => p.join(',')).join(' '), class: `ln ${m.cls}` });
      else { e = el('circle', { cx: m.x, cy: m.y, r: m.r, class: `dot ${m.cls}` }); e.append(el('title')); e.firstChild.textContent = m.tip; }
      gS.append(e);
    }
    if (name === 'cells') tick(L.X(150) + 4, L.Y(150) + 14, 'same speed', 'tick');
    if (name === 'fleets') for (const f of ['BRITISH', 'DUTCH', 'SPANISH']) {
      const d = D.decades[f].at(-1);
      // British ends mid-chart, just above the Dutch line: label it above its last dot, not beside
      const above = f === 'BRITISH';
      tick(L.X(d[0] + 5) + (above ? 0 : 7), L.Y(d[2]) + (above ? -10 : 4), f[0] + f.slice(1).toLowerCase(), `tick lab${above ? ' mid' : ''}${f === 'SPANISH' ? ' red' : ''}`);
    }
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
