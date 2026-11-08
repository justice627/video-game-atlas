// Review commands from the pinned issue (docs/plans/pipeline.md, section 4.5). Deterministic, no LLM.
// A comment holds one command per line:
//   reject <id> <reason>
//   edit <id> <field>=<value> [<field>=<value> ...]
//   quote <id> "<text>"        (blocked sources: the text you found on the page)
//   skip <id>
//   approve <id>               (same as ticking the box)
// A comment with any line that can't be read changes nothing.
import { EDITABLE, parseAssignments, type QueueRow } from './queue.ts';

export type Command =
  | { op: 'approve' | 'skip'; id: string }
  | { op: 'reject'; id: string; reason: string }
  | { op: 'edit'; id: string; assignments: string }
  | { op: 'quote'; id: string; text: string };

const ID = '(q\\d+)';
/** Phone keyboards turn " into “ ” and ' into ’. */
const straighten = (s: string) => s.replace(/[“”„″]/g, '"').replace(/[‘’]/g, "'");

export function parseComment(body: string): { commands: Command[]; errors: string[] } {
  const commands: Command[] = [], errors: string[] = [];
  let fence = false;
  for (const raw of body.replace(/\r/g, '').split('\n')) {
    const line = straighten(raw).trim();
    if (line.startsWith('```')) { fence = !fence; continue; }
    if (fence || !line || line.startsWith('>') || line.startsWith('<!--')) continue; // quoted replies and blank lines
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^(approve|skip)\\s+${ID}$`, 'i').exec(line))) commands.push({ op: m[1].toLowerCase() as 'approve' | 'skip', id: m[2].toLowerCase() });
    else if ((m = new RegExp(`^reject\\s+${ID}\\s+(.+)$`, 'i').exec(line))) commands.push({ op: 'reject', id: m[1].toLowerCase(), reason: m[2].trim() });
    else if ((m = new RegExp(`^reject\\s+${ID}$`, 'i').exec(line))) errors.push(`"${raw.trim()}": reject needs a reason, e.g. reject ${m[1]} wrong city`);
    else if ((m = new RegExp(`^edit\\s+${ID}\\s+(.+)$`, 'i').exec(line))) {
      try {
        const pairs = parseAssignments(m[2]);
        const bad = pairs.filter(([k]) => !(EDITABLE as readonly string[]).includes(k)).map(([k]) => k);
        if (!pairs.length) errors.push(`"${raw.trim()}": nothing to edit`);
        else if (bad.length) errors.push(`"${raw.trim()}": can't edit ${bad.join(', ')} (allowed: ${EDITABLE.join(', ')})`);
        else commands.push({ op: 'edit', id: m[1].toLowerCase(), assignments: m[2].trim() });
      } catch (e) { errors.push(`"${raw.trim()}": ${(e as Error).message}`); }
    }
    else if ((m = new RegExp(`^quote\\s+${ID}\\s+"(.+)"$`, 'i').exec(line))) commands.push({ op: 'quote', id: m[1].toLowerCase(), text: m[2] });
    else errors.push(`"${raw.trim()}": not a command (reject, edit, quote, skip or approve, then the item id)`);
  }
  return { commands, errors };
}

/** Ids whose box went from unticked (or absent) to ticked between two versions of the issue body. */
export function newTicks(before: string, after: string): string[] {
  const ticked = (s: string) => new Set([...s.matchAll(/^\s*[-*] \[[xX]\] (q\d+)\b/gm)].map((m) => m[1]));
  const was = ticked(before);
  return [...ticked(after)].filter((id) => !was.has(id));
}

export interface Outcome { applied: string[]; conflicts: string[]; errors: string[] }

/** Writes decisions into open rows. The first decision wins: a decided row is never overwritten. */
export function applyCommands(rows: QueueRow[], commands: Command[]): Outcome {
  const out: Outcome = { applied: [], conflicts: [], errors: [] };
  for (const c of commands) {
    const r = rows.find((x) => x.id === c.id);
    if (!r) { out.errors.push(`${c.id}: no such item in the queue`); continue; }
    if (r.decision) { out.conflicts.push(`${c.id}: already decided (${r.decision}${r.decision_note ? `: ${r.decision_note}` : ''}); the first decision stands`); continue; }
    if (c.op === 'quote' && r.kind !== 'blocked-source') { out.errors.push(`${c.id}: quote is for blocked sources; this item is ${r.kind}`); continue; }
    if (c.op === 'approve') { r.decision = 'approve'; out.applied.push(`${c.id}: approve`); }
    else if (c.op === 'skip') { r.decision = 'skip'; out.applied.push(`${c.id}: skip`); }
    else if (c.op === 'reject') { r.decision = 'reject'; r.decision_note = c.reason; out.applied.push(`${c.id}: reject (${c.reason})`); }
    else if (c.op === 'edit') { r.decision = 'edit'; r.decision_note = c.assignments; out.applied.push(`${c.id}: edit ${c.assignments}`); }
    else if (c.op === 'quote') { r.decision = 'approve'; r.decision_note = `quote="${c.text.replace(/(["\\])/g, '\\$1')}"`; out.applied.push(`${c.id}: quote stored as evidence`); }
  }
  return out;
}
