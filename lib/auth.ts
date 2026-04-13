import { timingSafeEqual } from "crypto";

export interface ClientConfig {
  id: string;
  secret: string;
  allowedOrigins?: string[];
}

let cachedClients: ClientConfig[] | null = null;

function getClients(): ClientConfig[] {
  if (cachedClients) return cachedClients;
  const raw = process.env.CLIENTS_JSON;
  if (!raw) {
    throw new Error("CLIENTS_JSON environment variable is not set");
  }
  cachedClients = JSON.parse(raw) as ClientConfig[];
  return cachedClients;
}

export function getClientById(id: string): ClientConfig | null {
  const clients = getClients();
  return clients.find((c) => c.id === id) ?? null;
}

export function verifyClientCredentials(
  id: string,
  secret: string
): ClientConfig | null {
  const client = getClientById(id);
  if (!client) return null;

  const expected = Buffer.from(client.secret, "utf-8");
  const actual = Buffer.from(secret, "utf-8");

  if (expected.length !== actual.length) return null;

  if (!timingSafeEqual(expected, actual)) return null;

  return client;
}
