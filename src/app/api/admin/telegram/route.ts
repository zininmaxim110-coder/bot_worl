import { requireAdmin } from "@/lib/admin-auth";
import { getConfig } from "@/lib/config";
import { setWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Регистрирует webhook бота в Telegram с секретным токеном.
 * Базовый URL берётся из запроса (или из поля baseUrl в теле).
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { telegramWebhookSecret } = getConfig();
  if (!telegramWebhookSecret) {
    return Response.json({ error: "TELEGRAM_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { baseUrl?: string };
  const baseUrl = (body.baseUrl?.trim() || new URL(req.url).origin).replace(/\/+$/, "");
  const url = `${baseUrl}/api/telegram/webhook`;

  try {
    const result = await setWebhook(url, telegramWebhookSecret);
    return Response.json({ ok: true, url, result });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
