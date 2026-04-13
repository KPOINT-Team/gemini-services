import { timingSafeEqual } from "node:crypto";

export interface ClientConfig {
  id: string;
  secret: string;
  allowedOrigins?: string[];
}

let cachedClients: ClientConfig[] | null = null;

function loadClients(): ClientConfig[] {
  if (cachedClients) return cachedClients;

  const raw = process.env.CLIENTS_JSON;
  if (!raw) {
    throw new Error("CLIENTS_JSON environment variable is not set");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CLIENTS_JSON is not valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("CLIENTS_JSON must be a JSON array");
  }

  const clients: ClientConfig[] = parsed.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as ClientConfig).id !== "string" ||
      typeof (entry as ClientConfig).secret !== "string"
    ) {
      throw new Error(`CLIENTS_JSON entry ${index} is missing id or secret`);
    }
    return entry as ClientConfig;
  });

  cachedClients = clients;
  return clients;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyClientCredentials(
  clientId: unknown,
  clientSecret: unknown
): ClientConfig | null {
  if (typeof clientId !== "string" || typeof clientSecret !== "string") {
    return null;
  }

  const clients = loadClients();
  const client = clients.find((c) => c.id === clientId);
  if (!client) return null;

  return constantTimeEqual(client.secret, clientSecret) ? client : null;
}

export function getClientById(clientId: string): ClientConfig | null {
  const clients = loadClients();
  return clients.find((c) => c.id === clientId) ?? null;
}
