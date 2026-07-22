export type ErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "TOKEN_USED"
  | "INTERNAL_ERROR";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }

  console.error("Cloudflare Worker request failed");
  return json(
    { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
    { status: 500 }
  );
}

export function notFound(): never {
  throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
}

export async function readJsonObject(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(400, "INVALID_REQUEST", "Payload excede o limite permitido");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(400, "INVALID_REQUEST", "Payload excede o limite permitido");
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "INVALID_REQUEST", "JSON inválido");
  }
}
