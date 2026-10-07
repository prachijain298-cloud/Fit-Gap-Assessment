// A small in-memory imitation of the SharePoint REST API (lists + items), used to test the data layer
// without a tenant. It mimics: field lookup, paged item reads, create, MERGE, DELETE, unique columns, choice validation.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const encode = (name) => name.replace(/ /g, '_x0020_').replace(/\//g, '_x002f_');

export function startMock({ port = 0, pageSize = 500, processIdAsTitle = false, excelStyleLists = false, staticFiles = {} } = {}) {
  const catalogue = JSON.parse(readFileSync(resolve(here, 'fixtures/catalogue.json'), 'utf8'));
  const lists = {};
  let nextId = 1;
  const failures = []; // {match: RegExp, status, body}

  const defineList = (title, fields, unique = [], choices = {}) => {
    lists[title] = { title, fields, unique, choices, items: [] };
  };

  // Catalogue list: columns from the Excel header, optionally with Process ID stored in Title.
  const catFields = catalogue.columns.map((c) => ({
    Title: c, InternalName: processIdAsTitle && c === 'Process ID' ? 'Title' : encode(c)
  }));
  if (!processIdAsTitle) catFields.push({ Title: 'Title', InternalName: 'Title' });
  defineList('Fit Gap Process Catalogue', catFields);
  catalogue.rows.forEach((row, i) => {
    const item = { Id: i + 1 };
    for (const f of catFields) if (f.Title in row) item[f.InternalName] = row[f.Title];
    lists['Fit Gap Process Catalogue'].items.push(item);
  });

  // Assessment lists. Either created by script (columns without spaces, typed) or by an Excel import
  // (headers with spaces -> internal names like Assessment_x0020_Key, every column plain text except long text).
  const A = ['Title', 'AssessmentKey', 'TemplateId', 'TemplateVersion'];
  const R = ['Title', 'AssessmentKey', 'ProcessID', 'Rating', 'Comment', 'Version', 'AssessedBy', 'AssessedByEmail',
    'AssessedAt', 'EditedAt', 'EditedBy'];
  const spaced = (n) => n.replace(/([a-z])([A-Z])/g, '$1 $2').replace('Process I D', 'Process ID');
  const typeOf = (n, excel) => n === 'Comment' ? 'Note'
    : excel ? 'Text'
      : n === 'Version' ? 'Number' : (n === 'AssessedAt' || n === 'EditedAt') ? 'DateTime' : n === 'Rating' ? 'Choice' : 'Text';
  const mk = (names) => names.map((n) => n === 'Title' ? { Title: 'Title', InternalName: 'Title', TypeAsString: 'Text' } : (
    excelStyleLists
      ? { Title: spaced(n), InternalName: encode(spaced(n)), TypeAsString: typeOf(n, true) }
      : { Title: n, InternalName: n, TypeAsString: typeOf(n, false) }));
  defineList('Fit Gap Assessments', mk(A), [excelStyleLists ? 'Assessment_x0020_Key' : 'AssessmentKey']);
  defineList('Fit Gap Assessment Records', mk(R), ['Title'],
    { [excelStyleLists ? 'Rating' : 'Rating']: ['Fit', 'Partial Fit', 'Not Fit'] });

  const checkTypes = (list, data) => {
    for (const [k, v] of Object.entries(data)) {
      const f = list.fields.find((x) => x.InternalName === k);
      if (!f) return 'Column ' + k + ' does not exist';
      const t = f.TypeAsString;
      if (v !== null && (t === 'Text' || t === 'Note') && typeof v !== 'string') return 'Column ' + k + ' expects text';
      if (v !== null && t === 'Number' && typeof v !== 'number') return 'Column ' + k + ' expects a number';
    }
    return null;
  };

  const log = [];

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json;odata=nometadata' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = Buffer.concat(chunks).toString('utf8');
      const override = (req.headers['x-http-method'] || '').toUpperCase();
      const method = override || req.method;
      log.push(`${method} ${url.pathname}`);

      if (staticFiles[url.pathname]) {
        const f = staticFiles[url.pathname];
        res.writeHead(200, { 'Content-Type': f.type });
        return res.end(readFileSync(f.path));
      }
      for (const f of failures) if (f.match.test(`${method} ${url.pathname}`)) return send(res, f.status, f.body);

      const m = /^\/_api\/web\/lists\/getbytitle\('([^']*)'\)(?:\/(fields|items)(?:\((\d+)\))?)?$/.exec(decodeURIComponent(url.pathname));
      if (!m) return send(res, 404, { error: 'unknown route ' + url.pathname });
      const list = lists[m[1].replace(/''/g, "'")];
      if (!list) return send(res, 404, 'The list does not exist.');
      const [, , kind, idStr] = m;

      if (kind === 'fields' && method === 'GET') return send(res, 200, { value: list.fields });

      if (kind === 'items' && !idStr) {
        if (method === 'GET') {
          const skip = Number(url.searchParams.get('$skiptoken') || 0);
          const top = Math.min(Number(url.searchParams.get('$top') || 100), pageSize);
          const page = list.items.slice(skip, skip + top);
          const out = { value: page };
          if (skip + top < list.items.length) {
            const next = new URL(url.toString());
            next.searchParams.set('$skiptoken', String(skip + top));
            out['odata.nextLink'] = next.pathname + next.search;
          }
          return send(res, 200, out);
        }
        if (method === 'POST') {
          const data = JSON.parse(body || '{}');
          for (const [k, allowed] of Object.entries(list.choices)) {
            if (k in data && !allowed.includes(data[k])) return send(res, 400, 'Invalid choice value for ' + k);
          }
          for (const u of list.unique) {
            if (list.items.some((it) => it[u] !== undefined && it[u] === data[u])) {
              return send(res, 400, `The list item could not be added or updated because duplicate values were found in the following field(s) in the list: ${u}`);
            }
          }
          const typeErr = checkTypes(list, data);
          if (typeErr) return send(res, 400, typeErr);
          const item = { ...data, Id: nextId++, Created: new Date().toISOString() };
          list.items.push(item);
          return send(res, 201, item);
        }
      }
      if (kind === 'items' && idStr) {
        const item = list.items.find((it) => it.Id === Number(idStr));
        if (!item) return send(res, 404, 'Item does not exist');
        if (method === 'GET') return send(res, 200, item);
        if (method === 'MERGE') {
          const data = JSON.parse(body || '{}');
          const typeErr = checkTypes(list, data);
          if (typeErr) return send(res, 400, typeErr);
          Object.assign(item, data); return send(res, 204, '');
        }
        if (method === 'DELETE') { list.items.splice(list.items.indexOf(item), 1); return send(res, 200, ''); }
      }
      return send(res, 400, 'unsupported');
    });
  });

  return new Promise((resolveStart) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolveStart({
        url: `http://127.0.0.1:${addr.port}`,
        lists, log, failures,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}
