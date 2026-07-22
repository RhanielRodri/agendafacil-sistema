export type ErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
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
