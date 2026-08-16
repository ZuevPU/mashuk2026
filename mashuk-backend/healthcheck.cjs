'use strict';

const http = require('http');

const port = Number(process.env.PORT) || 8080;
const targets = [
  { host: '127.0.0.1', path: '/health' },
  { host: 'localhost', path: '/health' },
  { host: '127.0.0.1', path: '/' },
];

function probe(target) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: target.host,
        port,
        path: target.path,
        timeout: 2500,
        family: target.host === '127.0.0.1' ? 4 : undefined,
      },
      (res) => {
        res.resume();
        const ok = Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400);
        resolve(ok);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  for (const target of targets) {
    if (await probe(target)) {
      process.exit(0);
    }
  }
  console.error(`healthcheck: no 2xx from 127.0.0.1/localhost:${port}/health`);
  process.exit(1);
})();
