"""
LEVEL 1: Face Detection + Landmark Extraction (MediaPipe)
FIX: FaceMesh and FaceDetection are now used independently.
     We run FaceMesh which gives BOTH landmarks AND bounding boxes,
     avoiding the alignment mismatch between two separate models.
"""

import mediapipe as mp
import cv2
import numpy as np
from typing import List, Optional
from ..config import PipelineConfig
from ..utils.logging_utils import setup_logger


class FaceDetector:

    # MediaPipe 468 → standard 68-point landmark mapping
    _MP468_TO_68 = {
        0: 10, 1: 338, 2: 297, 3: 332, 4: 284, 5: 251, 6: 389, 7: 356,
        8: 454, 9: 323, 10: 361, 11: 288, 12: 397, 13: 365, 14: 379,
        15: 378, 16: 400,
        17: 70, 18: 63, 19: 105, 20: 66, 21: 107,
        22: 336, 23: 296, 24: 334, 25: 293, 26: 300,
        27: 168, 28: 6, 29: 197, 30: 195,
        31: 48, 32: 115, 33: 220, 34: 45, 35: 4,
        36: 33, 37: 160, 38: 158, 39: 133, 40: 153, 41: 144,
        42: 362, 43: 385, 44: 387, 45: 263, 46: 373, 47: 380,
        48: 61, 49: 39, 50: 37, 51: 0, 52: 267, 53: 269,
        54: 291, 55: 405, 56: 314, 57: 17, 58: 84, 59: 181,
        60: 78, 61: 191, 62: 80, 63: 81, 64: 82,
        65: 13, 66: 312, 67: 311,
    }

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.logger = setup_logger("detector", config.LOG_FILE, config.LOG_LEVEL)

        # Use FaceMesh as PRIMARY detector
        # It gives BOTH landmarks AND we can derive bounding box from landmarks
        # This avoids the alignment bug between FaceDetection + FaceMesh
        self._mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=config.MAX_FACES_PER_FRAME,
            refine_landmarks=True,
            min_detection_confidence=config.FACE_DETECTION_CONFIDENCE
        )

        # Backup: FaceDetection for confidence scores
        self._det = mp.solutions.face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=config.FACE_DETECTION_CONFIDENCE
        )

        self.logger.info("FaceDetector ready (MediaPipe FaceMesh primary)")

    def detect_faces(self, image: np.ndarray) -> List[dict]:
        """
        Detect faces using FaceMesh as primary.
        Bounding box is derived FROM landmarks → guaranteed alignment.
        """
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        h, w = image.shape[:2]

        # Primary: FaceMesh for landmarks
        mesh_res = self._mesh.process(rgb)

        if not mesh_res.multi_face_landmarks:
            self.logger.info("No faces detected")
            return []

        # Secondary: FaceDetection for confidence scores
        det_res = self._det.process(rgb)
        det_scores = []
        if det_res.detections:
            det_scores = [float(d.score[0]) for d in det_res.detections]

        results = []
        for idx, face_lm in enumerate(mesh_res.multi_face_landmarks):
            # Convert all 468 landmarks to pixel coordinates
            all_pts = np.array([
                [int(lm.x * w), int(lm.y * h)]
                for lm in face_lm.landmark
            ])

            # Derive bounding box FROM landmarks (guaranteed aligned)
            x_min = max(0, int(np.min(all_pts[:, 0])))
            x_max = min(w, int(np.max(all_pts[:, 0])))
            y_min = max(0, int(np.min(all_pts[:, 1])))
            y_max = min(h, int(np.max(all_pts[:, 1])))

            # Add small padding
            pad_x = int((x_max - x_min) * 0.05)
            pad_y = int((y_max - y_min) * 0.05)
            y_min = max(0, y_min - pad_y)
            y_max = min(h, y_max + pad_y)
            x_min = max(0, x_min - pad_x)
            x_max = min(w, x_max + pad_x)

            # Convert to 68-point format
            lm68 = self._to_68(face_lm, w, h)

            # Get confidence from FaceDetection if available
            conf = det_scores[idx] if idx < len(det_scores) else 0.90

            face_area = (y_max - y_min) * (x_max - x_min)

            if face_area < 400:  # Skip tiny detections
                continue

            results.append({
                "bbox": (y_min, x_max, y_max, x_min),  # (top, right, bottom, left)
                "landmarks": lm68,
                "detection_confidence": conf,
                "face_area": face_area,
                "all_landmarks_468": all_pts  # Keep full landmarks for advanced use
            })

        results.sort(key=lambda x: x["face_area"], reverse=True)
        self.logger.info(f"Detected {len(results)} face(s)")
        return results

    def detect_single_face(self, image: np.ndarray) -> Optional[dict]:
        faces = self.detect_faces(image)
        return faces[0] if faces else None

    def _to_68(self, mp_face, w: int, h: int) -> np.ndarray:
        """Convert MediaPipe 468 → 68-point landmarks."""
        pts = np.zeros((68, 2), dtype=np.int32)
        for i68, imp in self._MP468_TO_68.items():
            lm = mp_face.landmark[imp]
            pts[i68] = [int(lm.x * w), int(lm.y * h)]
        return pts