const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');require(root+'/public/js/data.js');require(root+'/public/js/benchmarks.js');
const E=require(root+'/public/js/engine.js');
const rows=[];
for(const t of AdminBenchmarks){
 const start=performance.now();const out=E.evaluate(t.text,t.answers,AdminData,{asOf:t.asOf||'2026-09-05',...t.options});
 let pass=true,reason='';
 try{assert.equal(out.status,t.expected);if(t.absentSource)assert(!out.sourceIds.includes(t.absentSource));if(t.requiredQuestion)assert(out.questions.some(q=>q.id===t.requiredQuestion));for(const task of out.tasks)assert(AdminData.sources.some(s=>s.id===task.sourceId));}
 catch(e){pass=false;reason=e.message;}
 rows.push({id:t.id,scenario:t.scenario,expected:t.expected,actual:out.status,pass,reason,kernelMs:Math.round((performance.now()-start)*1000)/1000});
 console.log(pass?'PASS':'FAIL',t.id,t.scenario,reason);
}
const extractionTests=[
 ['否定句不變成READY',()=>assert.notEqual(E.evaluate('講者费，沒有領據',{},AdminData).status,'READY')],
 ['不同總額不擅選',()=>assert(!E.extract('總計：2500\n金額：3000').fields.some(f=>f.id==='amount'))],
 ['民國轉西元',()=>assert.equal(E.extract('日期：115/09/03').fields.find(f=>f.id==='documentDate').value,'2026-09-03')],
 ['無效日期不輸出',()=>assert(!E.extract('日期：115/02/30').fields.some(f=>f.id==='documentDate'))],
 ['證號手機遮罩',()=>{const s=E.redact('A123456789 0912345678');assert(!s.includes('A123456789'));assert(!s.includes('0912345678'));}],
 ['孤立領據不認定講者費',()=>assert.equal(E.classify('領據').lane,'unknown')],
 ['全形字元處理',()=>assert.equal(E.extract('金額：２５００').fields.find(f=>f.id==='amount').value,2500)],
 ['引號惡意文件不影響資料',()=>assert.equal(E.classify('<script>alert(1)</script>發票').lane,'purchase')]
];
const unit=[];
for(const [name,fn]of extractionTests){try{fn();unit.push({name,pass:true});}catch(e){unit.push({name,pass:false,error:e.message});}}
const result={version:E.VERSION,executedAt:new Date().toISOString(),caseType:'synthetic-regression',liveCases:0,independentAccuracyStudy:false,total:rows.length,passed:rows.filter(x=>x.pass).length,unitTotal:unit.length,unitPassed:unit.filter(x=>x.pass).length,rows,unit};
fs.mkdirSync(root+'/reports',{recursive:true});fs.writeFileSync(root+'/reports/regression.json',JSON.stringify(result,null,2));
console.log(`\n${result.passed}/${result.total} 合成回歸; ${result.unitPassed}/${result.unitTotal} 欄位單元測試。不是實地正確率。`);
if(result.passed!==result.total||result.unitPassed!==result.unitTotal)process.exitCode=1;
