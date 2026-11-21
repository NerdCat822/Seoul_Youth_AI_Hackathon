import { readRoute } from '../lib/route';

const routes: Record<string, string> = {
  '/': 'home',
  '/login': 'login',
  '/signup': 'signup',
  '/forecast': 'forecast',
  '/calendar': 'calendar',
  '/records': 'records',
  '/cases': 'explore',
};
const route = readRoute();
const [path, query = ''] = route.split('?');
const params = new URLSearchParams(query);
let screen = routes[path];
const record = /^\/experiments\/([^/]+)(?:\/(upload|report))?$/.exec(path);
const idea = /^\/cases\/([^/]+)$/.exec(path);
if (record) {
  screen = record[2] === 'report' ? 'result' : record[2] === 'upload' ? 'upload' : 'record';
  params.set('id', decodeURIComponent(record[1]));
} else if (idea) {
  screen = 'idea';
  params.set('id', decodeURIComponent(idea[1]));
}
if (screen) {
  const target = new URL('design-final/' + screen + '.html', location.href);
  target.search = params.toString();
  location.replace(target.href);
} else {
  location.replace('service.html#' + route);
}
