import {readFile, realpath} from 'node:fs/promises';
import {join, resolve, relative, sep} from 'node:path';
import {VERSION} from 'remotion';
import {platform, arch, release} from 'node:os';
import {loadStudioProject} from '../src/spike/project';
import {projectRoot, selectScene} from '../src/spike/selection';
import {sourceDigest, validatePng} from '../src/review/artifacts';
import {selectReviewFrames} from '../src/review/frames';
import {cueSheet, loadProduction, type Plan} from '../src/production/contracts';
import {captureProduction} from '../src/production/capture';
import {verifyMedia} from '../src/production/media';
import {cleanupRun, createRun, fileIdentity, loadRun, paths, publishFile, reserve, safePath, saveRun, seal, withRunLock, writeRecord, type Run} from '../src/production/lifecycle';
import {validateCreativeReview, type EvidenceFrame} from '../src/production/review';

const repo = resolve(import.meta.dir, '..');
function milestones(plan: Plan): string[] {
  return [...plan.beats.flatMap(b => [b.startFrame, Math.floor((b.startFrame + b.endFrame - 1) / 2), b.endFrame - 1].map(f => `${b.shotId}:${f}`)),
    ...plan.events.flatMap(e => [e.frame, ...(['press', 'release', 'grab', 'drop'].includes(e.type) ? [e.frame - 1, e.frame + 1] : [])]
      .filter(f => f >= 0 && f < plan.beats.filter(b => b.shotId === e.shotId).reduce((n, b) => Math.max(n, b.endFrame), 0)).map(f => `${e.shotId}:${f}`))];
}
async function command(args: string[], run: Run) {
  const proc = Bun.spawn(args, {cwd: repo, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr, exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const log = `${args.slice(0, 3).join(' ')}: exit ${exit}\n${stdout}${stderr}`.replaceAll(join(repo, paths(run).work), '[run scratch; see ownership and frame metadata]');
  await writeRecord(repo, run, args.includes('validate') ? 'validation.log' : 'render.log', log);
  if (exit) throw new Error(`${args.slice(0, 3).join(' ')} failed: ${stderr.slice(-4000)}`);
}
function report(run: Run, media: Awaited<ReturnType<typeof verifyMedia>>, gates: Record<string, string>, extra = ''): string {
  return `# Production verification: ${run.projectId}/${run.sceneId}\n\nRun: ${run.runId}\n\n` +
    `- Source SHA-256: ${run.sourceSha256}\n- Final: ${run.published ? join(repo, run.published.path) : 'not published'}\n- Bytes: ${media.bytes}\n- SHA-256: ${media.sha256}\n` +
    `- Gate A: ${gates.technical}\n- Gate B: ${gates.creative}\n- Gate C: ${gates.editorial}\n- Delivery label: ${gates.label}\n` +
    `- Video: ${media.video.codec}/${media.video.pixelFormat}, ${media.video.width}×${media.video.height}, ${media.video.fps}fps, ${media.video.frames} frames, ${media.video.durationSeconds}s; full decode passed.\n` +
    `- Audio: ${media.audio.present ? `${media.audio.codec}, ${media.audio.channels}ch/${media.audio.sampleRate}Hz; peak ${media.audio.peak.toFixed(6)}, RMS ${media.audio.rms.toFixed(6)}; ${media.audio.cues.length} correlated cues; ${media.audio.quiet.length} quiet intervals checked` : 'intentionally absent'}.\n` +
    `- Cleanup: ${run.cleanup.filesRemoved} files removed, ${run.cleanup.bytesReclaimed} bytes reclaimed (cumulative actual deletions).\n- Preserved scratch: ${run.cleanup.preserved.length}; cleanup failures: ${run.cleanup.failures.length}.\n\n` +
    `Permanent contracts, cue sheet, frame hashes/descriptions, named review, command logs, verification and ownership ledger remain beside this report. Legacy renderer-managed bundle cleanup is excluded from reclamation counts.\n\n` +
    `## Limitations\n\nSubjective listening is ${!media.audio.present ? 'not applicable to deliberate silence' : gates.creative !== 'passed' ? 'pending: measurements are not listening' : 'recorded in the named creative review'}. No automatic human approval, second-machine determinism claim or aesthetic guarantee. Source HTML is trusted executable content. Path guards are not a sandbox against a hostile concurrent process with the same filesystem privileges.\n\n${extra}`;
}
async function main() {
  const [action, ...flags] = Bun.argv.slice(2);
  if (action === '--help' || flags.includes('--help')) {
    console.log('Usage: bun run production <check|prepare|publish|cleanup> --project <path> --scene <id> [--run <uuid>]\nLegacy CLIs do not require these contracts. prepare prints permanent review/verification paths; publish requires a named creative-review.json. Listening may remain pending, never implicitly approved.'); return;
  }
  if (!['check', 'prepare', 'publish', 'cleanup'].includes(action ?? '')) throw new Error('expected production check, prepare, publish or cleanup');
  const args = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i]!, value = flags[i + 1];
    if (!['--project', '--scene', '--run'].includes(flag) || args.has(flag) || !value || value.startsWith('--')) throw new Error(`invalid/duplicate option: ${flag}`);
    args.set(flag, value);
  }
  if (!args.has('--project') || !args.has('--scene')) throw new Error('production requires explicit --project and --scene');
  if (['publish', 'cleanup'].includes(action!) !== args.has('--run')) throw new Error('--run is required only for publish/cleanup');
  const root = await projectRoot(args.get('--project'));
  const canonicalRepo = await realpath(repo);
  for (const protectedRoot of ['output', 'docs']) {
    const rel = relative(join(canonicalRepo, protectedRoot), root);
    if (!rel || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('/'))) throw new Error('production source cannot be inside output or documentation');
  }
  if (action === 'check') {
    const project = await loadStudioProject(root), scene = selectScene(project, args.get('--scene'));
    await loadProduction(root, project, scene); console.log(`Production contracts valid: ${project.id}/${scene.id}`); return;
  }
  if (action === 'prepare') {
    const identity = JSON.parse(await readFile(join(root, 'project.json'), 'utf8'));
    const run = await createRun(repo, identity.id, args.get('--scene')!, await sourceDigest(root));
    console.log(`Production run: ${run.runId}`);
    try {
      const project = await loadStudioProject(root), scene = selectScene(project, args.get('--scene'));
      const production = await loadProduction(root, project, scene);
      await writeRecord(repo, run, 'contracts.json', production);
      await writeRecord(repo, run, 'cue-sheet.md', cueSheet(production.plan, scene, project.video.fps));
      await writeRecord(repo, run, 'environment.json', {bun: Bun.version, remotion: VERSION, os: {platform: platform(), arch: arch(), release: release()}, video: project.video});
      await command(['bun', 'run', 'validate', '--project', root, '--scene', scene.id], run);
      const frames = selectReviewFrames(scene.shots, milestones(production.plan));
      const captures = await captureProduction(repo, root, project, scene, frames, run);
      await writeRecord(repo, run, 'captures.json', {schemaVersion: 1, storage: 'temporary-prepublication', frames: captures});
      const candidate = await reserve(repo, run, 'candidate.mp4', 'draft-video');
      await command(['bun', 'run', 'render', '--project', root, '--scene', scene.id, '--output', candidate], run);
      await seal(repo, run, 'candidate.mp4');
      const media = await verifyMedia(candidate, root, project, scene, production.plan);
      if (await sourceDigest(root) !== run.sourceSha256) throw new Error('source changed during production');
      await writeRecord(repo, run, 'verification.json', media);
      run.status = 'prepared'; await saveRun(repo, run);
      await writeRecord(repo, run, 'report.md', report(run, media, {technical: 'passed', creative: 'pending', editorial: production.brief.review.humanApprovalRequired ? 'pending' : 'not-required', label: 'technically-verified'}));
      console.log(`Prepared ${captures.length} frames. Inspect ${join(repo, paths(run).work)} and write ${join(repo, paths(run).records, 'creative-review.json')}. No approval was generated.`);
    } catch (error) {
      run.status = 'failed'; run.failure = String(error); await saveRun(repo, run);
      await writeRecord(repo, run, 'failure.md', `# Production failed\n\n${String(error)}\n\nNo cleanup authorized. Scratch media and permanent diagnostics retained.\n`);
      throw error;
    }
    return;
  }
  const project = await loadStudioProject(root), scene = selectScene(project, args.get('--scene'));
  const loaded = await loadRun(repo, project.id, scene.id, args.get('--run')!);
  await withRunLock(repo, loaded, async () => {
    const run = await loadRun(repo, project.id, scene.id, loaded.runId), p = paths(run);
    try {
    const production = await loadProduction(root, project, scene);
    if (await sourceDigest(root) !== run.sourceSha256) throw new Error('source changed; retain diagnostics and prepare a new run');
    if (action === 'cleanup') {
      const media = await verifyMedia(await safePath(repo, p.final), root, project, scene, production.plan);
      if (media.sha256 !== run.published?.sha256) throw new Error('published hash mismatch');
      const cleanup = await cleanupRun(repo, run);
      await writeRecord(repo, run, 'cleanup.json', cleanup);
      const gates = JSON.parse(await readFile(await safePath(repo, `${p.records}/gates.json`), 'utf8'));
      await writeRecord(repo, run, 'report.md', report(run, media, gates));
      if (cleanup.failures.length) process.exitCode = 1;
      console.log(JSON.stringify(cleanup)); return;
    }
    if (run.status !== 'prepared') throw new Error('publish requires a prepared, unpublished run');
    const captureRecord = JSON.parse(await readFile(await safePath(repo, `${p.records}/captures.json`), 'utf8'));
    const captures = captureRecord.frames as EvidenceFrame[];
    const expected = selectReviewFrames(scene.shots, milestones(production.plan));
    if (captureRecord.storage !== 'temporary-prepublication' || captures.length !== expected.length) throw new Error('capture evidence mismatch');
    for (const [i, f] of captures.entries()) {
      const e = expected[i]!;
      if (f.shotId !== e.shotId || f.localFrame !== e.localFrame || f.globalFrame !== e.globalFrame || f.path !== e.path) throw new Error('capture identity mismatch');
      const file = await safePath(repo, `${p.work}/${f.path}`), actual = await fileIdentity(file);
      if (actual.sha256 !== f.sha256) throw new Error('capture hash mismatch');
      await validatePng(file, await readFile(file));
    }
    const media = await verifyMedia(await safePath(repo, `${p.work}/candidate.mp4`), root, project, scene, production.plan);
    const namedReview = JSON.parse(await readFile(await safePath(repo, `${p.records}/creative-review.json`), 'utf8'));
    const {review, gates} = validateCreativeReview(namedReview, production.brief, scene, captures, run.sourceSha256, media.sha256);
    if (await sourceDigest(root) !== run.sourceSha256) throw new Error('source changed during publication verification');
    await writeRecord(repo, run, 'verification.json', media);
    await writeRecord(repo, run, 'gates.json', gates);
    await writeRecord(repo, run, 'captures.json', {schemaVersion: 1, storage: 'archived-frame-metadata', frames: captures.map((f, i) => ({shotId: f.shotId, localFrame: f.localFrame, globalFrame: f.globalFrame, sha256: f.sha256,
      observation: review.frames[i]!.observation, finalVideo: {path: p.final, seconds: f.globalFrame / project.video.fps}}))});
    await writeRecord(repo, run, 'report.md', report(run, media, gates, 'Frame evidence archived. Publication/cleanup follows verification.\n'));
    await publishFile(repo, run, media);
    const publishedMedia = await verifyMedia(await safePath(repo, p.final), root, project, scene, production.plan);
    if (publishedMedia.sha256 !== media.sha256) throw new Error('published file differs from verified candidate; cleanup refused');
    run.status = 'published'; await saveRun(repo, run);
    const cleanup = await cleanupRun(repo, run);
    await writeRecord(repo, run, 'cleanup.json', cleanup);
    await writeRecord(repo, run, 'report.md', report(run, publishedMedia, gates,
      `## Preserved scratch\n\n${cleanup.preserved.map(p => `- ${p.path}: ${p.reason}`).join('\n') || 'None.'}\n\n## Cleanup failures\n\n${cleanup.failures.join('\n') || 'None.'}\n`));
    console.log(`${join(repo, p.final)}\n${media.bytes} bytes; ${gates.label}; listening ${gates.creative}.\nCleanup: ${cleanup.filesRemoved} files, ${cleanup.bytesReclaimed} bytes. Report: ${join(repo, p.records, 'report.md')}`);
    if (cleanup.failures.length) process.exitCode = 1;
    } catch (error) {
      await writeRecord(repo, run, 'failure.md', `# Production ${action} failed\n\n${String(error)}\n\nRemaining media and permanent diagnostics retained. No additional cleanup authorized.\n`);
      throw error;
    }
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
