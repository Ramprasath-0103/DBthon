import type { Server } from "node:http";
import { createApp } from "../src/app.js";

export async function startTestServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const server: Server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error("no port assigned");
  return {
    base: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
