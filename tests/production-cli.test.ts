import {expect, test} from 'bun:test';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {paths, type Run} from '../src/production/lifecycle';

test('real production lifecycle archives evidence before cleanup; render and validation failures retain diagnostics', async () => {
  const repo = await mkdtemp('/tmp/opencode/production-cli-');
  try {
    for (const directory of ['src', 'scripts']) await cp(resolve(directory), join(repo, directory), {recursive: true});
    await symlink(resolve('node_modules'), join(repo, 'node_modules'));
    await cp(resolve('package.json'), join(repo, 'package.json'));
    const root = join(repo, 'projects/fixture'); await mkdir(join(root, 'production'), {recursive: true}); await mkdir(join(root, 'scenes/scene'), {recursive: true});
    await cp(resolve('projects/demo/runtime.js'), join(root, 'runtime.js'));
    await writeFile(join(root, 'project.json'), JSON.stringify({schemaVersion: 1, id: 'fixture', title: 'Fixture', video: {width: 64, height: 64, fps: 30}, scenes: [{id: 'scene', path: 'scenes/scene/scene.json'}], audio: []}));
    await writeFile(join(root, 'scenes/scene/scene.json'), JSON.stringify({id: 'scene', shots: [{id: 'shot', entry: 'shot.html', durationFrames: 6, overlapFrames: 0}], audio: []}));
    const shot = (fail = false) => `<!doctype html><html><body style="margin:0;background:#eee"><main></main><script src="../../runtime.js"></script><script>framecraft.shot({renderFrame({frame}) {${fail ? 'if(frame===3)throw new Error("intentional frame failure");' : ''}document.querySelector('main').textContent=String(frame);}});</script></body></html>`;
    await writeFile(join(root, 'scenes/scene/shot.html'), shot());
    const brief = JSON.parse(await readFile(resolve('projects/production-desktop/production/brief.json'), 'utf8'));
    Object.assign(brief, {projectId: 'fixture', sceneId: 'scene'}); brief.audio.sfx = 'silent'; brief.audio.silenceReason = 'Deliberate silent integration fixture';
    await writeFile(join(root, 'production/brief.json'), JSON.stringify(brief));
    await writeFile(join(root, 'production/plan.json'), JSON.stringify({schemaVersion: 1, projectId: 'fixture', sceneId: 'scene',
      beats: [{id: 'beat', shotId: 'shot', startFrame: 0, endFrame: 6, script: 'Frame count', visual: 'Frame text', motion: 'Frame state', rationale: 'Exercise lifecycle'}],
      events: [{id: 'reveal', beatId: 'beat', shotId: 'shot', frame: 0, type: 'reveal', detail: 'Frame zero', audio: {intent: 'silent', cueId: null, reason: 'Fixture silence'}}], assets: [], quiet: [{startFrame: 0, endFrame: 6, reason: 'Silent fixture'}]}));
    async function cli(action: string, run?: string, env = {}) {
      const proc = Bun.spawn(['bun', 'scripts/production.ts', action, '--project', root, '--scene', 'scene', ...(run ? ['--run', run] : [])], {cwd: repo, env: {...process.env, CHROME_BIN: resolve('node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell'), ...env}, stdout: 'pipe', stderr: 'pipe'});
      const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]); return {stdout, stderr, code};
    }
    const prepared = await cli('prepare'); expect(prepared.code, prepared.stderr).toBe(0);
    const uuid = prepared.stdout.match(/Production run: ([a-f0-9-]+)/)![1]!, record = join(repo, 'docs/production-runs/fixture', uuid);
    const run: Run = JSON.parse(await readFile(join(record, 'run.json'), 'utf8'));
    const captures = JSON.parse(await readFile(join(record, 'captures.json'), 'utf8')).frames;
    const media = JSON.parse(await readFile(join(record, 'verification.json'), 'utf8'));
    expect(run.status).toBe('prepared'); expect(captures.length).toBeGreaterThan(2);
    const refused = await cli('publish', uuid); expect(refused.code).toBe(1); expect(await Bun.file(join(record, 'failure.md')).exists()).toBe(true);
    expect(await Bun.file(join(repo, paths(run).work, 'candidate.mp4')).exists()).toBe(true);
    await writeFile(join(record, 'creative-review.json'), JSON.stringify({schemaVersion: 1, sourceSha256: run.sourceSha256, candidateSha256: media.sha256,
      reviewer: {kind: 'agent', name: 'Automated lifecycle test (not real creative approval)'}, decision: 'accepted',
      frames: captures.map((f: any) => ({shotId: f.shotId, localFrame: f.localFrame, sha256: f.sha256, observation: 'Explicit test fixture only; no claim about acceptance film.'})),
      motion: {status: 'reviewed', method: 'fixture', notes: 'Fixture only'}, sound: {status: 'pending', notes: 'Deliberately silent'}, human: {status: 'not-required', name: null, notes: 'Fixture only'}, findings: []}));
    await writeFile(join(repo, paths(run).work, 'user.png'), 'unowned file');
    const result = await cli('publish', uuid); expect(result.code, result.stderr).toBe(0);
    const ledger: Run = JSON.parse(await readFile(join(record, 'run.json'), 'utf8'));
    expect(ledger.status).toBe('published'); expect(ledger.cleanup.filesRemoved).toBe(captures.length + 1);
    expect(ledger.cleanup.bytesReclaimed).toBe(run.owned.reduce((n, f) => n + (f.bytes ?? 0), 0));
    expect((await readdir(join(repo, paths(run).work))).sort()).toEqual(['screenshots', 'user.png']);
    const archive = JSON.parse(await readFile(join(record, 'captures.json'), 'utf8'));
    expect(archive.storage).toBe('archived-frame-metadata'); expect(JSON.stringify(archive)).not.toContain('.png');
    expect(archive.frames[0].finalVideo.path).toBe(paths(run).final);
    const repeated = await cli('cleanup', uuid); expect(repeated.code, repeated.stderr).toBe(0); expect(repeated.stdout).toContain('"filesRemoved":0');
    expect((await readdir(join(repo, 'output/fixture/final'))).every(f => f.endsWith('.mp4'))).toBe(true);
    await writeFile(join(root, 'scenes/scene/shot.html'), shot(true));
    const failed = await cli('prepare'); expect(failed.code).toBe(1);
    const failedId = failed.stdout.match(/Production run: ([a-f0-9-]+)/)![1]!, failedRecord = join(repo, 'docs/production-runs/fixture', failedId);
    const failedRun: Run = JSON.parse(await readFile(join(failedRecord, 'run.json'), 'utf8'));
    expect(failedRun.status).toBe('failed'); expect(failedRun.owned.some(f => f.sha256 !== null)).toBe(true);
    expect(await Bun.file(join(failedRecord, 'failure.md')).text()).toContain('No cleanup');
    for (const f of failedRun.owned.filter(f => f.sha256)) expect(await Bun.file(join(repo, paths(failedRun).work, f.path)).exists()).toBe(true);
    brief.audio.sfx = 'required'; brief.audio.silenceReason = null;
    await writeFile(join(root, 'production/brief.json'), JSON.stringify(brief));
    const invalid = await cli('prepare'); expect(invalid.code).toBe(1);
    const invalidId = invalid.stdout.match(/Production run: ([a-f0-9-]+)/)![1]!;
    expect(await Bun.file(join(repo, 'docs/production-runs/fixture', invalidId, 'failure.md')).text()).toContain('required SFX');
    expect(await Bun.file(join(repo, paths(run).final)).exists()).toBe(true);
  } finally {await rm(repo, {recursive: true, force: true});}
}, 300000);
