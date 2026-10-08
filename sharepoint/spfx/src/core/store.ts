import { CATALOGUE_COLUMNS, rowToProcess } from './catalogue';
import { diff, recordKey, Snapshot } from './diff';
import { SpRest } from './spRest';
import {
  AppState, AssessmentState, Http, HistRecord, Rating, RATING_TEXT, SpError, StoreConfig, Template
} from './types';


const squash = (v: string): string => v.toLowerCase().replace(/_x0020_|[\s_]+/g, '');

interface ColInfo { internal: string; type: string; }
type Cols = { [canonical: string]: ColInfo };

/** Coerces a value to what the SharePoint column type expects (text columns need strings, number columns numbers). */
function coerce(type: string, v: any): any {
  if (v === undefined || v === null) return null;
  if (type === 'Number' || type === 'Integer' || type === 'Currency') return Number(v);
  if (type === 'Text' || type === 'Note' || type === 'Choice') return String(v);
  return v;
}

const CODE_BY_TEXT: { [text: string]: Rating } = { 'fit': 'F', 'partial fit': 'P', 'not fit': 'N', 'not applicable': 'A' };
const ms = (v: any): number => { const t = v ? Date.parse(v) : NaN; return isNaN(t) ? 0 : t; };

export interface LoadedData {
  templates: { [id: string]: Template };
  assessments: { [id: string]: AssessmentState };
}

/** Reads the catalogue and assessments from SharePoint lists and writes changes back. */
export class SpStore {
  private rest: SpRest;
  private snap: Snapshot = { assessments: {}, records: {} };
  private cols: { [list: string]: Cols } = {};
  private queue: Promise<void> = Promise.resolve();

  constructor(http: Http, private cfg: StoreConfig) {
    this.rest = new SpRest(http, cfg.webUrl);
  }

  public async load(): Promise<LoadedData> {
    const [aCols, rCols] = await Promise.all([
      this.resolve(this.cfg.assessmentsList, ['Title', 'AssessmentKey', 'TemplateId', 'TemplateVersion']),
      this.resolve(this.cfg.recordsList, ['Title', 'AssessmentKey', 'ProcessID', 'Rating', 'Comment', 'Version',
        'AssessedBy', 'AssessedByEmail', 'AssessedAt', 'EditedAt', 'EditedBy'])
    ]);
    const [template, rawAssessments, rawRecords] = await Promise.all([
      this.loadCatalogue(),
      this.rest.getAll(this.cfg.assessmentsList, ['Id', 'Created'].concat(Object.keys(aCols).map(function (k) { return aCols[k].internal; }))),
      this.rest.getAll(this.cfg.recordsList, ['Id'].concat(Object.keys(rCols).map(function (k) { return rCols[k].internal; })))
    ]);
    const assessmentItems = rawAssessments.map(function (it) { return canonical(it, aCols); });
    const recordItems = rawRecords.map(function (it) { return canonical(it, rCols); });

    this.snap = { assessments: {}, records: {} };
    const assessments: { [id: string]: AssessmentState } = {};
    for (const it of assessmentItems) {
      const id = String(it.AssessmentKey || '').trim();
      if (!id) continue;
      this.snap.assessments[id] = { itemId: it.Id, name: it.Title || '', templateId: it.TemplateId || '' };
      assessments[id] = {
        id,
        name: it.Title || id,
        templateId: it.TemplateId || template.id,
        templateVersion: it.TemplateVersion || template.version,
        createdAt: ms(it.Created) || Date.now(),
        updatedAt: ms(it.Created) || Date.now(),
        ratings: {},
        hist: {}
      };
    }

    for (const it of recordItems) {
      const id = String(it.AssessmentKey || '').trim();
      const a = assessments[id];
      const code = CODE_BY_TEXT[String(it.Rating || '').toLowerCase()];
      if (!a || !code) continue;
      const rec: HistRecord = {
        processId: String(it.ProcessID || ''),
        rating: code,
        comment: it.Comment || '',
        assessedBy: it.AssessedBy || '',
        assessedAt: ms(it.AssessedAt),
        version: Number(it.Version) || 1,
        ...(it.EditedAt ? { editedAt: ms(it.EditedAt), editedBy: it.EditedBy || '' } : {})
      };
      (a.hist[rec.processId] = a.hist[rec.processId] || []).push(rec);
      this.snap.records[recordKey(id, rec.processId, rec.version)] = {
        itemId: it.Id, rating: code, comment: rec.comment, editedAt: rec.editedAt || 0
      };
      a.updatedAt = Math.max(a.updatedAt, rec.editedAt || rec.assessedAt || 0);
    }
    for (const id of Object.keys(assessments)) {
      const a = assessments[id];
      for (const pid of Object.keys(a.hist)) {
        a.hist[pid].sort(function (x, y) { return x.version - y.version; });
        a.ratings[pid] = a.hist[pid][a.hist[pid].length - 1].rating;
      }
    }
    return { templates: { [template.id]: template }, assessments };
  }

