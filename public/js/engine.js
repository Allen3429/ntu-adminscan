/* Rule-first preflight. Extracted text is untrusted evidence, never authorization. */
(function(root){
'use strict';
const VERSION='1.0.0-rc.1';
const LANES={lecture:'講者／人事費',hire:'聘僱／勞健保',purchase:'採購／核銷',unknown:'待辨識',mixed:'混合案件'};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const normalize=s=>String(s||'').normalize('NFKC').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1').trim();
const DAY=86400000;
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
function redact(text){return String(text||'').replace(/\b[A-Z][12]\d{8}\b/gi,'[證號已遮罩]').replace(/\b09\d{8}\b/g,'[手機已遮罩]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[信箱已遮罩]').replace(/((?:帳戶|帳號|銀行帳號|受款帳戶)\s*[:：]?\s*)[\d -]{6,}/g,'$1[帳號已遮罩]').replace(/((?:受款人|姓名|聯絡人)\s*[:：]\s*)[^\n,，;；]{1,24}/g,'$1[姓名已遮罩]');}
function classify(raw){
 const t=normalize(raw).toLowerCase();
 const hire=/(聘僱|加保|勞保|勞退|工讀|教學助理|聘期|工作許可|僱傭)/.test(t);
 const lecture=/(講者|演講費|鐘點費|講座|校外專家|講師)/.test(t);
 const purchase=/(採購|發票|耗材|驗收|財產|設備|請購)/.test(t);
 if((hire&&purchase)|| (hire&&lecture && !/教學助理/.test(t)))return {lane:'mixed',reason:'包含不同行政目的，應拆開成不同案件。'};
 if(hire)return {lane:'hire',reason:'文字含聘僱或投保類線索；仍待你確認。'};
 if(lecture)return {lane:'lecture',reason:'文字含講者或鐘點費線索；不據此推定補助計畫。'};
 if(purchase)return {lane:'purchase',reason:'文字含採購或發票線索；不據此推定直接核銷資格。'};
 return {lane:'unknown',reason:'單獨的「領據／收據」不足以確認支出性質。'};
}
function extract(raw){
 const text=normalize(raw), fields=[],warnings=[];
 const findAll=(re)=>[...text.matchAll(re)].map(m=>({value:m[1],evidence:m[0]}));
 const amounts=findAll(/(?:總計|合計|總額|金額|實付|TOTAL|AMOUNT)\s*[:：]?\s*(?:新臺幣|NT\$?|TWD|\$)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi);
 const unique=[...new Set(amounts.map(a=>Number(a.value.replaceAll(',',''))))];
 if(unique.length===1&&unique[0]>0)fields.push({id:'amount',label:'文件標示金額',value:unique[0],evidence:amounts[0].evidence});
 else if(unique.length>1)warnings.push('辨識到多個不同金額，未自動選定總額。');
 const dates=[...text.matchAll(/(?:日期|開立日|發票日|Date)\s*[:：]?\s*((?:\d{4}|\d{3})[年\/.\-]\d{1,2}[月\/.\-]\d{1,2}日?)/gi)];
 const ds=dates.map(m=>{const a=m[1].match(/\d+/g);let y=+a[0];if(y<1911)y+=1911;return {value:`${y}-${a[1].padStart(2,'0')}-${a[2].padStart(2,'0')}`,evidence:m[0]};});
 if(ds.length===1&&validDate(ds[0].value))fields.push({id:'documentDate',label:'文件日期（非自動認定活動日）',...ds[0]});
 else if(ds.length)warnings.push('日期無法唯一確認或不是有效日期，請人工核對。');
 const ids=findAll(/(?:買方統編|統一編號|統編|統一番号)\s*[:：]?\s*(\d{8})(?!\d)/g);
 ids.forEach((a,i)=>fields.push({id:'taxId'+i,label:'文件統編（未推定買／賣方）',...a}));
 const invoices=findAll(/(?:發票號碼|發票號|Invoice\s*(?:No\.?)?)\s*[:：]?\s*([A-Z]{2}[- ]?\d{8})/gi);
 invoices.forEach((a,i)=>fields.push({id:'invoice'+i,label:'發票號碼',...a}));
 const c=classify(text);
 fields.unshift({id:'lane',label:'候選案件類型',value:c.lane,evidence:c.reason});
 warnings.push('辨識與模型輸出都只作候選；附件存在、適用範圍與金額需逐欄確認。');
 if(/(沒有|未附|尚無|缺少|無)\s*(領據|發票|收據|附件)/.test(text))warnings.push('文字含缺件描述；不可因出現文件名稱就判定已附。');
 return {text,fields,warnings,lane:c.lane};
}
const yesno=[['yes','已確認／有'],['no','否／尚未'],['unknown','不確定']];
function evaluate(input,answers={},data,options={}){
 const registry=data||root.AdminData||{sources:[],rules:[]};
 const now=options.asOf||today();
 const c=classify(input), chosen=answers.lane;
 const lane=Object.hasOwn(LANES,chosen)&&!['unknown','mixed'].includes(chosen)?chosen:c.lane;
 const out={version:VERSION,asOf:now,lane,label:LANES[lane],status:'NEED INFO',questions:[],blockers:[],tasks:[],notes:[],sourceIds:[],trace:[],facts:{...answers},coverage:'尚未確認適用範圍'};
 const add=(id)=>{const r=registry.rules.find(x=>x.id===id);if(r){out.tasks.push({...r});if(!out.sourceIds.includes(r.sourceId))out.sourceIds.push(r.sourceId);}};
 const gate=(s)=>out.blockers.push(s);
 const ask=(id,label,kind='select',choices=yesno,help='')=>{out.questions.push({id,label,kind,choices,help});};
 const hasChoice=(id,choices)=>choices.some(x=>x[0]===answers[id])&&answers[id]!=='unknown';
 const select=(id,label,choices=yesno,help='')=>{if(!hasChoice(id,choices)){ask(id,label,'select',choices,help);return undefined;}return answers[id];};
 const num=(id,label,min=0,max=1e9)=>{const v=answers[id];if(v===''||v==null||!Number.isFinite(Number(v))||Number(v)<=min||Number(v)>max){ask(id,label,'number',[],`輸入大於 ${min} 且不大於 ${max} 的數值。`);return undefined;}return Number(v);};
 const date=(id,label)=>{if(!validDate(answers[id])){ask(id,label,'date',[],'請核對實際日期，不以 OCR 的文件日期自動替代。');return undefined;}return answers[id];};
 const needYes=(id,label)=>{let v=select(id,label);if(v==='no'){out.notes.push(label+'：尚未完成。');ask(id,label);}return v==='yes';};
 if(!validDate(now)){gate('系統日期無效，無法做來源時效檢查。');}
 if(c.lane==='mixed')gate('文件描述包含不同類型案件，請拆件後重做；不能用選單消除衝突。');
 if(chosen&&c.lane!=='unknown'&&c.lane!=='mixed'&&chosen!==c.lane)gate('手動類型與文字線索不一致，請核對是否混件。');
 if(lane==='unknown'||lane==='mixed'){ask('lane','請先確認這次要辦的案件','select',[['lecture','講者／人事費'],['hire','聘僱／勞健保'],['purchase','採購／核銷']]);}
 else{
   needYes('factsConfirmed','我已核對原文件與以下事實，不將辨識結果當成核准');
   needYes('fundingConfirmed','經費來源、用途及核定／授權已向單位確認');
 }
 if(lane==='lecture'){
  const scope=select('scope','哪一個計畫／帳務範圍？',[['cge1151','已核定的 115-1 個別型通識課程改進計畫'],['medical','醫學院會計系統'],['other','其他講者／人事費'],['unknown','不確定']]);
  if(scope==='cge1151'){
   out.coverage='115-1 個別型通識課程：單一講者、單次演講費';
   ['cge.scope','cge.lecture','cge.paper','cge.deadline'].forEach(add);
   const mode=select('mode','授課語言',[['zh','中文授課'],['emi','EMI'],['unknown','不確定']]);
   const amount=num('amount','這位講者這一次的申報金額（NT$）');
   const eventDate=date('eventDate','實際演講／費用發生日');
   needYes('receipt','已取得這位講者的領據並確認必填欄位');
   needYes('materials','已備妥演講相關資料（例如議程或海報）');
   needYes('quota','已核對本課核定名額與剩餘可報次數');
   needYes('paper','已核對紙本黏存單、所需簽核及共教中心收件安排');
   if(mode==='zh'&&amount>2500)gate('中授單次金額超出此公告所列每人次 2,500 元；請承辦確認，不自行切單。');
   if(mode==='emi') {let hours=num('lectureHours','本次可報支鐘點數',0,24);if(hours&&amount>hours*2000)gate('金額超出本公告 EMI 每人每小時 2,000 元的計算範圍。');}
   if(eventDate){
    if(eventDate<'2026-09-01'||eventDate>'2026-12-25')gate('費用日期不在本版已核讀結帳區間；轉承辦確認。');
    else {const due=eventDate<'2026-12-01'?'2026-11-30':'2026-12-25';out.deadline={date:due,destination:'主計室',sourceId:'cge1151'};if(now>due)gate('已超過公告所列送達主計室節點；不要自行保證仍可報支。');}
    if(eventDate>now)gate('活動尚未發生；只能作事前準備，不能判定已完成報支條件。');
   }
  }else if(scope==='medical'){add('medical.income');gate('醫學院個人所得／扣繳分支尚未完整覆蓋，請所得承辦核對。');}
  else if(scope==='other'){gate('不在本版講者費詳細規則覆蓋範圍；請原經費承辦確認表單、所得與簽核。');}
 }
 if(lane==='hire'){
  out.coverage='一般本國籍勞僱型兼任／臨時聘僱：文件與時效預檢';
  ['hr.relation','hr.docs','hr.timing','hr.health'].forEach(add);
  const role=select('role','受聘角色',[['parttime','一般兼任助理／工讀／臨時人員'],['cgeta','本計畫通識 TA'],['fulltime','專任計畫助理'],['other','其他'],['unknown','不確定']]);
  if(role==='cgeta'){add('cge.ta');gate('通識 TA 有額外聘僱與認證程序；不能只按一般加保清單判定完成。');}
  if(role==='fulltime'){add('hr.fulltime');gate('專任助理聘用程序超出本版一般兼任清單，請用人單位確認。');}
  if(role==='other')gate('此受聘角色未覆蓋，請用人單位認定適用流程。');
  const relation=select('relation','用人單位是否確認為勞僱型？',[['labour','已確認為勞僱型'],['nonlabour','非勞僱型'],['unknown','尚未確認']]);
  if(relation==='nonlabour')gate('非勞僱型不可套用本版受僱者流程，交由身分權責單位確認。');
  const nation=select('nationality','受聘身分',[['local','一般本國籍受僱者'],['foreign','外籍／僑生／其他特殊身分'],['unknown','不確定']]);
  if(nation==='foreign')gate('外籍／特殊身分涉及工作許可及投保、勞退適用判斷；本版不自動決定。');
  needYes('eligibility','用人單位已核對投保身分（含年齡、公保及其他適用情形）');
  const hours=num('weeklyHours','平均每週工作時數',0,168);
  const duration=num('durationMonths','預計聘期月數（可小數）',0,120);
  const start=date('startDate','實際聘期起日');
  if(start&&start<=now)gate('起聘日已到或已過：有投保時效風險，請立即聯絡人事，不可假設能追溯。');
  needYes('timing','用人單位已確認聘僱及加保均能在所需工作日之前送達');
  ['insuranceForm','hireProof','idCopy'].forEach((id,i)=>needYes(id,['已完成適用的加保申請書','已備妥用印後聘僱證明','已備妥適用身分證件（勿在此輸入證號）'][i]));
  needYes('monthlyPay','已向用人單位確認平均月薪與適用年度投保表；本系統未計算保費');
  if(hours&&duration){
   if(hours<12)out.notes.push('依已核讀 FAQ，每週未滿 12 小時者本校不辦健保加保；不等於免勞保或免其他費用。');
   else if(duration<=3){out.notes.push('短期聘僱不超過 3 個月仍有原投保單位選擇分支，不以每週 12 小時直接下結論。');needYes('healthDecision','已向用人單位確認本次短期聘僱的健保安排');}
   else needYes('healthDecision','已向用人單位確認本次健保與其他保險安排');
  }
 }
 if(lane==='purchase'){
  const campus=select('campus','適用帳務範圍',[['main','校總區／其他'],['medical','醫學院會計系統'],['unknown','不確定']]);
  const amt=num('amount','本案金額（NT$）');
  const property=select('property','是否涉及財產、設備或驗收？');
  const split=select('split','是否有兩個以上經費來源？');
  const prior=select('prior','是否已有請購／採購案？');
  needYes('invoice','已核對原始單據、用途及受款人資料');
  if(campus==='main'){out.coverage='校總區：案件釐清與轉交原單位，非完整核銷路徑';gate('本版未核實校總區一般核銷的完整路徑，不套用醫學院選單。');}
  if(property==='yes'||split==='yes'){add('purchase.complex');gate('涉及財產／驗收或多經費分攤，須由原案承辦確認。');}
  if(campus==='medical'){
   out.coverage='醫學院：已經權責單位確認資格的一般單據';
   if(prior==='yes')add('medical.prior');
   if(prior==='no'){add('medical.direct');needYes('directAuthorized','單位已確認本案屬無須先請購的可直接核銷項目');}
   needYes('paper','已核對黏存單、單據及單位簽核要求');
  }
 }
 if(options.extractionIncomplete)gate('文件未完整讀取（例如超過頁數限制）；請拆檔並確認完整性後再做預檢。');
 if(options.factConflict)gate('候選資訊與人工資料互相矛盾，需回原文件核對。');
 for(const id of out.sourceIds){
  const s=registry.sources.find(x=>x.id===id);
  const override=options.sourceStatus?.[id];
  if(!s||s.status!=='public-reviewed'||(override&&override!=='unchanged')){gate(`來源 ${id} 未通過目前狀態檢查（${override||s?.status||'missing'}）。`);continue;}
  if(!validDate(s.reviewedAt)||!validDate(now)||(new Date(now)-new Date(s.reviewedAt))/DAY>(s.maxAgeDays||30)||now<s.reviewedAt)gate(`來源 ${id} 已過本系統覆核期限或日期異常，需重新核讀。`);
 }
 out.questions=out.questions.filter((q,i,a)=>a.findIndex(x=>x.id===q.id)===i);
 if(out.blockers.length)out.status='HUMAN REVIEW';
 else if(out.questions.length)out.status='NEED INFO';
 else out.status='READY';
 out.notice=out.status==='READY'?'僅完成本版覆蓋的文件準備檢查，不是臺大核准、不代表一定不退件。':out.status==='HUMAN REVIEW'?'已停止自動放行；下列資料可帶給原單位／承辦確認。':'補足會改變判斷的事實後，重新預檢。';
 out.trace=[{step:'classify',result:c.lane},{step:'confirm',result:`${Object.keys(answers).length} 個人工欄位`},{step:'retrieve',result:out.sourceIds.join(', ')||'尚無適用來源'},{step:'plan',result:`${out.tasks.length} 條來源指示`},{step:'preflight',result:out.status}];
 out.handoff=redact(`您好，我正在確認「${out.label}」案件。\n適用範圍：${out.coverage}\n本版尚待確認：\n${out.blockers.concat(out.questions.map(q=>q.label)).map(x=>'－'+x).join('\n')||'請核對本案的完整簽核與收件要求。'}\n已核讀來源：${out.sourceIds.join('、')||'尚無符合來源'}\n請問本案應備表單、附件、簽核與收件時限為何？謝謝。`);
 return out;
}
root.AdminEngine={VERSION,LANES,today,normalize,validDate,redact,classify,extract,evaluate};
if(typeof module==='object')module.exports=root.AdminEngine;
})(globalThis);
