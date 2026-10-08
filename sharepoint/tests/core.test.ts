import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-ignore - plain JS helper
import { startMock } from './mockSharePoint.mjs';
import { rowToProcess, trackFor, ratingFromReference } from '../spfx/src/core/catalogue';
import { diff, recordKey } from '../spfx/src/core/diff';
import { SpStore } from '../spfx/src/core/store';
import type { AssessmentState, Http, StoreConfig } from '../spfx/src/core/types';

const catalogue = JSON.parse(readFileSync(new URL('./fixtures/catalogue.json', import.meta.url), 'utf8'));
const builtin = JSON.parse(readFileSync(new URL('./fixtures/builtin-processes.json', import.meta.url), 'utf8'));

const fetchHttp: Http = {
  request: async (method, url, body, headers) => {
    const r = await fetch(url, { method, body, headers });
    return { ok: r.ok, status: r.status, json: () => r.json(), text: () => r.text() };
  }
};
const cfg = (webUrl: string, who = 'Asha Rao'): StoreConfig => ({
  webUrl, catalogueList: 'Fit Gap Process Catalogue', assessmentsList: 'Fit Gap Assessments',
  recordsList: 'Fit Gap Assessment Records', userName: who, userEmail: who.toLowerCase().replace(' ', '.') + '@example.com'
});
const rec = (pid: string, v: number, rating: 'F' | 'P' | 'N', comment = '', by = 'Asha Rao', at = 1760000000000 + v) =>
  ({ processId: pid, rating, comment, assessedBy: by, assessedAt: at, version: v });
const assessment = (id: string, name: string, hist: AssessmentState['hist']): AssessmentState => {
  const ratings: AssessmentState['ratings'] = {};
  for (const p of Object.keys(hist)) ratings[p] = hist[p][hist[p].length - 1].rating;
  return { id, name, templateId: 'fitgap-catalogue', templateVersion: '1.0', createdAt: 1760000000000, updatedAt: 1760000000000, ratings, hist };
};

test('every catalogue row maps onto the dashboard process the old built-in list had (same order, track, L1-L5, reference)', () => {
  const mapped = catalogue.rows.map((r: any) => rowToProcess(r));
  assert.equal(mapped.length, 399);
  assert.equal(builtin.length, 399);
  const l5Differs: string[] = [];
  const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 399; i++) {
    const m = mapped[i], b = builtin[i];
    assert.equal(m.t, b.t, `track row ${i} ${m.id}`);
    for (const k of ['l1', 'l2', 'l4']) assert.equal(norm(m[k]), norm(b[k]), `${k} row ${i}`);
    // the catalogue fills in L3 for the 7 Logistics Execution rows that were blank in the old list
    if (norm(b.l3)) assert.equal(norm(m.l3), norm(b.l3), `l3 row ${i}`); else assert.equal(m.t, 'LE');
    if (norm(m.l5).indexOf(norm(b.l5)) !== 0) l5Differs.push(m.id);
    assert.equal(m.ref, b.ref, `ref row ${i}`);
  }
  // The catalogue author reworded the L5 text of 8 rows compared with the old built-in list; that is a content edit, not a mapping error.
  assert.ok(l5Differs.length <= 10, 'unexpected L5 differences: ' + l5Differs.join(','));
  assert.equal(new Set(mapped.map((m: any) => m.id)).size, 399);
});

test('tracks and reference ratings', () => {
  assert.equal(rowToProcess({ 'Process ID': 'X', 'L1 Process': 'Order to Cash', 'L5 Process': 'a_x000D_\nb' })!.l5, 'a\nb');
  assert.equal(trackFor('  Record-to-Report '), 'RTR');
  assert.equal(trackFor('Asset Accounting'), 'RTR');
  assert.equal(trackFor('Quality Management (QM)'), 'QM');
  assert.equal(trackFor('Something new'), 'GEN');
  assert.equal(ratingFromReference('FIT'), 'F');
  assert.equal(ratingFromReference('Partial FIT'), 'P');
  assert.equal(ratingFromReference('No Fit'), 'N');
  assert.equal(ratingFromReference(''), '');
  assert.equal(rowToProcess({ 'Process ID': 'X-1', Active: 'No' }), null);
  assert.equal(rowToProcess({ 'Process ID': 'X-1', 'L1 Process': 'Order to Cash', 'L5 Process': 'a', 'L6 Process': 'b' })!.l5, 'a\nb');
});

