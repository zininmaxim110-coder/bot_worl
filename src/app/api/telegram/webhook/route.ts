import { handleUpdate } from "@/lib/bot";
import { getConfig } from "@/lib/config";
import type { TgUpdate } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Webhook Telegram. Подлинность запроса проверяется по заголовку
 * X-Telegram-Bot-Api-Secret-Token, который задаётся при setWebhook.
 */
export async function POST(req: Request) {
  const { telegramWebhookSecret } = getConfig();
  const header = req.headers.get("x-telegram-bot-api-secret-token");

  if (!telegramWebhookSecret || header !== telegramWebhookSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    await handleUpdate(update);
  } catch (error) {
    // 200 OK, чтобы Telegram не повторял апдейт бесконечно
    console.error("[webhook] update handling failed:", error);
  }

  return Response.json({ ok: true });
}
