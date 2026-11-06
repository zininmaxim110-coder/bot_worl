import { getConfig } from "./config";

/**
 * Клиент внешнего Python-сервиса распознавания (face-service/app.py).
 * face_recognition (dlib) не работает в Node.js, поэтому вычисления
 * выполняются в отдельном сервисе, а сравнение с порогом — здесь.
 */

export type ExtractResult = {
  faces: number;
  encodings: number[][];
};

export type VerifyResult = {
  /** Количество лиц на фото */
  facesCount: number;
  /** Расстояния от лица на фото до каждой эталонной кодировки этого username */
  distances: number[];
  /** Количество распознанных поднятых пальцев (null — рука не найдена) */
  fingers: number | null;
};

function serviceUrl(): string {
  const url = getConfig().faceServiceUrl;
  if (!url) throw new Error("FACE_SERVICE_URL is not configured");
  return url.replace(/\/+$/, "");
}

/** Извлекает кодировки лиц с фото (используется при регистрации эталонов). */
export async function extractEncodings(image: Blob, filename = "photo.jpg"): Promise<ExtractResult> {
  const form = new FormData();
  form.append("image", image, filename);

  const res = await fetch(`${serviceUrl()}/encodings`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Face service /encodings failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ExtractResult;
}

/**
 * Проверка фото при отметке: лицо сравнивается ТОЛЬКО с эталонами
 * конкретного сотрудника, и распознаётся жест.
 */
export async function verifyPhoto(params: {
  image: Blob;
  references: number[][];
  gestureNumber: number;
}): Promise<VerifyResult> {
  const form = new FormData();
  form.append("image", params.image, "check.jpg");
  form.append("references", JSON.stringify(params.references));
  form.append("gesture", String(params.gestureNumber));

  const res = await fetch(`${serviceUrl()}/verify`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Face service /verify failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as VerifyResult;
}
