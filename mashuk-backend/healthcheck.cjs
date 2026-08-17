'use strict';

const net = require('net');

const port = Number(process.env.PORT) || 8080;
const hosts = ['127.0.0.1', '::1'];

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
    if (await ping(host)) process.exit(0);
  }
  process.exit(1);
})();
