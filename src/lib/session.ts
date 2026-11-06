import { db } from "@/db";
import { botSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getConfig } from "./config";

export type SessionState = "waiting_for_photo" | "waiting_for_location";
export type BotSession = typeof botSessions.$inferSelect;

export async function getSession(telegramUserId: number): Promise<BotSession | null> {
  const [row] = await db
    .select()
    .from(botSessions)
    .where(eq(botSessions.telegramUserId, telegramUserId))
    .limit(1);
  return row ?? null;
}

export function isSessionExpired(session: BotSession, now: Date = new Date()): boolean {
  return session.expiresAt.getTime() <= now.getTime();
}

/**
 * Создаёт (или перезаписывает) сессию отметки для конкретного user_id.
 * Срок жизни фиксируется в момент нажатия «Я на работе».
 */
export async function startSession(input: {
  telegramUserId: number;
  chatId: number;
  username: string;
  gestureNumber: number;
  gestureLabel: string;
}): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + getConfig().sessionTtlSeconds * 1000);
  const values = {
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    username: input.username,
    state: "waiting_for_photo" as SessionState,
    gestureNumber: input.gestureNumber,
    gestureLabel: input.gestureLabel,
    startedAt: now,
    expiresAt,
    photoReceivedAt: null,
  };

  await db
    .insert(botSessions)
    .values(values)
    .onConflictDoUpdate({
      target: botSessions.telegramUserId,
      set: {
        chatId: values.chatId,
        username: values.username,
        state: values.state,
        gestureNumber: values.gestureNumber,
        gestureLabel: values.gestureLabel,
        startedAt: values.startedAt,
        expiresAt: values.expiresAt,
        photoReceivedAt: null,
      },
    });
}

/** Переводит сессию в новое состояние (срок жизни не продлевается). */
export async function moveSession(
  telegramUserId: number,
  state: SessionState,
  photoReceivedAt?: Date,
): Promise<void> {
  await db
    .update(botSessions)
    .set({ state, ...(photoReceivedAt ? { photoReceivedAt } : {}) })
    .where(eq(botSessions.telegramUserId, telegramUserId));
}

export async function clearSession(telegramUserId: number): Promise<void> {
  await db.delete(botSessions).where(eq(botSessions.telegramUserId, telegramUserId));
}
