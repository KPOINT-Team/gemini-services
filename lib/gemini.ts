import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export function getAllowedModels(): string[] {
  const raw = process.env.ALLOWED_MODELS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

export function isModelAllowed(model: unknown): model is string {
  if (typeof model !== "string") return false;
  const allowed = getAllowedModels();
  if (allowed.length === 0) return false;
  return allowed.includes(model);
}

/**
 * Mint a Gemini ephemeral auth token for Live API.
 * The returned token is safe to hand to a browser client for direct
 * Live WebSocket connection.
 */
export async function mintLiveToken(
  model: string,
  liveConfig?: Record<string, unknown>
): Promise<{
  token: string;
  expiresAt: number;
  model: string;
}> {
  const ai = getGenAI();
  const now = Date.now();
  const expireMs = now + 60 * 60 * 1000; // 1 hour
  const newSessionExpireMs = now + 60 * 1000; // allow 60s to start the session

  const authToken = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(expireMs).toISOString(),
      newSessionExpireTime: new Date(newSessionExpireMs).toISOString(),
      httpOptions: { apiVersion: "v1alpha" },
      liveConnectConstraints: {
        model,
        ...(liveConfig ? { config: liveConfig } : {}),
      },
    },
  });

  const tokenName = (authToken as { name?: string }).name;
  if (!tokenName) {
    throw new Error("Gemini did not return an ephemeral token");
  }

  return {
    token: tokenName,
    expiresAt: expireMs,
    model,
  };
}
