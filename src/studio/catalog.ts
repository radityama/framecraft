export type StudioCatalog = {
  projects: {id: string; title: string; scenes: {id: string; title: string; durationFrames: number}[]}[];
  warnings: string[];
  selected: {projectId: string; sceneId: string | null};
};

export type StudioRoute = {project: string | null; scene: string | null; shot?: string | null; error?: string};
const validId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id);

export function routeFromSearch(search: string): StudioRoute {
  const params = new URLSearchParams(search);
  const route: StudioRoute = {project: params.get('project'), scene: params.get('scene') ?? params.get('clip'), shot: params.get('shot')};
  if (['project', 'scene', 'clip', 'shot'].some(key => params.getAll(key).length > 1) ||
    (params.has('scene') && params.has('clip') && params.get('scene') !== params.get('clip'))) route.error = 'Conflicting or repeated selection parameters.';
  else if ([route.project, route.scene, route.shot].some(id => id !== null && id !== undefined && !validId(id))) route.error = 'Selection must use project, scene and shot IDs, not paths.';
  return route;
}

export function routeSearch(route: StudioRoute): string {
  const params = new URLSearchParams();
  if (route.project !== null) params.set('project', route.project);
  if (route.scene !== null) params.set('scene', route.scene);
  if (route.shot) params.set('shot', route.shot);
  return `?${params}`;
}