  /**
   * Finds the real (internal) column names, so the lists work whether the columns were created by script
   * ("AssessmentKey") or by an Excel import ("Assessment Key" -> Assessment_x0020_Key).
   */
  private async resolve(listTitle: string, wanted: string[]): Promise<Cols> {
    const all = await this.rest.fields(listTitle);
    const index: { [k: string]: ColInfo } = {};
    for (const f of all) {
      index[squash(f.internal)] = { internal: f.internal, type: f.type };
      if (!index[squash(f.title)]) index[squash(f.title)] = { internal: f.internal, type: f.type };
    }
    const cols: Cols = {};
    const missing: string[] = [];
    for (const name of wanted) {
      const hit = index[squash(name)];
      if (hit) cols[name] = hit; else missing.push(name);
    }
    if (missing.length) {
      throw new SpError('The list "' + listTitle + '" is missing the column(s): ' + missing.join(', ') + '.', 0);
    }
    this.cols[listTitle] = cols;
    return cols;
  }

  private toFields(listTitle: string, values: { [canonical: string]: any }): { [internal: string]: any } {
    const cols = this.cols[listTitle];
    const out: { [k: string]: any } = {};
    for (const k of Object.keys(values)) out[cols[k].internal] = coerce(cols[k].type, values[k]);
    return out;
  }

  private async loadCatalogue(): Promise<Template> {
    const map = await this.rest.fieldMap(this.cfg.catalogueList);
    const internal: { [display: string]: string } = {};
    for (const col of CATALOGUE_COLUMNS) {
      if (map[col]) internal[col] = map[col];
    }
    // When SharePoint maps the first Excel column onto the built-in Title column, Process ID is stored in "Title".
    if (!internal['Process ID']) internal['Process ID'] = 'Title';
    const required = ['L1 Process', 'L2 Process', 'L3 Process'];
    for (const col of required) {
      if (!internal[col]) throw new SpError('The catalogue list is missing the column "' + col + '".', 0);
    }
    const select = ['Id'];
    for (const col of Object.keys(internal)) if (select.indexOf(internal[col]) < 0) select.push(internal[col]);
    const items = await this.rest.getAll(this.cfg.catalogueList, select);

    const processes = [];
    const seen: { [id: string]: boolean } = {};
    for (const it of items) {
      const row: { [k: string]: any } = {};
      for (const col of Object.keys(internal)) row[col] = it[internal[col]];
      const p = rowToProcess(row);
      if (!p || seen[p.id]) continue;
      seen[p.id] = true;
      processes.push({ p, order: it.Id as number });
    }
    processes.sort(function (a, b) { return a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0; });
    if (!processes.length) throw new SpError('The catalogue list "' + this.cfg.catalogueList + '" has no active processes.', 0);

    return {
      id: 'fitgap-catalogue',
      name: this.cfg.catalogueList,
      version: '1.0',
      builtIn: true,
      description: 'Process catalogue read from the SharePoint list "' + this.cfg.catalogueList + '".',
      createdAt: Date.UTC(2026, 9, 1),
      processes: processes.map(function (x) { return x.p; })
    };
  }

