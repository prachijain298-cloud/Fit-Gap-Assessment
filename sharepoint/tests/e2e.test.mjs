// End-to-end: the real dashboard bundle runs in an iframe, saving to the mock SharePoint through the web-part host code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { startMock } from './mockSharePoint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = mkdtempSync(join(tmpdir(), 'pfa-e2e-'));
execFileSync(resolve(root, 'node_modules/.bin/esbuild'),
  [resolve(here, 'harness/main.ts'), '--bundle', '--format=iife', '--outfile=' + join(out, 'harness.js'), '--log-level=warning']);

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright');

let sp, browser;
test.before(async () => {
  sp = await startMock({
    staticFiles: {
      '/app.html': { path: resolve(root, 'Process-Fit-Assessment.html'), type: 'text/html' },
      '/harness.html': { path: resolve(here, 'harness/harness.html'), type: 'text/html' },
      '/harness.js': { path: join(out, 'harness.js'), type: 'text/javascript' }
    }
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
});
test.after(async () => { await browser.close(); await sp.close(); });

async function open(user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${sp.url}/harness.html?user=${encodeURIComponent(user)}`);
  const app = page.frameLocator('iframe');
  await app.locator('h1').first().waitFor({ timeout: 15000 });
  return { page, app, errors, ctx };
}
const rows = () => sp.lists['Fit Gap Assessment Records'].items;
const settle = (page) => page.waitForTimeout(1500);

test('dashboard runs on SharePoint data: catalogue from the list, no browser-storage extras, saves to the lists', async () => {
  const a = await open('Asha Rao');
  const body = await a.app.locator('body').innerText();
  assert.doesNotMatch(body, /Saved in this browser|Saving in this browser/);
  assert.doesNotMatch(body, /Add template version from CSV|Download backup|Restore backup/);
  assert.match(body, /Fit Gap Process Catalogue/);
  assert.match(body, /399 processes/);

  await a.app.getByPlaceholder(/Fab 2/).fill('Plant 1 review');
  await a.app.getByRole('button', { name: 'Start assessment' }).click();
  await a.app.locator('.row').first().waitFor();
  assert.match(await a.app.locator('.row').first().innerText(), /BPML-0001/);
  await settle(a.page);
  assert.equal(sp.lists['Fit Gap Assessments'].items.length, 1);
  assert.equal(sp.lists['Fit Gap Assessments'].items[0].Title, 'Plant 1 review');

  await a.app.locator('.row-main').first().click();
  await a.app.locator('.wk-opt[data-r="P"]').click();
  assert.equal(await a.app.getByRole('button', { name: 'Save Assessment' }).isDisabled(), true, 'comment required for Partial Fit');
  await a.app.locator('.wk-reason').fill('Standard covers most; a custom approval step is needed.');
  assert.equal(await a.app.getByPlaceholder('Your name').inputValue(), 'Asha Rao');
  assert.equal(await a.app.getByPlaceholder('Your name').isEditable(), false, 'name comes from the Microsoft login');
  await a.app.getByRole('button', { name: 'Save Assessment' }).click();
  await settle(a.page);

  const r = rows();
  assert.equal(r.length, 1);
  assert.equal(r[0].ProcessID, 'BPML-0001');
  assert.equal(r[0].Rating, 'Partial Fit');
  assert.equal(r[0].Comment, 'Standard covers most; a custom approval step is needed.');
  assert.equal(r[0].AssessedBy, 'Asha Rao');
  assert.equal(r[0].Version, 1);
  assert.deepEqual(a.errors, []);
  await a.ctx.close();
});

test('a second user sees the same data, reassesses (new version) and the first user sees it after reload', async () => {
  const b = await open('Dilasha Jain');
  await b.app.getByRole('button', { name: 'Plant 1 review', exact: true }).click();
  await b.app.locator('.row-main').first().click();
  const panel = await b.app.locator('.wk').innerText();
  assert.match(panel, /Partial Fit/);
  assert.match(panel, /custom approval step/);
  assert.match(panel, /Asha Rao/);
  await b.app.getByRole('button', { name: 'Reassess' }).click();
  await b.app.locator('.wk-opt[data-r="F"]').click();
  await b.app.locator('.wk-reason').fill('Delivered in release 3.');
  await b.app.getByRole('button', { name: 'Save Assessment' }).click();
  await settle(b.page);
  assert.equal(rows().length, 2);
  const v2 = rows().find((x) => x.Version === 2);
  assert.equal(v2.Rating, 'Fit');
  assert.equal(v2.AssessedBy, 'Dilasha Jain');
  assert.equal(v2.AssessedByEmail, 'dilasha.jain@example.com');

  const a = await open('Asha Rao');
  await a.app.getByRole('button', { name: 'Plant 1 review', exact: true }).click();
  await a.app.locator('.row-main').first().click();
  const text = await a.app.locator('.wk').innerText();
  assert.match(text, /Changed: Partial Fit → Fit/);
  assert.match(text, /Dilasha Jain/);
  await a.app.locator('.wk-hist summary').click();
  assert.match(await a.app.locator('.wk-hl').innerText(), /v2[\s\S]*v1/);
  assert.deepEqual([a.errors, b.errors], [[], []]);
  await a.ctx.close(); await b.ctx.close();
});

test('edit corrects the record in place on SharePoint (EditedBy / EditedAt), no new version', async () => {
  const a = await open('Asha Rao');
  await a.app.getByRole('button', { name: 'Plant 1 review', exact: true }).click();
  await a.app.locator('.row-main').first().click();
  await a.app.getByRole('button', { name: 'Edit', exact: true }).click();
  await a.app.locator('.wk-reason').fill('Delivered in release 3.1 (typo fixed).');
  await a.app.getByRole('button', { name: 'Save changes' }).click();
  await settle(a.page);
  assert.equal(rows().length, 2);
  const v2 = rows().find((x) => x.Version === 2);
  assert.equal(v2.Comment, 'Delivered in release 3.1 (typo fixed).');
  assert.equal(v2.EditedBy, 'Asha Rao');
  assert.ok(v2.EditedAt);
  assert.equal(v2.AssessedBy, 'Dilasha Jain', 'original author is preserved');
  assert.deepEqual(a.errors, []);
  await a.ctx.close();
});

test('two users reassess the same process at once: the second is told and the page reloads the latest data', async () => {
  const a = await open('Asha Rao');
  const b = await open('Dilasha Jain');
  for (const u of [a, b]) {
    await u.app.getByRole('button', { name: 'Plant 1 review', exact: true }).click();
    await u.app.locator('.row-main').first().click();
    await u.app.getByRole('button', { name: 'Reassess' }).click();
    await u.app.locator('.wk-opt[data-r="N"]').click();
  }
  await a.app.locator('.wk-reason').fill('A: dropped from scope.');
  await b.app.locator('.wk-reason').fill('B: dropped from scope too.');
  await a.app.getByRole('button', { name: 'Save Assessment' }).click();
  await settle(a.page);
  await b.app.getByRole('button', { name: 'Save Assessment' }).click();
  await b.page.waitForTimeout(800);
  assert.match(await b.app.locator('.toast').innerText(), /Someone else saved/);
  await b.page.waitForTimeout(4000); // host reloads the latest data
  await b.app.locator('h1').first().waitFor();
  const v3 = rows().filter((x) => x.Version === 3);
  assert.equal(v3.length, 1);
  assert.equal(v3[0].Comment, 'A: dropped from scope.');
  await a.ctx.close(); await b.ctx.close();
});

test('Not Applicable can be saved without a reason; deleting an assessment removes its rows from SharePoint', async () => {
  const a = await open('Asha Rao');
  await a.app.getByPlaceholder(/Fab 2/).fill('ToDelete');
  await a.app.getByRole('button', { name: 'Start assessment' }).click();
  await a.app.locator('.row').first().waitFor();
  await a.app.locator('.row-main').first().click();
  await a.app.locator('.wk-opt[data-r="A"]').click();
  await a.app.getByRole('button', { name: 'Save Assessment' }).click();
  await a.page.waitForTimeout(2000);
  const key = sp.lists['Fit Gap Assessments'].items.find((i) => i.Title === 'ToDelete').AssessmentKey;
  const mine = rows().filter((x) => x.Title.startsWith(key + '|'));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].Rating, 'Not Applicable');
  assert.equal(mine[0].Comment, '');
  assert.deepEqual(a.errors, []);

  await a.app.locator('.brand').click();
  await a.app.getByRole('button', { name: 'Delete ToDelete' }).click();
  await a.app.getByRole('button', { name: 'Delete assessment' }).click();
  await a.page.waitForTimeout(2500);
  assert.equal(sp.lists['Fit Gap Assessments'].items.some((i) => i.Title === 'ToDelete'), false);
  assert.equal(rows().filter((x) => x.Title.startsWith(key + '|')).length, 0);
  await a.ctx.close();
});

test('a SharePoint error is shown to the user instead of silently pretending to save', async () => {
  const a = await open('Asha Rao');
  await a.app.getByRole('button', { name: 'Plant 1 review', exact: true }).click();
  await a.app.locator('.row-main').nth(1).click();
  sp.failures.push({ match: /POST .*Records/, status: 403, body: 'Access denied' });
  await a.app.locator('.wk-opt[data-r="F"]').click();
  await a.app.getByRole('button', { name: 'Save Assessment' }).click();
  await a.page.waitForTimeout(2500);
  assert.match(await a.app.locator('.save-state').innerText(), /Not saved/);
  assert.match(await a.app.locator('.toast').innerText(), /permission/i);
  sp.failures.length = 0;
  await a.ctx.close();
});
