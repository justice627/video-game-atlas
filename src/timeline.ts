/** Piecewise-linear mapping between slider positions and years. */
export const RESOLUTION = 10000;
export const STOPS: readonly [pos: number, year: number][] = [
  [0, -13_800_000_000],
  [600, -10_000],
  [2200, 0],
  [4800, 1800],
  [8000, 2026],
  [9200, 3000],
  [10000, 100_000],
];
export const MIN_YEAR = STOPS[0][1];
export const MAX_YEAR = STOPS[STOPS.length - 1][1];

export function posToYear(pos: number): number {
  const p = Math.min(RESOLUTION, Math.max(0, pos));
  for (let i = 1; i < STOPS.length; i++) {
    const [p0, y0] = STOPS[i - 1], [p1, y1] = STOPS[i];
    if (p <= p1) return Math.round(y0 + ((p - p0) / (p1 - p0)) * (y1 - y0));
  }
  return MAX_YEAR;
}

export function yearToPos(year: number): number {
  const y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, year));
  for (let i = 1; i < STOPS.length; i++) {
    const [p0, y0] = STOPS[i - 1], [p1, y1] = STOPS[i];
    if (y <= y1) return p0 + ((y - y0) / (y1 - y0)) * (p1 - p0);
  }
  return RESOLUTION;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function formatYear(y: number): string {
  const a = Math.abs(y);
  const era = y < 0 ? ' BCE' : '';
  if (a >= 1e9) return `${+(a / 1e9).toFixed(1)} bn${era || ' CE'}`;
  if (a >= 1e6) return `${+(a / 1e6).toFixed(1)} m${era || ' CE'}`;
  if (y === 0) return '1 CE';
  if (y < 0) return `${fmt(a)} BCE`;
  return a >= 10_000 ? fmt(a) : String(a);
}

export function formatSpan(s: { from: number; to: number }): string {
  return s.from === s.to ? formatYear(s.from) : `${formatYear(s.from)}–${formatYear(s.to)}`;
}

export interface Range { from: number; to: number }

export const PRESETS: { label: string; range: Range }[] = [
  { label: 'All time', range: { from: MIN_YEAR, to: MAX_YEAR } },
  { label: 'Antiquity', range: { from: -3000, to: 500 } },
  { label: 'Medieval', range: { from: 500, to: 1500 } },
  { label: 'Early modern', range: { from: 1500, to: 1800 } },
  { label: '20th century', range: { from: 1901, to: 2000 } },
  { label: '1980s', range: { from: 1980, to: 1989 } },
  { label: 'Future', range: { from: 2027, to: MAX_YEAR } },
];

const TICKS: [number, string][] = [
  [MIN_YEAR, 'Big Bang'], [0, '0'], [1800, '1800'],
  [2026, '2026'], [3000, '3000'], [MAX_YEAR, '100k'],
];

/** Dual-knob slider built from two native range inputs (keyboard accessible). */
export function mountTimeline(root: HTMLElement, initial: Range, onChange: (r: Range) => void) {
  root.innerHTML = `
    <div class="tl-head">
      <output class="tl-value" aria-live="polite"></output>
      <div class="tl-presets" role="group" aria-label="Time presets">
        ${PRESETS.map((p, i) => `<button type="button" data-preset="${i}">${p.label}</button>`).join('')}
      </div>
    </div>
    <div class="tl-track">
      <div class="tl-rail"></div><div class="tl-fill"></div>
      <input type="range" class="tl-lo" min="0" max="${RESOLUTION}" step="1" aria-label="Earliest year">
      <input type="range" class="tl-hi" min="0" max="${RESOLUTION}" step="1" aria-label="Latest year">
    </div>
    <div class="tl-ticks" aria-hidden="true">
      ${TICKS.map(([y, l]) => `<span style="left:${(yearToPos(y) / RESOLUTION) * 100}%">${l}</span>`).join('')}
    </div>`;
  const lo = root.querySelector<HTMLInputElement>('.tl-lo')!;
  const hi = root.querySelector<HTMLInputElement>('.tl-hi')!;
  const fill = root.querySelector<HTMLElement>('.tl-fill')!;
  const out = root.querySelector<HTMLOutputElement>('.tl-value')!;
  let range = { ...initial };

  const render = () => {
    lo.value = String(Math.round(yearToPos(range.from)));
    hi.value = String(Math.round(yearToPos(range.to)));
    const a = (yearToPos(range.from) / RESOLUTION) * 100, b = (yearToPos(range.to) / RESOLUTION) * 100;
    fill.style.left = `${a}%`;
    fill.style.width = `${b - a}%`;
    out.textContent = `${formatYear(range.from)} – ${formatYear(range.to)}`;
    lo.setAttribute('aria-valuetext', formatYear(range.from));
    hi.setAttribute('aria-valuetext', formatYear(range.to));
    root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
      const p = PRESETS[Number(btn.dataset.preset)].range;
      btn.setAttribute('aria-pressed', String(p.from === range.from && p.to === range.to));
    });
  };
  const set = (r: Range) => { range = r; render(); onChange(range); };

  lo.addEventListener('input', () => {
    const p = Math.min(Number(lo.value), Number(hi.value));
    set({ from: posToYear(p), to: range.to });
  });
  hi.addEventListener('input', () => {
    const p = Math.max(Number(hi.value), Number(lo.value));
    set({ from: range.from, to: posToYear(p) });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) =>
    btn.addEventListener('click', () => set({ ...PRESETS[Number(btn.dataset.preset)].range })),
  );
  render();
  return { set };
}
