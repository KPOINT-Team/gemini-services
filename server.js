require("dotenv").config();
const http = require("http");
const url = require("url");

// Map route → handler file (Vercel-style default export)
const routes = {
  "/api/health": "./api/health.ts",
  "/api/token/live": "./api/token/live.ts",
  "/api/token/proxy": "./api/token/proxy.ts",
  "/api/proxy/generate": "./api/proxy/generate.ts",
};

// Vercel handlers expect (req, res) with req.body parsed and req.method set.
// We shim just enough to make them work.
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Find matching route
  const handlerPath = routes[pathname];
  if (!handlerPath) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  // Collect body for POST requests
  let body = "";
  if (req.method === "POST") {
    await new Promise((resolve) => {
      req.on("data", (chunk) => (body += chunk));
      req.on("end", resolve);
    });
    try {
      req.body = JSON.parse(body);
    } catch {
      req.body = {};
    }
  }

  // Shim res.json and res.status for Vercel compatibility
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data, null, 2));
  };

  try {
    // Use tsx to load TypeScript handlers directly
    const handler = require(handlerPath);
    const fn = handler.default || handler;
    await fn(req, res);
  } catch (err) {
    console.error(`[${pathname}] Error:`, err.message || err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal_error", detail: err.message }));
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  gemini-token-service running at http://localhost:${PORT}\n`);
  console.log("  Endpoints:");
  Object.keys(routes).forEach((r) => console.log(`    ${r}`));
  console.log("");
});
