import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  setProtectMeWellCors,
  handleProtectMeWellPreflight,
  enforceOrigin,
  getProtectMeWellApiKey,
} from "../lib/protectmewell.js";

// Universal Sompo PDF endpoint lives on the demo host (different from the
// main PROTECTMEWELL_BASE_URL used by other endpoints).
const SOMPO_PDF_BASE_URL = "https://demo.protectmewell.com";
const SOMPO_PDF_PATH = "/api/v3/universal-sompo/generate_pdf";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleProtectMeWellPreflight(req, res)) return;
  setProtectMeWellCors(req, res);

  if (!enforceOrigin(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ status: false, error: "method_not_allowed" });
    return;
  }

  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    res.status(400).json({ status: false, error: "Request body is required for PDF generation" });
    return;
  }

  let apiKey: string;
  try {
    apiKey = getProtectMeWellApiKey();
  } catch {
    res.status(500).json({ status: false, error: "server_not_configured" });
    return;
  }

  try {
    // The upstream host (demo.protectmewell.com) intermittently fails to connect
    // (DNS/transient network errors surface as a thrown "fetch failed"). Retry on a
    // THROWN error only — an HTTP response (even 4xx/5xx) is a real answer and is
    // never retried. Mirrors the retry loop in calculate-portfolio.ts.
    const MAX_ATTEMPTS = 4;
    let upstream: Response | undefined;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        upstream = await fetch(`${SOMPO_PDF_BASE_URL}${SOMPO_PDF_PATH}`, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        break;
      } catch (err) {
        lastErr = err;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[generate-pdf] upstream connect failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${message}`,
        );
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
        }
      }
    }
    if (!upstream) throw lastErr ?? new Error("upstream_unreachable");

    const text = await upstream.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      const errObj = (data && typeof data === "object" ? data : {}) as { error?: string };
      res.status(upstream.status).json({
        status: false,
        error: errObj.error || "Failed to generate PDF",
        details: data,
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[generate-pdf] upstream failed:", message);
    res.status(502).json({
      status: false,
      error: "Failed to generate PDF",
      details: message,
    });
  }
}
