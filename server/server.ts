import { analytics, createApp, lakebase, server, serving } from '@databricks/appkit';
import { setupAssetRoutes } from './routes/assets';
import { setupAiRoutes } from './routes/ai';

createApp({
  plugins: [server(), analytics(), lakebase(), serving({ timeout: 30000 })],
  async onPluginsReady(appkit) {
    await setupAssetRoutes(appkit);
    setupAiRoutes(appkit);
  },
}).catch(console.error);

// server - web server, analytics - read only SQL files, lakebase - PostgresSQL Connection pool
