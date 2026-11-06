import { randomInt } from "node:crypto";
import { db } from "@/db";
import { attendanceRecords, employees } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logFailure } from "./audit";
import { getConfig } from "./config";
import { haversineMeters } from "./geo";
import { downloadFile, LOCATION_KEYBOARD, MAIN_KEYBOARD, sendMessage, type TgMessage, type TgUpdate } from "./telegram";
import { appendRow } from "./sheets";
import { serverDateTime } from "./time";
import { verifyPhoto } from "./face";
import {
  clearSession,
  getSession,
  isSessionExpired,
  moveSession,
  startSession,
  type BotSession,
} from "./session";

const START_BUTTON = "Я на работе";
const CANCEL_TEXT = "Отмена";

/** Жесты, которые бот называет случайно (защита от фото из галереи). */
const GESTURES = [
  { number: 1, label: "один палец" },
  { number: 2, label: "два пальца" },
  { number: 3, label: "три пальца" },
  { number: 4, label: "четыре пальца" },
  { number: 5, label: "пять пальцев" },
];

type Ctx = {
  userId: number;
  chatId: number;
  username: string | null;
};

type Employee = typeof employees.$inferSelect;

function pickGesture() {
  return GESTURES[randomInt(GESTURES.length)];
}

function ttlMinutesText(): string {
  const minutes = Math.round(getConfig().sessionTtlSeconds / 60);
  return `${minutes} мин`;
}

async function findEmployee(username: string): Promise<Employee | null> {
  const [row] = await db.select().from(employees).where(eq(employees.username, username)).limit(1);
  return row ?? null;
}

/** Точка входа: обработка одного апдейта Telegram. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.from) return;

  // Работаем только в личных сообщениях: сессия привязана к конкретному пользователю
  if (msg.chat.type !== "private") return;

  const ctx: Ctx = {
    userId: msg.from.id,
    chatId: msg.chat.id,
    username: msg.from.username ? msg.from.username.toLowerCase() : null,
  };

  if (typeof msg.text === "string") {
    const text = msg.text.trim();
    if (text === "/start") return handleWelcome(ctx);
    if (text === "/cancel" || text === CANCEL_TEXT) return handleCancel(ctx);
    if (text === START_BUTTON) return handleStart(ctx);
    return handleTextFallback(ctx);
  }

  if ((msg.photo && msg.photo.length > 0) || isImageDocument(msg)) {
    return handlePhoto(ctx, msg);
  }

  if (msg.location) {
    return handleLocation(ctx, msg);
  }

  await sendMessage(ctx.chatId, "Поддерживаются текст, фото и геопозиция.");
}

function isImageDocument(msg: TgMessage): boolean {
  return Boolean(msg.document?.mime_type?.startsWith("image/"));
}

async function handleWelcome(ctx: Ctx) {
  await sendMessage(
    ctx.chatId,
    "Здравствуйте! Нажмите «Я на работе», чтобы отметиться.\n" +
      "Понадобятся: фото с лицом (на фоне якорного объекта и с жестом) и геопозиция из офиса.",
  );
}

async function handleCancel(ctx: Ctx) {
  await clearSession(ctx.userId);
  await sendMessage(ctx.chatId, "Отметка отменена.");
}

async function handleTextFallback(ctx: Ctx) {
  const session = await getSession(ctx.userId);
  if (!session || isSessionExpired(session)) {
    await sendMessage(ctx.chatId, "Чтобы отметиться, нажмите «Я на работе».");
    return;
  }
  if (session.state === "waiting_for_photo") {
    await sendMessage(ctx.chatId, `Ожидаю фото (жест: ${session.gestureLabel}). Текст не принимается.`);
  } else {
    await sendMessage(ctx.chatId, "Ожидаю геопозицию. Нажмите кнопку «📍 Отправить геолокацию».", LOCATION_KEYBOARD);
  }
}

/** Шаг 1: проверка username и активности, переход в waiting_for_photo. */
async function handleStart(ctx: Ctx) {
  if (!ctx.username) {
    await logFailure({ telegramUserId: ctx.userId, step: "start", reason: "no_telegram_username" });
    await sendMessage(
      ctx.chatId,
      "У вашего аккаунта Telegram не задан username. Задайте его в настройках Telegram и попробуйте снова.",
    );
    return;
  }

  const emp = await findEmployee(ctx.username);
  if (!emp) {
    await logFailure({
      telegramUserId: ctx.userId,
      username: ctx.username,
      step: "start",
      reason: "username_not_found",
    });
    await sendMessage(ctx.chatId, `Username @${ctx.username} не найден в базе сотрудников.`);
    return;
  }

  if (!emp.isActive) {
    await logFailure({ telegramUserId: ctx.userId, username: ctx.username, step: "start", reason: "inactive" });
    await sendMessage(ctx.chatId, "Ваш аккаунт деактивирован. Обратитесь к администратору.");
    return;
  }

  if (emp.faceEncodings.length === 0) {
    await logFailure({
      telegramUserId: ctx.userId,
      username: ctx.username,
      step: "start",
      reason: "no_reference_faces",
    });
    await sendMessage(ctx.chatId, "Для вашего аккаунта не загружены эталонные фото. Обратитесь к администратору.");
    return;
  }

  const gesture = pickGesture();
  await startSession({
    telegramUserId: ctx.userId,
    chatId: ctx.chatId,
    username: ctx.username,
    gestureNumber: gesture.number,
    gestureLabel: gesture.label,
  });

  const gestureText = getConfig().requireGesture
    ? `\nПокажите на фото: ${gesture.label}.`
    : "";
  await sendMessage(
    ctx.chatId,
    `Шаг 1/3. Сфотографируйтесь на фоне якорного объекта офиса.${gestureText}\n\n` +
      `Фото нужно отправить в течение ${ttlMinutesText()}.`,
  );
}

