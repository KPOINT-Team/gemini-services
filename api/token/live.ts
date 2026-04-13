import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyClientCredentials } from "../../lib/auth.js";
import {
  setBaseCorsHeaders,
  handleOptions,
  enforceClientOrigin,
} from "../../lib/cors.js";
import { isModelAllowed, mintLiveToken } from "../../lib/gemini.js";

interface LiveTokenBody {
  clientId?: unknown;
  clientSecret?: unknown;
  model?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setBaseCorsHeaders(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = (req.body ?? {}) as LiveTokenBody;
  const client = verifyClientCredentials(body.clientId, body.clientSecret);
  if (!client) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  if (!enforceClientOrigin(req, client)) {
    res.status(403).json({ error: "origin_not_allowed" });
    return;
  }

  if (!isModelAllowed(body.model)) {
    res.status(403).json({ error: "model_not_allowed" });
    return;
  }

  try {
    const result = await mintLiveToken(body.model);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[token/live] mint failed:", message);
    res.status(500).json({ error: "mint_failed" });
  }
}
