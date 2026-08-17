'use strict';

// Stand-in for curl/wget inside node:22-slim. Timeweb may replace our
// HEALTHCHECK with `curl -f http://localhost:8080/` after it recreates
// the container. HTTP GET can hang while boot() blocks the event loop;
// a TCP handshake is enough: the kernel accept queue is already open.

const net = require('net');

const portDefault = Number(process.env.PORT) || 8080;
const args = process.argv.slice(2);
const urlArg = [...args].reverse().find((a) => /^https?:\/\//i.test(a))
  || `http://127.0.0.1:${portDefault}/`;

let parsed;
try {
  parsed = new URL(urlArg);
} catch {
  process.exit(1);
}

const port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
const hostname = parsed.hostname || '127.0.0.1';
const hosts = hostname === 'localhost' || hostname === '0.0.0.0'
  ? ['127.0.0.1', '::1']
  : [hostname];

function ping(host) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: 400 }, () => {
      sock.end();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

(async () => {
  for (const host of hosts) {
    if (await ping(host)) {
      process.stdout.write('{"status":"ok"}\n');
      process.exit(0);
    }
  }
  process.stderr.write(`probe: nothing listening on ${hostname}:${port}\n`);
  process.exit(1);
})();
