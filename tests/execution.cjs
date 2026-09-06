'use strict';
const X=require('../public/js/execution-engine.js'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const rows=[];function test(name,fn){try{fn();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:e.message});}}
const base={applicant:'測試者',unit1:'示範學院',unit2:'示範單位',fundCode:'DEMO-FUND',purpose:'合成測試用途',payee:'測試受款人',amount:'860',documentDate:'2026-09-06',originalMode:'paper',servicePoint:'示範收件窗口'};
function make(demo=false,lane='purchase'){const s=X.newCase({demo,lane});X.update(s,base);return s;}
function ready(){const s=make(true);X.confirm(s,true);X.prepare(s);X.startDemo(s);return s;}
function reply(s,decision='approve',extra={}){const t=s.tasks.find(t=>t.status==='PENDING');return X.applyDemoEvent(s,{taskId:t.id,role:t.role,revision:s.revision,decision,reference:'DEMO-'+s.events.length,reason:'測試補件',...extra});}
test('空白案件不推定經費、受款人或主管',()=>{const s=X.newCase();assert(X.validate(s).length>=8);assert.deepEqual(X.routeFor(s),[]);});
test('有效底稿可通過欄位檢查',()=>assert.equal(X.validate(make()).length,0));
test('金額不接受空字串、NaN、負數、科學記號、超額小數',()=>{for(const v of ['',NaN,'-1','1e3','1.234','99999999999'])assert.equal(X.money(v),null);});
test('金額接受一般逗點格式',()=>assert.equal(X.money('1,200.50'),1200.5));
test('無效日期不接受',()=>{for(const d of ['2026-02-30','2026-13-01','09/06/2026',''])assert.equal(X.dateOK(d),false);});
test('紙本需指定接手窗口',()=>{const s=make();X.update(s,{servicePoint:''});assert(X.validate(s).some(v=>v.includes('窗口')));});
test('原件方式未知須停下確認',()=>{const s=make();X.update(s,{originalMode:'unknown'});assert(X.validate(s).some(v=>v.includes('原件')));});
test('不可以沒有確認就產單',()=>assert.throws(()=>X.prepare(make()),/確認/));
test('不可以沒有同意就確認',()=>assert.throws(()=>X.confirm(make(),false),/確認/));
test('確認後能生成底稿而非官方文件',()=>{const s=make();X.confirm(s,true);const p=X.prepare(s);assert.equal(p.prepared,true);assert.equal(p.documentType,'ADMINSCAN_WORKSHEET_NOT_OFFICIAL_FORM');assert.equal(p.officialReceipt,null);});
test('修改金額使舊確認與產單失效',()=>{const s=make();X.confirm(s,true);X.prepare(s);X.update(s,{amount:'900'});assert.equal(s.confirmedRevision,null);assert.equal(s.preparedRevision,null);});
test('修改單位、經費、受款人同樣失效',()=>{for(const k of ['unit1','unit2','fundCode','payee']){const s=make();X.confirm(s,true);X.prepare(s);X.update(s,{[k]:'新的值'});assert.equal(s.confirmedRevision,null);}});
test('相同值不造成虛假版本異動',()=>{const s=make();const v=s.revision;X.update(s,{amount:'860'});assert.equal(s.revision,v);});
test('未知欄位不能植入正式提交狀態',()=>{const s=make();X.update(s,{submitted:true,officialReceipt:'FAKE'});assert.equal(s.submitted,false);assert.equal(s.officialReceipt,null);});
test('正式代送永遠回報未接通，不產回執',()=>{const r=X.requestLive();assert.equal(r.ok,false);assert.equal(r.submitted,false);assert.equal(r.receipt,null);});
test('即使合成流程完成也不提供正式提交能力',()=>{const s=ready();X.receiveOriginalDemo(s);while(s.tasks.some(t=>t.status==='PENDING'))reply(s);assert.equal(X.requestLive(s).submitted,false);});
test('真實底稿不能混入模擬核准',()=>{const s=make();X.confirm(s,true);X.prepare(s);assert.throws(()=>X.startDemo(s),/真實/);});
test('沒有確認的合成案例不能啟動',()=>assert.throws(()=>X.startDemo(make(true)),/確認/));
test('合成送件防止重複啟動',()=>{const s=ready();assert.throws(()=>X.startDemo(s),/重複/);});
test('一級二級名稱不自動成為真實簽核路徑',()=>{const s=make();X.confirm(s,true);X.prepare(s);assert.deepEqual(X.routeFor(s),[]);});
test('合成收件節點在原件接手前不能完成',()=>{const s=ready();assert.throws(()=>reply(s),/原件/);});
test('原件演練記錄不接受重複交接',()=>{const s=ready();X.receiveOriginalDemo(s);assert.throws(()=>X.receiveOriginalDemo(s),/重複/);});
test('不可跳到後面的付款節點',()=>{const s=ready();assert.throws(()=>X.applyDemoEvent(s,{taskId:'cashier',role:'cashier',revision:s.revision,decision:'approve',reference:'DEMO-PAY'}),/尚未到達/);});
test('錯誤角色不能核准',()=>{const s=ready();assert.throws(()=>reply(s,'approve',{role:'intruder'}),/角色/);});
test('過期版本回覆被拒絕',()=>{const s=ready();assert.throws(()=>reply(s,'approve',{revision:s.revision-1}),/本版/);});
test('不能把任意文字当正式回執',()=>{const s=ready();assert.throws(()=>reply(s,'approve',{reference:'NTU-OFFICIAL-123'}),/DEMO/);});
test('未知動作被拒絕',()=>{const s=ready();assert.throws(()=>reply(s,'pay'),/無效/);});
test('回覆參考號不能跨節點重放',()=>{const s=ready();X.receiveOriginalDemo(s);reply(s,'approve',{reference:'DEMO-SAME'});assert.throws(()=>reply(s,'approve',{reference:'DEMO-SAME'}),/重複/);});
test('正常演練完整走完但真實核准付款維持否',()=>{const s=ready();X.receiveOriginalDemo(s);while(s.tasks.some(t=>t.status==='PENDING'))reply(s);const p=X.packet(s);assert.equal(s.status,'SIMULATED_COMPLETED');assert.equal(p.officialSubmission,false);assert.equal(p.officialApproval,false);assert.equal(p.paymentConfirmed,false);});
test('退回需要具體原因',()=>{const s=ready();assert.throws(()=>reply(s,'return',{reason:''}),/具體/);});
test('退回補件使舊確認失效',()=>{const s=ready();reply(s,'return');assert.equal(s.status,'SIMULATED_NEEDS_CORRECTION');assert.equal(s.confirmedRevision,null);});
test('退回後不得未修改就重送',()=>{const s=ready();reply(s,'return');assert.throws(()=>X.confirm(s,true),/新版/);});
test('補件新版可重跑且不沿用舊合成核准',()=>{const s=ready();X.receiveOriginalDemo(s);reply(s);reply(s,'return');X.update(s,{purpose:'合成補件後的新用途'});assert.equal(s.tasks.length,0);X.confirm(s,true);X.prepare(s);X.startDemo(s);assert.equal(s.tasks[0].status,'PENDING');});
test('切換類型需重新確認',()=>{const s=make();X.confirm(s,true);X.prepare(s);X.changeLane(s,'lecture');assert.equal(s.confirmedRevision,null);});
test('所得示範路徑含出納預審但一般核銷示範不含',()=>{for(const lane of ['lecture','hire','purchase']){const s=make(true,lane);X.confirm(s,true);X.prepare(s);X.startDemo(s);assert.equal(s.tasks.some(t=>t.id==='income'),lane!=='purchase');}});
test('產單 HTML 轉義不受信任文字',()=>{const s=make();X.update(s,{purpose:'<script>alert(1)</script>'});const html=X.worksheetHTML(s);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));});
test('匯出標示未含原始附件及範本未核實',()=>{const p=X.packet(make());assert.equal(p.supportingFilesIncluded,false);assert(p.mappingStatus.includes('UNVERIFIED'));assert(p.notice.includes('原始檔'));});
test('時間戳與修改紀錄可追溯但不是簽章證據',()=>{const s=make();X.confirm(s,true);assert(s.events.every((e,i)=>e.sequence===i+1&&!isNaN(Date.parse(e.at))));assert(X.packet(s).notice.includes('不能作正式'));});
test('原有预檢未解決項目保留在底稿，不冒充放行',()=>{const s=X.newCase({preflight:{status:'HUMAN REVIEW',blockers:['待單位確認']}});X.update(s,base);X.confirm(s,true);const p=X.prepare(s);assert.equal(p.preflight.status,'HUMAN REVIEW');assert.equal(p.officialApproval,false);});
const report={version:X.VERSION,executedAt:new Date().toISOString(),total:rows.length,passed:rows.filter(x=>x.pass).length,mode:'Synthetic unit tests. Not real signature, payment, receipt acceptance, or field evidence.',rows};fs.writeFileSync(path.join(__dirname,'../reports/execution-unit-tests.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
