import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open, readdir, readFile, readlink, realpath, stat} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, sep} from 'node:path';
import {RenderInternals} from '@remotion/renderer';
import {loadProject} from '../spike/project';
import {SELECTION_POLICY, selectReviewFrames, type ReviewFrame} from './frames';

export type ReviewCapture = ReviewFrame & ({status: 'captured'; sha256: string} | {status: 'failed'; error: string});
export type ReviewManifest = {
  schemaVersion: 1; projectId: string; sceneId: string;
  source: {gitCommit: string; trackedDirty: boolean; untrackedDirty: boolean; sha256: string};
  selection: {policy: typeof SELECTION_POLICY; milestones: string[]};
  environment: {bun: string; remotion: string; chromium: string;
    os: {platform: string; arch: string; release: string};
    video: {width: number; height: number; fps: number}; fonts: Array<{family: string; file: string}> | null};
  validation: {command: 'bun run validate'; exitCode: number; warnings: string[]; errors: string[]};
  captures: ReviewCapture[];
  review: {status: 'unreviewed' | 'needs-revision' | 'accepted';
    reviewer: null | {kind: 'human' | 'agent'; name: string}; findings: string[]; notes: string};
};

const shaPattern = /^[0-9a-f]{64}$/;
const pngHeader = '89504e470d0a1a0a';

export async function validatePng(path: string, bytes: Buffer): Promise<void> {
  if (bytes.length <= 8 || bytes.subarray(0, 8).toString('hex') !== pngHeader)
    throw new Error(`invalid PNG: ${path}`);
  const binary = RenderInternals.getExecutablePath({type: 'ffmpeg', indent: false, logLevel: 'error', binariesDirectory: null});
  const proc = Bun.spawn([binary, '-v', 'error', '-xerror', '-f', 'image2pipe', '-c:v', 'png', '-i', path,
    '-frames:v', '1', '-c:v', 'rawvideo', '-f', 'null', '-'], {stdout: 'ignore', stderr: 'pipe'});
  const [error, exit] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (exit !== 0) throw new Error(`invalid PNG: ${path}: ${error.trim()}`);
}

function inside(base: string, target: string): boolean {
  const path = relative(base, target);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function sourceDigest(root: string): Promise<string> {
  const base = await realpath(root);
  const files: Array<{path: string; sha256: string}> = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(join(base, directory), {withFileTypes: true});
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isSymbolicLink()) {
        files.push({path, sha256: createHash('sha256').update(await readlink(join(base, path))).digest('hex')});
      } else if (entry.isFile()) {
        const file = await open(join(base, path), constants.O_RDONLY | constants.O_NOFOLLOW);
        try { files.push({path, sha256: createHash('sha256').update(await file.readFile()).digest('hex')}); }
        finally { await file.close(); }
      } else throw new Error(`unsupported project file: ${path}`);
    }
  }
  await visit('');
  const digest = createHash('sha256');
  for (const file of files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    digest.update(`${file.path.split(sep).join('/')}\0${file.sha256}\n`);
  return digest.digest('hex');
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, nonempty = true): string {
  if (typeof value !== 'string' || (nonempty && !value.trim())) throw new Error(`${field} must be a string`);
  return value;
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`${field} must be an integer >= ${minimum}`);
  return value as number;
}

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => text(item, `${field}[${index}]`));
}

function digest(value: unknown, field: string): void {
  if (typeof value !== 'string' || !shaPattern.test(value)) throw new Error(`${field} must be a SHA-256 hash`);
}

