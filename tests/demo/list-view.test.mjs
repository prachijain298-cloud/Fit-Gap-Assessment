import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>['error','warning'].includes(m.type())&&errs.push(m.text()));
const ok=(n,v,x='')=>console.log((v?'PASS ':'FAIL ')+n+(x?' | '+x:''));
await p.goto('file://'+process.argv[2]); await p.waitForTimeout(800);
// new assessment: sections listed, rows hidden
await p.getByPlaceholder(/Fab 2/).fill('List view'); await p.getByRole('button',{name:'Start assessment'}).click(); await p.waitForTimeout(600);
await p.locator('.tree-btn',{hasText:'PTP'}).first().click(); await p.waitForTimeout(300);
const l3=await p.locator('.acc-h3 .acc-t').allInnerTexts(); ok('L3 sections listed on open', l3.length>=7, l3.slice(0,4).join(' | '));
ok('process rows hidden until a section is opened', (await p.locator('.row').count())===0);
ok('L3 headers collapsed (aria-expanded=false)', await p.locator('.acc-l3').evaluateAll(e=>e.every(x=>x.getAttribute('aria-expanded')==='false')));
ok('L2 groups expanded', await p.locator('.acc-l2').evaluateAll(e=>e.every(x=>x.getAttribute('aria-expanded')==='true')));
ok('Mark all buttons on each section', (await p.locator('.acc-h3').first().locator('.acc-b').count())===4);
await p.screenshot({path:process.argv[3]+'/list.png'});
await p.locator('.acc-l3').nth(1).click(); await p.waitForTimeout(250); ok('click a section opens its rows', (await p.locator('.row').count())===5, String(await p.locator('.row').count()));
await p.locator('.acc-l3').nth(1).click(); await p.waitForTimeout(250); ok('click again collapses', (await p.locator('.row').count())===0);
// search / filter show rows
const inp=p.getByPlaceholder(/search/i).first(); await inp.fill('PTP-018'); await p.waitForTimeout(400); ok('search shows matching row', JSON.stringify(await p.locator('.row .pid').allInnerTexts())==='["PTP-018"]'); await inp.fill(''); await p.waitForTimeout(300);
await p.locator('.seg button',{hasText:/^Not rated$/}).click(); await p.waitForTimeout(300); ok('rating filter shows rows', (await p.locator('.row').count())>0); await p.locator('.seg button',{hasText:/^All$/}).click(); await p.waitForTimeout(300);
await p.locator('.tree-btn.t-l2').first().click(); await p.waitForTimeout(250); await p.locator('.tree-btn.t-l3').first().click(); await p.waitForTimeout(300); ok('picking a section in the left tree shows its rows', (await p.locator('.row').count())>0, String(await p.locator('.row').count()));
// summary jump to track -> list view; open Plant A PTP-023 via guide-less path
await p.locator('.brand').click(); await p.waitForTimeout(300); await p.locator('tbody tr',{hasText:/Plant A/}).getByRole('button',{name:'Summary',exact:true}).click(); await p.waitForTimeout(500);
await p.locator('details.tr summary').first().click(); await p.waitForTimeout(200); await p.locator('details.tr').first().locator('summary .ft-go').click(); await p.waitForTimeout(500);
ok('summary arrow -> track page opens in list view', (await p.locator('.row').count())===0 && (await p.locator('.acc-l3').count())>=7);
// bulk on collapsed section
await p.locator('.brand').click(); await p.getByPlaceholder(/Fab 2/).fill('Bulk'); await p.getByRole('button',{name:'Start assessment'}).click(); await p.waitForTimeout(500); await p.locator('.tree-btn',{hasText:'PTP'}).first().click(); await p.waitForTimeout(250);
await p.locator('.acc-h3').first().getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(250); await p.locator('dialog[open]').getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(400);
ok('Mark all Fit works on a collapsed section (count 3/3)', (await p.locator('.acc-h3').first().locator('.acc-c').innerText()).trim()==='3/3', await p.locator('.acc-h3').first().locator('.acc-c').innerText());
console.log('errors',errs); await b.close();
