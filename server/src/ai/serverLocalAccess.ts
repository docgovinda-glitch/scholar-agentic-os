/**
 * A deployed server can never reach a model on the user's computer: its own
 * "localhost" is the server. Only a server running on the user's machine
 * (development) can, or one explicitly configured with ALLOW_SERVER_LOCAL_AI.
 * Otherwise the router hands local models to the user's browser.
 */
export function serverCanReachLocalModels(): boolean {
  if (process.env.ALLOW_SERVER_LOCAL_AI === "true") return true;
  if (process.env.ALLOW_SERVER_LOCAL_AI === "false") return false;
  return process.env.NODE_ENV !== "production";
}
