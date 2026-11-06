import { db } from "@/db";
import { employees } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { extractEncodings } from "@/lib/face";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const MAX_PHOTOS = 3;
const MIN_PHOTOS = 2;

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const rows = await db
    .select({
      id: employees.id,
      username: employees.username,
      fullName: employees.fullName,
      isActive: employees.isActive,
      faceEncodings: employees.faceEncodings,
      createdAt: employees.createdAt,
      updatedAt: employees.updatedAt,
    })
    .from(employees)
    .orderBy(desc(employees.createdAt));

  return Response.json({
    employees: rows.map(({ faceEncodings, ...rest }) => ({
      ...rest,
      referencePhotos: faceEncodings.length,
    })),
  });
}

/**
 * Создание/обновление сотрудника (multipart/form-data):
 * username, fullName, isActive ("true"|"false"), photos[] (2–3 эталонных фото).
 * Эталоны извлекаются через face-сервис; на каждом фото должно быть ровно одно лицо.
 */
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const form = await req.formData();
  const username = String(form.get("username") ?? "").trim().replace(/^@/, "").toLowerCase();
  const fullName = String(form.get("fullName") ?? "").trim();
  const isActive = form.get("isActive") !== "false";
  const photos = form.getAll("photos").filter((v): v is File => v instanceof File && v.size > 0);

  if (!USERNAME_RE.test(username)) {
    return Response.json({ error: "Некорректный username (латиница, цифры, _; 3–32 символа)" }, { status: 400 });
  }
  if (!fullName) {
    return Response.json({ error: "Укажите ФИО" }, { status: 400 });
  }
  if (photos.length > MAX_PHOTOS) {
    return Response.json({ error: `Не более ${MAX_PHOTOS} фото` }, { status: 400 });
  }

  const [existing] = await db.select().from(employees).where(eq(employees.username, username)).limit(1);

  if (!existing && photos.length < MIN_PHOTOS) {
    return Response.json({ error: `Для нового сотрудника нужно ${MIN_PHOTOS}–${MAX_PHOTOS} эталонных фото` }, { status: 400 });
  }
  if (existing && photos.length > 0 && photos.length < MIN_PHOTOS) {
    return Response.json({ error: `Для замены эталонов нужно ${MIN_PHOTOS}–${MAX_PHOTOS} фото` }, { status: 400 });
  }

  let faceEncodings: number[][] | undefined;
  if (photos.length > 0) {
    faceEncodings = [];
    for (const [index, photo] of photos.entries()) {
      let result;
      try {
        result = await extractEncodings(photo, photo.name || `photo-${index + 1}.jpg`);
      } catch (error) {
        console.error("[admin] face service error:", error);
        return Response.json({ error: "Сервис распознавания лиц недоступен" }, { status: 503 });
      }
      if (result.faces !== 1) {
        return Response.json(
          { error: `Фото ${index + 1}: найдено лиц — ${result.faces}. Нужно ровно одно лицо.` },
          { status: 400 },
        );
      }
      faceEncodings.push(result.encodings[0]);
    }
  }

  const now = new Date();
  await db
    .insert(employees)
    .values({
      username,
      fullName,
      isActive,
      faceEncodings: faceEncodings ?? [],
    })
    .onConflictDoUpdate({
      target: employees.username,
      set: {
        fullName,
        isActive,
        updatedAt: now,
        ...(faceEncodings ? { faceEncodings } : {}),
      },
    });

  return Response.json({ ok: true, username, created: !existing });
}

/** Быстрое переключение активности: { username, isActive } */
export async function PATCH(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { username?: string; isActive?: boolean } | null;
  const username = body?.username?.trim().toLowerCase();
  if (!username || typeof body?.isActive !== "boolean") {
    return Response.json({ error: "Нужны поля username и isActive (boolean)" }, { status: 400 });
  }

  const updated = await db
    .update(employees)
    .set({ isActive: body.isActive, updatedAt: new Date() })
    .where(eq(employees.username, username))
    .returning({ username: employees.username, isActive: employees.isActive });

  if (updated.length === 0) {
    return Response.json({ error: "Сотрудник не найден" }, { status: 404 });
  }
  return Response.json({ ok: true, ...updated[0] });
}
