import { Http, HttpResponse, SpError } from './types';

const ODATA = 'application/json;odata=nometadata';

/** Thin wrapper over the SharePoint REST API for list items. */
export class SpRest {
  constructor(private http: Http, private webUrl: string) {
    this.webUrl = webUrl.replace(/\/+$/, '');
  }

  private origin(): string {
    const m = /^(https?:\/\/[^/]+)/i.exec(this.webUrl);
    return m ? m[1] : '';
  }

  public listUrl(title: string): string {
    return this.webUrl + "/_api/web/lists/getbytitle('" + encodeURIComponent(title.replace(/'/g, "''")) + "')";
  }

  private async ensure(res: HttpResponse, what: string): Promise<void> {
    if (res.ok) return;
    let text = '';
    try { text = await res.text(); } catch (e) { /* ignore */ }
    const duplicate = /duplicate/i.test(text) || res.status === 409;
    if (res.status === 404 && /list/i.test(text) && /does not exist/i.test(text)) {
      throw new SpError('SharePoint list not found while ' + what + '. Check the list names in the web part settings.', 404);
    }
    if (res.status === 401 || res.status === 403) {
      throw new SpError('You do not have permission to ' + what + ' in SharePoint (HTTP ' + res.status + ').', res.status);
    }
    throw new SpError('SharePoint rejected the request while ' + what + ' (HTTP ' + res.status + ')' + (duplicate ? ': duplicate value' : '') + '.', res.status, duplicate);
  }

  /** All visible columns of a list: display name, internal name and type. */
  public async fields(listTitle: string): Promise<{ title: string; internal: string; type: string }[]> {
    const url = this.listUrl(listTitle) + '/fields?$select=Title,InternalName,TypeAsString,Hidden&$filter=Hidden eq false';
    const res = await this.http.request('GET', url, undefined, { Accept: ODATA });
    await this.ensure(res, 'read the columns of "' + listTitle + '"');
    const j = await res.json();
    return (j.value || []).map(function (f: any) { return { title: f.Title, internal: f.InternalName, type: f.TypeAsString || '' }; });
  }

  /** Maps column display names to internal names (handles "Process ID" -> "Process_x0020_ID" or "Title"). */
  public async fieldMap(listTitle: string): Promise<{ [displayName: string]: string }> {
    const out: { [k: string]: string } = {};
    for (const f of await this.fields(listTitle)) out[f.title] = f.internal;
    return out;
  }

  /** Reads every item, following paging links. */
  public async getAll(listTitle: string, select: string[]): Promise<any[]> {
    let url: string = this.listUrl(listTitle) + '/items?$select=' + select.join(',') + '&$top=500';
    const out: any[] = [];
    let guard = 0;
    while (url && guard++ < 200) {
      const res = await this.http.request('GET', url, undefined, { Accept: ODATA });
      await this.ensure(res, 'read "' + listTitle + '"');
      const j = await res.json();
      for (const v of j.value || []) out.push(v);
      let next: string = j['odata.nextLink'] || j['@odata.nextLink'] || '';
      if (next && next.charAt(0) === '/') next = this.origin() + next;
      url = next;
    }
    return out;
  }

  public async getItem(listTitle: string, id: number, select: string[]): Promise<any> {
    const url = this.listUrl(listTitle) + '/items(' + id + ')?$select=' + select.join(',');
    const res = await this.http.request('GET', url, undefined, { Accept: ODATA });
    await this.ensure(res, 'read an item of "' + listTitle + '"');
    return res.json();
  }

  public async create(listTitle: string, fields: { [k: string]: any }): Promise<number> {
    const res = await this.http.request('POST', this.listUrl(listTitle) + '/items', JSON.stringify(fields), {
      Accept: ODATA, 'Content-Type': ODATA
    });
    await this.ensure(res, 'save to "' + listTitle + '"');
    const j = await res.json();
    return j.Id !== undefined ? j.Id : j.ID;
  }

  public async update(listTitle: string, id: number, fields: { [k: string]: any }): Promise<void> {
    const res = await this.http.request('POST', this.listUrl(listTitle) + '/items(' + id + ')', JSON.stringify(fields), {
      Accept: ODATA, 'Content-Type': ODATA, 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*'
    });
    await this.ensure(res, 'update "' + listTitle + '"');
  }

  public async remove(listTitle: string, id: number): Promise<void> {
    const res = await this.http.request('POST', this.listUrl(listTitle) + '/items(' + id + ')', undefined, {
      Accept: ODATA, 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*'
    });
    await this.ensure(res, 'delete from "' + listTitle + '"');
  }
}
