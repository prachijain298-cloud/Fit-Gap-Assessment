import type { AppState, AssessmentState, HistRecord } from './types';

export interface RecordSnap { itemId: number; rating: string; comment: string; editedAt: number; }
export interface AssessmentSnap { itemId: number; name: string; templateId: string; }
export interface Snapshot {
  assessments: { [id: string]: AssessmentSnap };
  records: { [key: string]: RecordSnap };
}

export const recordKey = (assessmentId: string, processId: string, version: number): string =>
  assessmentId + '|' + processId + '|v' + version;

export interface Ops {
  createAssessments: AssessmentState[];
  renameAssessments: { id: string; itemId: number; name: string }[];
  deleteAssessments: { id: string; itemId: number }[];
  createRecords: { assessmentId: string; rec: HistRecord }[];
  updateRecords: { key: string; itemId: number; rec: HistRecord }[];
  deleteRecords: { key: string; itemId: number }[];
}

/**
 * Compares what the app wants stored with what SharePoint already holds.
 * History is append-only: a record that exists on the server is never deleted unless its whole assessment is deleted.
 */
export function diff(snap: Snapshot, state: AppState): Ops {
  const ops: Ops = {
    createAssessments: [], renameAssessments: [], deleteAssessments: [],
    createRecords: [], updateRecords: [], deleteRecords: []
  };
  const ids = Object.keys(state.assessments);

  for (const id of ids) {
    const a = state.assessments[id];
    const s = snap.assessments[id];
    if (!s) ops.createAssessments.push(a);
    else if (s.name !== a.name) ops.renameAssessments.push({ id, itemId: s.itemId, name: a.name });

    for (const pid of Object.keys(a.hist || {})) {
      for (const rec of a.hist[pid]) {
        const key = recordKey(id, pid, rec.version);
        const r = snap.records[key];
        if (!r) ops.createRecords.push({ assessmentId: id, rec });
        else if (r.rating !== rec.rating || r.comment !== (rec.comment || '') || (r.editedAt || 0) !== (rec.editedAt || 0)) {
          ops.updateRecords.push({ key, itemId: r.itemId, rec });
        }
      }
    }
  }

  for (const id of Object.keys(snap.assessments)) {
    if (state.assessments[id]) continue;
    ops.deleteAssessments.push({ id, itemId: snap.assessments[id].itemId });
    const prefix = id + '|';
    for (const key of Object.keys(snap.records)) {
      if (key.indexOf(prefix) === 0) ops.deleteRecords.push({ key, itemId: snap.records[key].itemId });
    }
  }

  ops.createRecords.sort(function (x, y) {
    return x.rec.processId === y.rec.processId ? x.rec.version - y.rec.version : (x.rec.processId < y.rec.processId ? -1 : 1);
  });
  return ops;
}
