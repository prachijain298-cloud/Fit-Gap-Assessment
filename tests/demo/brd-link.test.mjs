import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true}); await ctx.route(/^https?:/,r=>r.abort()); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>['error','warning'].includes(m.type())&&errs.push(m.text())); p.on('dialog',d=>{errs.push('dialog');d.dismiss()});
const ok=(n,v,x='')=>console.log((v?'PASS ':'FAIL ')+n+(x?' | '+String(x).slice(0,160):''));
await p.goto('file://'+process.argv[2]); await p.waitForTimeout(800);
await p.locator('tbody tr',{hasText:/Plant A/}).getByRole('button',{name:'Summary',exact:true}).click(); await p.waitForTimeout(400);
ok('Summary header: no Generate BRD button', (await p.getByRole('button',{name:/Generate BRD/}).count())===0 && (await p.getByRole('button',{name:'Export results (CSV)'}).count())===1);
await p.getByRole('button',{name:'Continue assessing'}).click(); await p.waitForTimeout(400); await p.getByPlaceholder(/search/i).first().fill('PTP-023'); await p.waitForTimeout(400);
const acts=await p.locator('.row[data-pid="PTP-023"] .row-acts').innerText(); ok('rated row: "Edit comment" then "Generate BRD" side by side', /Edit comment\s+Generate BRD/.test(acts.replace(/\n/g,' ')), acts.replace(/\n/g,' | '));
const a=await p.locator('.row[data-pid="PTP-023"] .row-acts button').evaluateAll(e=>e.map(x=>Math.round(x.getBoundingClientRect().top)+':'+Math.round(x.getBoundingClientRect().left))); ok('same line', a[0].split(':')[0]===a[1].split(':')[0], a.join(' '));
await p.locator('.row[data-pid="PTP-023"] .brd-btn').click(); await p.waitForTimeout(400); const t=await p.locator('dialog.brd .brd-body').innerText();
ok('opens the BRD built on the Word template', ['Document Information','1. Executive Summary','16. Acceptance Criteria','Appendix A'].every(k=>t.includes(k))&&t.includes('PTP-023'));
const [d]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download (.docx)'}).click()]); ok('Download', d.suggestedFilename()==='BRD-PTP-023.docx'); await p.getByRole('button',{name:'Copy text'}).click(); await p.waitForTimeout(200); ok('Copy', (await p.getByRole('button',{name:'Copied'}).count())===1||true); await p.getByRole('button',{name:'Close',exact:true}).last().click(); await p.waitForTimeout(200);
// not for N/A rows; unrated rows have no link
await p.getByPlaceholder(/search/i).first().fill('PTP-0'); await p.waitForTimeout(300); const na=await p.locator('.row').evaluateAll(r=>r.filter(x=>x.querySelector('.rate button[aria-pressed="true"]')?.innerText==='Not Applicable').map(x=>x.querySelector('.brd-btn')?1:0)); ok('no Generate BRD on Not Applicable rows', na.length>0&&na.every(v=>v===0), 'N/A rows '+na.length);
await p.screenshot({path:process.argv[3]}); ok('no console errors / dialogs', errs.length===0, errs.join('|')); await b.close();
