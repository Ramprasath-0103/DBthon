import { createApp } from "./app.js";
import { env } from "./env.js";
import { connectRedis } from "./redis.js";

connectRedis();

createApp().listen(env.PORT, () => {
  console.log(`SafeWay API listening on http://localhost:${env.PORT}`);
});
