'use strict';

const http = require('http');

const port = Number(process.env.PORT) || 8080;
const req = http.get(
  {
    host: '127.0.0.1',
    port,
    path: '/health',
    timeout: 3500,
  },
  (res) => {
    res.resume();
    const ok = Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400);
    if (!ok) {
      console.error(`healthcheck: HTTP ${res.statusCode} from 127.0.0.1:${port}/health`);
    }
    process.exit(ok ? 0 : 1);
  },
);
req.on('error', (err) => {
  console.error(`healthcheck: ${err && err.message ? err.message : err} (127.0.0.1:${port}/health)`);
  process.exit(1);
});
req.on('timeout', () => {
  console.error(`healthcheck: timeout 127.0.0.1:${port}/health`);
  req.destroy();
  process.exit(1);
});
