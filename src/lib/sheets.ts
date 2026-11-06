import { google } from "googleapis";
import { getConfig } from "./config";

function parseServiceAccount(raw: string): Record<string, unknown> {
  const json = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw.trim(), "base64").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Добавляет строку в лист Google Sheets.
 * Возвращает false, если интеграция не настроена или запрос не удался.
 * Ошибка не должна ломать бота — отметка уже сохранена в PostgreSQL.
 */
export async function appendRow(sheetName: string, row: (string | number)[]): Promise<boolean> {
  const { googleSheetId, googleServiceAccountJson } = getConfig();
  if (!googleSheetId || !googleServiceAccountJson) return false;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: parseServiceAccount(googleServiceAccountJson) as never,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: googleSheetId,
      range: `'${sheetName}'!A:Z`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    return true;
  } catch (error) {
    console.error(`[sheets] append to "${sheetName}" failed:`, error);
    return false;
  }
}
