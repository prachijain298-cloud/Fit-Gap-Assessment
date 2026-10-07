import { SpStore } from './store';
import { Http, SpError, StoreConfig } from './types';

export interface MountOptions {
  container: HTMLElement;
  http: Http;
  config: StoreConfig;
  appHtml: string;
  height: number;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, function (c) {
  return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
});

/** JSON that is safe to place inside an inline <script> block. */
const safeJson = (o: any): string =>
  JSON.stringify(o).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');

/**
 * Loads the catalogue and assessments from SharePoint, then runs the dashboard inside an iframe.
 * The dashboard never talks to SharePoint itself: it posts its state to this host, which writes it to the lists.
 */
export function mountApp(o: MountOptions): () => void {
  const store = new SpStore(o.http, o.config);
  let iframe: HTMLIFrameElement | null = null;
  let disposed = false;
  let reloadTimer: any = 0;

  const status = (html: string): void => { o.container.innerHTML = html; };

  const onMessage = (ev: MessageEvent): void => {
    const d = ev.data;
    if (!iframe || ev.source !== iframe.contentWindow || !d || d.pfa !== 1 || d.type !== 'save') return;
    store.save(d.state).then(
      function () { post({ pfa: 1, type: 'saved', id: d.id, ok: true }); },
      function (err: any) {
        const conflict = err instanceof SpError && err.conflict;
        post({
          pfa: 1, type: 'saved', id: d.id, ok: false,
          error: conflict
            ? 'Someone else saved a change to the same process first. Reloading the latest data from SharePoint…'
            : (err && err.message) || 'Unknown error'
        });
        if (conflict) reloadTimer = setTimeout(start, 2500);
      }
    );
  };

  function post(msg: any): void {
    if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(msg, '*');
  }

  async function start(): Promise<void> {
    if (disposed) return;
    status('<div style="padding:24px;font:14px Segoe UI,Arial,sans-serif;color:#40545e">Loading from SharePoint…</div>');
    try {
      const data = await store.load();
      if (disposed) return;
      const host = {
        user: { name: o.config.userName, email: o.config.userEmail },
        templates: data.templates,
        assessments: data.assessments
      };
      const inject = '<script>window.__PFA_HOST__=' + safeJson(host) + ';</script>';
      const srcdoc = o.appHtml.replace('<head>', '<head>' + inject);

      o.container.innerHTML = '';
      iframe = document.createElement('iframe');
      iframe.title = 'Process Fit Assessment';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals allow-downloads allow-forms');
      iframe.style.cssText = 'width:100%;border:0;display:block;background:#f4f6f7;height:' + o.height + 'px';
      iframe.srcdoc = srcdoc;
      o.container.appendChild(iframe);
    } catch (e: any) {
      if (disposed) return;
      status(
        '<div style="padding:24px;font:14px Segoe UI,Arial,sans-serif;color:#1d2d35;max-width:720px">' +
        '<h2 style="margin:0 0 8px;font-size:18px">Could not load the Fit Gap data</h2>' +
        '<p style="margin:0 0 12px">' + esc((e && e.message) || String(e)) + '</p>' +
        '<button id="pfa-retry" style="padding:8px 14px;border:1px solid #0a6ed1;background:#0a6ed1;color:#fff;border-radius:6px;cursor:pointer">Try again</button></div>'
      );
      const btn = o.container.querySelector('#pfa-retry');
      if (btn) btn.addEventListener('click', function () { start(); });
    }
  }

  window.addEventListener('message', onMessage);
  start();

  return function dispose(): void {
    disposed = true;
    clearTimeout(reloadTimer);
    window.removeEventListener('message', onMessage);
  };
}
