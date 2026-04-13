import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCorsHeaders, handleOptions } from "../../lib/cors.js";
import { extractBearerToken, verifyJwt } from "../../lib/jwt.js";
import { isModelAllowed, mintLiveToken } from "../../lib/gemini.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCorsHeaders(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_or_expired_token" });
    return;
  }

  const { model, config } = (req.body ?? {}) as { model?: unknown; config?: Record<string, unknown> };
  if (!isModelAllowed(model)) {
    res.status(403).json({ error: "model_not_allowed" });
    return;
  }

  try {
    const result = await mintLiveToken(model, config);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[token/live] mint failed:", message);
    res.status(500).json({ error: "mint_failed" });
  }
}
