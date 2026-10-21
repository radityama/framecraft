import {readFile, realpath} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {loadProject} from '../src/spike/project';

const warnings = [
  ['setInterval', /\bsetInterval\s*\(/],
  ['requestAnimationFrame', /\brequestAnimationFrame\s*\(/],
  ['fetch(', /\bfetch\s*\(/],
  ['http:// or https://', /https?:\/\//],
  ['Math.random', /\bMath\.random\s*\(/],
] as const;
const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'math', 'emoji', 'fangsong']);
const family = (value: string) => value.split(',')[0].trim().replace(/^['"]|['"]$/g, '');

async function main() {
  const root = resolve(process.argv[2] || join(import.meta.dir, '../projects/demo'));
  const project = await loadProject(root);
  for (const shot of project.shots) {
    console.log(`${shot.id}: ${shot.durationFrames} frames (${shot.durationFrames / project.video.fps} seconds)`);
    const entry = join(root, shot.entry);
    const html = await readFile(entry, 'utf8');
    const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map(match => match[1]);
    for (const link of html.matchAll(/<link\b[^>]*>/gi)) {
      if (!/\brel\s*=\s*(['"])stylesheet\1/i.test(link[0])) continue;
      const href = link[0].match(/\bhref\s*=\s*(['"])(.*?)\1/i)?.[2];
      if (!href || /^(?:https?:)?\/\//i.test(href)) continue;
      const path = await realpath(resolve(dirname(entry), href));
      const rel = relative(root, path);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Stylesheet escapes project: ${href}`);
      styles.push(await readFile(path, 'utf8'));
    }
    styles.push(...[...html.matchAll(/\bstyle\s*=\s*(['"])(.*?)\1/gi)].map(match => match[2]));
    const css = styles.join('\n');
    const faces = new Set([...css.matchAll(/@font-face\s*\{[^}]*\}/gi)].flatMap(match => [...match[0].matchAll(/\bfont-family\s*:\s*([^;{}]+)/gi)].map(value => family(value[1]).toLowerCase())));
    const ordinary = css.replace(/@font-face\s*\{[^}]*\}/gi, '');
    const missing = new Map<string, string>();
    for (const match of ordinary.matchAll(/\bfont-family\s*:\s*([^;{}]+)/gi)) {
      const name = family(match[1]);
      if (name && !faces.has(name.toLowerCase()) && !generic.has(name.toLowerCase())) missing.set(name.toLowerCase(), name);
    }
    for (const name of missing.values()) console.warn(`warning [${shot.id}]: undeclared font-family "${name}" in ${shot.entry}`);
    for (const [label, pattern] of warnings) {
      const source = label === 'http:// or https://' ? (html.replace(/\s+xmlns(?::[\w-]+)?\s*=\s*(['"])https?:\/\/[^'"<>]*\1/gi, '') + css) : html;
      if (pattern.test(source)) console.warn(`warning [${shot.id}]: ${label} in ${shot.entry}`);
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
