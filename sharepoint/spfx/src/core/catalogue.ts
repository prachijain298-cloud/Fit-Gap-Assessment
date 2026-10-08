import type { Process, Rating } from './types';

/**
 * The catalogue has no "track" column. The dashboard groups by track (PTP, OTC, PS, PTM, RTR, LE),
 * which is derived from the L1 Process value. Unknown L1 values fall into "GEN" so nothing is dropped.
 */
export const TRACK_BY_L1: { [normalisedL1: string]: string } = {
  'procure to pay': 'PTP',
  'order to cash': 'OTC',
  'project system': 'PS',
  'manufacturing (mfg)': 'PTM',
  'record-to-report': 'RTR',
  'procure-to-pay (accounts payable)': 'RTR',
  'order-to-cash (accounts receivable)': 'RTR',
  'asset accounting': 'RTR',
  'controlling (cca / io / pca)': 'RTR',
  'profitability analysis (co-pa)': 'RTR',
  'fico interfaces': 'RTR',
  'treasury & cash management': 'RTR',
  'product costing': 'RTR',
  'logistics execution': 'LE',
  'quality management (qm)': 'QM',
  'quality management': 'QM'
};

/** Display names of the catalogue columns the dashboard reads. */
export const CATALOGUE_COLUMNS = [
  'Process ID', 'L1 Process', 'L2 Process', 'L3 Process', 'L4 Process', 'L5 Process', 'L6 Process',
  'Reference Fit/Gap', 'Active'
];

const norm = (v: any): string => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim().toLowerCase();
/** Excel writes a stray carriage return as the literal text "_x000D_" in two catalogue cells (BPML-0074); strip it. */
const clean = (v: any): string => (v === null || v === undefined ? '' : String(v)).replace(/_x000D_/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

export function trackFor(l1: string): string {
  return TRACK_BY_L1[norm(l1)] || 'GEN';
}

export function ratingFromReference(v: any): Rating | '' {
  const s = norm(v);
  if (!s) return '';
  if (s === 'fit') return 'F';
  if (s.indexOf('partial') === 0) return 'P';
  if (s === 'not fit' || s === 'no fit') return 'N';
  return '';
}

/** Turns one catalogue list row (keyed by column DISPLAY name) into a dashboard process. */
export function rowToProcess(row: { [displayName: string]: any }): Process | null {
  const id = clean(row['Process ID']);
  if (!id) return null;
  if (norm(row['Active']) === 'no') return null;
  const l1 = clean(row['L1 Process']);
  const l5 = clean(row['L5 Process']);
  const l6 = clean(row['L6 Process']);
  return {
    id,
    t: trackFor(l1),
    l1,
    l2: clean(row['L2 Process']),
    l3: clean(row['L3 Process']),
    l4: clean(row['L4 Process']),
    l5: [l5, l6].filter(function (x) { return !!x; }).join('\n'),
    ref: ratingFromReference(row['Reference Fit/Gap'])
  };
}
