# Face service (face_recognition + mediapipe)

Небольшой Python-сервис, который Next.js-приложение вызывает по HTTP.
`face_recognition` (dlib) не запускается в Node.js, поэтому распознавание вынесено сюда.

## Установка

```bash
cd face-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # нужны cmake и компилятор C++ для dlib
uvicorn app:app --host 127.0.0.1 --port 8001
```

В `.env` основного приложения:

```
FACE_SERVICE_URL=http://127.0.0.1:8001
```

## Эндпоинты

- `POST /encodings` (multipart `image`) → `{ faces, encodings }`
- `POST /verify` (multipart `image`, `references` = JSON-массив эталонных кодировок
  одного сотрудника, `gesture` = загаданное число пальцев) →
  `{ facesCount, distances, fingers }`

Порог совпадения (`distance < 0.6`) применяется в Next.js (`src/lib/bot.ts`).
