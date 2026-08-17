import http from 'node:http';

const port = Number(process.env.PORT) || 8080;
// Timeweb/panel HOST is often an advertised address, not a bindable NIC.
// Always listen on IPv4; IPv6 is best-effort so `localhost` / ::1 probes work.
const bootDelayMs = process.env.NODE_ENV === 'production' ? 2500 : 0;

type NodeHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

let appHandler: NodeHandler | null = null;
let bootStarted = false;

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function isLiveness(urlPath: string): boolean {
  return urlPath === '/' || urlPath === '/health' || urlPath === '/api/health';
}

function handler(req: http.IncomingMessage, res: http.ServerResponse) {
  if (appHandler) {
    appHandler(req, res);
    return;
  }
  const urlPath = (req.url || '').split('?')[0];
  if (isLiveness(urlPath)) {
    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  sendJson(res, 503, { status: 'starting' });
}

function listen(host: string): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    const onErr = (err: Error) => {
      server.close();
      reject(err);
    };
    server.once('error', onErr);
    server.listen(port, host, () => {
      server.off('error', onErr);
      server.on('error', (err) => {
        console.error(`Server error on ${host}:${port}:`, err);
      });
      const addr = server.address();
      const where = typeof addr === 'object' && addr
        ? `${addr.address}:${addr.port}`
        : `${host}:${port}`;
      console.log(`Server listening on ${where}`);
      resolve(server);
    });
  });
}

function scheduleBoot() {
  if (bootStarted) return;
  bootStarted = true;
  console.log('Health: /, /health, /api/health (liveness), /health/ready (DB check after boot)');
  setTimeout(() => {
    void boot().catch((err) => {
      console.error('Boot failed after listen — healthcheck stays up:', err);
    });
  }, bootDelayMs);
}

async function start() {
  try {
    await listen('0.0.0.0');
  } catch (err) {
    console.error(`Failed to bind 0.0.0.0:${port}:`, err);
    process.exit(1);
  }
  try {
    await listen('::');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`IPv6 bind skipped for :${port}: ${message}`);
  }
  scheduleBoot();
}

void start();

async function boot() {
  const { env } = await import('./config/env.js');
  const { validateEnv } = await import('./config/validateEnv.js');
  const { createApp } = await import('./app.js');
  if (env.PUBLIC_URL) console.log(`PUBLIC_URL: ${env.PUBLIC_URL}`);

  appHandler = createApp() as unknown as NodeHandler;

  const envOk = validateEnv();
  if (!envOk) {
    console.error('Startup config invalid — server stays up for healthchecks, but DB/auth routes will fail until env vars are fixed and the app is restarted.');
    return;
  }

  try {
    const { runMigrations } = await import('./db/migrate.js');
    const { ensureAdminPermissionsSeeded } = await import('./services/adminPermissionsService.js');
    const { ensureNavDiagnosticsTemplateApplied } = await import('./services/ensureNavDiagnosticsTemplate.js');
    await runMigrations();
    await ensureAdminPermissionsSeeded();
    try {
      await ensureNavDiagnosticsTemplateApplied();
    } catch (err) {
      console.error('Nav diagnostics template upgrade failed (non-fatal):', err);
    }
    if (process.env.AUTO_SEED === 'true') {
      try {
        const { runSeed } = await import('./db/seed.js');
        await runSeed();
      } catch (err) {
        console.error('Seed skipped or failed (non-fatal):', err);
      }
    }
    const { startAnalyticsRefreshScheduler } = await import('./services/analytics/refreshScheduler.js');
    const { startPushScheduler } = await import('./services/pushScheduler.js');
    const { startExportJobRunner } = await import('./services/exports/exportJobRunner.js');
    startAnalyticsRefreshScheduler();
    startPushScheduler();
    startExportJobRunner();
  } catch (err) {
    console.error('Migrations failed — server stays up for healthchecks, but DB/auth routes will fail until this is fixed and the app is restarted:', err);
  }
}
