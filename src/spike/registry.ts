import {lstat, readdir, realpath} from 'node:fs/promises';
import {isAbsolute, join, relative, sep} from 'node:path';
import {loadStudioProject, type StudioProject} from './project';

export type Registry = {
  projects: Map<string, {root: string; project: StudioProject}>;
  warnings: string[];
};

function inside(base: string, target: string): boolean {
  const path = relative(base, target);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function discoverProjects(directory: string, explicitRoot?: string): Promise<Registry> {
  const base = await realpath(directory);
  const projects: Registry['projects'] = new Map();
  const warnings: string[] = [];
  const duplicates = new Set<string>();

  const add = async (name: string, root: string, discovered: boolean) => {
    try {
      const canonical = await realpath(root);
      if (discovered && !inside(base, canonical)) throw new Error('outside the projects directory');
      const project = await loadStudioProject(canonical);
      if (['assets', 'scenes', 'runtime.js'].includes(project.id)) throw new Error(`reserved project id: ${project.id}`);
      if (duplicates.has(project.id)) {
        if (!discovered) throw new Error(`duplicate project id ${project.id}`);
        return;
      }
      const existing = projects.get(project.id);
      if (existing) {
        if (existing.root === canonical) return;
        projects.delete(project.id);
        duplicates.add(project.id);
        if (!discovered) throw new Error(`duplicate project id ${project.id}`);
        warnings.push(`duplicate project id ${project.id}: all colliding projects omitted`);
        return;
      }
      projects.set(project.id, {root: canonical, project});
    } catch (error) {
      if (!discovered) throw error;
      // Catalog warnings must not expose absolute loader paths.
      warnings.push(`${name}: invalid project (run validate for details)`);
    }
  };

  for (const child of (await readdir(base, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!child.isDirectory()) {
      if (child.isSymbolicLink()) warnings.push(`${child.name}: symlinked project directory is not authorized`);
      continue;
    }
    const root = join(base, child.name);
    try { await lstat(join(root, 'project.json')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      warnings.push(`${child.name}: project manifest is inaccessible`);
      continue;
    }
    await add(child.name, root, true);
  }
  if (explicitRoot) await add(explicitRoot, explicitRoot, false);
  return {projects: new Map([...projects].sort(([a], [b]) => a.localeCompare(b))), warnings};
}
