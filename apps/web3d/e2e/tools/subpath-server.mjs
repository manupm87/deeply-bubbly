/* global process, URL */
/**
 * A production build served the way Pages would: only under /3d/, with its own store prefix, on a free port.
 * Anything asked for outside the subpath answers 404 and is recorded, so an absolute asset path shows up.
 */
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.map': 'application/json',
};

export async function start() {
  const app = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const root = mkdtempSync(join(tmpdir(), 'db-subpath-'));
  const dist = join(root, 'dist');
  const built = spawnSync(`npx vite build --outDir "${dist}" --emptyOutDir`, {
    cwd: app,
    shell: true,
    env: { ...process.env, VITE_STORE_PREFIX: '3d:' },
    encoding: 'utf8',
  });
  if (built.status !== 0) throw new Error(`build failed: ${built.stdout}${built.stderr}`);
  const outside = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/3d') {
      const query = new URL(req.url, 'http://x').search;
      res.writeHead(301, { location: `/3d/${query}` }).end();
      return;
    }
    if (!path.startsWith('/3d/')) {
      outside.push(path);
      res.writeHead(404).end();
      return;
    }
    const relative = path.slice('/3d/'.length) || 'index.html';
    const file = join(dist, normalize(relative));
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    outside,
    close: async () => {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
      rmSync(root, { recursive: true, force: true });
    },
  };
}
