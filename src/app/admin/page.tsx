"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Employee = {
  id: number;
  username: string;
  fullName: string;
  isActive: boolean;
  referencePhotos: number;
  updatedAt: string;
};

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [files, setFiles] = useState<FileList | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem("adminToken") ?? "");
  }, []);

  const authHeaders = useCallback(
    (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, ...extra }),
    [token],
  );

  const loadEmployees = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/admin/employees", { headers: authHeaders(), cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "Ошибка загрузки" });
      return;
    }
    setEmployees(data.employees);
  }, [token, authHeaders]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  function saveToken(value: string) {
    setToken(value);
    sessionStorage.setItem("adminToken", value);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("username", username);
      form.append("fullName", fullName);
      form.append("isActive", String(isActive));
      if (files) Array.from(files).forEach((f) => form.append("photos", f));

      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка сохранения");

      setMessage({ type: "ok", text: `Сотрудник @${data.username} ${data.created ? "добавлен" : "обновлён"}.` });
      setUsername("");
      setFullName("");
      setFiles(null);
      const input = document.getElementById("photos") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadEmployees();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(emp: Employee) {
    const res = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ username: emp.username, isActive: !emp.isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "Ошибка" });
      return;
    }
    await loadEmployees();
  }

  async function registerWebhook() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/telegram", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка регистрации webhook");
      setMessage({ type: "ok", text: `Webhook зарегистрирован: ${data.url}` });
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900";

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.08em] text-slate-500">Администрирование</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Сотрудники и эталоны лиц</h1>
        </div>
        <a href="/" className="text-sm font-medium text-slate-700 underline">
          На главную
        </a>
      </header>

      <section className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          ADMIN_TOKEN
          <input
            type="password"
            className={inputClass}
            value={token}
            onChange={(e) => saveToken(e.target.value)}
            placeholder="Токен из переменной окружения ADMIN_TOKEN"
          />
        </label>
        <button
          onClick={registerWebhook}
          disabled={busy || !token}
          className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Зарегистрировать webhook Telegram
        </button>
      </section>

      {message && (
        <div
          className={`mb-6 rounded-2xl px-4 py-3 text-sm ${
            message.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Добавить или обновить сотрудника</h2>
        <p className="mt-1 text-sm text-slate-600">
          Укажите username без @. Для нового сотрудника нужно 2–3 фото, на каждом — ровно одно лицо.
          При обновлении без фото эталоны сохранятся.
        </p>
        <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Username (Telegram)
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ivanov"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            ФИО
            <input
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Иванов Иван Иванович"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Эталонные фото (2–3)
            <input
              id="photos"
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className={inputClass}
              onChange={(e) => setFiles(e.target.files)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Активен
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={busy || !token}
              className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Список сотрудников</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">ФИО</th>
                <th className="py-2 pr-4">Эталонов</th>
                <th className="py-2 pr-4">Статус</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono">@{emp.username}</td>
                  <td className="py-2 pr-4">{emp.fullName}</td>
                  <td className="py-2 pr-4">{emp.referencePhotos}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        emp.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {emp.isActive ? "активен" : "отключён"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => toggleActive(emp)}
                      disabled={!token}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      {emp.isActive ? "Отключить" : "Включить"}
                    </button>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    {token ? "Сотрудников пока нет" : "Введите ADMIN_TOKEN, чтобы увидеть список"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
