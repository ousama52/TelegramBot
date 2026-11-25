import { GrammyError } from "grammy";

export class SetupError extends Error {}

export function logError(where: string, error: unknown): void {
  if (error instanceof SetupError) {
    console.error(where, error.message);
  } else if (error instanceof GrammyError) {
    console.error(where, error.method, error.error_code, error.description);
  } else {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const safeCode = typeof code === "string" && /^[A-Z0-9_]{1,30}$/.test(code) ? code : undefined;
    console.error(where, error instanceof Error ? error.name : "Unknown error", safeCode ?? "");
  }
}
