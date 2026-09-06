/* Optional UI, deliberately separate from AdminEngine and live rule registry. */
(function(root){
'use strict';
const M=root.AdminManual,D=root.AdminManualData;
const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let activeIssue='',lastRecords=[];
function locator(r){
 const p=r.pdfPages[0],txt=`PDF 第 ${r.pdfPages.join('、')} 頁（投影片 ${r.slideNumbers.join('、')}）`;
 if(!D.source.localPath)return `<a href="reference/index.html#page-${p}" target="_blank" rel="noopener noreferrer">${h(txt)} · 來源說明 ↗</a>`;
 return root.AdminManualStandalone?`<span>${h(txt)} · 原文請見完整包 reference/ PDF</span>`:`<a href="reference/CP1739858279340.pdf#page=${p}" target="_blank" rel="noopener noreferrer">${h(txt)} ↗</a>`;
}
function card(r){return `<article class="source-card manual-card"><span class="badge">${h(r.chapter)}</span><span class="manual-risk">${r.risk==='workflow'?'手冊參考 · 未核實現行性':'敏感規則 · 不啟用自動判斷'}</span><h3>${h(r.title)}</h3><p><b>手冊所述：</b>${h(r.sourceSummary)}</p><small>${locator(r)}</small><details><summary>依手冊設計的導覽與確認事項</summary><ol>${r.navigationSuggestions.map(s=>`<li>${h(s)}</li>`).join('')}</ol><b>案件還需確認</b><ul>${r.questionsForCase.map(s=>`<li>${h(s)}</li>`).join('')}</ul><b>本工具的使用界線</b><ul>${r.productGuardrails.map(s=>`<li>${h(s)}</li>`).join('')}</ul></details><small>${h(r.id)} · 僅參考，不改變主預檢狀態</small></article>`;}
function cards(records){lastRecords=records;$('manualCount').textContent=`${records.length} / ${D.records.length} 條參考項目`;$('manualCards').innerHTML=records.length?records.map(card).join(''):'<p class="notice">沒有符合的手冊關鍵字。這不是通用AI問答；請改用「聘號」「分攤」「進度」「校區」「所得」等關鍵字。</p>';}
function resetContext(){activeIssue='';$('allocationFields').hidden=true;$('manualDiagnosis').hidden=true;document.querySelectorAll('[data-manual-issue]').forEach(x=>x.classList.remove('selected'));}
function browse(){resetContext();cards(M.search($('manualSearch').value,$('manualChapter').value));}
function problem(id){
 activeIssue=id;$('manualSearch').value='';$('manualChapter').value='';
 document.querySelectorAll('[data-manual-issue]').forEach(x=>x.classList.toggle('selected',x.dataset.manualIssue===id));
 $('allocationFields').hidden=id!=='allocation';
 const raw=$('fundingCount').value.trim();
 const diag=M.diagnose(id,{fundingCount:raw===''?null:Number(raw)});
 $('manualDiagnosis').hidden=false;
 $('manualDiagnosis').innerHTML=`<h2>${h(diag.label)}</h2><p>${h(diag.message)}</p>${diag.notes.map(n=>`<p class="notice">${h(n)}</p>`).join('')}<details><summary>這個案件還要問什麼？</summary><ul>${diag.questions.map(q=>`<li>${h(q)}</li>`).join('')}</ul></details><p class="micro">僅作手冊導覽與排查建議：未連線查帳、未選定現行制度、未自動核准或送件。</p>`;
 cards(diag.records);
}
function activateManual(query){
 document.querySelector('[data-tab="manual"]').click();
 $('manualSearch').value=query;$('manualChapter').value='';browse();
}
root.renderManualHints=function(text){
 const rows=M.search(text).slice(0,3);$('manualHints').hidden=rows.length===0;
 $('manualHintsContent').innerHTML='<p class="micro">以下是附件手冊的相關參考，不代表已核實現行規則，也不改變上方檢查狀態。</p>'+rows.map(r=>`<button type="button" class="manual-hint" data-manual-ref="${h(r.id)}">${h(r.title)}<small>PDF 第 ${r.pdfPages.join('、')} 頁 →</small></button>`).join('');
 document.querySelectorAll('[data-manual-ref]').forEach(b=>b.onclick=()=>{const r=D.records.find(r=>r.id===b.dataset.manualRef);activateManual(r.title);});
};
$('manualSearch').addEventListener('input',browse);
$('manualChapter').innerHTML='<option value="">全部章節</option>'+D.sectionOrder.map(x=>`<option value="${h(x)}">${h(x)}</option>`).join('');
$('manualChapter').onchange=browse;
$('fundingCount').addEventListener('input',()=>{if(activeIssue==='allocation')problem('allocation');});
document.querySelectorAll('[data-manual-issue]').forEach(b=>b.onclick=()=>{$('fundingCount').value='';problem(b.dataset.manualIssue);});
$('clearManual').onclick=()=>{$('manualSearch').value='';$('manualChapter').value='';$('fundingCount').value='';browse();};
$('clear').addEventListener('click',()=>{$('clearManual').click();});
$('exportManual').onclick=()=>{
 const payload={release:D.release,source:D.source,sourceStatus:'reference-only',canApprove:false,liveQueryPerformed:false,records:lastRecords};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AdminScan-手冊參考摘錄.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('manualVersionNotice').textContent='依據：'+D.source.title+'，共76頁。檔案中繼資料顯示2020/08/31，第70頁也含2020年畫面；這不是已確認的發布日期或115學年適用證明。納入日期：2026/09/06。';
cards(D.records);
})(globalThis);