function parseManifest(value: unknown): ReviewManifest {
  const manifest = object(value, 'manifest');
  if (manifest.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  text(manifest.projectId, 'projectId');
  text(manifest.sceneId, 'sceneId');
  const source = object(manifest.source, 'source');
  if (typeof source.gitCommit !== 'string' || !/^[a-fA-F0-9]+$/.test(source.gitCommit)) throw new Error('source.gitCommit must be hex');
  if (typeof source.trackedDirty !== 'boolean' || typeof source.untrackedDirty !== 'boolean')
    throw new Error('source dirty indicators must be booleans');
  digest(source.sha256, 'source.sha256');
  const selection = object(manifest.selection, 'selection');
  if (selection.policy !== SELECTION_POLICY) throw new Error('selection.policy is invalid');
  strings(selection.milestones, 'selection.milestones');
  const environment = object(manifest.environment, 'environment');
  for (const key of ['bun', 'remotion', 'chromium']) text(environment[key], `environment.${key}`);
  const os = object(environment.os, 'environment.os');
  for (const key of ['platform', 'arch', 'release']) text(os[key], `environment.os.${key}`);
  const video = object(environment.video, 'environment.video');
  for (const key of ['width', 'height', 'fps']) integer(video[key], `environment.video.${key}`, 1);
  if (environment.fonts !== null) {
    if (!Array.isArray(environment.fonts)) throw new Error('environment.fonts must be an array or null');
    for (const [index, font] of environment.fonts.entries()) {
      const item = object(font, `environment.fonts[${index}]`);
      text(item.family, `environment.fonts[${index}].family`);
      text(item.file, `environment.fonts[${index}].file`);
    }
  }
  const validation = object(manifest.validation, 'validation');
  if (validation.command !== 'bun run validate') throw new Error('validation.command is invalid');
  integer(validation.exitCode, 'validation.exitCode');
  strings(validation.warnings, 'validation.warnings');
  strings(validation.errors, 'validation.errors');
  if (!Array.isArray(manifest.captures)) throw new Error('captures must be an array');
  for (const [index, value] of manifest.captures.entries()) {
    const capture = object(value, `captures[${index}]`);
    text(capture.shotId, `captures[${index}].shotId`);
    integer(capture.localFrame, `captures[${index}].localFrame`);
    integer(capture.globalFrame, `captures[${index}].globalFrame`);
    text(capture.path, `captures[${index}].path`);
    if (capture.status === 'captured') {
      digest(capture.sha256, `captures[${index}].sha256`);
      if ('error' in capture) throw new Error(`captures[${index}].error is invalid for captured status`);
    } else if (capture.status === 'failed') {
      text(capture.error, `captures[${index}].error`);
      if ('sha256' in capture) throw new Error(`captures[${index}].sha256 is invalid for failed status`);
    } else throw new Error(`captures[${index}].status is invalid`);
  }
  const review = object(manifest.review, 'review');
  if (!['unreviewed', 'needs-revision', 'accepted'].includes(review.status as string)) throw new Error('review.status is invalid');
  if (review.reviewer !== null) {
    const reviewer = object(review.reviewer, 'review.reviewer');
    if (reviewer.kind !== 'human' && reviewer.kind !== 'agent') throw new Error('review.reviewer.kind is invalid');
    text(reviewer.name, 'review.reviewer.name');
  }
  strings(review.findings, 'review.findings');
  text(review.notes, 'review.notes', false);
  if (review.status === 'accepted') {
    if (!review.reviewer) throw new Error('accepted review requires a reviewer');
    if (!(review.notes as string).trim()) throw new Error('accepted review requires notes describing inspected images');
  }
  return manifest as ReviewManifest;
}

export function summaryText(manifest: ReviewManifest): string {
  const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return `# Visual review: ${manifest.projectId}/${manifest.sceneId}\n\n` +
    `Source SHA-256: ${manifest.source.sha256}\n\n` +
    `Validation: exit ${manifest.validation.exitCode}\n` +
    `Warnings: ${manifest.validation.warnings.map(cell).join('; ') || 'none'}\n` +
    `Errors: ${manifest.validation.errors.map(cell).join('; ') || 'none'}\n\n` +
    '| Shot | Local | Global | Capture | File |\n| --- | ---: | ---: | --- | --- |\n' +
    manifest.captures.map(c => `| ${cell(c.shotId)} | ${c.localFrame} | ${c.globalFrame} | ${c.status} | ${cell(c.status === 'captured' ? c.path : c.error)} |`).join('\n') +
    `\n\nReview: ${manifest.review.status}\n` +
    `Reviewer: ${manifest.review.reviewer ? `${manifest.review.reviewer.kind}: ${manifest.review.reviewer.name}` : 'none'}\n` +
    `Findings:\n${manifest.review.findings.map(f => `- ${f}`).join('\n') || '- none recorded'}\n` +
    `Notes: ${manifest.review.notes || 'none recorded'}\n`;
}

export async function verifyReview(manifestPath: string, projectRoot: string,
  options: {checkSummary?: boolean} = {}): Promise<void> {
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  const project = await loadProject(projectRoot);
  const projectJson = JSON.parse(await readFile(join(projectRoot, 'project.json'), 'utf8')) as {
    id: string; scenes: Array<{id: string}>;
  };
  if (manifest.projectId !== projectJson.id || manifest.sceneId !== projectJson.scenes[0]?.id)
    throw new Error('project or scene ID mismatch');
  for (const key of ['width', 'height', 'fps'] as const)
    if (manifest.environment.video[key] !== project.video[key]) throw new Error(`video ${key} mismatch`);
  const expected = selectReviewFrames(project.shots, manifest.selection.milestones);
  if (manifest.captures.length !== expected.length) throw new Error('capture frame count mismatch');
  const directory = await realpath(dirname(manifestPath));
  for (const [index, frame] of expected.entries()) {
    const capture = manifest.captures[index]!;
    if (capture.shotId !== frame.shotId || capture.localFrame !== frame.localFrame ||
      capture.globalFrame !== frame.globalFrame) throw new Error(`capture frame mismatch at index ${index}`);
    if (capture.path !== frame.path || isAbsolute(capture.path) || !inside(directory, join(directory, capture.path)))
      throw new Error(`capture path mismatch at index ${index}`);
    if (capture.status === 'failed') throw new Error(`capture failed: ${capture.error}`);
    const file = await realpath(join(directory, capture.path));
    if (!inside(directory, file)) throw new Error(`capture path escapes artifacts: ${capture.path}`);
    if (!(await stat(file)).isFile()) throw new Error(`capture path is not a file: ${capture.path}`);
    const bytes = await readFile(file);
    if (bytes.length <= 8 || bytes.subarray(0, 8).toString('hex') !== pngHeader)
      throw new Error(`invalid PNG: ${capture.path}`);
    if (createHash('sha256').update(bytes).digest('hex') !== capture.sha256)
      throw new Error(`capture hash mismatch: ${capture.path}`);
    await validatePng(file, bytes);
  }
  if (manifest.validation.exitCode !== 0 || manifest.validation.errors.length)
    throw new Error('validation failed');
  if (manifest.source.sha256 !== await sourceDigest(projectRoot)) throw new Error('source digest mismatch');
  if (options.checkSummary !== false && await readFile(join(directory, 'summary.md'), 'utf8') !== summaryText(manifest))
    throw new Error('summary is stale');
}
