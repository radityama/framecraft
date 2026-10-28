import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat, mkdir, open, realpath, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {parseFeedback, type Feedback} from './feedback';

export class FeedbackConflict extends Error {}
export class FeedbackStore {
  constructor(private root: string) {}
  private path(project: string, scene: string) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(project) || !/^[a-z0-9][a-z0-9-]*$/.test(scene)) throw new Error('Invalid feedback identity');
    return join(this.root, `${project}__${scene}.feedback.json`);
  }
  async read(project: string, scene: string): Promise<{feedback: Feedback; etag: string}> {
    const path = this.path(project, scene);
    try { if (await realpath(this.root) !== this.root) throw new Error('Workspace path changed'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    let file;
    try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {feedback: {schemaVersion: 1, projectId: project, sceneId: scene, issues: []}, etag: 'missing'};
      throw error;
    }
    try {
      if (!(await file.stat()).isFile()) throw new Error('Feedback is not a regular file');
      const bytes = await file.readFile();
      const feedback = parseFeedback(JSON.parse(bytes.toString()));
      if (feedback.projectId !== project || feedback.sceneId !== scene) throw new Error('Feedback identity mismatch');
      return {feedback, etag: createHash('sha256').update(bytes).digest('hex')};
    } finally { await file.close(); }
  }
  async save(value: unknown, expected: string) {
    const feedback = parseFeedback(value);
    await mkdir(this.root, {recursive: true});
    if (await realpath(this.root) !== this.root) throw new Error('Workspace path changed');
    const path = this.path(feedback.projectId, feedback.sceneId);
    let lock;
    try { lock = await open(`${path}.lock`, 'wx'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new FeedbackConflict('Feedback is being saved; reload before retrying'); throw error; }
    const partial = `${path}.${crypto.randomUUID()}.partial`;
    try {
      const current = await this.read(feedback.projectId, feedback.sceneId);
      if (current.etag !== expected) throw new FeedbackConflict('Feedback changed in another window; reload before saving');
      try { if (!(await lstat(path)).isFile()) throw new Error('Feedback target must be a regular file'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const file = await open(partial, 'wx');
      try { await file.writeFile(JSON.stringify(feedback, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
      await rename(partial, path);
      return this.read(feedback.projectId, feedback.sceneId);
    } finally { await lock.close(); await rm(`${path}.lock`); await rm(partial, {force: true}); }
  }
}
