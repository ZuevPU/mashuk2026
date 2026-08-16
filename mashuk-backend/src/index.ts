import http from 'node:http';

const port = Number(process.env.PORT) || 8080;
// Timeweb probes `localhost`, which is often ::1. Binding only 0.0.0.0
// makes that check fail while the process looks fine. Omit host so Node
// uses dual-stack (::) when IPv6 exists, otherwise 0.0.0.0.
const explicitHost = process.env.HOST && process.env.HOST !== '0.0.0.0'
  ? process.env.HOST
  : undefined;

type NodeHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

let appHandler: NodeHandler | null = null;

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

// Bind 8080 with zero app imports. Timeweb's healthcheck has ~105s and fails
// if /health is silent while Express/DB/PDF are still loading — or if dotenv
// runs first. Platform env vars are already in process.env.
const server = http.createServer((req, res) => {
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
});

server.on('error', (err) => {
  console.error(`Failed to bind port ${port}:`, err);
  process.exit(1);
});

function onListening() {
  const addr = server.address();
  const where = typeof addr === 'object' && addr
    ? `${addr.address}:${addr.port}`
    : `port ${port}`;
  console.log(`Server running on ${where}`);
  console.log('Health: /, /health, /api/health (liveness), /health/ready (DB check after boot)');
  void boot().catch((err) => {
    console.error('Boot failed after listen — healthcheck stays up:', err);
  });
}

if (explicitHost) {
  server.listen(port, explicitHost, onListening);
} else {
  server.listen(port, onListening);
}

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
    console.error('Migrations failed — server stays up for healthchecks, but DB routes will fail until this is fixed and the app is restarted:', err);
  }
}
