# Fit Gap Assessment dashboard

* `src/imports/Process-Fit-Assessment__1_.html` – the dashboard application (single bundled file).
* `src/enterprise.css` – presentation layer injected into the app.
* `Process-Fit-Assessment.html` – **generated** single file to hand out (`npm run build:html`).
  Opened on its own it stores data in the browser (with Download/Restore backup).
* `sharepoint/` – the SharePoint version: data lives in SharePoint lists. See `sharepoint/README.md`.

```
npm install
npm run build:html      # regenerates Process-Fit-Assessment.html
npm run dev             # local preview
```
