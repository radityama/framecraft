export const severities = ['info', 'minor', 'major', 'blocking'] as const;
export const categories = ['timing', 'motion', 'typography', 'layout', 'color', 'asset', 'audio', 'other'] as const;
export const issueStatuses = ['open', 'resolved', 'wont-fix'] as const;
export type Geometry = {type: 'point'; x: number; y: number} | {type: 'rectangle'; x: number; y: number; width: number; height: number};
export type ReviewIssue = {
  id: string; projectId: string; sceneId: string; shotId: string; frame: number; localFrame: number;
  sourceSha256: string; severity: typeof severities[number]; category: typeof categories[number];
  description: string; status: typeof issueStatuses[number]; geometry?: Geometry; artifact?: string;
};
export type Feedback = {schemaVersion: 1; projectId: string; sceneId: string; issues: ReviewIssue[]};
const id = /^[a-z0-9][a-z0-9-]*$/;
const sha = /^[a-f0-9]{64}$/;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unknown feedback field');
}
export function parseGeometry(value: unknown): Geometry {
  const region = object(value);
  keys(region, region.type === 'point' ? ['type', 'x', 'y'] : ['type', 'x', 'y', 'width', 'height']);
  if (region.type !== 'point' && region.type !== 'rectangle') throw new Error('Invalid geometry type');
  for (const key of region.type === 'point' ? ['x', 'y'] : ['x', 'y', 'width', 'height']) {
    const n = region[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) throw new Error('Geometry must be normalized to [0,1]');
  }
  if (region.type === 'rectangle' && (!(Number(region.width) > 0) || !(Number(region.height) > 0) || Number(region.x) + Number(region.width) > 1 + 1e-10 || Number(region.y) + Number(region.height) > 1 + 1e-10)) throw new Error('Rectangle outside frame');
  return region as Geometry;
}
export function parseFeedback(value: unknown): Feedback {
  const doc = object(value);
  keys(doc, ['schemaVersion', 'projectId', 'sceneId', 'issues']);
  if (doc.schemaVersion !== 1 || typeof doc.projectId !== 'string' || !id.test(doc.projectId) || typeof doc.sceneId !== 'string' || !id.test(doc.sceneId) || !Array.isArray(doc.issues) || doc.issues.length > 1000) throw new Error('Invalid feedback document');
  const seen = new Set<string>();
  for (const item of doc.issues) {
    const issue = object(item);
    keys(issue, ['id', 'projectId', 'sceneId', 'shotId', 'frame', 'localFrame', 'sourceSha256', 'severity', 'category', 'description', 'status', 'geometry', 'artifact']);
    if (typeof issue.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(issue.id) || seen.has(issue.id)) throw new Error('Invalid or duplicate issue ID');
    seen.add(issue.id);
    if (issue.projectId !== doc.projectId || issue.sceneId !== doc.sceneId || typeof issue.shotId !== 'string' || !id.test(issue.shotId)) throw new Error('Issue identity mismatch');
    for (const key of ['frame', 'localFrame']) if (!Number.isSafeInteger(issue[key]) || Number(issue[key]) < 0) throw new Error('Invalid issue frame');
    if (Number(issue.localFrame) > Number(issue.frame) || typeof issue.sourceSha256 !== 'string' || !sha.test(issue.sourceSha256)) throw new Error('Invalid source identity');
    if (!severities.includes(issue.severity as ReviewIssue['severity']) || !categories.includes(issue.category as ReviewIssue['category']) || !issueStatuses.includes(issue.status as ReviewIssue['status'])) throw new Error('Invalid issue classification');
    if (typeof issue.description !== 'string' || !issue.description.trim() || issue.description.length > 10000) throw new Error('Description required (maximum 10000 characters)');
    if (issue.geometry !== undefined) parseGeometry(issue.geometry);
    if (issue.artifact !== undefined && (typeof issue.artifact !== 'string' || !/^revisions\/[a-f0-9]{64}\/screenshots\/[a-z0-9-]+\.png$/.test(issue.artifact))) throw new Error('Invalid relative artifact reference');
  }
  return doc as Feedback;
}
export const isStale = (issue: ReviewIssue, sourceSha256: string) => issue.sourceSha256 !== sourceSha256;
export function feedbackMarkdown(doc: Feedback): string {
  const plain = (s: string) => s.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replace(/\r?\n/g, ' ');
  return `# Framecraft feedback: ${doc.projectId}/${doc.sceneId}\n\nSchema: 1\nIssues: ${doc.issues.length}, open: ${doc.issues.filter(i => i.status === 'open').length}\n\n` + doc.issues.map(i =>
    `## ${i.id}\n\n- Severity: ${i.severity}\n- Category: ${i.category}\n- Status: ${i.status}\n- Scene frame: ${i.frame}\n- Shot: ${i.shotId}, local frame ${i.localFrame}\n- Source SHA-256: ${i.sourceSha256}\n- Region: ${i.geometry ? JSON.stringify(i.geometry) : 'none'}\n- Artifact: ${i.artifact ?? 'live preview; capture this exact frame before editing'}\n\n${plain(i.description)}\n`).join('\n') +
    '\n## Agent handoff\n\nRead this feedback and the project/shot briefs. Inspect each exact frame with `bun run snap --project projects/<project-id> --scene <scene-id> --shot <shot-id> --frame <local-frame>`. Preserve unrelated work. Fix source, not historical captures. Validate and capture a new review directory, compare matched frames, and report addressed issue IDs with evidence. Never auto-resolve feedback or claim human approval. See docs/feedback.md.\n';
}
