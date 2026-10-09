import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const FILE=process.argv[2], OUT=process.argv[3]; fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const results=[]; const ok=(n,v,x='')=>{results.push([v,n]);console.log((v?'PASS ':'FAIL ')+n+(x?' | '+String(x).slice(0,220):''))};
const logs=[],net=[],dialogs=[];
const mk=async(vp={width:1440,height:900},init)=>{const ctx=await b.newContext({viewport:vp,acceptDownloads:true});await ctx.route(/^https?:/,r=>r.abort());if(init)await ctx.addInitScript(init);const p=await ctx.newPage();p.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.text())});p.on('pageerror',e=>logs.push('pageerror '+e.message));p.on('request',r=>{if(!/^(file|data|blob):/.test(r.url()))net.push(r.url())});p.on('dialog',d=>{dialogs.push(d.message());d.dismiss()});return [ctx,p]};
const [ctx,p]=await mk(); await p.goto('file://'+FILE); await p.waitForTimeout(900);
const body=()=>p.evaluate(()=>document.body.innerText);
const home=async()=>{await p.locator('.brand').click();await p.waitForTimeout(350)};
// ---- removals on home
let t=await body();
ok('no Demo guide button', (await p.getByRole('button',{name:/Demo guide/}).count())===0 && !/Demo guide/.test(t));
ok('no Reset demo data', (await p.getByRole('button',{name:/Reset demo/}).count())===0 && !/Reset demo/i.test(t));
ok('no "Demo mode" text', !/demo mode/i.test(t));
ok('home: "Overall Fit Score" column header', (await p.locator('thead th').allInnerTexts()).includes('Overall Fit Score'), (await p.locator('thead th').allInnerTexts()).join('|'));
for(const w of [1366,1440]){await p.setViewportSize({width:w,height:800});await p.waitForTimeout(250);const o=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:window.innerWidth,tw:[...document.querySelectorAll('.table-wrap')].map(e=>[e.scrollWidth,e.clientWidth])}));ok('home table fits at '+w, o.sw<=o.cw && o.tw.every(a=>a[0]<=a[1]), JSON.stringify(o))}
await p.setViewportSize({width:1440,height:900});
await p.screenshot({path:OUT+'/home.png'});
// ---- new assessment
await p.getByPlaceholder(/Fab 2/).fill('Change test'); await p.getByRole('button',{name:'Start assessment'}).click(); await p.waitForTimeout(600);
await p.locator('.acc-l3').first().click(); await p.waitForTimeout(250);
const row=i=>p.locator('.row').nth(i), rb=(i,n)=>row(i).locator('.rate button',{hasText:new RegExp('^'+n+'$')});
await rb(0,'Fit').click(); await p.waitForTimeout(250);
ok('no "Reference plant" lines on rows', !/Reference plant/.test(await body()));
await rb(1,'Partial Fit').click(); await p.waitForTimeout(200); ok('Partial Fit needs comment', await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).isDisabled()); await p.locator('.ic-text').first().fill('Extra step.'); await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).click(); await p.waitForTimeout(250);
await rb(2,'Not Applicable').click(); await p.waitForTimeout(250);
// header stats
const stats=(await p.locator('.a-stats .stat').allInnerTexts()).map(x=>x.replace(/\s+/g,' ')); console.log('   stats',stats.join(' || '));
ok('assessment header: Fit, Partial Fit, Not Fit, Not Applicable, Overall Fit Score', stats.length===5 && /Fit/.test(stats[0]) && /Partial Fit/.test(stats[1]) && /Not Fit/.test(stats[2]) && /Not Applicable · 1/.test(stats[3]) && /Overall Fit Score/.test(stats[4]));
const col=await p.locator('.stat.ov b').evaluate(e=>getComputedStyle(e).color); ok('header Overall Fit Score is black and visible', col==='rgb(0, 0, 0)' && /\d/.test(stats[4]), col+' '+stats[4]);
ok('no tip sentence at the bottom', !/Tip:|focus a row/.test(await body()));
await p.screenshot({path:OUT+'/assess-header.png'});
// details panel
await row(1).locator('.row-main').click(); await p.waitForTimeout(300); const wk=await p.locator('.wk').innerText(); console.log('   panel:',wk.replace(/\s+/g,' '));
ok('details panel: no previous assessment / versions / history / reassess / next', !/Previous|\bv\d\b|Reassess|Next process|history|Save & Next|First assessment/i.test(wk));
ok('details panel: has Edit + Close', (await p.locator('.wk').getByRole('button',{name:'Edit',exact:true}).count())===1 && (await p.locator('.wk').getByRole('button',{name:'Close',exact:true}).count())===1);
await p.locator('.wk').getByRole('button',{name:'Edit',exact:true}).click(); await p.waitForTimeout(200);
ok('edit mode: no Reassess wording, Ctrl+Enter hint only', !/Reassess|move on/.test(await p.locator('.wk').innerText()));
await p.locator('.wk textarea').first().fill('Edited text'); await p.locator('.wk').getByRole('button',{name:'Save changes'}).click(); await p.waitForTimeout(300);
ok('edit saves in place', (await body()).includes('Edited text')); await p.locator('.wk').getByRole('button',{name:'Close',exact:true}).click(); await p.waitForTimeout(200);
await p.screenshot({path:OUT+'/panel.png'});
// bulk buttons
await p.locator('.tree-btn',{hasText:'PTP'}).first().click(); await p.waitForTimeout(300);
ok('L2 headers have no bulk buttons', (await p.locator('.acc-h2 .acc-b').count())===0);
const names=await p.locator('.acc-h3').first().locator('.acc-b').allInnerTexts(); ok('L3 header: Mark all Fit / N/A only', JSON.stringify(names)===JSON.stringify(['Mark all Fit','Mark all N/A']), names.join(','));
await p.screenshot({path:OUT+'/bulk.png'});
await p.locator('.acc-sub').nth(1).locator('.acc-dd').click(); await p.waitForTimeout(200);
const sec=p.locator('.acc-sub').nth(1); const nrows=await sec.locator('.row').count();
await sec.getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(300); ok('bulk Fit: confirm only, no comment box', (await p.locator('dialog[open] textarea').count())===0 && (await p.locator('dialog[open]').count())===1);
await p.locator('dialog[open]').getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(400);
ok('bulk Fit marks all '+nrows, await sec.locator('.row').evaluateAll(r=>r.every(x=>x.querySelector('.rate button[aria-pressed="true"]')?.innerText==='Fit')));
await p.getByRole('button',{name:'Undo'}).click(); await p.waitForTimeout(400); ok('bulk Undo reverts', (await sec.locator('.row').evaluateAll(r=>r.filter(x=>x.querySelector('.rate button[aria-pressed="true"]')).length))===0);
// summary
await p.locator('.tab',{hasText:'Assessment Summary'}).click(); await p.waitForTimeout(500);
const sc=await p.locator('.score-big').evaluate(e=>getComputedStyle(e).color); ok('summary Overall Fit Score is black', sc==='rgb(0, 0, 0)', sc);
const head=(await p.locator('.trow.head').innerText()).replace(/\s+/g,' '); ok('track table: header names', head==='Track Rated Fit Partial Fit Not Fit Not Applicable Overall Fit Score', head);
ok('Open capsule removed from Fit by process track', (await p.locator('.s-grid .open-link').count())===0);
ok('chevron button at the right end of each track row', (await p.locator('details.tr > summary .ft-go').count())===6);
const pos=await p.locator('details.tr').first().locator('summary').evaluate(s=>{const g=s.querySelector('.ft-go').getBoundingClientRect(),sc=s.querySelector('b.num').getBoundingClientRect();return g.left>=sc.right-1});
ok('chevron sits right of Overall Fit Score', pos);
await p.locator('.s-grid').screenshot({path:OUT+'/tracks.png'});
await p.locator('details.tr').first().locator('summary .ft-go').click(); await p.waitForTimeout(500); ok('track chevron goes to that track\'s page', (await p.locator('.filter-note').innerText()).startsWith('PTP') && (await p.locator('.acc-l3').count())>0);
await p.locator('.tab',{hasText:'Assessment Summary'}).click(); await p.waitForTimeout(400); await p.locator('details.tr summary').first().click(); await p.waitForTimeout(250);
const l2=await p.locator('details.tr').first().locator('.trow.sub').first().locator('.nm button').innerText(); await p.locator('details.tr').first().locator('.trow.sub').first().locator('.ft-go').click(); await p.waitForTimeout(500);
ok('L2 sub-row chevron goes to that L2 page', (await p.locator('.filter-note').innerText()).includes(l2), l2+' -> '+(await p.locator('.filter-note').innerText()).slice(0,60));

