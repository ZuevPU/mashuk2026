'use strict';

const http = require('http');

const port = Number(process.env.PORT) || 8080;
const targets = [
  { host: '127.0.0.1', path: '/health', family: 4 },
  { host: '::1', path: '/health', family: 6 },
];

function probe(target) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: target.host,
        port,
        path: target.path,
        timeout: 400,
        family: target.family,
      },
      (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400));
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
  const hits = await Promise.all(targets.map(probe));
  process.exit(hits.some(Boolean) ? 0 : 1);
})();
