import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Сотрудники. Для каждого username хранятся ФИО, эталонные кодировки лица
 * (128-мерные векторы face_recognition, 2–3 шт.) и флаг активности.
 */
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  fullName: text("full_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  faceEncodings: jsonb("face_encodings").$type<number[][]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Сессия отметки. Привязана к telegram user_id, поэтому параллельные
 * сессии разных сотрудников не пересекаются.
 */
export const botSessions = pgTable("bot_sessions", {
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  username: varchar("username", { length: 64 }).notNull(),
  state: varchar("state", { length: 32 }).notNull(), // waiting_for_photo | waiting_for_location
  gestureNumber: integer("gesture_number").notNull(),
  gestureLabel: text("gesture_label").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Серверное время получения фото (фиксируется ботом, EXIF не используется)
  photoReceivedAt: timestamp("photo_received_at", { withTimezone: true }),
});

/**
 * Подтверждённые отметки (зеркалируются в лист Google Sheets «Учёт»).
 */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    fullName: text("full_name").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    workTime: text("work_time").notNull(), // серверное время, HH:MM:SS
    distanceM: integer("distance_m").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("Подтверждено"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attendance_username_idx").on(t.username)],
);

/**
 * Аудит провалов проверок (зеркалируется в лист Google Sheets «Аудит»).
 */
export const failedChecks = pgTable("failed_checks", {
  id: serial("id").primaryKey(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }),
  username: varchar("username", { length: 64 }),
  step: varchar("step", { length: 32 }).notNull(), // start | photo | location | session
  reason: text("reason").notNull(),
  distanceM: integer("distance_m"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