// regressions: search, BRD, complete, persist
const inp=p.getByPlaceholder(/search/i).first(); await p.locator('.tree-btn',{hasText:'All processes'}).click(); await inp.fill('PTP-018'); await p.waitForTimeout(400); ok('search PTP-018', JSON.stringify(await p.locator('.row .pid').allInnerTexts())==='["PTP-018"]');
await inp.fill('PTP-023'); await p.waitForTimeout(300); await p.locator('.row[data-pid="PTP-023"] .rate button',{hasText:/^Partial Fit$/}).click(); await p.locator('.ic-text').first().fill('Gap.'); await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).click(); await p.waitForTimeout(250); await p.locator('.row[data-pid="PTP-023"] .brd-btn').click(); await p.waitForTimeout(400);
ok('BRD opens (sample content)', /This results in:/.test(await p.locator('dialog.brd .brd-body').innerText())); const [dl]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download (.docx)'}).click()]); ok('BRD download', dl.suggestedFilename()==='BRD-PTP-023.docx'); await p.getByRole('button',{name:'Close',exact:true}).last().click(); await p.waitForTimeout(250); await p.locator('.tab',{hasText:'Assess'}).first().click(); await p.waitForTimeout(400);
await p.getByRole('button',{name:'Mark complete'}).click(); await p.waitForTimeout(300); ok('Mark complete', (await p.locator('.chip.done').count())===1);
await p.reload(); await p.waitForTimeout(800); const rws=(await p.locator('tbody tr').allInnerTexts()).map(x=>x.replace(/\s+/g,' ')); ok('refresh persists', rws.some(x=>/Change test/.test(x)&&/Completed/.test(x)), rws.length+' rows');
// Plant A (seed) opens, details panel without previous/versions
await p.locator('tbody tr',{hasText:/Plant A/}).getByRole('button',{name:'Assess',exact:true}).click(); await p.waitForTimeout(500); await inp.fill('PTP-023'); await p.waitForTimeout(300); await p.locator('.row[data-pid="PTP-023"] .row-main').click(); await p.waitForTimeout(300);
ok('Plant A PTP-023 panel: comment kept, no versions', /Standard review/.test(await p.locator('.wk').innerText()) && !/\bv1\b|Previous|history/i.test(await p.locator('.wk').innerText()));
// storage blocked: no note
const [c2,p2]=await mk({width:1440,height:900},()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}})});
await p2.goto('file://'+FILE); await p2.waitForTimeout(800); const t2=await p2.evaluate(()=>document.body.innerText); ok('storage blocked: still works, no "Demo mode" note', (await p2.locator('tbody tr').count())===2 && !/demo mode/i.test(t2)); await c2.close();
ok('no console errors/warnings', logs.length===0, logs.join(' || ')); ok('no network requests', net.length===0, net.join(',')); ok('no native dialogs', dialogs.length===0, dialogs.join('|'));
await ctx.close(); await b.close(); const f=results.filter(x=>!x[0]); console.log(`\n${results.length-f.length}/${results.length} passed`); process.exit(f.length?1:0);
