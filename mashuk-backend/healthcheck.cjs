'use strict';

const port = Number(process.env.PORT) || 8080;
const url = `http://127.0.0.1:${port}/health`;

fetch(url)
  .then((res) => process.exit(res.ok ? 0 : 1))
  .catch(() => process.exit(1));
