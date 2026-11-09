// The API documentation stays true: every route in the app is documented, every documented
// endpoint exists, and a role without the documented permission really is refused.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { openApiSpec } from '../src/docs/openapi.js';
import { hasPermission } from '../src/auth/permissions.js';
import { cleanupUsers, createUser, login, newTag, pool, startApi } from './helpers.js';

const tag = newTag('D');
let api;

before(async () => {
  api = await startApi();
});

after(async () => {
  try {
    await cleanupUsers();
  } finally {
    await api?.close();
    await pool.end();
  }
});

// Every route of every router mounted under /api, as 'GET /products/{id}'.
function appRoutes() {
  const routes = [];
  for (const layer of app._router.stack) {
    if (layer.name !== 'router') continue;
    const mount = /^\^\\\/api\\\/(.+?)\\\/\?/.exec(layer.regexp.source);
    if (!mount) continue;
    const base = `/${mount[1].replaceAll('\\/', '/')}`;
    for (const { route } of layer.handle.stack) {
      if (!route) continue;
      const path = `${base}${route.path === '/' ? '' : route.path}`.replace(/:(\w+)/g, '{$1}');
      for (const method of Object.keys(route.methods)) routes.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return routes.sort();
}

const documented = () => Object.entries(openApiSpec.paths)
  .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`))
  .sort();

test('every route is documented, and every documented endpoint exists', () => {
  const routes = appRoutes();
  assert.ok(routes.length > 60, `found the routes (${routes.length})`);
  assert.deepEqual(documented(), routes);
});

test('the docs page and the OpenAPI file are served, and unknown API addresses are still 404', async () => {
  const page = await fetch(`${api.base}/docs/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /html/);
  assert.match(await page.text(), /swagger/i);

  const spec = await api.call('GET', '/openapi.json');
  assert.equal(spec.status, 200);
  assert.equal(spec.body.info.title, 'StockFlow API');
  assert.equal(Object.keys(spec.body.paths).length, Object.keys(openApiSpec.paths).length);

  assert.equal((await api.call('GET', '/no-such-thing')).status, 404);
});

test('protected endpoints say so: a call without a token answers what the docs promise', async () => {
  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation.security) continue;
      const url = path.replace('{id}', '1').replace('{key}', 'x');
      const res = await api.call(method.toUpperCase(), url);
      assert.equal(res.status, 401, `${method} ${path}`);
      assert.ok(operation.responses[401], `${method} ${path} documents 401`);
    }
  }
});

test('a role without the documented permission is refused', async () => {
  // An id that doesn't exist, so that even a wrongly documented route can't change real data.
  const url = (path) => path.replace('{id}', '999999999').replace('{key}', 'x');
  for (const role of ['staff', 'manager']) {
    const token = await login(api.call, await createUser(tag, role));
    for (const [path, methods] of Object.entries(openApiSpec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        const permission = /`([\w.]+)` permission/.exec(operation.description ?? '')?.[1];
        if (!permission || hasPermission(role, permission)) continue;
        const res = await api.call(method.toUpperCase(), url(path), { token });
        assert.equal(res.status, 403, `${role}: ${method} ${path} needs ${permission}`);
      }
    }
  }
});
