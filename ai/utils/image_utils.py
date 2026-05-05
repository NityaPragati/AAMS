import cv2
import numpy as np
import base64
from typing import Tuple


class ImageProcessor:

    @staticmethod
    def load_from_base64(b64: str) -> np.ndarray:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        data = base64.b64decode(b64)
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode base64 image")
        return img

    @staticmethod
    def load_from_bytes(raw: bytes) -> np.ndarray:
        img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image bytes")
        return img

    @staticmethod
    def load_from_path(path: str) -> np.ndarray:
        img = cv2.imread(path)
        if img is None:
            raise FileNotFoundError(f"Cannot load: {path}")
        return img

    @staticmethod
    def enhance(image: np.ndarray) -> np.ndarray:
        """CLAHE for varied lighting — improves recognition accuracy."""
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
        return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    @staticmethod
    def crop_face(image: np.ndarray, bbox: Tuple[int, int, int, int],
                  pad: float = 0.25) -> np.ndarray:
        top, right, bottom, left = bbox
        h, w = image.shape[:2]
        ph, pw = int((bottom - top) * pad), int((right - left) * pad)
        t = max(0, top - ph)
        b = min(h, bottom + ph)
        l = max(0, left - pw)
        r = min(w, right + pw)
        crop = image[t:b, l:r]
        if crop.size == 0:
            return image  # Fallback to full image
        return crop

    @staticmethod
    def resize_face(image: np.ndarray, target_size: Tuple[int, int] = (160, 160)) -> np.ndarray:
        """
        Resize face crop to exact size expected by the embedding model.
        FaceNet expects 160x160. This is CRITICAL for accurate embeddings.
        """
        if image.size == 0:
            raise ValueError("Cannot resize empty image")
        return cv2.resize(image, target_size, interpolation=cv2.INTER_AREA)

    @staticmethod
    def to_base64(image: np.ndarray) -> str:
        _, buf = cv2.imencode(".jpg", image)
        return base64.b64encode(buf).decode("utf-8")

    @staticmethod
    def assess_quality(image: np.ndarray) -> dict:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        brightness = float(np.mean(gray))
        contrast = float(np.std(gray))
        blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        b_ok = 40 < brightness < 220
        c_ok = contrast > 30
        s_ok = blur > 50
        return {
            "brightness": brightness, "contrast": contrast, "blur_score": blur,
            "brightness_ok": b_ok, "contrast_ok": c_ok, "sharpness_ok": s_ok,
            "overall_quality": (0.3 if b_ok else 0) + (0.3 if c_ok else 0) + (0.4 if s_ok else 0)
        }