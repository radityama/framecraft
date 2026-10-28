import {readFile, realpath} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {projectRoot, selectScene} from '../src/spike/selection';
import {loadStudioProject} from '../src/spike/project';
import {FeedbackStore} from '../src/review/feedback-store';
import {feedbackMarkdown, parseFeedback} from '../src/review/feedback';
import {atomicOutput, assertOutsideProject} from './atomic-output';

async function main() {
  const args = Bun.argv.slice(2);
  if (args.includes('--help')) { console.log('Usage: bun run review:feedback [--project <path>] [--scene <id>] [--workspace <path>] [--check <file>] [--import <json>] [--output <file.json|file.md>]'); return; }
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!; const value = args[i + 1];
    if (!['--project', '--scene', '--workspace', '--check', '--import', '--output'].includes(key) || !value || value.startsWith('--') || flags.has(key)) throw new Error(`Invalid option: ${key}`);
    flags.set(key, value);
  }
  if (flags.has('--check')) { parseFeedback(JSON.parse(await readFile(flags.get('--check')!, 'utf8'))); console.log('Feedback valid'); return; }
  const root = await projectRoot(flags.get('--project')); const project = await loadStudioProject(root); const scene = selectScene(project, flags.get('--scene'));
  const workspace = resolve(flags.get('--workspace') ?? 'output/studio-workspace');
  await assertOutsideProject(join(workspace, 'feedback.json'), root);
  const store = new FeedbackStore(workspace);
  let current = await store.read(project.id, scene.id);
  if (flags.has('--import')) {
    const doc = parseFeedback(JSON.parse(await readFile(flags.get('--import')!, 'utf8')));
    if (doc.projectId !== project.id || doc.sceneId !== scene.id) throw new Error('Feedback identity mismatch');
    current = await store.save(doc, current.etag);
  }
  const output = flags.get('--output');
  const text = output?.endsWith('.md') ? feedbackMarkdown(current.feedback) : JSON.stringify(current.feedback, null, 2) + '\n';
  if (output) {
    if (!/\.(json|md)$/.test(output)) throw new Error('Output must be .json or .md');
    await assertOutsideProject(output, await realpath(root)); await atomicOutput(resolve(output), async path => { await Bun.write(path, text); });
  } else console.log(text);
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
