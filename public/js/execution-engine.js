/* Local-only preparation + explicitly synthetic routing simulator.
 * There is intentionally NO school connector or signing implementation here.
 * Treat every client-side value as untrusted; never deploy this as an approval service.
 */
(function(root){
'use strict';
const VERSION='1.1.0-execution-alpha.1';
const clone=x=>JSON.parse(JSON.stringify(x));
const LIMIT=2000;
const clean=x=>String(x??'').trim().slice(0,LIMIT);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=['applicant','unit1','unit2','fundCode','purpose','payee','documentNo','documentDate','amount','originalMode','servicePoint'];
const money=s=>{const t=String(s??'').replaceAll(',','');return /^\d+(?:\.\d{1,2})?$/.test(t)&&Number(t)>0&&Number(t)<=1e9?Number(t):null;};
function dateOK(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===s;}
function record(s,kind,detail){s.events.push({sequence:s.events.length+1,at:new Date().toISOString(),revision:s.revision,kind,detail:clean(detail),environment:s.demo?'sandbox':'local-preparation'});}
function newCase({demo=false,lane='purchase',preflight=null}={}){
 return {version:VERSION,id:'LOCAL-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),demo:!!demo,lane,revision:1,fields:Object.fromEntries(fields.map(k=>[k,''])),provenance:{},preflight:preflight?clone(preflight):null,confirmedRevision:null,preparedRevision:null,routePolicy:'unconfigured',submitted:false,officialReceipt:null,paymentConfirmed:false,originalReceived:false,status:'DRAFT',tasks:[],events:[],demoReceipt:null,returnedRevision:null};
}
function mutate(s){s.revision++;s.confirmedRevision=null;s.preparedRevision=null;s.status='DRAFT';s.tasks=[];s.demoReceipt=null;s.originalReceived=false;s.submitted=false;s.paymentConfirmed=false;}
function update(s,patch,provenance={}){
 const keys=Object.keys(patch).filter(k=>fields.includes(k));
 const changed=keys.filter(k=>s.fields[k]!==clean(patch[k]));
 if(!changed.length)return s;
 mutate(s);
 for(const k of changed){s.fields[k]=clean(patch[k]);s.provenance[k]=clean(provenance[k]||'使用者輸入；未驗證');}
 record(s,'EDIT_INVALIDATES_CONFIRMATION','欄位修改：'+changed.join('、')+'；前版確認、演練回覆及付款狀態不再適用。');
 return s;
}
function changeLane(s,lane){if(!['purchase','lecture','hire'].includes(lane))throw Error('無效案件類型');if(lane!==s.lane){mutate(s);s.lane=lane;record(s,'LANE_CHANGED',lane);}return s;}
function validate(s){
 const issues=[];const names={applicant:'申請人代稱',unit1:'經費所屬一級單位',unit2:'經費所屬二級單位',fundCode:'經費代碼',purpose:'真實支出用途',payee:'受款人代稱'};
 for(const [k,v] of Object.entries(names))if(!clean(s.fields[k]))issues.push('尚缺：'+v);
 if(money(s.fields.amount)===null)issues.push('金額需為有效正數，最多兩位小數。');
 if(!dateOK(s.fields.documentDate))issues.push('文件日期不完整或無效。');
 if(!['paper','digital','unknown'].includes(s.fields.originalMode)||s.fields.originalMode==='unknown')issues.push('原件處理方式尚未由承辦確認。');
 if(s.fields.originalMode==='paper'&&!clean(s.fields.servicePoint))issues.push('尚未指定原件交接窗口。');
 return issues;
}
function confirm(s,consent){if(s.returnedRevision===s.revision)throw Error('退件後需更新資料並建立新版，不能原樣重送。');if(consent!==true)throw Error('需要確認本版金額、經費、用途與受款資料。');const v=validate(s);if(v.length)throw Error(v.join('\n'));s.confirmedRevision=s.revision;record(s,'LOCAL_CONFIRMATION','僅确认本版工作底稿；不是校方簽章或核准。');return s;}
function prepare(s){const v=validate(s);if(v.length)throw Error(v.join('\n'));if(s.confirmedRevision!==s.revision)throw Error('本版資料尚未確認。');s.preparedRevision=s.revision;s.status='PREPARED_NOT_SUBMITTED';record(s,'DRAFT_PREPARED','已產生工作底稿及待串接資料；未建立官方報帳單。');return packet(s);}
function requestLive(){return {ok:false,code:'SCHOOL_CONNECTOR_NOT_CONNECTED',submitted:false,receipt:null,message:'未送出：尚無校方核准的串接、正式表單對照、承辦核定路徑與可信回執。此版不會登入校務、不會寄信、不會代簽或付款。'};}
function routeFor(s){
 if(!s.demo||s.routePolicy!=='synthetic-training-v1')return [];
 // These supervisor nodes are a deliberately selected training fixture, not a campus-wide rule.
 const nodes=[{id:'intake',label:'合作收件窗口',role:'case_handler'}];
 if(s.lane==='hire')nodes.push({id:'hr',label:'用人／聘僱承辦',role:'hr_handler'});
 if(s.lane==='lecture'||s.lane==='hire')nodes.push({id:'income',label:'出納所得預審',role:'cashier_precheck'});
 nodes.push({id:'unit2',label:'二級主管（範例指定）',role:'unit2_approver'},{id:'unit1',label:'一級主管（範例指定）',role:'unit1_approver'},{id:'accounting',label:'主計審核與製票',role:'accountant'},{id:'cashier',label:'出納付款結果',role:'cashier'});
 return nodes.map((n,i)=>({...n,after:i?[nodes[i-1].id]:[],status:'WAITING',evidence:null}));
}
function startDemo(s){
 if(!s.demo)throw Error('真實工作底稿不可進入模擬核准流程。');
 if(s.preparedRevision!==s.revision||s.confirmedRevision!==s.revision)throw Error('先確認並產生本版工作底稿。');
 if(s.status!=='PREPARED_NOT_SUBMITTED')throw Error('本版演練已啟動；不能重複送出。');
 s.routePolicy='synthetic-training-v1';s.tasks=routeFor(s);s.tasks[0].status='PENDING';s.demoReceipt='DEMO-'+s.id+'-R'+s.revision;s.status='SIMULATED_IN_PROGRESS';record(s,'SIMULATED_DISPATCH',s.demoReceipt+'；沒有真實收件人或校方回執。');return s;
}
function receiveOriginalDemo(s){if(!s.demo||s.fields.originalMode!=='paper'||s.status!=='SIMULATED_IN_PROGRESS')throw Error('不是等待纸本的演練案件。');if(s.originalReceived)throw Error('已記錄演練收件，不重複登錄。');s.originalReceived=true;record(s,'SIMULATED_ORIGINAL_HANDOVER',s.fields.servicePoint+'：演練原件收件事件；沒有實際取件。');return s;}
function applyDemoEvent(s,{taskId,role,revision,decision,reference,reason}={}){
 if(!s.demo||s.status!=='SIMULATED_IN_PROGRESS')throw Error('僅接受正在演練的案件。');
 if(revision!==s.revision||s.confirmedRevision!==s.revision)throw Error('回覆不是本版資料，拒絕沿用舊確認。');
 const task=s.tasks.find(t=>t.id===taskId);if(!task||task.status!=='PENDING')throw Error('此節點尚未到達或已處理。');
 if(task.role!==role)throw Error('回覆角色與節點權責不符。');
 if(!/^DEMO-/.test(reference||''))throw Error('演練回覆必須使用 DEMO- 參考號，不冒充正式回執。');
 if(s.tasks.some(t=>t.evidence===reference))throw Error('重複的演練回覆參考號，拒絕重放。');
 if(!['approve','return'].includes(decision))throw Error('無效事件類型。');
 if(decision==='return'){
  if(!clean(reason))throw Error('退回需附具體補件原因。');
  task.status='RETURNED';task.evidence=clean(reference);s.returnedRevision=s.revision;s.status='SIMULATED_NEEDS_CORRECTION';s.confirmedRevision=null;s.preparedRevision=null;record(s,'SIMULATED_RETURN',task.label+'：'+reason);return s;
 }
 if(taskId==='intake'&&s.fields.originalMode==='paper'&&!s.originalReceived)throw Error('原件尚未由演練窗口接手，不能越過收件節點。');
 if(task.after.some(id=>s.tasks.find(t=>t.id===id).status!=='DONE'))throw Error('前序節點未完成。');
 task.status='DONE';task.evidence=clean(reference);record(s,'SIMULATED_ROLE_REPLY',task.label+'：'+reference);
 const next=s.tasks.find(t=>t.status==='WAITING');if(next)next.status='PENDING';else {s.status='SIMULATED_COMPLETED';record(s,'SIMULATED_FINISH','所有演練節點完成；實際送件、實際核准、實際付款均仍為否。');}
 return s;
}
function packet(s){return {
 schema:VERSION,documentType:'ADMINSCAN_WORKSHEET_NOT_OFFICIAL_FORM',environment:s.demo?'SYNTHETIC_SANDBOX':'LOCAL_PREPARATION',caseId:s.id,revision:s.revision,fields:clone(s.fields),provenance:clone(s.provenance),preflight:s.preflight,confirmed:s.confirmedRevision===s.revision,prepared:s.preparedRevision===s.revision,
 mappingStatus:'UNVERIFIED_NO_OFFICIAL_TEMPLATE_ADAPTER',routeStatus:s.demo?'SYNTHETIC_ONLY':'UNCONFIGURED',officialSubmission:false,officialReceipt:null,officialApproval:false,paymentConfirmed:false,
 supportingFilesIncluded:false,missingIntegration:['校方與經費單位核准','正式表單範本與欄位對照','限定範圍身分授權','承辦核定的簽核路徑','學校回執與進度介接','原件接手窗口及交接紀錄'],
 documents:[{title:'報支資料工作底稿',kind:'worksheet',official:false},{title:'附件與原件交接說明',kind:'handoff-draft',official:false}],events:clone(s.events),notice:'這不是黏存單、所得表或正式表單，不含官方條碼、印章、完整證號或銀行帳號。原始檔與附件未嵌入。本機紀錄可被修改，不能作正式簽核或付款證據。'};}
function worksheetHTML(s){
 const p=packet(s),names={applicant:'申請人代稱',unit1:'經費所屬一級單位',unit2:'經費所屬二級單位',fundCode:'經費代碼',purpose:'支出用途',payee:'受款人代稱',documentNo:'文件／發票號碼',documentDate:'文件日期',amount:'金額',originalMode:'原件方式',servicePoint:'交接窗口'};
 return '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AdminScan 製單工作底稿（未送件）</title><style>body{font-family:system-ui,sans-serif;max-width:850px;margin:35px auto;padding:20px;line-height:1.7;color:#203443}h1{font-size:26px}.notice{padding:16px;background:#fff3d6;border:1px solid #c89745}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{text-align:left;padding:9px;border-bottom:1px solid #cbd5df;overflow-wrap:anywhere}th{width:30%}small{color:#586b78}@media print{body{margin:0;padding:0}}</style><h1>'+ (s.demo?'合成演練 · ':'')+'報支資料工作底稿</h1><p class="notice"><b>不是正式黏存單／所得表；未送件、未核准、未付款。</b><br>沒有官方條碼或印章。需由承辦以核准範本或官方系统轉製。'+esc(p.notice)+'</p><p>本機案件：'+esc(p.caseId)+' · 版本 '+p.revision+'</p><table>'+Object.entries(names).map(([k,l])=>'<tr><th>'+esc(l)+'</th><td>'+esc(p.fields[k]||'尚未提供')+'<br><small>來源：'+esc(p.provenance[k]||'未確認')+'</small></td></tr>').join('')+'</table><h2>製單與原件處理</h2><p>金額、經費、用途與受款資料：'+(p.confirmed?'已在本機由操作者確認；不是有效簽章':'尚未確認')+'。正式表單對照尚未完成，未產生學校單號。</p><p>紙本原件應依承辦核定的方式交接；電子憑證是否可免紙本需逐案確認。原件／附件本身未嵌入此檔。</p><h2>接手單位待辦</h2><p>核對文件與經費授權 → 選定官方範本 → 核定簽核與原件路徑 → 產生正式單號與回執。不是所有案件都需要一級、二級主管兩關；也不可省略規定要求的審核。</p><h2>未完成的校方串接</h2><p>'+p.missingIntegration.map(esc).join('；')+'。</p><p><b>此檔含人工輸入的案件資料，請僅交授權承辦並妥善保存。</b></p></html>';
}
const api={VERSION,newCase,update,changeLane,validate,confirm,prepare,requestLive,routeFor,startDemo,receiveOriginalDemo,applyDemoEvent,packet,worksheetHTML,money,dateOK};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.AdminExecution=api;
})(typeof globalThis!=='undefined'?globalThis:this);
