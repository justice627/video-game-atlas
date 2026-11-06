// PreToolUse guard for the research subagents (docs/plans/pipeline.md, section 3.3).
// researcher: may write only under data/staging/ and docs/research/.
// fact-checker: may not read the researcher's reasoning (docs/research/, data/staging/) — it judges
// the rows, quotes and evidence on their own.
// Runs from each agent's frontmatter and again from .claude/settings.json (keyed on agent_type),
// so a missing frontmatter hook still leaves one layer. Exit 2 blocks the call.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WRITE = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const READ = new Set(['Read', 'Grep', 'Glob']);

export function guard(input: { tool_name?: string; tool_input?: Record<string, unknown>; agent_type?: string }, agent = input.agent_type, root = ROOT): string | null {
  const tool = input.tool_name ?? '';
  const path = String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? input.tool_input?.path ?? '');
  const rel = path ? relative(root, resolve(root, path)).split('\\').join('/') : '';
  if (agent === 'researcher') {
    if (tool === 'Bash') return 'The researcher has no shell: no git, gh or scripts.';
    if (WRITE.has(tool) && !/^(data\/staging\/[^/]+\/|docs\/research\/)/.test(rel))
      return `The researcher may only write under data/staging/<game-id>/ and docs/research/, not "${rel || path}".`;
  }
  if (agent === 'fact-checker') {
    if (WRITE.has(tool) || tool === 'Bash') return 'The fact-checker is read-only.';
    if (READ.has(tool) && /^(docs\/research\/|data\/staging\/)/.test(rel))
      return `The fact-checker judges rows, quotes and evidence without the researcher's reasoning; "${rel}" is off limits.`;
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const why = guard(input, process.argv[2] || input.agent_type);
  if (why) { process.stderr.write(why + '\n'); process.exit(2); }
}