/** Истёкшая сессия сбрасывается, попытка фиксируется в аудит. */
async function expireIfNeeded(ctx: Ctx, session: BotSession): Promise<boolean> {
  if (!isSessionExpired(session)) return false;
  await clearSession(ctx.userId);
  await logFailure({
    telegramUserId: ctx.userId,
    username: session.username,
    step: "session",
    reason: "session_expired",
  });
  await sendMessage(
    ctx.chatId,
    `Время сессии истекло (${ttlMinutesText()}). Начните заново: «Я на работе».`,
  );
  return true;
}

async function rejectAndReset(
  ctx: Ctx,
  session: BotSession,
  step: "photo" | "location",
  reason: string,
  userMessage: string,
  distanceM?: number | null,
) {
  await clearSession(ctx.userId);
  await logFailure({
    telegramUserId: ctx.userId,
    username: session.username,
    step,
    reason,
    distanceM: distanceM ?? null,
  });
  await sendMessage(ctx.chatId, `${userMessage}\n\nЧтобы повторить, начните заново: «Я на работе».`);
}

/** Шаг 2: проверка лица по эталонам этого username и жеста. */
async function handlePhoto(ctx: Ctx, msg: TgMessage) {
  const session = await getSession(ctx.userId);
  if (!session) {
    await sendMessage(ctx.chatId, "Сначала нажмите «Я на работе».");
    return;
  }
  if (await expireIfNeeded(ctx, session)) return;

  if (session.state !== "waiting_for_photo") {
    await sendMessage(ctx.chatId, "Личность уже подтверждена. Отправьте геолокацию.", LOCATION_KEYBOARD);
    return;
  }

  // Серверное время получения сообщения — фиксируется в сессии
  const receivedAt = new Date();

  const emp = await findEmployee(session.username);
  if (!emp || !emp.isActive) {
    await rejectAndReset(ctx, session, "photo", "inactive_or_removed", "Ваш аккаунт сейчас недоступен для отметки.");
    return;
  }

  const fileId = msg.photo?.length
    ? msg.photo[msg.photo.length - 1].file_id // самое большое разрешение
    : msg.document!.file_id;

  let image: Blob;
  try {
    image = await downloadFile(fileId);
  } catch (error) {
    console.error("[bot] photo download failed:", error);
    await sendMessage(ctx.chatId, "Не удалось получить фото из Telegram. Отправьте его ещё раз.");
    return;
  }

  let result;
  try {
    result = await verifyPhoto({
      image,
      references: emp.faceEncodings,
      gestureNumber: session.gestureNumber,
    });
  } catch (error) {
    console.error("[bot] face service error:", error);
    await sendMessage(ctx.chatId, "Сервис проверки лица временно недоступен. Отправьте фото ещё раз.");
    return;
  }

  if (result.facesCount === 0) {
    await rejectAndReset(
      ctx,
      session,
      "photo",
      "face_not_found",
      "Лицо на фото не найдено. Сделайте фото при хорошем освещении, лицо должно быть в кадре.",
    );
    return;
  }

  if (result.facesCount > 1) {
    await rejectAndReset(ctx, session, "photo", "multiple_faces", "На фото должно быть одно лицо.");
    return;
  }

  const bestDistance = result.distances.length ? Math.min(...result.distances) : Number.POSITIVE_INFINITY;
  if (!(bestDistance < getConfig().faceDistanceThreshold)) {
    await rejectAndReset(
      ctx,
      session,
      "photo",
      `face_mismatch (distance=${Number.isFinite(bestDistance) ? bestDistance.toFixed(3) : "n/a"})`,
      "Лицо не совпадает с эталоном для вашего аккаунта.",
    );
    return;
  }

  if (getConfig().requireGesture && result.fingers !== session.gestureNumber) {
    await rejectAndReset(
      ctx,
      session,
      "photo",
      `gesture_mismatch (expected=${session.gestureNumber}, got=${result.fingers ?? "none"})`,
      `Жест не совпал или не распознан. Нужно было показать: ${session.gestureLabel}.`,
    );
    return;
  }

  await moveSession(ctx.userId, "waiting_for_location", receivedAt);
  await sendMessage(
    ctx.chatId,
    "✅ Личность подтверждена.\nШаг 2/3. Отправьте геолокацию: нажмите кнопку ниже или прикрепите геопозицию.",
    LOCATION_KEYBOARD,
  );
}

