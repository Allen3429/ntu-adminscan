/* Read-only reference navigator. It cannot grant READY, write case facts or call NTU. */
(function(root){
'use strict';
const D=root.AdminManualData||(typeof require==='function'?require('./manual-data.js'):null);
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
function search(query='',chapter=''){
 const raw=String(query??'').slice(0,50000),q=norm(raw);
 return D.records.filter(r=>!chapter||r.chapter===chapter).map(r=>{
  let score=q?0:1;
  for(const k of r.keywords){if(q.includes(norm(k)))score+=Math.min(norm(k).length,10);}
  if(q&&norm(r.title).includes(q))score+=15;
  if(q&&norm(r.sourceSummary).includes(q))score+=5;
  return {record:r,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.record.id.localeCompare(b.record.id)).map(x=>x.record);
}
const problems={
 'funding-missing':{label:'找不到經費',recordIds:[22,2,3,18],message:'先排查經費類型與入口，再核對經費校區、登入身分及授權年度。這是排查順序建議，不是已查到原因。'},
 'appointment-missing':{label:'沒有聘號',recordIds:[12,11,10],message:'手冊列出未完成上游建檔、或修改帶入資料造成不一致等可能原因。不要自行填一個聘號。'},
 'tracking':{label:'不知道卡在哪裡',recordIds:[20,3],message:'原系統已有流程追蹤入口。這裡只顯示手冊的查詢方式，沒有查到本案實際進度。'},
 'allocation':{label:'多筆經費分攤',recordIds:[21,6,5],message:'先確認分攤經費筆數；不要用受款人數代替。取消分攤表下方核章欄，不代表其他黏存單免簽。'}
};
function diagnose(issue,facts={}){
 const item=problems[issue];
 if(!item)return {status:'REFERENCE ONLY',label:'未辨識參考主題',records:[],questions:['請選擇參考主題或使用關鍵字搜尋。'],notes:[],currentApplicabilityVerified:false,canApprove:false,liveQueryPerformed:false};
 const records=item.recordIds.map(n=>D.records.find(r=>r.id==='NTU-EACC-'+String(n).padStart(3,'0')));
 const questions=[...new Set(records.flatMap(r=>r.questionsForCase))];
 const out={status:'REFERENCE ONLY',label:item.label,message:item.message,records,questions,notes:[],currentApplicabilityVerified:false,canApprove:false,liveQueryPerformed:false};
 if(issue==='allocation'){
  const n=facts.fundingCount;
  if(typeof n==='number'&&Number.isInteger(n)&&n>=1&&n<=50){
   out.manualIllustration={fundingCount:n,copiesAccordingToManual:n,perVoucher:1,currentApplicabilityVerified:false};
   out.notes.push(`依這份手冊的說明，若已確認有 ${n} 筆經費分攤，範例份數為 ${n} 份分攤表，每筆黏存單附 1 份；現行要求仍待承辦核對。`);
  }else out.questions.unshift('請輸入已確認的分攤經費筆數（整數1–50）；空白時不猜份數。');
 }
 return out;
}
root.AdminManual={search,diagnose,problems,source:D.source};
if(typeof module==='object')module.exports=root.AdminManual;
})(globalThis);