test('diff: new, unchanged, renamed, edited and deleted assessments', () => {
  const a = assessment('a1', 'First', { 'P-1': [rec('P-1', 1, 'P', 'gap')] });
  const snap = { assessments: {}, records: {} } as any;
  let ops = diff(snap, { assessments: { a1: a } });
  assert.equal(ops.createAssessments.length, 1);
  assert.equal(ops.createRecords.length, 1);

  snap.assessments.a1 = { itemId: 1, name: 'First', templateId: 'fitgap-catalogue' };
  snap.records[recordKey('a1', 'P-1', 1)] = { itemId: 5, rating: 'P', comment: 'gap', editedAt: 0 };
  ops = diff(snap, { assessments: { a1: a } });
  assert.deepEqual([ops.createAssessments.length, ops.createRecords.length, ops.updateRecords.length, ops.deleteAssessments.length], [0, 0, 0, 0]);

  a.name = 'Renamed';
  a.hist['P-1'].push(rec('P-1', 2, 'F'));
  a.hist['P-1'][0] = { ...a.hist['P-1'][0], comment: 'gap (fixed typo)', editedAt: 99, editedBy: 'Asha Rao' };
  ops = diff(snap, { assessments: { a1: a } });
  assert.equal(ops.renameAssessments.length, 1);
  assert.equal(ops.createRecords.length, 1);
  assert.equal(ops.updateRecords.length, 1);

  ops = diff(snap, { assessments: {} });
  assert.equal(ops.deleteAssessments.length, 1);
  assert.equal(ops.deleteRecords.length, 1);

  // history is append-only: a record missing from the app state is not deleted from SharePoint
  const trimmed = { ...a, hist: { 'P-1': [] as any[] } };
  ops = diff(snap, { assessments: { a1: trimmed } });
  assert.equal(ops.deleteRecords.length, 0);
});

test('store: loads the 399-process catalogue (with paging) and round-trips assessments through SharePoint lists', async () => {
  const sp = await startMock({ pageSize: 50 });
  try {
    const store = new SpStore(fetchHttp, cfg(sp.url));
    const first = await store.load();
    const t = first.templates['fitgap-catalogue'];
    assert.equal(t.processes.length, 399);
    assert.equal(t.processes[0].id, 'BPML-0001');
    assert.equal(t.processes[398].id, 'BPML-0399');
    assert.ok(sp.log.filter((l: string) => l.indexOf('/items') > 0).length > 8, 'paged through the catalogue');
    assert.deepEqual(first.assessments, {});

    const a = assessment('a-100', 'Plant 1 review', {
      'BPML-0001': [rec('BPML-0001', 1, 'F')],
      'BPML-0002': [rec('BPML-0002', 1, 'P', 'Needs a custom field.'), rec('BPML-0002', 2, 'F', 'Delivered in release 3.')]
    });
    await store.save({ assessments: { 'a-100': a } });

    const items = sp.lists['Fit Gap Assessment Records'].items;
    assert.equal(items.length, 3);
    const v2 = items.find((i: any) => i.Title === 'a-100|BPML-0002|v2');
    assert.equal(v2.Rating, 'Fit');
    assert.equal(v2.AssessedBy, 'Asha Rao');
    assert.equal(v2.AssessedByEmail, 'asha.rao@example.com');
    assert.equal(sp.lists['Fit Gap Assessments'].items[0].Title, 'Plant 1 review');

    // a different user opens the dashboard and sees the same data
    const other = new SpStore(fetchHttp, cfg(sp.url, 'Dilasha Jain'));
    const loaded = await other.load();
    const got = loaded.assessments['a-100'];
    assert.equal(got.name, 'Plant 1 review');
    assert.equal(got.ratings['BPML-0002'], 'F');
    assert.equal(got.hist['BPML-0002'].length, 2);
    assert.equal(got.hist['BPML-0002'][0].comment, 'Needs a custom field.');
    assert.equal(got.hist['BPML-0002'][1].assessedBy, 'Asha Rao');

    // she reassesses (new version) and corrects the old comment in place (edit)
    got.hist['BPML-0001'].push(rec('BPML-0001', 2, 'N', 'Dropped from scope.', 'Dilasha Jain'));
    got.hist['BPML-0002'][1] = { ...got.hist['BPML-0002'][1], comment: 'Delivered in release 3.1', editedAt: 1760000099999, editedBy: 'Dilasha Jain' };
    await other.save({ assessments: { 'a-100': got } });
    const items2 = sp.lists['Fit Gap Assessment Records'].items;
    assert.equal(items2.length, 4);
    const edited = items2.find((i: any) => i.Title === 'a-100|BPML-0002|v2');
    assert.equal(edited.Comment, 'Delivered in release 3.1');
    assert.equal(edited.EditedBy, 'Dilasha Jain');
    const newV = items2.find((i: any) => i.Title === 'a-100|BPML-0001|v2');
    assert.equal(newV.AssessedByEmail, 'dilasha.jain@example.com');

    // rename + delete
    got.name = 'Plant 1 review (final)';
    await other.save({ assessments: { 'a-100': got } });
    assert.equal(sp.lists['Fit Gap Assessments'].items[0].Title, 'Plant 1 review (final)');
    await other.save({ assessments: {} });
    assert.equal(sp.lists['Fit Gap Assessments'].items.length, 0);
    assert.equal(sp.lists['Fit Gap Assessment Records'].items.length, 0);
  } finally { await sp.close(); }
});

