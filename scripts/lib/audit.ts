// Audit schedule (docs/plans/pipeline.md, "Audits"): how many auto-verified links go to the owner
// for checking, computed from docs/review/audit-log.csv every time and never stored.
//
// burn-in    every auto-verified link is audited until 60 are, with at most 1 error. More errors:
//            stay in burn-in until a gate fix merges and a `reset` row restarts the count.
// normal     a random 10% of each batch's auto-verified links, at least 1.
// tightened  3+ errors in the last 50 audits: 100%, until 5 batches in a row have no errors.
// reduced    after 100 correct audits in a row: 5%. Any error returns to normal.

export interface AuditRow { link: string; batch: string; date: string; result: string; cause: string }
export type Mode = 'burn-in' | 'normal' | 'tightened' | 'reduced';
export const RATE: Record<Mode, number> = { 'burn-in': 1, tightened: 1, normal: 0.1, reduced: 0.05 };
export const BURN_IN = 60;

export interface AuditState { mode: Mode; audited: number; errors: number; upper95: number; note: string }

/** One-sided 95% Clopper–Pearson upper bound on the error rate after k errors in n audits. */
export function upperBound(n: number, k: number, alpha = 0.05): number {
  if (n === 0) return 1;
  if (k >= n) return 1;
  // P(X <= k | p) is decreasing in p: bisect for the p where it equals alpha.
  const cdf = (p: number) => { let term = (1 - p) ** n, sum = term; for (let i = 1; i <= k; i++) { term *= ((n - i + 1) / i) * (p / (1 - p)); sum += term; } return sum; };
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (cdf(m) > alpha) lo = m; else hi = m; }
  return lo;
}

export function auditState(log: AuditRow[]): AuditState {
  // Only audits since the last reset count (a reset follows a merged gate fix).
  const lastReset = log.map((r) => r.result).lastIndexOf('reset');
  const rows = log.slice(lastReset + 1).filter((r) => r.result === 'correct' || r.result === 'wrong');
  const errors = rows.filter((r) => r.result === 'wrong').length;
  const base = { audited: rows.length, errors, upper95: upperBound(rows.length, errors) };

  // Burn-in: the first 60 audits. Exit needs at most 1 error among them.
  const first = rows.slice(0, BURN_IN);
  const burnErrors = first.filter((r) => r.result === 'wrong').length;
  if (first.length < BURN_IN) return { ...base, mode: 'burn-in', note: `burn-in: ${first.length} of ${BURN_IN} audited, ${burnErrors} wrong` };
  if (burnErrors > 1) return { ...base, mode: 'burn-in', note: `burn-in failed: ${burnErrors} of ${BURN_IN} wrong. Fix the gate, then add a reset row to the audit log to restart the count` };

  // After burn-in: replay batch by batch.
  const after = rows.slice(BURN_IN);
  const batches: AuditRow[][] = [];
  for (const r of after) { const last = batches[batches.length - 1]; if (last && last[0].batch === r.batch) last.push(r); else batches.push([r]); }
  let mode: Mode = 'normal', cleanBatches = 0, streak = burnErrors ? 0 : first.length;
  const seen: AuditRow[] = [...first];
  for (const b of batches) {
    const wrong = b.some((r) => r.result === 'wrong');
    for (const r of b) { seen.push(r); streak = r.result === 'wrong' ? 0 : streak + 1; }
    const recent = seen.slice(-50).filter((r) => r.result === 'wrong').length;
    if (mode === 'tightened') { cleanBatches = wrong ? 0 : cleanBatches + 1; if (cleanBatches >= 5) { mode = 'normal'; cleanBatches = 0; } continue; }
    if (recent >= 3) { mode = 'tightened'; cleanBatches = 0; continue; }
    if (mode === 'reduced' && wrong) { mode = 'normal'; continue; }
    if (mode === 'normal' && streak >= 100) mode = 'reduced';
  }
  const note = mode === 'tightened' ? `tightened: ${cleanBatches} of 5 clean batches` : mode === 'reduced' ? `reduced: ${streak} correct in a row` : `normal: ${streak} correct in a row`;
  return { ...base, mode, note };
}

/** Deterministic sample: the same run picks the same links. */
export function sample<T>(items: T[], mode: Mode, seed: string): T[] {
  if (!items.length) return [];
  const n = Math.min(items.length, Math.max(1, Math.ceil(items.length * RATE[mode])));
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
