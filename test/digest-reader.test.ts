import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/index.js';
import type { DigestRow } from '../src/digest/index.js';

function rowFor(rows: DigestRow[], job: string): DigestRow {
  const row = rows.find((r) => r.job === job);
  if (row === undefined) throw new Error(`no row for ${job}`);
  return row;
}

describe('readNight', () => {
  it('folds the real fixture into one row per job, counting the bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    if (night === null) return;

    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);

    // rows are sorted by job ascending
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const refresh = rowFor(night.rows, 'fixtures/refresh');
    expect(refresh.runs).toBe(4);
    expect(refresh.retries).toBe(3);
    expect(refresh.lastStatus).toBe('ok');
    expect(refresh.lastError).toBe('upstream 503');

    const backup = rowFor(night.rows, 'notes/backup');
    expect(backup.lastStatus).toBe('fail');
    expect(backup.lastError).toBe('quota exceeded');

    const render = rowFor(night.rows, 'digest/render');
    expect(render.owner).toBeNull();

    const sync = rowFor(night.rows, 'lane/sync');
    expect(sync.runs).toBe(8);
    expect(sync.retries).toBe(1);
    expect(sync.lastStatus).toBe('ok');
  });

  it('returns null when the night file is missing', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });
});
