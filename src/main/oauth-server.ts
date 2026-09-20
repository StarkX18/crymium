import http from "http";
import type { OAuth2Client } from "google-auth-library";
import { exchangeCode } from "./sheets-service.js";
import type { StoredTokens } from "./config-store.js";

const PORT = 42817;

export function startOAuthFlow(
  client: OAuth2Client,
  authUrl: string
): Promise<{ tokens: StoredTokens; error?: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const err = url.searchParams.get("error");
      if (err) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<p>Authorization failed. Close this window.</p>");
        server.close();
        resolve({ tokens: {}, error: err });
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing code");
        return;
      }
      try {
        const tokens = await exchangeCode(client, code);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<p>Google Sheets connected. You can close this window and return to Huntboard.</p>"
        );
        server.close();
        resolve({ tokens });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.writeHead(500);
        res.end(msg);
        server.close();
        resolve({ tokens: {}, error: msg });
      }
    });
    server.listen(PORT, "127.0.0.1");
    import("electron").then(({ shell }) => {
      shell.openExternal(authUrl);
    });
  });
}
