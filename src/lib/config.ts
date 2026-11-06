function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Глобальная конфигурация. Значения читаются лениво, чтобы сборка
 * не падала при отсутствии секретов.
 */
export function getConfig() {
  return {
    // Координаты офиса и радиус допуска (по умолчанию 100 м)
    officeLat: Number(env("OFFICE_LAT")),
    officeLng: Number(env("OFFICE_LNG")),
    officeRadiusM: Number(env("OFFICE_RADIUS_M") ?? 100),

    // Порог расстояния между кодировками лиц (face_recognition)
    faceDistanceThreshold: 0.6,

    // Сессия отметки живёт ограниченное время с момента нажатия «Я на работе»
    sessionTtlSeconds: Number(env("SESSION_TTL_SECONDS") ?? 300),

    // Проверка жеста (случайный номер пальцев), защита от фото из галереи
    requireGesture: env("REQUIRE_GESTURE") !== "false",

    // Внешний сервис распознавания лиц (Python, face_recognition + mediapipe)
    faceServiceUrl: env("FACE_SERVICE_URL"),

    telegramBotToken: env("TELEGRAM_BOT_TOKEN"),
    telegramWebhookSecret: env("TELEGRAM_WEBHOOK_SECRET"),

    adminToken: env("ADMIN_TOKEN"),

    // Часовой пояс для серверной даты/времени отметки
    timezone: env("APP_TIMEZONE") ?? "Europe/Moscow",

    googleSheetId: env("GOOGLE_SHEETS_ID"),
    // JSON сервисного аккаунта или его base64-представление
    googleServiceAccountJson: env("GOOGLE_SERVICE_ACCOUNT_JSON"),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
