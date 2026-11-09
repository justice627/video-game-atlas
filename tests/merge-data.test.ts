import { describe, expect, it } from 'vitest';
import { unionBacklog, unionLog, unionQueue } from '../scripts/merge-data.ts';

const H = 'id,kind,decision,decision_note';
describe('data branch conflict resolution', () => {
  it('queue: a decided row beats an open one; otherwise main wins; rows from both sides kept', () => {
    const main = `${H}\nq1,audit,,\nq2,needs-human,approve,\nq3,audit,,`;
    const branch = `${H}\nq1,audit,reject,wrong city\nq2,needs-human,,\nq4,blocked-source,,`;
    expect(unionQueue(branch, main)).toBe(`${H}\nq1,audit,reject,wrong city\nq2,needs-human,approve,\nq3,audit,,\nq4,blocked-source,,\n`);
  });
  it('logs: main first, then branch rows main lacks, no duplicates', () => {
    expect(unionLog('link,result\na,correct\nb,wrong', 'link,result\na,correct\nc,correct')).toBe('link,result\na,correct\nc,correct\nb,wrong\n');
  });
  it('backlog: the higher attempt count, the branch reason', () => {
    expect(unionBacklog('game,reason,attempts\nx,no quote,1\ny,new,0', 'game,reason,attempts\nx,old,2'))
      .toBe('game,reason,attempts\nx,no quote,2\ny,new,0\n');
  });
});
