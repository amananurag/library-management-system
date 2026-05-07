import { createApp } from './app';
import { config } from './config';
import { getDb } from './db';

const db = getDb(config.dbPath);
const app = createApp(db, { corsOrigin: config.corsOrigin });

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[library-api] listening on http://localhost:${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`[library-api] database at ${config.dbPath}`);
});
