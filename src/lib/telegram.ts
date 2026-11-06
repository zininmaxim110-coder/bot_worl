import { getConfig } from "./config";

export type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
};

export type TgPhotoSize = {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TgMessage = {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; mime_type?: string };
  location?: { latitude: number; longitude: number };
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
};

export type ReplyKeyboard = {
  keyboard: Array<Array<{ text: string; request_location?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

export const MAIN_KEYBOARD: ReplyKeyboard = {
  keyboard: [[{ text: "Я на работе" }]],
  resize_keyboard: true,
};

export const LOCATION_KEYBOARD: ReplyKeyboard = {
  keyboard: [[{ text: "📍 Отправить геолокацию", request_location: true }], [{ text: "Отмена" }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

function requireToken(): string {
  const token = getConfig().telegramBotToken;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

export async function telegramApi<T>(method: string, body: unknown = {}): Promise<T> {
  const token = requireToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok || data.result === undefined) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  }
  return data.result;
}

export async function sendMessage(chatId: number, text: string, replyMarkup?: ReplyKeyboard) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup ?? MAIN_KEYBOARD,
  });
}

/** Скачивает файл Telegram (фото) и возвращает его как Blob. */
export async function downloadFile(fileId: string): Promise<Blob> {
  const file = await telegramApi<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram getFile returned no file_path");

  const token = requireToken();
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  return res.blob();
}

export async function setWebhook(url: string, secretToken: string) {
  return telegramApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}
