import { db } from "@/db";
import { failedChecks } from "@/db/schema";
import { appendRow } from "./sheets";
import { serverDateTime } from "./time";

export type FailureStep = "start" | "photo" | "location" | "session";

export type FailureInput = {
  telegramUserId?: number | null;
  username?: string | null;
  step: FailureStep;
  reason: string;
  distanceM?: number | null;
};

/**
 * Логирует провал проверки: таблица failed_checks + лист «Аудит».
 * Ошибки логирования не должны прерывать работу бота.
 */
export async function logFailure(input: FailureInput): Promise<void> {
  try {
    await db.insert(failedChecks).values({
      telegramUserId: input.telegramUserId ?? null,
      username: input.username ?? null,
      step: input.step,
      reason: input.reason,
      distanceM: input.distanceM ?? null,
    });

    const now = serverDateTime();
    await appendRow("Аудит", [
      now.date,
      now.time,
      input.username ?? "",
      input.telegramUserId ?? "",
      input.step,
      input.reason,
      input.distanceM ?? "",
    ]);
  } catch (error) {
    console.error("[audit] failed to log failure:", error);
  }
}
