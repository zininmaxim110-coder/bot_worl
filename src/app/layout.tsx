import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Учёт присутствия — Telegram-бот",
  description: "Отметка «Я на работе»: проверка лица, жеста и геолокации.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
