import { analytics, createApp, lakebase, server } from "@databricks/appkit";
import { setupAssetRoutes } from "./routes/assets";

createApp({
  plugins: [server(), analytics(), lakebase()], 
  async onPluginsReady(appkit) {
    await setupAssetRoutes(appkit);
  },
}).catch(console.error);

// server - web server, analytics - read only SQL files, lakebase - PostgresSQL Connection pool
