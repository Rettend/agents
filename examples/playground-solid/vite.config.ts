import { cloudflare } from "@cloudflare/vite-plugin";
import solid from "vite-plugin-solid";
import chalk from "chalk";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare(),
    solid({
      exclude: ["src/server.ts", "src/agents/**"]
    }),
    {
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const timeString = new Date().toLocaleTimeString();
          console.log(
            `[${chalk.blue(timeString)}] ${chalk.green(
              req.method
            )} ${chalk.yellow(req.url)}`
          );
          next();
        });
      },
      name: "requestLogger"
    }
  ]
});
