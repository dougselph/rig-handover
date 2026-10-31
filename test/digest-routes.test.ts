import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

let runsDir = '';

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

const line = (at: string, job: string, status: string, owner: string, error?: string): string =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  const normal = [
    line('2026-02-01T01:00:00+01:00', 'alpha/backup', 'ok', 'rook'),
    line('2026-02-01T02:00:00+01:00', 'beta/sync', 'retry', 'lane-07', 'timeout'),
    line('2026-02-01T03:00:00+01:00', 'beta/sync', 'fail', 'lane-07', 'boom'),
  ];
  writeFileSync(join(runsDir, '2026-02-01.jsonl'), normal.join('\n') + '\n');
  writeFileSync(join(runsDir, '2026-02-02.jsonl'), '');
  const bad = [
    line('2026-02-03T01:00:00+01:00', 'alpha/backup', 'ok', 'rook'),
    '{"at":"2026-02-03T02:00:00+01:00","job":"trunc',
    line('2026-02-03T03:00:00+01:00', 'beta/sync', 'ok', 'lane-07'),
  ];
  writeFileSync(join(runsDir, '2026-02-03.jsonl'), bad.join('\n') + '\n');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page route', () => {
  it('renders an existing night', async () => {
    const res = await app().request('/digest/2026-02-01');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('alpha/backup');
    expect(html).toContain('beta/sync');
  });

  it('404s on a missing night', async () => {
    const res = await app().request('/digest/2026-02-09');
    expect(res.status).toBe(404);
  });

  it('says nothing ran on an empty night', async () => {
    const res = await app().request('/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders a night with a bad line', async () => {
    const res = await app().request('/digest/2026-02-03');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('alpha/backup');
  });
});

describe('digest JSON route', () => {
  it('returns rows for an existing night', async () => {
    const res = await app().request('/api/digest/2026-02-01');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-02-01');
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/backup', 'beta/sync']);
    expect(body.totals).toEqual({ ok: 1, retry: 1, fail: 1 });
    expect(body.badLines).toBe(0);
  });

  it('404s on a missing night', async () => {
    const res = await app().request('/api/digest/2026-02-09');
    expect(res.status).toBe(404);
  });

  it('returns empty rows for an empty night', async () => {
    const res = await app().request('/api/digest/2026-02-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
  });

  it('counts bad lines and keeps the good rows', async () => {
    const res = await app().request('/api/digest/2026-02-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBeGreaterThanOrEqual(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/backup', 'beta/sync']);
  });
});
