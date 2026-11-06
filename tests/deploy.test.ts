import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cycleStart, decide, type NetlifyDeploy } from '../scripts/deploy-gate.ts';

const prod = (day: string, sha = 'old', state = 'ready'): NetlifyDeploy => ({ context: 'production', state, created_at: `${day}T10:00:00Z`, published_at: state === 'ready' ? `${day}T10:01:00Z` : null, commit_ref: sha });
const base = { now: new Date('2026-11-20T06:17:00Z'), cycleStartDay: 4, cap: 16, mainSha: 'new', force: false, overrideCap: false };

describe('deploy gate', () => {
  it('finds the billing cycle start, clamping short months', () => {
    expect(cycleStart(new Date('2026-11-20T00:00:00Z'), 4).toISOString().slice(0, 10)).toBe('2026-11-04');
    expect(cycleStart(new Date('2026-11-02T00:00:00Z'), 4).toISOString().slice(0, 10)).toBe('2026-10-04');
    expect(cycleStart(new Date('2027-03-01T00:00:00Z'), 31).toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('deploys when main changed and budget remains, counting only this cycle\'s ready production deploys', () => {
    const deploys = [prod('2026-11-05'), prod('2026-11-06', 'x', 'error'), prod('2026-10-30'), { ...prod('2026-11-07'), context: 'deploy-preview' }];
    const d = decide({ ...base, deploys });
    expect(d).toMatchObject({ deploy: true, used: 1 });
  });

  it('skips when production already runs main, unless forced', () => {
    const deploys = [prod('2026-11-05', 'new')];
    expect(decide({ ...base, deploys })).toMatchObject({ deploy: false });
    expect(decide({ ...base, deploys, force: true })).toMatchObject({ deploy: true });
  });

  it('stops at the cap with a blocker, unless overridden', () => {
    const deploys = Array.from({ length: 16 }, (_, i) => prod(`2026-11-${String(5 + i).padStart(2, '0')}`));
    const d = decide({ ...base, deploys });
    expect(d.deploy).toBe(false);
    expect(d.blocker).toContain('16 of 16 production deploys used this cycle (since 2026-11-04, 240 credits)');
    expect(decide({ ...base, deploys, overrideCap: true }).deploy).toBe(true);
  });
});

describe('netlify ignore command', () => {
  const run = (env: Record<string, string>) => {
    try { execFileSync('bash', ['scripts/netlify-ignore.sh'], { env: { PATH: process.env.PATH!, ...env }, stdio: 'pipe' }); return 'skip'; } catch { return 'build'; }
  };
  it('builds previews and hook builds, skips every other production build', () => {
    expect(run({ CONTEXT: 'deploy-preview' })).toBe('build');
    expect(run({ CONTEXT: 'production', INCOMING_HOOK_TITLE: 'Scheduled deploy' })).toBe('build');
    expect(run({ CONTEXT: 'production' })).toBe('skip');
  });
});
