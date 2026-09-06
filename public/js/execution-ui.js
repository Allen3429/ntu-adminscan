/* Preparation workbench. No requests are made by this module. */
(function(){
'use strict';
const X=AdminExecution,id=x=>document.getElementById(x);
const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=X.newCase(),boundSnapshot=null;
const labels={DRAFT:'待製單確認',PREPARED_NOT_SUBMITTED:'底稿已完成 · 未送件',SIMULATED_IN_PROGRESS:'演練中 · 沒有真實送件',SIMULATED_NEEDS_CORRECTION:'演練退回 · 待補件',SIMULATED_COMPLETED:'演練完成 · 沒有真實付款'};
const fieldIds=['applicant','unit1','unit2','fundCode','purpose','payee','documentNo','documentDate','amount','originalMode','servicePoint'];
function msg(t,error=false){id('execNotice').textContent=t;id('execNotice').className='notice'+(error?' error':'');}
function save(name,data,mime){const u=URL.createObjectURL(new Blob([data],{type:mime})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function syncFields(){for(const k of fieldIds)id('ex_'+k).value=state.fields[k];id('ex_lane').value=state.lane;id('ex_confirm').checked=false;}
function getSummary(){const p=state.preflight;return p?`預檢：${p.status}；仍缺 ${p.questions?.length||0} 項、${p.blockers?.length||0} 個待承辦議題。預檢不等於核准。`:'尚未匯入預檢結果；這只是製單工作台。';}
function render(){
 id('execStatus').textContent=labels[state.status]||state.status;
 id('execEnv').textContent=state.demo?'合成演練（無任何外部動作）':'本機工作底稿（正式路徑未設定）';
 id('execRev').textContent='R'+state.revision;
 id('execSummary').textContent=getSummary();
 id('execMissing').innerHTML=X.validate(state).map(t=>'<div class="ex-missing">'+h(t)+'</div>').join('');
 id('execPrepare').disabled=false;
 id('execExportHTML').disabled=state.preparedRevision!==state.revision;
 id('execExportJSON').disabled=state.preparedRevision!==state.revision;
 id('execDemoControls').hidden=!state.demo;
 id('execStartDemo').disabled=state.status!=='PREPARED_NOT_SUBMITTED';
 const pending=state.tasks.find(t=>t.status==='PENDING');
 id('execOriginal').disabled=!state.demo||state.status!=='SIMULATED_IN_PROGRESS'||state.originalReceived||state.fields.originalMode!=='paper';
 id('execAdvance').disabled=!pending||state.status!=='SIMULATED_IN_PROGRESS';
 id('execReturn').disabled=!pending||state.status!=='SIMULATED_IN_PROGRESS';
 id('execNext').textContent=pending?'演練中等待：'+pending.label:'目前無等待中的演練節點';
 id('execOriginalStatus').textContent=state.fields.originalMode==='paper'?(state.originalReceived?'演練窗口已接手（無實際交接）':'待指定窗口接手原件；不要要求使用者逐樓送件'):state.fields.originalMode==='digital'?'操作者宣告採電子憑證；正式適用性尚須承辦核定':'原件政策尚未核定';
 id('execTasks').innerHTML=state.tasks.length?state.tasks.map(t=>'<div class="ex-task '+(t.status==='PENDING'?'pending':'')+'"><span class="ex-task-dot">'+(t.status==='DONE'?'✓':t.status==='RETURNED'?'!':'○')+'</span><div><b>演練 · '+h(t.label)+'</b><small>'+h({WAITING:'尚未到達',PENDING:'等待此角色回覆',DONE:'已收到合成回覆',RETURNED:'合成退件'}[t.status])+'</small></div></div>').join(''):'<div class="empty"><h3>正式路徑待合作單位核定</h3><p>一級／二級「單位名稱」不是必簽主管清單。<br>沒有核定路徑，不自動編派收件人。</p></div>';
 id('execAudit').innerHTML=state.events.slice().reverse().map(e=>'<div class="trace-row"><b>R'+e.revision+' · '+h(e.kind)+'</b>'+h(e.detail)+'</div>').join('');
 id('execDocumentPreview').innerHTML='<h3>'+ (state.demo?'合成演練 · ':'')+'報支資料工作底稿</h3><p class="micro">不是正式黏存單或所得表；沒有校方條碼、簽章或匯款指示。</p><dl class="ex-dl"><dt>文件日期</dt><dd>'+h(state.fields.documentDate||'待提供')+'</dd><dt>金額</dt><dd>'+h(state.fields.amount||'待提供')+'</dd><dt>經費代碼</dt><dd>'+h(state.fields.fundCode||'待提供')+'</dd><dt>用途</dt><dd>'+h(state.fields.purpose||'待提供')+'</dd><dt>受款人代稱</dt><dd>'+h(state.fields.payee||'待提供')+'</dd></dl>';
}
function inputChanged(){const patch=Object.fromEntries(fieldIds.map(k=>[k,id('ex_'+k).value]));X.update(state,patch);X.changeLane(state,id('ex_lane').value);id('ex_confirm').checked=false;render();msg('資料已更新。先前確認與演練回覆已失效，需核對本版後重新製單。');}
fieldIds.forEach(k=>id('ex_'+k).addEventListener('input',inputChanged));id('ex_lane').addEventListener('change',inputChanged);
id('execImport').onclick=()=>{
 const snap=globalThis.getAdminScanExecutionSnapshot?.();
 if(!snap||!snap.text.trim()){msg('請先在「01 處理案件」放入文件或貼文字並分析；照片／PDF 使用原有本機服務。',true);return;}
 const got=AdminEngine.extract(snap.text),v=k=>got.fields.find(f=>f.id===k),invoice=got.fields.filter(f=>/^invoice\d+$/.test(f.id));
 state=X.newCase({demo:false,lane:['purchase','lecture','hire'].includes(snap.current?.lane)?snap.current.lane:'purchase',preflight:snap.current?{status:snap.current.status,questions:snap.current.questions,blockers:snap.current.blockers,asOf:snap.current.asOf,sourceIds:snap.current.sourceIds}:null});
 const patch={};const provenance={};
 if(v('amount')){patch.amount=String(v('amount').value);provenance.amount='文件辨識候選：'+v('amount').evidence;}
 if(v('documentDate')){patch.documentDate=v('documentDate').value;provenance.documentDate='文件辨識候選：'+v('documentDate').evidence;}
 if(invoice.length===1){patch.documentNo=invoice[0].value;provenance.documentNo='文件辨識候選：'+invoice[0].evidence;}
 X.update(state,patch,provenance);boundSnapshot=JSON.stringify(snap);syncFields();render();msg('已帶入能唯一辨識的文件欄位；經費、用途、受款人與原件安排不能從發票亂猜。正式版應由單位設定與授權資料帶入，這版先人工核對。');
};
id('execDemo').onclick=()=>{
 boundSnapshot=null;state=X.newCase({demo:true,lane:'purchase'});
 const demo={applicant:'測試申請人 A（虛構）',unit1:'示範學院（虛構）',unit2:'示範單位（虛構）',fundCode:'DEMO-FUND-001',purpose:'合成案例：活動用文具，非真實支出',payee:'測試受款人 B（虛構）',documentNo:'DEMO-RECEIPT-001',documentDate:'2026-09-06',amount:'860',originalMode:'paper',servicePoint:'示範單位收件窗口（尚無實際服務）'};
 X.update(state,demo,Object.fromEntries(Object.keys(demo).map(k=>[k,'人工設定的合成測試資料'])));syncFields();render();msg('僅載入合成資料。勾選確認 → 產生工作底稿 → 開始演練；不存在真人審核者或實際收件窗口。');
};
id('execPrepare').onclick=()=>{try{X.confirm(state,id('ex_confirm').checked);X.prepare(state);render();msg('已產生本版製單工作底稿，可匯出 HTML／JSON。尚未建立正式校務單據，未送出。');}catch(e){msg(e.message,true);render();}};
id('execCheckLive').onclick=()=>{const r=X.requestLive();msg(r.message,true);};
id('execExportHTML').onclick=()=>{if(state.preparedRevision!==state.revision)return;save('AdminScan-製單工作底稿-未送件-R'+state.revision+'.html',X.worksheetHTML(state),'text/html;charset=utf-8');msg('底稿已匯出；不是寄信或送件。附件原檔未嵌入，匯出檔請交授權承辦妥善保存。');};
id('execExportJSON').onclick=()=>{if(state.preparedRevision!==state.revision)return;save('AdminScan-待串接資料-未送件-R'+state.revision+'.json',JSON.stringify(X.packet(state),null,2),'application/json');msg('已匯出待串接資料；没有發送至任何系統。');};
id('execStartDemo').onclick=()=>{try{X.startDemo(state);render();msg('開始演練。回覆事件均為合成，實際送件／核准／付款一直維持為否。');}catch(e){msg(e.message,true);}};
id('execOriginal').onclick=()=>{try{X.receiveOriginalDemo(state);render();msg('記錄了合成原件收件事件；没有安排或完成實際取件。');}catch(e){msg(e.message,true);}};
function reply(decision){try{const t=state.tasks.find(t=>t.status==='PENDING');if(!t)throw Error('無等待中的演練節點。');X.applyDemoEvent(state,{taskId:t.id,role:t.role,revision:state.revision,decision,reference:'DEMO-REPLY-'+(state.events.length+1),reason:decision==='return'?'合成補件需求：請補明確支出用途。':''});if(decision==='return')id('ex_confirm').checked=false;render();msg(decision==='return'?'演練退件：請修改用途，再確認及製單。本版採保守全程重跑，不沿用前版合成核准。':'已套用一筆合成角色回覆。這不是替主管蓋章。');}catch(e){msg(e.message,true);}}
id('execAdvance').onclick=()=>reply('approve');id('execReturn').onclick=()=>reply('return');
id('execReset').onclick=()=>{state=X.newCase();boundSnapshot=null;syncFields();render();msg('已清除工作台資料。本模組不使用 localStorage，也未傳送案件資料。');};
window.addEventListener('adminscan:base-reset',()=>{state=X.newCase();boundSnapshot=null;syncFields();render();});
window.addEventListener('adminscan:preflight-change',()=>{if(boundSnapshot&&JSON.stringify(globalThis.getAdminScanExecutionSnapshot?.())!==boundSnapshot){state=X.newCase();boundSnapshot=null;syncFields();render();msg('上游文件／預檢條件已更動；為避免誤送舊版，請重新帶入。',true);}});
syncFields();render();
})();
