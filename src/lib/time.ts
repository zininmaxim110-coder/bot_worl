import { getConfig } from "./config";

export type ServerDateTime = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM:SS */
  time: string;
};

/**
 * Серверные дата и время в часовом поясе приложения.
 * Клиентское время никогда не используется.
 */
export function serverDateTime(now: Date = new Date()): ServerDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getConfig().timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
  };
}

export function formatTimeHuman(now: Date = new Date()): string {
  const { date, time } = serverDateTime(now);
  return `${date} ${time}`;
}
