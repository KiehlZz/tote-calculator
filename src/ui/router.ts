export type Route = { name: 'home' } | { name: 'session'; id: number };

// ids are limited to 9 digits so Number() always stays an exact integer
const SESSION_PATH = /^\/session\/([1-9][0-9]{0,8})$/;

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const match = SESSION_PATH.exec(path);
  if (match) {
    return { name: 'session', id: Number(match[1]) };
  }
  return { name: 'home' };
}

export function routeToHash(route: Route): string {
  return route.name === 'home' ? '#/' : `#/session/${route.id}`;
}