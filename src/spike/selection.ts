import {realpath} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import type {Scene, StudioProject} from './project';

export async function projectRoot(value?: string): Promise<string> {
  return realpath(resolve(value ?? join(import.meta.dir, '../../projects/demo')));
}

export function selectScene(project: StudioProject, sceneId?: string): Scene {
  if (sceneId === undefined) {
    if (project.scenes.length === 1) return project.scenes[0]!;
    throw new Error(`project ${project.id}: specify a scene (found ${project.scenes.length})`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(sceneId)) throw new Error(`invalid scene id: ${sceneId}`);
  const scene = project.scenes.find(candidate => candidate.id === sceneId);
  if (!scene) throw new Error(`project ${project.id}: scene not found: ${sceneId}`);
  return scene;
}