/** Шаг 3 и 4: геолокация в радиусе офиса → фиксация в БД и Google Sheets. */
async function handleLocation(ctx: Ctx, msg: TgMessage) {
  const session = await getSession(ctx.userId);
  if (!session) {
    await sendMessage(ctx.chatId, "Сначала нажмите «Я на работе».");
    return;
  }
  if (await expireIfNeeded(ctx, session)) return;

  // Геолокация принимается только после успешной проверки лица
  if (session.state !== "waiting_for_location") {
    await sendMessage(
      ctx.chatId,
      "Геолокация пока не принята: сначала подтвердите личность фото (шаг 1).",
    );
    return;
  }

  const emp = await findEmployee(session.username);
  if (!emp || !emp.isActive) {
    await rejectAndReset(ctx, session, "location", "inactive_or_removed", "Ваш аккаунт сейчас недоступен для отметки.");
    return;
  }

  const cfg = getConfig();
  if (!Number.isFinite(cfg.officeLat) || !Number.isFinite(cfg.officeLng)) {
    console.error("[bot] OFFICE_LAT / OFFICE_LNG are not configured");
    await sendMessage(ctx.chatId, "Координаты офиса не настроены. Обратитесь к администратору.");
    return;
  }

  const { latitude, longitude } = msg.location!;
  const distance = haversineMeters(latitude, longitude, cfg.officeLat, cfg.officeLng);
  const distanceM = Math.round(distance);

  if (distance > cfg.officeRadiusM) {
    await rejectAndReset(
      ctx,
      session,
      "location",
      `outside_office (distance=${distanceM}m)`,
      `❌ Вы вне офиса. Расстояние до офиса: ${distanceM} м (допустимо не более ${cfg.officeRadiusM} м).`,
      distanceM,
    );
    return;
  }

  // Фиксация: серверные дата и время
  const now = serverDateTime();
  await db.insert(attendanceRecords).values({
    username: emp.username,
    fullName: emp.fullName,
    workDate: now.date,
    workTime: now.time,
    distanceM,
    status: "Подтверждено",
  });

  await appendRow("Учёт", [emp.username, emp.fullName, now.date, now.time, distanceM, "Подтверждено"]);

  await clearSession(ctx.userId);

  await sendMessage(
    ctx.chatId,
    `✅ Отметка подтверждена.\n${emp.fullName}\nДата: ${now.date}\nВремя: ${now.time}\n` +
      `Расстояние до офиса: ${distanceM} м`,
    MAIN_KEYBOARD,
  );
}
