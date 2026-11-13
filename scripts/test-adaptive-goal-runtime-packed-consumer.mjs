#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agg-runtime-consumer-'));
const consumer=path.join(tmp,'consumer');
const env={...process.env,npm_config_audit:'false',npm_config_fund:'false',npm_config_update_notifier:'false'};
function run(command,args,cwd,label){
  const result=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
  if(result.error||result.status!==0) throw new Error(label+' failed: '+(result.stdout||'')+'\n'+(result.stderr||'')+'\n'+(result.error?.message||''));
  return result.stdout.trim();
}
try{
  fs.mkdirSync(consumer,{mode:0o700});
  const packed=JSON.parse(run('npm',['pack','--json','--pack-destination',tmp],root,'npm pack'));
  assert.equal(packed.length,1);
  assert.equal(packed[0].name,'@runalith/adaptive-goal-runtime');
  assert.equal(packed[0].version,'0.1.0');
  const tarball=path.join(tmp,packed[0].filename);
  run('npm',['install','--ignore-scripts','--no-audit','--no-fund','--prefix',consumer,tarball],root,'install package tarball');
  const smoke=[
    "import assert from 'node:assert/strict';",
    "import * as agg from '@runalith/adaptive-goal-runtime';",
    "import * as plan from '@runalith/workflow-runtime/workflow-plan';",
    "import * as contracts from '@runalith/workflow-contracts';",
    "assert.equal(typeof agg.createAdaptiveGoalActionIntentBindingResolver,'function');",
    "assert.equal(plan.WORKFLOW_PLAN_API_VERSION,1);",
    "assert.equal(typeof contracts.validateArtifact,'function');",
    "console.log('packed AGG resolver, Workflow Plan API and Workflow Contracts imports PASS');"
  ].join('\n');
  run(process.execPath,['--input-type=module','-e',smoke],consumer,'packed consumer smoke');
  console.log('AGG Runtime packed consumer PASS: '+packed[0].filename+' ('+packed[0].entryCount+' files)');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
