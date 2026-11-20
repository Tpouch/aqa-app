import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const cfg = loadConfig();
const { app } = await buildApp(cfg);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info(`${signal}: shutting down`);
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

await app.listen({ host: cfg.HOST, port: cfg.PORT });
