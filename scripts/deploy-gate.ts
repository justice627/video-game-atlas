// Decides whether the scheduled production deploy goes ahead (.github/workflows/deploy.yml).
// Netlify Free: 300 credits a month, a hard limit (sites pause when they run out); a production
// deploy costs 15, previews are free, traffic costs the rest (20 credits/GB, 2 per 10,000 requests).
// The gate counts this billing cycle's production deploys through the Netlify API and stops at
// the cap, skips when production already runs main, and never deploys without both secrets.
import { appendFileSync } from 'node:fs';

export interface NetlifyDeploy { context: string; state: string; created_at: string; published_at?: string | null; commit_ref?: string | null }
export interface GateInput {
  now: Date; cycleStartDay: number; cap: number; mainSha: string;
  force: boolean; overrideCap: boolean; deploys: NetlifyDeploy[];
}
export type Decision = { deploy: boolean; reason: string; blocker?: string; used: number };

/** Start of the billing cycle containing `now`, given the day of month it starts on (UTC). */
export function cycleStart(now: Date, day: number): Date {
  const at = (y: number, m: number) => new Date(Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
  const thisMonth = at(now.getUTCFullYear(), now.getUTCMonth());
  return now >= thisMonth ? thisMonth : at(now.getUTCFullYear(), now.getUTCMonth() - 1);
}

export function decide(i: GateInput): Decision {
  const start = cycleStart(i.now, i.cycleStartDay);
  const prod = i.deploys.filter((d) => d.context === 'production');
  const used = prod.filter((d) => d.state === 'ready' && new Date(d.created_at) >= start).length;
  const live = prod.filter((d) => d.state === 'ready' && d.published_at).sort((a, b) => b.published_at!.localeCompare(a.published_at!))[0];
  const budget = `${used} of ${i.cap} production deploys used this cycle (since ${start.toISOString().slice(0, 10)}, ${used * 15} credits)`;
  if (live?.commit_ref === i.mainSha && !i.force) return { deploy: false, reason: `production already runs main (${i.mainSha.slice(0, 7)}); ${budget}`, used };
  if (used >= i.cap && !i.overrideCap)
    return { deploy: false, reason: `deploy budget reached: ${budget}`, used,
      blocker: `The scheduled deploy stopped: ${budget}. Production stays on ${live?.commit_ref?.slice(0, 7) ?? 'its last deploy'} until the next cycle. To ship anyway, run the Deploy workflow by hand with "override cap" (15 credits each; the site pauses at 300).` };
  return { deploy: true, reason: `deploying ${i.mainSha.slice(0, 7)}; ${budget} before this one`, used };
}

async function main() {
  const env = (k: string) => process.env[k]?.trim() || undefined;
  const out = (k: string, v: string) => { if (env('GITHUB_OUTPUT')) appendFileSync(env('GITHUB_OUTPUT')!, `${k}<<EOF\n${v}\nEOF\n`); };
  const summary = (s: string) => { console.log(s); if (env('GITHUB_STEP_SUMMARY')) appendFileSync(env('GITHUB_STEP_SUMMARY')!, s + '\n'); };
  const stop = (reason: string, blocker?: string) => { summary(`Skipped: ${reason}`); out('deploy', 'false'); if (blocker) out('blocker', blocker); };

  const hook = env('NETLIFY_BUILD_HOOK'), token = env('NETLIFY_AUTH_TOKEN');
  const missing = [!hook && 'NETLIFY_BUILD_HOOK', !token && 'NETLIFY_AUTH_TOKEN'].filter(Boolean);
  if (missing.length) return stop(`missing secret(s) ${missing.join(', ')}`,
    `The scheduled Netlify deploy can't run: add the repository secret(s) ${missing.join(' and ')} (Settings → Secrets and variables → Actions). NETLIFY_BUILD_HOOK is the URL of a build hook (Netlify: Project configuration → Build & deploy → Build hooks); NETLIFY_AUTH_TOKEN is a personal access token (User settings → Applications), used read-only to count this cycle's deploys. Without them nothing deploys, which costs no credits.`);
  const site = env('NETLIFY_SITE') ?? 'video-game-atlas.netlify.app';
  const api = (path: string) => fetch(`https://api.netlify.com/api/v1/${path}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'video-game-atlas-deploy' } });
  // Resolve the site to its ID first, so a failure says whether the token or the site is wrong.
  // The repository is public, so logs never print account details or other sites' names.
  const found = await api(`sites/${encodeURIComponent(site)}`);
  if (!found.ok) {
    const me = await api('user');
    const why = me.ok
      ? `the token is valid, but its account can't see the site "${site}" (HTTP ${found.status}). Set the repository variable NETLIFY_SITE to the Project ID from Netlify (Project configuration → General → Project details), or create the token from the account that owns the site.`
      : `NETLIFY_AUTH_TOKEN was refused (HTTP ${me.status}): it may be mistyped, expired or revoked. Create a new personal access token (Netlify: User settings → Applications) and update the secret.`;
    return stop(`could not resolve the Netlify site: ${why}`, `The scheduled deploy couldn't read the deploy history: ${why} Nothing was deployed.`);
  }
  const siteId = ((await found.json()) as { id: string }).id;
  const deploys: NetlifyDeploy[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await api(`sites/${siteId}/deploys?per_page=100&page=${page}`);
    if (!res.ok) return stop(`Netlify API returned ${res.status} listing deploys`, `The scheduled deploy couldn't list the site's deploys (HTTP ${res.status}). Check that NETLIFY_AUTH_TOKEN has access to the site. Nothing was deployed.`);
    const batch = (await res.json()) as NetlifyDeploy[];
    deploys.push(...batch);
    if (batch.length < 100) break;
  }
  const mainSha = env('MAIN_SHA') ?? '';
  const d = decide({
    now: new Date(), cycleStartDay: Number(env('NETLIFY_CYCLE_START_DAY') ?? 1), cap: Number(env('NETLIFY_DEPLOY_CAP') ?? 16),
    mainSha, force: env('FORCE') === 'true', overrideCap: env('OVERRIDE_CAP') === 'true', deploys,
  });
  if (!d.deploy) return stop(d.reason, d.blocker);
  const r = await fetch(`${hook}?trigger_title=${encodeURIComponent(`Scheduled deploy of ${mainSha.slice(0, 7)}`)}`, { method: 'POST' });
  if (!r.ok) return stop(`build hook returned ${r.status}`, `The build hook returned HTTP ${r.status}. Check NETLIFY_BUILD_HOOK. Nothing was deployed.`);
  summary(`Triggered: ${d.reason}`);
  out('deploy', 'true');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
