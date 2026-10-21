import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {loadProject} from '../src/spike/project';

const warnings = [
  ['setInterval', /\bsetInterval\s*\(/],
  ['requestAnimationFrame', /\brequestAnimationFrame\s*\(/],
  ['fetch(', /\bfetch\s*\(/],
  ['http:// or https://', /https?:\/\//],
  ['Math.random', /\bMath\.random\s*\(/],
] as const;

async function main() {
  const root = resolve(process.argv[2] || join(import.meta.dir, '../projects/demo'));
  const project = await loadProject(root);
  for (const shot of project.shots) {
    console.log(`${shot.id}: ${shot.durationFrames} frames (${shot.durationFrames / project.video.fps} seconds)`);
    const html = await readFile(join(root, shot.entry), 'utf8');
    for (const [label, pattern] of warnings) {
      if (pattern.test(html)) console.warn(`warning [${shot.id}]: ${label} in ${shot.entry}`);
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
