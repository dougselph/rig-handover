export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null; // null kept as null; the VIEW shows it as "—", not the reader
  runs: number; // count of parsed lines for this job
  retries: number; // count of lines with status 'retry'
  lastStatus: DigestStatus;
  lastError: string | null; // error of the MOST RECENT line (by `at`) that carried an `error`, else null
  first: string; // earliest `at` for the job, kept verbatim (keep the offset, never convert — styleguide)
  last: string; // latest `at` for the job, kept verbatim
};

export type Night = {
  night: string;
  rows: DigestRow[]; // one per job, SORTED BY job ascending (page and JSON both use this order)
  badLines: number; // lines that did not parse — counted, never thrown
};

// The reader's signature is the contract; the implementation lives in read-night.ts
// (re-exported from index.ts). `declare` keeps this file type-only, no runtime.
export declare function readNight(runsDir: string, night: string): Night | null;