test('store: two people reassess the same process at the same time -> second save is a conflict, nothing is overwritten', async () => {
  const sp = await startMock();
  try {
    const a = new SpStore(fetchHttp, cfg(sp.url, 'Asha Rao'));
    const b = new SpStore(fetchHttp, cfg(sp.url, 'Dilasha Jain'));
    await a.load(); await b.load();
    await a.save({ assessments: { x: assessment('x', 'Shared', { 'BPML-0001': [rec('BPML-0001', 1, 'F')] }) } });
    const bState = await b.load();
    const aState = await a.load();

    aState.assessments.x.hist['BPML-0001'].push(rec('BPML-0001', 2, 'P', 'A says partial', 'Asha Rao'));
    bState.assessments.x.hist['BPML-0001'].push(rec('BPML-0001', 2, 'N', 'B says no fit', 'Dilasha Jain'));
    await a.save({ assessments: aState.assessments });
    await assert.rejects(b.save({ assessments: bState.assessments }), (e: any) => e.conflict === true);

    const items = sp.lists['Fit Gap Assessment Records'].items.filter((i: any) => i.Title === 'x|BPML-0001|v2');
    assert.equal(items.length, 1);
    assert.equal(items[0].Comment, 'A says partial');
  } finally { await sp.close(); }
});

test('store: editing a record somebody else already changed is refused', async () => {
  const sp = await startMock();
  try {
    const a = new SpStore(fetchHttp, cfg(sp.url, 'Asha Rao'));
    const b = new SpStore(fetchHttp, cfg(sp.url, 'Dilasha Jain'));
    await a.load(); await b.load();
    await a.save({ assessments: { x: assessment('x', 'Shared', { 'BPML-0001': [rec('BPML-0001', 1, 'P', 'original')] }) } });
    const sa = await a.load(); const sb = await b.load();
    sa.assessments.x.hist['BPML-0001'][0] = { ...sa.assessments.x.hist['BPML-0001'][0], comment: 'A fixed it', editedAt: 1760000050000, editedBy: 'Asha Rao' };
    sb.assessments.x.hist['BPML-0001'][0] = { ...sb.assessments.x.hist['BPML-0001'][0], comment: 'B fixed it', editedAt: 1760000060000, editedBy: 'Dilasha Jain' };
    await a.save({ assessments: sa.assessments });
    await assert.rejects(b.save({ assessments: sb.assessments }), (e: any) => e.conflict === true);
    assert.equal(sp.lists['Fit Gap Assessment Records'].items[0].Comment, 'A fixed it');
  } finally { await sp.close(); }
});

