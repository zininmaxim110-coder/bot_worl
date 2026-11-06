import { db } from "@/db";
import { attendanceRecords, employees, failedChecks } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { count, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
        }`}
      >
        {ok ? "настроено" : "не задано"}
      </span>
    </li>
  );
}

export default async function HomePage() {
  const cfg = getConfig();

  const [{ total: activeEmployees }] = await db
    .select({ total: count() })
    .from(employees)
    .where(eq(employees.isActive, true));

  const [{ total: todayCount }] = await db
    .select({ total: count() })
    .from(attendanceRecords)
    .where(sql`${attendanceRecords.createdAt} >= date_trunc('day', now())`);

  const recent = await db
    .select()
    .from(attendanceRecords)
    .orderBy(desc(attendanceRecords.createdAt))
    .limit(15);

  const failures = await db
    .select()
    .from(failedChecks)
    .orderBy(desc(failedChecks.createdAt))
    .limit(10);

  const configured = {
    "Telegram bot token": Boolean(cfg.telegramBotToken),
    "Webhook secret": Boolean(cfg.telegramWebhookSecret),
    "Координаты офиса": Number.isFinite(cfg.officeLat) && Number.isFinite(cfg.officeLng),
    "Сервис распознавания лиц": Boolean(cfg.faceServiceUrl),
    "Google Sheets": Boolean(cfg.googleSheetId && cfg.googleServiceAccountJson),
    "Admin token": Boolean(cfg.adminToken),
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.08em] text-slate-500">Учёт присутствия</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Telegram-бот «Я на работе»</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Проверка личности по эталонам (distance &lt; 0.6), жест на фото, геолокация в радиусе{" "}
            {cfg.officeRadiusM} м от офиса. Сессия живёт {Math.round(cfg.sessionTtlSeconds / 60)} мин.
          </p>
        </div>
        <a
          href="/admin"
          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Администрирование
        </a>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Активных сотрудников</p>
          <p className="mt-2 text-4xl font-semibold">{activeEmployees}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Подтверждённых отметок сегодня</p>
          <p className="mt-2 text-4xl font-semibold">{todayCount}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Статус конфигурации</p>
          <ul className="mt-3 space-y-2">
            {Object.entries(configured).map(([label, ok]) => (
              <Badge key={label} label={label} ok={ok} />
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Последние подтверждённые отметки</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">ФИО</th>
                <th className="py-2 pr-4">Дата</th>
                <th className="py-2 pr-4">Время</th>
                <th className="py-2 pr-4">Расстояние</th>
                <th className="py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono">@{r.username}</td>
                  <td className="py-2 pr-4">{r.fullName}</td>
                  <td className="py-2 pr-4">{r.workDate}</td>
                  <td className="py-2 pr-4">{r.workTime}</td>
                  <td className="py-2 pr-4">{r.distanceM} м</td>
                  <td className="py-2 text-emerald-700">{r.status}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    Отметок пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Журнал провалов (аудит)</h2>
        <ul className="mt-4 divide-y text-sm">
          {failures.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-40 text-slate-500">{f.createdAt.toLocaleString("ru-RU", { timeZone: cfg.timezone })}</span>
              <span className="font-mono">{f.username ? `@${f.username}` : `id ${f.telegramUserId ?? "—"}`}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{f.step}</span>
              <span className="text-rose-700">{f.reason}</span>
            </li>
          ))}
          {failures.length === 0 && <li className="py-6 text-center text-slate-500">Провалов нет</li>}
        </ul>
      </section>

      <section className="mt-8 rounded-3xl bg-white p-6 text-sm text-slate-700 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Как подключить</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Заполните переменные из <code>.env.example</code> (токен бота, координаты офиса, ключи Google).</li>
          <li>Запустите face-сервис из папки <code>face-service/</code> и укажите <code>FACE_SERVICE_URL</code>.</li>
          <li>На странице «Администрирование» добавьте сотрудников с 2–3 эталонными фото.</li>
          <li>Нажмите «Зарегистрировать webhook Telegram» — бот начнёт принимать сообщения.</li>
          <li>Лист «Учёт» (username, ФИО, дата, время, расстояние, статус) и «Аудит» создаются в Google Sheets.</li>
        </ol>
      </section>
    </main>
  );
}