  /** Saves are serialised so two quick edits never race each other. */
  public save(state: AppState): Promise<void> {
    const run = this.queue.then(() => this.apply(state));
    this.queue = run.catch(function () { /* keep the chain alive */ });
    return run;
  }

  private async apply(state: AppState): Promise<void> {
    const ops = diff(this.snap, state);
    const c = this.cfg;

    for (const a of ops.createAssessments) {
      const itemId = await this.rest.create(c.assessmentsList, this.toFields(c.assessmentsList, {
        Title: a.name, AssessmentKey: a.id, TemplateId: a.templateId, TemplateVersion: a.templateVersion || ''
      }));
      this.snap.assessments[a.id] = { itemId, name: a.name, templateId: a.templateId };
    }
    for (const r of ops.renameAssessments) {
      await this.rest.update(c.assessmentsList, r.itemId, this.toFields(c.assessmentsList, { Title: r.name }));
      this.snap.assessments[r.id].name = r.name;
    }

    await runPool(ops.createRecords, 4, async (op) => {
      const rec = op.rec;
      const key = recordKey(op.assessmentId, rec.processId, rec.version);
      const mine = rec.assessedBy === c.userName;
      const itemId = await this.rest.create(c.recordsList, this.toFields(c.recordsList, {
        Title: key,
        AssessmentKey: op.assessmentId,
        ProcessID: rec.processId,
        Rating: RATING_TEXT[rec.rating],
        Comment: rec.comment || '',
        Version: rec.version,
        AssessedBy: rec.assessedBy || c.userName,
        AssessedByEmail: mine || !rec.assessedBy ? c.userEmail : '',
        AssessedAt: new Date(rec.assessedAt || Date.now()).toISOString()
      }));
      this.snap.records[key] = { itemId, rating: rec.rating, comment: rec.comment || '', editedAt: 0 };
    });

    for (const u of ops.updateRecords) {
      // Optimistic concurrency: refuse to overwrite a record somebody else edited since we loaded it.
      const rc = this.cols[c.recordsList];
      const raw = await this.rest.getItem(c.recordsList, u.itemId, [rc.Rating.internal, rc.Comment.internal, rc.EditedAt.internal]);
      const server = { Rating: raw[rc.Rating.internal], Comment: raw[rc.Comment.internal], EditedAt: raw[rc.EditedAt.internal] };
      const known = this.snap.records[u.key];
      const sameRating = String(server.Rating || '').toLowerCase() === RATING_TEXT[known.rating].toLowerCase();
      if (!sameRating || (server.Comment || '') !== known.comment || ms(server.EditedAt) !== (known.editedAt || 0)) {
        throw new SpError('Someone else changed this assessment while you were editing it.', 409, true);
      }
      await this.rest.update(c.recordsList, u.itemId, this.toFields(c.recordsList, {
        Rating: RATING_TEXT[u.rec.rating],
        Comment: u.rec.comment || '',
        EditedAt: new Date(u.rec.editedAt || Date.now()).toISOString(),
        EditedBy: u.rec.editedBy || c.userName
      }));
      this.snap.records[u.key] = { itemId: u.itemId, rating: u.rec.rating, comment: u.rec.comment || '', editedAt: u.rec.editedAt || 0 };
    }

    for (const d of ops.deleteRecords) {
      await this.rest.remove(c.recordsList, d.itemId);
      delete this.snap.records[d.key];
    }
    for (const d of ops.deleteAssessments) {
      await this.rest.remove(c.assessmentsList, d.itemId);
      delete this.snap.assessments[d.id];
    }
  }
}

function canonical(item: any, cols: Cols): any {
  const out: any = { Id: item.Id, Created: item.Created };
  for (const k of Object.keys(cols)) out[k] = item[cols[k].internal];
  return out;
}

async function runPool<T>(items: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  let failure: any = null;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < size; w++) {
    workers.push((async () => {
      while (!failure && i < items.length) {
        const item = items[i++];
        try { await fn(item); } catch (e) { failure = failure || e; }
      }
    })());
  }
  await Promise.all(workers);
  if (failure) throw failure;
}
