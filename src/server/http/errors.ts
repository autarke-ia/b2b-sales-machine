/** Erros tipados do servidor — falha de forma visível, nunca exceção engolida (doc 03 §3). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly fieldErrors?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) => new HttpError(400, code, message, details);
export const unauthenticated = (code = "UNAUTHENTICATED", message = "Autenticação necessária.") => new HttpError(401, code, message);
export const forbidden = (code: string, message: string) => new HttpError(403, code, message);
export const notFound = (message = "Registro não encontrado.") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) => new HttpError(409, code, message, details);
export const validation = (message: string, fieldErrors?: Array<{ field: string; message: string }>, details?: Record<string, unknown>) =>
  new HttpError(422, "VALIDATION_ERROR", message, details, fieldErrors);
export const tooMany = (retryAfterSeconds: number) =>
  new HttpError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde antes de repetir.", { retry_after_seconds: retryAfterSeconds });
