// Test harness: plays the role of the SharePoint web part inside a normal browser page.
import { mountApp } from '../../spfx/src/core/hostRuntime';
import type { Http } from '../../spfx/src/core/types';

const q = new URLSearchParams(location.search);
const name = q.get('user') || 'Asha Rao';
const http: Http = {
  request: async (method, url, body, headers) => {
    const r = await fetch(url, { method, body, headers });
    return { ok: r.ok, status: r.status, json: () => r.json(), text: () => r.text() };
  }
};

fetch('/app.html').then((r) => r.text()).then((appHtml) => {
  mountApp({
    container: document.getElementById('root') as HTMLElement,
    http,
    appHtml,
    height: 900,
    config: {
      webUrl: location.origin,
      catalogueList: 'Fit Gap Process Catalogue',
      assessmentsList: 'Fit Gap Assessments',
      recordsList: 'Fit Gap Assessment Records',
      userName: name,
      userEmail: name.toLowerCase().replace(/ /g, '.') + '@example.com'
    }
  });
});
