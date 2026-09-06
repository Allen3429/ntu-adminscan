/* Progressive preparation only. No submission, approval, payments or storage. */
(function(root){
'use strict';
const E=root.AdminEngine || (typeof require==='function'?require('./engine.js'):null);
const VERSION='1.2.0-simple-ui';
const trim=(x,n=2000)=>String(x??'').trim().slice(0,n);
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=s=>/^\d+(?:\.\d{1,2})?$/.test(String(s??'').replaceAll(',','')) && +String(s).replaceAll(',','')>0 && +String(s).replaceAll(',','')<=1e9;
function create(){return {version:VERSION,id:'LOCAL-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),revision:1,confirmedRevision:null,synthetic:false,sourceType:'',fileName:'',rawText:'',incomplete:false,warnings:[],fields:{amount:'',documentDate:'',documentNo:'',purpose:'',fundCode:'',fundName:'',payee:'',applicant:''},fieldSources:{},lane:'unknown',updatedAt:new Date().toISOString()};}
function fromText(text,{synthetic=false,fileName='',sourceType='text',incomplete=false,warnings=[]}={}){
 const s=create(),x=E.extract(trim(text,50000));s.rawText=trim(text,50000);s.synthetic=synthetic===true;s.fileName=trim(fileName,200);s.sourceType=sourceType;s.incomplete=!!incomplete;s.lane=x.lane;
 s.warnings=[...x.warnings.filter(w=>!w.startsWith('辨識與模型輸出')), ...warnings.map(w=>trim(w,500))];
 for(const f of x.fields){const key={amount:'amount',documentDate:'documentDate',invoice0:'documentNo'}[f.id];if(key){s.fields[key]=String(f.value);s.fieldSources[key]=synthetic?'合成範例資料':'文件文字候選，尚未核對';}}
 return s;
}
function update(s,patch){const changes=Object.keys(patch).filter(k=>Object.hasOwn(s.fields,k)&&s.fields[k]!==trim(patch[k]));if(!changes.length)return s;for(const k of changes){s.fields[k]=trim(patch[k]);s.fieldSources[k]='使用者輸入／核對';}s.revision++;s.confirmedRevision=null;s.updatedAt=new Date().toISOString();return s;}
function errors(s){const list=[];if(!money(s.fields.amount))list.push({field:'amount',text:'請填入這次要報的金額，最多兩位小數。'});if(!s.fields.purpose)list.push({field:'purpose',text:'補一句用途就好，例如「迎新活動用文具」。'});if(s.fields.documentDate&&!E.validDate(s.fields.documentDate))list.push({field:'documentDate',text:'日期無效，請對照單據修正，或留空待確認。'});return list;}
function confirm(s){const er=errors(s);if(er.length)throw Error(er[0].text);s.confirmedRevision=s.revision;s.updatedAt=new Date().toISOString();return s;}
function pending(s){const out=[];if(!s.fields.documentDate)out.push('文件日期');if(!s.fields.fundCode)out.push('經費來源及使用授權');else out.push('經費使用授權（尚未驗證）');if(!s.fields.payee)out.push('受款人');if(!s.fields.applicant)out.push('申請人');if(s.incomplete)out.push('原始文件完整內容');out.push('適用表單、附件與原件交接方式','承辦核定的簽核路徑');return out;}
function preflight(s,registry,sourceStatus={}){const facts={};if(s.lane!=='unknown'&&s.lane!=='mixed')facts.lane=s.lane;if(money(s.fields.amount))facts.amount=+s.fields.amount.replaceAll(',','');return E.evaluate(s.rawText,facts,registry,{extractionIncomplete:s.incomplete,sourceStatus});}
function packet(s,registry,sourceStatus={}){return {schema:VERSION,kind:'PARTIAL_PREPARATION_NOT_OFFICIAL_FORM',caseId:s.id,revision:s.revision,synthetic:s.synthetic,confirmedKnownFields:s.confirmedRevision===s.revision,fields:clone(s.fields),fieldSources:clone(s.fieldSources),source:{type:s.sourceType,fileName:s.fileName,complete:!s.incomplete,originalFileIncluded:false,rawTextIncluded:false},pending:pending(s),preflight:preflight(s,registry,sourceStatus),officialSubmission:false,officialApproval:false,paymentConfirmed:false,officialReceipt:null,updatedAt:s.updatedAt,notice:'僅整理已提供的欄位；待確認事項未補齊，不是校方製單、簽核、付款或正式收件紀錄。原始文件未包含在此檔。'};}
function worksheet(s,registry,sourceStatus={}){
 const p=packet(s,registry,sourceStatus),labels={amount:'金額（NT$）',documentDate:'文件日期',documentNo:'文件號碼',purpose:'支出用途',fundName:'經費名稱',fundCode:'經費代碼',payee:'受款人代稱',applicant:'申請人代稱'};
 return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>報支草稿 · 未送校方</title><style>body{font:16px/1.8 system-ui,sans-serif;max-width:800px;margin:36px auto;padding:24px;color:#183e36}h1{font-size:28px}.notice{background:#fff4d9;padding:18px;border-radius:12px}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #dbe5df;text-align:left;overflow-wrap:anywhere}th{width:28%}small{color:#596f66}.muted{font-size:14px}@media print{body{margin:0}}</style></head><body><h1>'+(s.synthetic?'合成範例 · ':'')+'報支資料草稿</h1><p class="notice"><b>尚未送校方；不是正式黏存單、核准或付款證明。</b><br>'+esc(p.notice)+'</p><p class="muted">本機草稿 '+esc(s.id)+' · 版本 '+s.revision+'</p><table>'+Object.entries(labels).map(([k,l])=>'<tr><th>'+l+'</th><td>'+esc(s.fields[k]||'待確認')+'<br><small>'+esc(s.fieldSources[k]||'未提供')+'</small></td></tr>').join('')+'</table><h2>接手前仍需確認</h2><ul>'+p.pending.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><h2>預檢保留事項</h2><p>'+esc(p.preflight.notice)+'</p><ul>'+p.preflight.blockers.concat(p.preflight.questions.map(q=>q.label)).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><p class="muted">此檔包含自行輸入的案件資料。請連同原始單據交給獲授權的承辦，勿公開分享。</p></body></html>';
}
const api={VERSION,create,fromText,update,errors,confirm,pending,preflight,packet,worksheet,money,esc};root.AdminSimple=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
