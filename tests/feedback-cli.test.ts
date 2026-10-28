import {expect, test} from 'bun:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('feedback CLI validates, imports and exports portable saved feedback without changing source', async () => {
  const base = await mkdtemp(join(tmpdir(), 'framecraft-feedback-cli-'));
  const run = async (...args: string[]) => {
    const p = Bun.spawn([process.execPath, 'scripts/feedback.ts', ...args], {stdout:'pipe', stderr:'pipe'});
    const stdout = new Response(p.stdout).text(), stderr = new Response(p.stderr).text();
    return {code: await p.exited, stdout: await stdout, stderr: await stderr};
  };
  try {
    const input = join(base, 'input.json'), output = join(base, 'feedback.md');
    const doc = {schemaVersion:1, projectId:'showcase', sceneId:'pulse', issues:[{id:crypto.randomUUID(),projectId:'showcase',sceneId:'pulse',shotId:'echo',frame:48,localFrame:0,sourceSha256:'a'.repeat(64),severity:'minor',category:'layout',description:'Move this ring.',status:'open'}]};
    await writeFile(input, JSON.stringify(doc));
    expect((await run('--check', input)).code).toBe(0);
    expect((await run('--project','projects/showcase','--scene','pulse','--workspace',join(base,'workspace'),'--import',input,'--output',output)).code).toBe(0);
    expect(await readFile(output,'utf8')).toContain('Scene frame: 48');
    const json = await run('--project','projects/showcase','--scene','pulse','--workspace',join(base,'workspace'));
    expect(JSON.parse(json.stdout)).toEqual(doc);
    await writeFile(input,JSON.stringify({...doc,projectId:'../escape'}));
    expect((await run('--check',input)).code).toBe(1);
    expect((await run('--project','projects/showcase','--scene','signal','--workspace',join(base,'workspace'),'--import',input)).code).toBe(1);
    expect((await run('--workspace','--scene')).code).toBe(1);
  } finally {await rm(base,{recursive:true,force:true});}
},30000);