test('store: lists created by an Excel import (headers with spaces, every column plain text) work the same', async () => {
  const sp = await startMock({ excelStyleLists: true });
  try {
    const store = new SpStore(fetchHttp, cfg(sp.url));
    await store.load();
    const a = assessment('x1', 'Imported lists', { 'BPML-0001': [rec('BPML-0001', 1, 'P', 'gap'), rec('BPML-0001', 2, 'F', 'fixed')] });
    await store.save({ assessments: { x1: a } });
    const items = sp.lists['Fit Gap Assessment Records'].items;
    assert.equal(items.length, 2);
    assert.equal(items[1]['Assessed_x0020_By'], 'Asha Rao');
    assert.equal(items[1]['Version'], '2', 'a text column receives the version as text');
    const back = await new SpStore(fetchHttp, cfg(sp.url, 'Dilasha Jain')).load();
    assert.equal(back.assessments.x1.hist['BPML-0001'].length, 2);
    assert.equal(back.assessments.x1.ratings['BPML-0001'], 'F');
  } finally { await sp.close(); }
});

test('store: a list that is missing a column explains which one', async () => {
  const sp = await startMock();
  try {
    sp.lists['Fit Gap Assessment Records'].fields = sp.lists['Fit Gap Assessment Records'].fields.filter((f: any) => f.InternalName !== 'ProcessID');
    await assert.rejects(new SpStore(fetchHttp, cfg(sp.url)).load(), /missing the column\(s\): ProcessID/);
  } finally { await sp.close(); }
});

test('store: Quality Management rows added to the catalogue appear as a QM track; inactive rows are hidden', async () => {
  const qmRows = JSON.parse(readFileSync(new URL('./fixtures/qm-rows.json', import.meta.url), 'utf8'));
  const inactive = ['BPML-0181', 'BPML-0182', 'BPML-0183', 'BPML-0184', 'BPML-0185', 'BPML-0186', 'BPML-0187', 'BPML-0188', 'BPML-0189', 'BPML-0190', 'BPML-0191', 'BPML-0192'];
  const sp = await startMock({ extraCatalogueRows: qmRows, deactivate: inactive });
  try {
    const data = await new SpStore(fetchHttp, cfg(sp.url)).load();
    const procs = data.templates['fitgap-catalogue'].processes;
    assert.equal(procs.length, 399 + 15 - 12);
    const qm = procs.filter((p) => p.t === 'QM');
    assert.equal(qm.length, 15);
    assert.equal(qm[0].id, 'BPML-0400');
    assert.equal(qm[0].l1, 'Quality Management (QM)');
    assert.equal(qm[0].l4, 'Maintain Master Inspection Characteristics');
    assert.equal(procs.some((p) => p.id === 'BPML-0181'), false);
    assert.equal(procs.filter((p) => p.t === 'PTM').length, 60);
  } finally { await sp.close(); }
});

test('store: catalogue where Process ID was imported into the built-in Title column still loads', async () => {
  const sp = await startMock({ processIdAsTitle: true });
  try {
    const data = await new SpStore(fetchHttp, cfg(sp.url)).load();
    assert.equal(data.templates['fitgap-catalogue'].processes.length, 399);
    assert.equal(data.templates['fitgap-catalogue'].processes[0].id, 'BPML-0001');
  } finally { await sp.close(); }
});

test('store: clear errors for a missing list and for no permission', async () => {
  const sp = await startMock();
  try {
    const bad = { ...cfg(sp.url), recordsList: 'Nope' };
    await assert.rejects(new SpStore(fetchHttp, bad).load(), /list not found/i);
    sp.failures.push({ match: /GET .*Fit%20Gap%20Assessments|GET .*Fit Gap Assessments/, status: 403, body: 'Access denied' });
    await assert.rejects(new SpStore(fetchHttp, cfg(sp.url)).load(), /permission/i);
  } finally { await sp.close(); }
});
