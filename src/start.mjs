import { createAppServer } from "./server.mjs";
import { startGracefulShutdown } from "./ops.mjs";

const viewerPassword = process.env.OAKLINE_VIEWER_PASSWORD;
const editorPassword = process.env.OAKLINE_EDITOR_PASSWORD;

if (!viewerPassword || !editorPassword) {
  throw new Error("Set both OAKLINE_VIEWER_PASSWORD and OAKLINE_EDITOR_PASSWORD before starting.");
}

const server = await createAppServer({
  databaseFile: process.env.OAKLINE_DB_FILE ?? "./oakline-demo.sqlite",
  credentials: { viewerPassword, editorPassword }
});

server.listen(3000, "127.0.0.1", () => {
  console.log("Oakline local application: http://127.0.0.1:3000");
});

startGracefulShutdown(server);
