import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900}}); await ctx.route(/^https?:/,r=>r.abort()); const p=await ctx.newPage(); const errs=[],dl=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>['error','warning'].includes(m.type())&&errs.push(m.text())); p.on('dialog',d=>{dl.push(d.message());d.dismiss()});
const ok=(n,v,x='')=>console.log((v?'PASS ':'FAIL ')+n+(x?' | '+String(x).slice(0,200):''));
await p.goto('file://'+process.argv[2]); await p.waitForTimeout(800);
await p.getByPlaceholder(/Fab 2/).fill('Bulk test'); await p.getByRole('button',{name:'Start assessment'}).click(); await p.waitForTimeout(600);
await p.locator('.tree-btn',{hasText:'PTP'}).first().click(); await p.waitForTimeout(300);
const nSec=await p.locator('.acc-h3').count(); ok('list view shows every PTP section on one page (no 25-row paging)', nSec>=18 && (await p.locator('.pager').count())===0, nSec+' sections');
ok('dropdown button on every L2 and L3 header', (await p.locator('.acc-h2 .acc-dd').count())===(await p.locator('.acc-h2').count()) && (await p.locator('.acc-h3 .acc-dd').count())===nSec);
const sec=i=>p.locator('.acc-sub').nth(i);
// dropdown expand/collapse
await sec(1).locator('.acc-dd').click(); await p.waitForTimeout(200); ok('L3 dropdown expands rows', (await sec(1).locator('.row').count())===5 && (await sec(1).locator('.acc-dd').getAttribute('aria-expanded'))==='true');
await sec(1).locator('.acc-dd').click(); await p.waitForTimeout(200); ok('L3 dropdown collapses rows', (await sec(1).locator('.row').count())===0);
const l2=p.locator('.acc').first(); const before=await l2.locator('.acc-h3').count(); await l2.locator('.acc-h2 .acc-dd').click(); await p.waitForTimeout(200); ok('L2 dropdown collapses its sub-sections', (await l2.locator('.acc-h3').count())===0 && before>0, before+' -> 0'); await l2.locator('.acc-h2 .acc-dd').click(); await p.waitForTimeout(200); ok('L2 dropdown expands again', (await l2.locator('.acc-h3').count())===before);
// pre-rate one process in section 1 as Partial with a comment, then Mark all Fit with a comment
await sec(1).locator('.acc-dd').click(); await p.waitForTimeout(200);
await sec(1).locator('.row').nth(0).locator('.rate button',{hasText:/^Partial Fit$/}).click(); await p.locator('.ic-text').first().fill('Old partial note.'); await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).click(); await p.waitForTimeout(250);
await sec(1).locator('.acc-dd').click(); await p.waitForTimeout(150); // collapse
await sec(1).getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(250);
const md=await p.locator('dialog[open]').innerText(); ok('Mark all Fit: comment box offered (optional) and mentions replaced ratings', (await p.locator('dialog[open] textarea').count())===1 && /optional/i.test(md) && /1 already rated will be replaced/.test(md), md.replace(/\s+/g,' ').slice(0,200));
ok('Mark all Fit: OK enabled without comment', !(await p.locator('dialog[open]').getByRole('button',{name:'Mark all Fit'}).isDisabled()));
await p.locator('dialog[open] textarea').fill('Standard covers this.'); await p.locator('dialog[open]').getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(500);
ok('header shows 5/5 after one click', (await sec(1).locator('.acc-c').innerText()).trim()==='5/5');
await sec(1).locator('.acc-dd').click(); await p.waitForTimeout(200);
const rows=await sec(1).locator('.row').evaluateAll(r=>r.map(x=>[x.querySelector('.rate button[aria-pressed="true"]')?.innerText,x.querySelector('.row-comment')?.innerText]));
ok('all 5 are Fit with the same comment (incl. the one that was Partial)', rows.length===5 && rows.every(r=>r[0]==='Fit'&&r[1]==='Standard covers this.'), JSON.stringify(rows));
await p.getByRole('button',{name:'Undo'}).click(); await p.waitForTimeout(400);
const rows2=await sec(1).locator('.row').evaluateAll(r=>r.map(x=>[x.querySelector('.rate button[aria-pressed="true"]')?.innerText||null,x.querySelector('.row-comment')?.innerText||null]));
ok('Undo restores previous state (first = Partial + old note, others unrated)', rows2[0][0]==='Partial Fit'&&rows2[0][1]==='Old partial note.'&&rows2.slice(1).every(r=>r[0]===null), JSON.stringify(rows2));
await sec(1).locator('.acc-dd').click(); await p.waitForTimeout(200);
// Partial Fit: comment required
await sec(2).getByRole('button',{name:'Mark all Partial Fit'}).click(); await p.waitForTimeout(250); const okb=p.locator('dialog[open]').getByRole('button',{name:'Mark all Partial Fit'}); ok('Mark all Partial Fit: OK disabled until a comment is typed', await okb.isDisabled());
await p.locator('dialog[open] textarea').fill('Needs extra step.'); await okb.click(); await p.waitForTimeout(400); await sec(2).locator('.acc-dd').click(); await p.waitForTimeout(200);
const r3=await sec(2).locator('.row').evaluateAll(r=>r.map(x=>[x.querySelector('.rate button[aria-pressed="true"]')?.innerText,x.querySelector('.row-comment')?.innerText])); ok('Partial Fit + comment on all rows of the section', r3.length>0&&r3.every(r=>r[0]==='Partial Fit'&&r[1]==='Needs extra step.'), JSON.stringify(r3[0]));
// Mark all without comment still works
await sec(3).getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(250); await p.locator('dialog[open]').getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(400); const c3=(await sec(3).locator('.acc-c').innerText()).trim().split('/'); ok('Mark all Fit with no comment works', c3[0]===c3[1], c3.join('/'));
// every section of PTP and RTR in one pass each -> tree shows 73/73 and 200/200
for(const [tr,tot] of [['PTP',73],['RTR',200]]){ await p.locator('.tree-btn',{hasText:new RegExp('^'+tr)}).first().click(); await p.waitForTimeout(300); const n=await p.locator('.acc-h3').count(); for(let i=0;i<n;i++){const h=p.locator('.acc-h3').nth(i); const [a,t]=(await h.locator('.acc-c').innerText()).trim().split('/'); if(a===t) continue; await h.getByRole('button',{name:'Mark all Fit'}).click(); await p.waitForTimeout(100); await p.locator('dialog[open]').getByRole('button',{name:/^Mark all Fit$/}).click(); await p.waitForTimeout(150);} const cnt=(await p.locator('.tree-btn',{hasText:new RegExp('^'+tr)}).first().locator('.cnt').innerText()).trim(); ok(tr+': every section marked, tree shows '+tot+'/'+tot, cnt===`${tot}/${tot}`, cnt+' ('+n+' sections)'); }
// summary + rows
await p.locator('.tab',{hasText:'Assessment Summary'}).click(); await p.waitForTimeout(500);
ok('Open capsule removed from Fit by process track', (await p.locator('.s-grid .open-link').count())===0 && !/\bOpen\b/.test(await p.locator('.s-grid').innerText()));
ok('› arrow still on each track row', (await p.locator('details.tr > summary .ft-go').count())===6);
ok('Generate BRD button still on the Summary', (await p.getByRole('button',{name:'Generate BRD',exact:true}).count())===1);
await p.getByRole('button',{name:'Continue assessing'}).click(); await p.waitForTimeout(400); await p.getByPlaceholder(/search/i).first().fill('PTP-018'); await p.waitForTimeout(400);
ok('Generate BRD link removed from the process rows', (await p.locator('.row .brd-btn').count())===0 && !/Generate BRD/.test(await p.locator('#list').innerText()));
ok('no console errors / native dialogs', errs.length===0&&dl.length===0, errs.concat(dl).join('|'));
await p.getByPlaceholder(/search/i).first().fill(''); await p.waitForTimeout(300); await p.locator('.tree-btn',{hasText:'PTP'}).first().click(); await p.waitForTimeout(300); await p.screenshot({path:process.argv[3]+'/dd.png'});
await b.close();
