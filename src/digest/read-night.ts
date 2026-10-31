import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, Night } from './types.js';

const STATUSES: ReadonlySet<string> = new Set<DigestStatus>(['ok', 'retry', 'fail']);

// One parsed run-log line. Only the fields we keep; `at` is verbatim from the log.
type RunLine = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Parse+validate one line at the edge. Returns null for anything we won't trust.
function parseLine(line: string): RunLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(raw)) return null;

  const { at, job, status, owner, error } = raw;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.has(status)) return null;
  if (!(typeof owner === 'string' || owner === null)) return null;
  if (!(error === undefined || typeof error === 'string')) return null;

  return {
    at,
    job,
    status: status as DigestStatus,
    owner,
    error: error ?? null,
  };
}

// Mutable fold state for one job; collapsed into a DigestRow at the end.
type Acc = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  latest: RunLine; // chronologically latest line seen (by `at`)
  latestError: RunLine | null; // latest line seen that carried an `error`
  first: RunLine; // chronologically earliest line seen
};

// `at` carries an offset; compare by instant, keep the string verbatim.
function instant(at: string): number {
  return Date.parse(at);
}

function fold(acc: Acc, line: RunLine): void {
  acc.runs += 1;
  if (line.status === 'retry') acc.retries += 1;

  const t = instant(line.at);
  if (t > instant(acc.latest.at)) {
    acc.latest = line;
    acc.owner = line.owner;
  }
  if (t < instant(acc.first.at)) acc.first = line;
  if (line.error !== null && (acc.latestError === null || t >= instant(acc.latestError.at))) {
    acc.latestError = line;
  }
}

function toRow(acc: Acc): DigestRow {
  return {
    job: acc.job,
    owner: acc.owner,
    runs: acc.runs,
    retries: acc.retries,
    lastStatus: acc.latest.status,
    lastError: acc.latestError?.error ?? null,
    first: acc.first.at,
    last: acc.latest.at,
  };
}

export function readNight(runsDir: string, night: string): Night | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null; // no file → the route 404s
  }

  const accs = new Map<string, Acc>();
  let badLines = 0;
  const totals = { ok: 0, retry: 0, fail: 0 };

  for (const rawLine of text.split('\n')) {
    if (rawLine.trim() === '') continue; // blank/whitespace lines are ignored, not counted
    const line = parseLine(rawLine);
    if (line === null) {
      badLines += 1;
      continue;
    }
    totals[line.status] += 1;
    const existing = accs.get(line.job);
    if (existing === undefined) {
      accs.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        latest: line,
        latestError: line.error !== null ? line : null,
        first: line,
      });
    } else {
      fold(existing, line);
    }
  }

  const rows = [...accs.values()].map(toRow).sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, totals, badLines };
}
