import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const FILE=process.argv[2], OUT=process.argv[3]; fs.mkdirSync(OUT,{recursive:true});
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const results=[]; const ok=(n,v,x='')=>{results.push([v,n,x]);console.log((v?'PASS ':'FAIL ')+n+(x?' | '+String(x).slice(0,200):''))};
const logs=[],net=[],dialogs=[];
function track(p){p.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text())});p.on('pageerror',e=>logs.push('pageerror: '+e.message));p.on('request',r=>{if(!/^(file|data|blob):/.test(r.url()))net.push(r.url())});p.on('dialog',d=>{dialogs.push(d.type()+': '+d.message());d.dismiss()})}
const mk=async(vp={width:1440,height:900},init)=>{const ctx=await b.newContext({viewport:vp,acceptDownloads:true});await ctx.route(/^https?:/,r=>r.abort());await ctx.addInitScript(()=>{window.__clip=null;try{Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__clip=t;return Promise.resolve()}},configurable:true})}catch(e){}});if(init)await ctx.addInitScript(init);const p=await ctx.newPage();track(p);return [ctx,p]};
const scanBad=async(p,label)=>{const t=await p.evaluate(()=>document.body.innerText);const bad=[];if(/SAMPLE/.test(t))bad.push('SAMPLE');for(const w of ['placeholder','TODO','undefined','NaN','null']){if(new RegExp('\\b'+w+'\\b','i').test(t))bad.push(w)}ok('text scan: '+label,bad.length===0,bad.join(','))};
const W=ms=>new Promise(r=>setTimeout(r,ms));
const [ctx,p]=await mk(); await p.goto('file://'+FILE); await p.waitForTimeout(900);
const rows=async()=>(await p.locator('tbody tr').allInnerTexts()).map(t=>t.replace(/\s+/g,' '));
const home=async()=>{await p.locator('.brand').click();await p.waitForTimeout(350)};
// ---------- 3 client-facing data
let r=await rows(); ok('home: Plant A / Plant B renamed, assessor Consultant', r.length===2&&r.some(t=>/^Plant A – Previous rollout \(Reference\)/.test(t))&&r.some(t=>/^Plant B – In progress/.test(t))&&r.every(t=>/Consultant/.test(t)&&!/Sample|SAMPLE/.test(t)), r.map(t=>t.slice(0,60)).join(' || '));
ok('home: Plant A ~78%, Plant B 70%', /77\.8%/.test(r.find(t=>/Plant A/.test(t))) && /70%/.test(r.find(t=>/Plant B/.test(t))));
ok('home: no "Add template version from CSV"', (await p.getByText('Add template version from CSV').count())===0);
ok('home: Reset demo data link present', (await p.getByRole('button',{name:'Reset demo data'}).count())===1);
await scanBad(p,'home');
// ---------- 4 demo guide
await p.getByRole('button',{name:'Demo guide'}).click(); await p.waitForTimeout(300);
ok('guide: panel opens with 8 steps', (await p.locator('.guide-step').count())===8, (await p.locator('.guide-t').allInnerTexts()).join(' / '));
ok('guide: each step has 1-2 talking points', (await p.locator('.guide-step').evaluateAll(e=>e.every(x=>{const n=x.querySelectorAll('.guide-p li').length;return n>=1&&n<=2}))));
ok('guide: BRD talking point text', (await p.locator('.guide').innerText()).includes("BRDs here are sample output. Going forward they're generated from Pentair's past rollout documents and the meeting transcript."));
await scanBad(p,'home with guide open');
await p.screenshot({path:OUT+'/guide-home.png'});
const step=async i=>{await p.locator('.guide-step').nth(i).click();await p.waitForTimeout(700)};
await step(0); ok('step 1 -> Home', (await p.locator('.intro h1').count())===1 && (await p.locator('tbody tr').count())===2 && (await p.locator('.guide-step').nth(0).getAttribute('aria-current'))==='step');
await step(1); ok('step 2 -> Start new assessment panel', (await p.locator('input[placeholder^="e.g."]').isVisible()) && (await p.getByRole('button',{name:'Start assessment'}).isVisible()));
await step(2); ok('step 3 -> PTP sections + Mark all Fit', (await p.locator('.filter-note').innerText()).startsWith('PTP') && (await p.getByRole('button',{name:'Mark all Fit'}).count())>0, (await p.locator('.filter-note').innerText()).slice(0,50));
await step(3); ok('step 4 -> unrated PTP row highlighted', (await p.locator('.row.flash').count())===1, await p.locator('.row.flash').getAttribute('data-pid').catch(()=>'none'));
await step(4); ok('step 5 -> Summary with BRD picker open', (await p.locator('.s-hero').count())===1 && (await p.locator('.brd-pick').count())===1); await p.locator('.brd-pick').getByRole('button',{name:'Close'}).click(); await p.waitForTimeout(300);
await step(5); ok('step 6 -> Mark complete button shown', (await p.locator('.head-act .btn').first().isVisible()) && (await p.locator('.a-head').count())===1);
await step(6); ok('step 7 -> Summary with track drill-down open', (await p.locator('details.tr[open]').count())>=1);
await step(7); ok('step 8 -> Plant A reference at PTP-023', (await p.locator('.crumbs b').innerText()).startsWith('Plant A') && (await p.locator('.row[data-pid="PTP-023"]').count())===1, await p.locator('.crumbs b').innerText());
ok('guide: Next/Previous buttons', await (async()=>{await p.getByRole('button',{name:'Previous',exact:true}).click();await p.waitForTimeout(500);const a=await p.locator('.guide-step[aria-current="step"] .guide-n').innerText();return a==='7'})());
await p.getByRole('button',{name:'Close demo guide'}).click(); await p.waitForTimeout(200); ok('guide: closes', (await p.locator('.guide').count())===0);
await home();
// ---------- start a new assessment
await p.getByPlaceholder(/Fab 2/).fill('Pentair pilot'); await p.getByRole('button',{name:'Start assessment'}).click(); await p.waitForTimeout(600);
ok('new assessment opens', (await p.locator('.a-title input').inputValue())==='Pentair pilot');
const row=i=>p.locator('.row').nth(i), rateBtn=(i,name)=>row(i).locator('.rate button',{hasText:new RegExp('^'+name+'$')});
// ---------- ratings
for(const i of [0,1,2]) await rateBtn(i,'Fit').click();
await p.waitForTimeout(300);
ok('Fit: one click, no comment box', (await p.locator('.ic').count())===0 && (await rateBtn(0,'Fit').getAttribute('aria-pressed'))==='true');
await rateBtn(3,'Partial Fit').click(); await p.waitForTimeout(250);
ok('Partial Fit: comment box, Save disabled + required msg', (await p.locator('.ic').count())===1 && await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).isDisabled() && /required/i.test(await p.locator('.ic-err').innerText()));
await p.getByRole('button',{name:'Add transcript'}).click(); await p.waitForTimeout(200);
await p.getByRole('button',{name:'Insert sample transcript'}).click(); await p.waitForTimeout(200);
const tx=await p.locator('.ic-x textarea').inputValue(); ok('Insert sample transcript fills consultant/client text', /Consultant:/.test(tx)&&/Client/.test(tx)&&tx.length>150, tx.slice(0,90).replace(/\n/g,' / '));
await scanBad(p,'inline comment box + transcript');
await p.screenshot({path:OUT+'/inline-transcript.png'});
ok('Partial Fit: still needs a comment (transcript alone is not enough)', await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).isDisabled());
await p.locator('.ic-text').first().fill('Needs an extra approval step.'); await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).click(); await p.waitForTimeout(300);
ok('Partial Fit saved with comment', (await row(3).innerText()).includes('Needs an extra approval step.'));
await rateBtn(4,'Not Fit').click(); await p.waitForTimeout(200);
ok('Not Fit: comment required', await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).isDisabled());
await p.locator('.ic-text').first().fill('Not available in standard.'); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(300);
ok('Not Fit saved (Ctrl+Enter)', (await rateBtn(4,'Not Fit').getAttribute('aria-pressed'))==='true');
await rateBtn(5,'Not Applicable').click(); await p.waitForTimeout(250);
ok('Not Applicable: one click', (await rateBtn(5,'Not Applicable').getAttribute('aria-pressed'))==='true' && (await p.locator('.progress-row').innerText()).startsWith('6 of 399'), await p.locator('.progress-row').innerText());
// keyboard shortcut
await rateBtn(6,'Fit').focus(); await p.keyboard.press('1'); await p.waitForTimeout(250); ok('keyboard 1 = Fit', (await rateBtn(6,'Fit').getAttribute('aria-pressed'))==='true');
await p.locator('.row').nth(6).locator('.rate button').first().click(); // toggle no-op
// transcript upload txt
await rateBtn(7,'Partial Fit').click(); await p.waitForTimeout(200); await p.getByRole('button',{name:'Add transcript'}).click();
await p.locator('.ic-x input[type=file]').setInputFiles({name:'call.txt',mimeType:'text/plain',buffer:Buffer.from('Consultant: hello from a txt file.\nClient: noted.')}); await p.waitForTimeout(400);
ok('.txt upload fills transcript', (await p.locator('.ic-x textarea').inputValue()).includes('hello from a txt file'));
await p.locator('.ic-x input[type=file]').setInputFiles('/root/.claude/uploads/055b2498-df96-5b84-9021-cb449628e332/9522387c-Call_with_Dilasha_Jain.docx'); await p.waitForTimeout(900);
const dx=await p.locator('.ic-x textarea').inputValue(); ok('.docx upload extracts text in browser', dx.length>1000&&!/<w:|PK\u0003/.test(dx), dx.length+' chars');
await p.locator('.ic-x input[type=file]').setInputFiles({name:'x.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')}); await p.waitForTimeout(400);
ok('wrong file type -> in-app toast, no native dialog', /\.txt, \.vtt or \.docx/.test(await p.locator('.toast').innerText()) && dialogs.length===0, await p.locator('.toast').innerText());
await p.locator('.ic-x input[type=file]').setInputFiles({name:'broken.docx',mimeType:'application/octet-stream',buffer:Buffer.from('not a zip file at all')}); await p.waitForTimeout(500);
ok('unreadable .docx -> in-app toast', /read text from that \.docx/.test(await p.locator('.toast').innerText()), await p.locator('.toast').innerText());
await p.locator('.ic-text').first().fill('Extra step.'); await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).click(); await p.waitForTimeout(300);
// ---------- summary numbers
await p.getByRole('button',{name:'View Assessment Summary'}).click(); await p.waitForTimeout(500);
const bd=(await p.locator('.s-hero .bd').innerText()).replace(/\s+/g,' '), hero=(await p.locator('.s-hero').innerText()).replace(/\s+/g,' ');
console.log('   ',bd);
ok('summary: F/P/N % of scored, N/A count + % of rated', /Fit 57\.1% of scored · 4/.test(bd)&&/Partial Fit 28\.6% of scored · 2/.test(bd)&&/Not Fit 14\.3% of scored · 1/.test(bd)&&/Not Applicable 12\.5% of rated · 1/.test(bd) , bd);
ok('summary: note explains denominators', /add up to 100%/.test(hero)&&/shown separately as a share of the 8 rated/.test(hero));
ok('summary: completion = rated incl. N/A / total', /Completion 2%: 8 of 399 processes rated, including Not Applicable\. 7 of them are scored\./.test(hero), hero.match(/Completion[^.]*\.[^.]*\./)?.[0]);
await scanBad(p,'summary'); await p.screenshot({path:OUT+'/summary.png',fullPage:true});
// drill-down
await p.locator('details.tr summary').first().click(); await p.waitForTimeout(250);
await p.locator('details.tr[open] .trow.sub .link').first().click(); await p.waitForTimeout(600);
ok('drill-down: track area opens filtered assessment list', (await p.locator('.filter-note').innerText()).startsWith('PTP') && (await p.locator('.row').count())>0, (await p.locator('.filter-note').innerText()).slice(0,60));
// ---------- Mark all w/ in-app confirm
await p.locator('.tree-btn',{hasText:'PTP'}).first().click(); await p.waitForTimeout(300);
const before=(await p.locator('.progress-row').innerText());
await p.getByRole('button',{name:'Mark all Fit'}).last().click(); await p.waitForTimeout(300);
ok('Mark all Fit: in-app modal (not native)', (await p.locator('dialog[open] .pfa-modal').count())===1 && /unrated process/.test(await p.locator('dialog[open]').innerText()) && dialogs.length===0, (await p.locator('dialog[open]').innerText()).replace(/\s+/g,' ').slice(0,140));
await p.screenshot({path:OUT+'/modal.png'});
await p.locator('dialog[open]').getByRole('button',{name:'Cancel'}).click(); await p.waitForTimeout(300);
ok('Mark all: Cancel changes nothing', (await p.locator('.progress-row').innerText())===before);
await p.getByRole('button',{name:'Mark all Fit'}).last().click(); await p.waitForTimeout(300); await p.locator('dialog[open]').getByRole('button',{name:/^Mark all Fit$/}).click(); await p.waitForTimeout(400);
ok('Mark all: confirm marks processes + undo note', (await p.locator('.progress-row').innerText())!==before && (await p.locator('.bulk-note').count())===1, await p.locator('.bulk-note').innerText());
await p.getByRole('button',{name:'Mark all N/A'}).nth(3).click(); await p.waitForTimeout(300); await p.locator('dialog[open]').getByRole('button',{name:'Cancel'}).click(); await p.waitForTimeout(200);
// ---------- search
const inp=p.getByPlaceholder(/search/i).first(); await p.locator('.tree-btn',{hasText:'All processes'}).click(); await p.waitForTimeout(200);
await inp.fill('PTP-018'); await p.waitForTimeout(400); ok('search PTP-018', JSON.stringify(await p.locator('.row .pid').allInnerTexts())==='["PTP-018"]' && (await p.locator('.acc').count())===1, await p.locator('.filter-note').innerText());
await inp.fill('ME01'); await p.waitForTimeout(400); const me=await p.locator('.row .pid').allInnerTexts(); ok('search ME01', me.includes('PTP-019')&&me.length>=1&&me.length<=3, me.join(','));
await inp.fill('Source List'); await p.waitForTimeout(400); const sl=await p.locator('.row .pid').allInnerTexts(); ok('search Source List', sl.length>=4&&(await p.locator('.acc-h3 .acc-t').allInnerTexts()).every(t=>/source list/i.test(t)), sl.join(','));
await inp.fill(''); await p.waitForTimeout(300);
// ---------- dirty guard (in-app)
await home(); await p.locator('tbody tr',{hasText:/Plant A/}).getByRole('button',{name:'Assess',exact:true}).click(); await p.waitForTimeout(500);
await inp.fill('PTP-023'); await p.waitForTimeout(400);
const rowA=p.locator('.row[data-pid="PTP-023"]');
ok('Plant A: PTP-023 Partial Fit + comment', (await rowA.locator('.rate button[aria-pressed="true"]').innerText())==='Partial Fit' && (await rowA.innerText()).includes('Standard review'));
await inp.fill('PTP-018'); await p.waitForTimeout(400); ok('Plant A: PTP-018 Fit', (await p.locator('.row[data-pid="PTP-018"] .rate button[aria-pressed="true"]').innerText())==='Fit');
await inp.fill('PTP-023'); await p.waitForTimeout(400);
await rowA.locator('.row-main').click(); await p.waitForTimeout(300);
ok('Plant A: PTP-023 has transcript in history', (await p.locator('.wk').innerText()).includes('Transcript') || (await p.locator('.wk details, .wk summary').count())>0);
await p.locator('.wk').getByRole('button',{name:'Edit',exact:true}).click(); await p.locator('.wk textarea').first().fill('changed in the demo'); await p.waitForTimeout(200);
await p.locator('.tab',{hasText:'Assessment Summary'}).click(); await p.waitForTimeout(400);
ok('unsaved-changes guard: in-app modal', (await p.locator('dialog[open]').innerText()).includes('Discard unsaved changes?') && dialogs.length===0);
await p.locator('dialog[open]').getByRole('button',{name:'Keep editing'}).click(); await p.waitForTimeout(300);
ok('guard: Keep editing stays', (await p.locator('.s-hero').count())===0 && (await p.locator('.wk textarea').first().inputValue())==='changed in the demo');
await p.locator('.tab',{hasText:'Assessment Summary'}).click(); await p.waitForTimeout(300); await p.locator('dialog[open]').getByRole('button',{name:'Discard'}).click(); await p.waitForTimeout(500);
ok('guard: Discard continues to Summary', (await p.locator('.s-hero').count())===1);
// Plant A summary + BRD
const bdA=(await p.locator('.s-hero .bd').innerText()).replace(/\s+/g,' '); ok('Plant A summary numbers', /Fit 66\.7% of scored · 72/.test(bdA)&&/Not Applicable 10% of rated · 12/.test(bdA), bdA);
await p.getByRole('button',{name:'Generate BRD',exact:true}).click(); await p.locator('.brd-pick input').fill('PTP-023'); await p.waitForTimeout(300); await p.locator('.brd-pick-item').first().click(); await p.waitForTimeout(500);
const brd=await p.locator('dialog.brd .brd-body').innerText();
ok('BRD (PTP-023): full sample content', /This results in:/.test(brd)&&/Operational Benefits/.test(brd)&&!/\[To be defined/.test(brd)&&/release strategy/i.test(brd)&&/Assessment comment:/.test(brd)&&/Appendix B/.test(brd));
await scanBad(p,'BRD dialog'); await p.screenshot({path:OUT+'/brd.png'});
await p.getByRole('button',{name:'Copy text'}).click(); await p.waitForTimeout(300);
ok('BRD Copy', (await p.getByRole('button',{name:'Copied'}).count())===1 && /BUSINESS REQUIREMENTS DOCUMENT/.test(await p.evaluate(()=>window.__clip||'')));
const [dl]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download (.docx)'}).click()]); const dlp=OUT+'/'+dl.suggestedFilename(); await dl.saveAs(dlp);
ok('BRD Download .docx', /^BRD-PTP-023\.docx$/.test(dl.suggestedFilename())&&fs.statSync(dlp).size>15000, dl.suggestedFilename()+' '+fs.statSync(dlp).size+' bytes');
await p.getByRole('button',{name:'Close',exact:true}).last().click(); await p.waitForTimeout(300);
// ---------- full sample BRDs x6 in a fresh assessment
await home(); await p.getByPlaceholder(/Fab 2/).fill('BRD check'); await p.getByRole('button',{name:'Start assessment'}).click(); await p.waitForTimeout(600);
const full=[]; 
for(const pid of ['PTP-018','PTP-023','PTP-005','PTP-017','PTP-033','PTP-050']){await inp.fill(pid); await p.waitForTimeout(350); const rw=p.locator(`.row[data-pid="${pid}"]`); await rw.locator('.rate button',{hasText:/^Partial Fit$/}).click(); await p.waitForTimeout(200); await p.locator('.ic-text').first().fill('Gap noted for '+pid+'.'); await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).click(); await p.waitForTimeout(250); await rw.locator('.brd-btn').click(); await p.waitForTimeout(350); const t=await p.locator('dialog.brd .brd-body').innerText(); full.push([pid,/This results in:/.test(t)&&/Operational Benefits\s+\S/.test(t)&&!/\[To be defined/.test(t)&&!/\[To be confirmed with the business owner\]/.test(t)&&/BR-02/.test(t)]); await p.getByRole('button',{name:'Close',exact:true}).last().click(); await p.waitForTimeout(250);}
ok('6 full sample BRDs (PTP-018, 023, 005, 017, 033, 050)', full.every(f=>f[1]), JSON.stringify(full));
await inp.fill('PTP-024'); await p.waitForTimeout(350); const rg=p.locator('.row[data-pid="PTP-024"]'); await rg.locator('.rate button',{hasText:/^Partial Fit$/}).click(); await p.locator('.ic-text').first().fill('Need a custom field on the requisition.'); await p.locator('.ic').getByRole('button',{name:'Save',exact:true}).click(); await p.waitForTimeout(250); await rg.locator('.brd-btn').click(); await p.waitForTimeout(350);
const gen=await p.locator('dialog.brd .brd-body').innerText(); ok('other processes keep the generic template', /\[To be defined during functional design\]/.test(gen)&&/custom field on the requisition/.test(gen)); await p.getByRole('button',{name:'Close',exact:true}).last().click(); await p.waitForTimeout(250); await inp.fill('');
// ---------- mark complete below 100%
await home(); await p.locator('tbody tr',{hasText:/Pentair pilot/}).getByRole('button',{name:'Assess',exact:true}).click(); await p.waitForTimeout(500);
await p.getByRole('button',{name:'Mark complete'}).click(); await p.waitForTimeout(350);
ok('Mark complete below 100%', /marked complete/i.test(await p.locator('.toast').innerText()) && (await p.locator('.chip.done').count())===1 && /of 399 rated/.test(await p.locator('.progress-row').innerText()), await p.locator('.progress-row').innerText());
await scanBad(p,'assess screen');
// ---------- refresh persistence
await p.reload(); await p.waitForTimeout(900); r=await rows();
ok('refresh persists my assessment + status', r.some(t=>/Pentair pilot/.test(t)&&/Completed/.test(t)) && r.length===4, r.map(t=>t.slice(0,40)).join(' | '));
ok('refresh: no demo-mode note when storage works', (await p.getByText('Demo mode').count())===0);
// ---------- reset demo restores seeds
await p.getByLabel(/Delete Plant A/).click(); await p.waitForTimeout(300); await p.locator('dialog[open]').getByRole('button',{name:/delete/i}).click(); await p.waitForTimeout(400);
await p.locator('tbody tr',{hasText:/Plant B/}).getByRole('button',{name:'Assess',exact:true}).click(); await p.waitForTimeout(400); await rateBtn(0,'Not Applicable').click(); await p.waitForTimeout(300); await home();
await p.getByRole('button',{name:'Reset demo data'}).click(); await p.waitForTimeout(300);
const rtxt=await p.locator('dialog[open]').innerText(); ok('Reset: in-app confirm, wording clean', /Reset demo data\?/.test(rtxt)&&!/SAMPLE|sample|placeholder/i.test(rtxt)&&dialogs.length===0, rtxt.replace(/\s+/g,' '));
await p.locator('dialog[open]').getByRole('button',{name:'Reset demo data'}).click(); await p.waitForTimeout(500); r=await rows();
ok('Reset restores Plant A + Plant B seeds, keeps mine', r.some(t=>/Plant A/.test(t)&&/77\.8%/.test(t))&&r.some(t=>/Plant B/.test(t)&&/70%/.test(t)&&/40 of 399/.test(t))&&r.some(t=>/Pentair pilot/.test(t)), r.map(t=>t.slice(0,30)).join(' | '));
await scanBad(p,'home after reset'); await p.screenshot({path:OUT+'/home.png'});
// ---------- storage blocked
const [c2,p2]=await mk({width:1440,height:900},()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}})});
await p2.goto('file://'+FILE); await p2.waitForTimeout(900);
const t2=await p2.evaluate(()=>document.body.innerText); ok('storage blocked: works in memory with seeds', (await p2.locator('tbody tr').count())===2);
ok('storage blocked: one neutral note', (t2.match(/Demo mode – changes are kept while this tab is open\./g)||[]).length===1 && !/blocking|SharePoint|Storage is full/.test(t2));
await p2.getByPlaceholder(/Fab 2/).fill('Memory only'); await p2.getByRole('button',{name:'Start assessment'}).click(); await p2.waitForTimeout(600); await p2.locator('.row').first().locator('.rate button',{hasText:/^Fit$/}).click(); await p2.waitForTimeout(900);
ok('storage blocked: rating works, note still single', (await p2.locator('.progress-row').innerText()).startsWith('1 of')&&(await p2.getByText('Demo mode – changes are kept while this tab is open.').count())===1);
await c2.close();
// ---------- global
ok('no console errors or warnings', logs.length===0, logs.join(' || '));
ok('no network requests (all http/https blocked)', net.length===0, net.join(','));
ok('no native dialogs fired', dialogs.length===0, dialogs.join(' | '));
const html=fs.readFileSync(FILE,'utf8'); ok('file: no external URLs/links/fonts', !/<link[^>]+(href|src)=["']https?:/i.test(html)&&!/fonts\.(googleapis|gstatic)/.test(html)&&!/<script[^>]+src=/i.test(html)&&!/@import/.test(html));
ok('file: no SharePoint / host path', !/__PFA_HOST__|SharePoint|parent\.postMessage|__pfaSave/.test(html));
await ctx.close(); await b.close();
const fail=results.filter(x=>!x[0]); console.log(`\n${results.length-fail.length}/${results.length} passed`); fs.writeFileSync(OUT+'/results.json',JSON.stringify(results)); process.exit(fail.length?1:0);
