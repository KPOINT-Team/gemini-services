import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCorsHeaders, handleOptions } from "../lib/cors.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCorsHeaders(req, res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  res.status(200).json({
    ok: true,
    service: "gemini-token-service",
    time: new Date().toISOString(),
  });
}
