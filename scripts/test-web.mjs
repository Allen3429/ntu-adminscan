/** Run inherited synthetic checks plus the public-release safety checks. */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
mkdirSync(path.join(ROOT,'reports/ui-v1.2'),{recursive:true});
for(const file of ['tests/regression.cjs','tests/simple-core.cjs','tests/execution.cjs','tests/manual_reference.cjs','scripts/build-web.mjs','tests/release.cjs']){
  const r=spawnSync(process.execPath,[file],{cwd:ROOT,encoding:'utf8'});
  if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
  if(r.status!==0)process.exit(r.status||1);
}
const from=p=>JSON.parse(readFileSync(path.join(ROOT,p),'utf8'));
const r=from('reports/regression.json'),s=from('reports/ui-v1.2/simple-core-tests.json'),e=from('reports/execution-unit-tests.json'),m=from('reports/manual-tests.json'),p=from('reports/release-tests.json');
const summary={executedAt:new Date().toISOString(),total:r.total+r.unitTotal+s.total+e.total+m.total+p.total,passed:r.passed+r.unitPassed+s.passed+e.passed+m.passed+p.passed,remoteDeploymentTested:false,realAdministrativeCases:0,groups:{regression:r.total,fieldChecks:r.unitTotal,simpleCore:s.total,execution:e.total,manual:m.total,publicRelease:p.total}};
writeFileSync(path.join(ROOT,'reports/publish-tests.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
