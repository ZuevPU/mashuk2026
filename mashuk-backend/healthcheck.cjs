'use strict';

const http = require('http');

const port = Number(process.env.PORT) || 8080;
const req = http.get(
  {
    host: '127.0.0.1',
    port,
    path: '/health',
    timeout: 4000,
  },
  (res) => {
    res.resume();
    process.exit(res.statusCode && res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
  },
);
req.on('error', () => process.exit(1));
req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});
