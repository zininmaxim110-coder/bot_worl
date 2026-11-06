"""
Face/gesture service for the attendance bot.

- POST /encodings  -> кодировки лиц с фото (для регистрации эталонов)
- POST /verify     -> расстояния от лица на фото до эталонов КОНКРЕТНОГО
                      сотрудника + количество поднятых пальцев (жест)

Запуск:  uvicorn app:app --host 127.0.0.1 --port 8001
"""

import io
import json

import face_recognition
import mediapipe as mp
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

app = FastAPI(title="Attendance face service")

_hands = mp.solutions.hands.Hands(
    static_image_mode=True,
    max_num_hands=1,
    min_detection_confidence=0.5,
)


def load_rgb(data: bytes) -> np.ndarray:
    try:
        return face_recognition.load_image_file(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать изображение: {exc}")


def count_fingers(img: np.ndarray) -> int | None:
    """
    Считает выпрямленные пальцы одной руки.
    Палец считается выпрямленным, если кончик дальше от запястья, чем его
    средний сустав (PIP / IP для большого). Так не зависит от ориентации руки.
    """
    result = _hands.process(img)
    if not result.multi_hand_landmarks:
        return None

    lm = result.multi_hand_landmarks[0].landmark

    def dist(a: int, b: int) -> float:
        return float(np.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y))

    wrist = 0
    count = 0
    # Указательный, средний, безымянный, мизинец: tip vs pip
    for tip, pip in ((8, 6), (12, 10), (16, 14), (20, 18)):
        if dist(tip, wrist) > dist(pip, wrist) * 1.05:
            count += 1
    # Большой палец: tip vs ip
    if dist(4, wrist) > dist(3, wrist) * 1.05:
        count += 1
    return count


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/encodings")
async def encodings(image: UploadFile = File(...)):
    img = load_rgb(await image.read())
    locations = face_recognition.face_locations(img)
    encs = face_recognition.face_encodings(img, locations)
    return {"faces": len(encs), "encodings": [e.tolist() for e in encs]}


@app.post("/verify")
async def verify(
    image: UploadFile = File(...),
    references: str = Form(...),
    gesture: int = Form(...),
):
    img = load_rgb(await image.read())

    try:
        refs = [np.array(r, dtype=np.float64) for r in json.loads(references)]
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="references must be a JSON array of encodings")

    locations = face_recognition.face_locations(img)
    encs = face_recognition.face_encodings(img, locations)

    distances: list[float] = []
    if len(encs) == 1 and refs:
        # Сравнение ТОЛЬКО с переданными эталонами этого username
        distances = face_recognition.face_distance(refs, encs[0]).tolist()

    return {
        "facesCount": len(encs),
        "distances": distances,
        "fingers": count_fingers(img),
        "expectedGesture": gesture,
    }
