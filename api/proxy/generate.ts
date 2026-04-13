import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCorsHeaders, handleOptions } from "../../lib/cors.js";
import { extractBearerToken, verifyJwt } from "../../lib/jwt.js";
import { getGenAI, isModelAllowed } from "../../lib/gemini.js";

interface GenerateBody {
  model?: unknown;
  contents?: unknown;
  generationConfig?: unknown;
  systemInstruction?: unknown;
  safetySettings?: unknown;
  tools?: unknown;
}

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

  const body = (req.body ?? {}) as GenerateBody;

  if (!isModelAllowed(body.model)) {
    res.status(403).json({ error: "model_not_allowed" });
    return;
  }

  if (!body.contents) {
    res.status(400).json({ error: "missing_contents" });
    return;
  }

  try {
    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: body.model,
      contents: body.contents as never,
      config: {
        ...(body.generationConfig as object | undefined),
        ...(body.systemInstruction
          ? { systemInstruction: body.systemInstruction as never }
          : {}),
        ...(body.safetySettings
          ? { safetySettings: body.safetySettings as never }
          : {}),
        ...(body.tools ? { tools: body.tools as never } : {}),
      },
    });

    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[proxy/generate] call failed:", message);
    res.status(502).json({ error: "upstream_failed", detail: message });
  }
}
