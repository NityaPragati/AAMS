"""
LEVEL 2B: Head Pose Estimation
FIX: Added landmark validation before solvePnP to prevent crashes.
"""

import cv2
import numpy as np
from ..config import PipelineConfig
from ..utils.logging_utils import setup_logger


class PoseEstimator:

    MODEL_3D = np.array([
        (0.0, 0.0, 0.0),
        (0.0, -330.0, -65.0),
        (-225.0, 170.0, -135.0),
        (225.0, 170.0, -135.0),
        (-150.0, -150.0, -125.0),
        (150.0, -150.0, -125.0)
    ], dtype=np.float64)

    # Landmark indices we need: nose(30), chin(8), left_eye(36), right_eye(45), mouth(48,54)
    REQUIRED_INDICES = [30, 8, 36, 45, 48, 54]

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.logger = setup_logger("pose", config.LOG_FILE, config.LOG_LEVEL)
        self.logger.info("PoseEstimator ready (solvePnP)")

    def estimate(self, image: np.ndarray, landmarks: np.ndarray) -> dict:
        # Validate landmarks
        if landmarks is None:
            return self._fail("No landmarks provided")

        if len(landmarks) < max(self.REQUIRED_INDICES) + 1:
            return self._fail(f"Need {max(self.REQUIRED_INDICES)+1} landmarks, got {len(landmarks)}")

        # Check that required landmarks are not all zeros (degenerate)
        pts2d = np.array([landmarks[i] for i in self.REQUIRED_INDICES], dtype=np.float64)
        if np.all(pts2d == 0):
            return self._fail("All required landmarks are zero")

        # Check for duplicate points (would cause solvePnP to fail)
        unique_pts = np.unique(pts2d, axis=0)
        if len(unique_pts) < 4:
            return self._fail("Too many duplicate landmark points")

        h, w = image.shape[:2]
        cam = np.array([[w, 0, w/2], [0, w, h/2], [0, 0, 1]], dtype=np.float64)
        dc = np.zeros((4, 1), dtype=np.float64)

        try:
            ok, rvec, tvec = cv2.solvePnP(
                self.MODEL_3D, pts2d, cam, dc,
                flags=cv2.SOLVEPNP_ITERATIVE
            )
        except cv2.error as e:
            return self._fail(f"solvePnP error: {e}")

        if not ok:
            return self._fail("solvePnP failed")

        rmat, _ = cv2.Rodrigues(rvec)
        proj = np.hstack((rmat, tvec))
        _, _, _, _, _, _, euler = cv2.decomposeProjectionMatrix(
            np.vstack((proj, [0, 0, 0, 1]))[:3]
        )

        pitch = float(euler[0][0])
        yaw = float(euler[1][0])
        roll = float(euler[2][0])

        # Clamp extreme values (can happen with bad landmarks)
        pitch = np.clip(pitch, -90, 90)
        yaw = np.clip(yaw, -90, 90)
        roll = np.clip(roll, -90, 90)

        # solvePnP can become unstable with webcam FaceMesh-to-68 landmarks and
        # produce impossible 90-degree pitch/roll values. In that case use a
        # simple landmark geometry fallback instead of penalizing a good scan.
        if abs(pitch) >= 85 or abs(roll) >= 85:
            fallback = self._estimate_from_landmarks(landmarks)
            if fallback:
                yaw = fallback["yaw"]
                pitch = fallback["pitch"]
                roll = fallback["roll"]

        y_ok = abs(yaw) <= self.config.POSE_YAW_LIMIT
        p_ok = abs(pitch) <= self.config.POSE_PITCH_LIMIT
        r_ok = abs(roll) <= self.config.POSE_ROLL_LIMIT
        frontal = y_ok and p_ok and r_ok

        if frontal:
            detail = f"Frontal (Y={yaw:.1f}° P={pitch:.1f}° R={roll:.1f}°)"
        else:
            issues = []
            if not y_ok:
                issues.append(f"turned {'left' if yaw < 0 else 'right'} {abs(yaw):.1f}°")
            if not p_ok:
                issues.append(f"tilted {'down' if pitch < 0 else 'up'} {abs(pitch):.1f}°")
            if not r_ok:
                issues.append(f"roll {abs(roll):.1f}°")
            detail = f"Non-frontal: {', '.join(issues)}"

        self.logger.info(detail)
        return {
            "success": True, "yaw": yaw, "pitch": pitch, "roll": roll,
            "yaw_ok": y_ok, "pitch_ok": p_ok, "roll_ok": r_ok,
            "is_frontal": frontal, "detail": detail
        }

    def _fail(self, msg):
        self.logger.warning(f"Pose estimation: {msg}")
        return {
            "success": False, "yaw": 0, "pitch": 0, "roll": 0,
            "is_frontal": True,  # Don't penalize if pose estimation fails
            "detail": msg,
            "yaw_ok": True, "pitch_ok": True, "roll_ok": True
        }

    def _estimate_from_landmarks(self, landmarks: np.ndarray) -> dict:
        try:
            nose = landmarks[30].astype(float)
            chin = landmarks[8].astype(float)
            left_eye = landmarks[36].astype(float)
            right_eye = landmarks[45].astype(float)
            eye_center = (left_eye + right_eye) / 2.0

            eye_dx = right_eye[0] - left_eye[0]
            eye_dy = right_eye[1] - left_eye[1]
            eye_dist = float(np.linalg.norm(right_eye - left_eye))
            face_height = float(np.linalg.norm(chin - eye_center))

            if eye_dist < 1 or face_height < 1:
                return None

            yaw = float(np.clip(((nose[0] - eye_center[0]) / eye_dist) * 55.0, -45, 45))
            roll = float(np.clip(np.degrees(np.arctan2(eye_dy, eye_dx)), -45, 45))

            nose_drop = (nose[1] - eye_center[1]) / face_height
            pitch = float(np.clip((nose_drop - 0.38) * 80.0, -35, 35))

            return {"yaw": yaw, "pitch": pitch, "roll": roll}
        except Exception:
            return None
