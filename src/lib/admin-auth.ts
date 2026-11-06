import { timingSafeEqual } from "node:crypto";
import { getConfig } from "./config";

/**
 * Проверка Bearer-токена администратора (ADMIN_TOKEN).
 * Возвращает Response с ошибкой, если доступ запрещён, иначе null.
 */
export function requireAdmin(req: Request): Response | null {
  const expected = getConfig().adminToken;
  if (!expected) {
    return Response.json({ error: "ADMIN_TOKEN is not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
