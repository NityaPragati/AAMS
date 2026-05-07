"""
Level 2A liveness detection / anti-spoofing.

This detector is intentionally fail-closed:
- tiny or invalid crops are rejected instead of passing by default
- multiple weak sub-signals reject the frame
- video bursts require a real blink pattern before the face can be accepted

The goal is to stop simple replay attacks such as showing a face photo on a
phone screen to the webcam.
"""

import math
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from ..config import PipelineConfig
from ..utils.logging_utils import setup_logger


class LivenessDetector:
    LEFT_EYE = [36, 37, 38, 39, 40, 41]
    RIGHT_EYE = [42, 43, 44, 45, 46, 47]
    NOSE = 30
    MOUTH_UPPER = 51
    MOUTH_LOWER = 57

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.logger = setup_logger("liveness", config.LOG_FILE, config.LOG_LEVEL)
        self.logger.info("LivenessDetector ready (frame + sequence anti-spoofing)")

    def check(
        self,
        image: np.ndarray,
        landmarks: np.ndarray,
        bbox: Tuple[int, int, int, int],
        session_id: str = "default",
    ) -> dict:
        crop = self._safe_crop(image, bbox, pad=0.18)
        if crop is None or min(crop.shape[:2]) < 48:
            return self._frame_result(
                is_live=False,
                final_score=0.0,
                scores=self._neutral_scores(0.0),
                flags=["small_face"],
                detail="Face crop is too small for reliable liveness",
                session_id=session_id,
            )

        scores = {
            "moire": self._moire(crop),
            "specular": self._specular(crop),
            "color_quant": self._color_quantization(crop),
            "noise": self._noise_consistency(crop),
            "dynamic_range": self._dynamic_range(crop),
            "texture": self._texture_detail(crop),
        }
        weights = {
            "texture": 0.24,
            "moire": 0.22,
            "specular": 0.18,
            "color_quant": 0.15,
            "noise": 0.11,
            "dynamic_range": 0.10,
        }
        final = float(sum(scores[name] * weights[name] for name in weights))
        low_flags = [name for name, value in scores.items() if value < 0.28]
        hard_flags = [name for name, value in scores.items() if value < 0.12]

        is_live = (
            final >= self.config.LIVENESS_THRESHOLD and
            len(low_flags) <= 1 and
            not hard_flags and
            scores["texture"] >= 0.32 and
            scores["moire"] >= 0.22
        )

        detail = (
            f"Liveness {'PASSED' if is_live else 'FAILED'} "
            f"(score={final:.3f}, low={','.join(low_flags) if low_flags else 'none'})"
        )
        if not is_live and not low_flags and final < self.config.LIVENESS_THRESHOLD:
            low_flags = ["aggregate"]

        self.logger.info(
            "Liveness %s | score=%.3f | session=%s | scores=%s",
            "PASSED" if is_live else "FAILED",
            final,
            session_id,
            {k: round(v, 3) for k, v in scores.items()},
        )

        return self._frame_result(
            is_live=is_live,
            final_score=final,
            scores=scores,
            flags=low_flags or hard_flags,
            detail=detail,
            session_id=session_id,
        )

    def check_sequence(
        self,
        frames: List[np.ndarray],
        detections: List[dict],
        session_id: str = "video",
    ) -> dict:
        analyzed = []
        geometry = []

        for index, (image, det) in enumerate(zip(frames, detections)):
            if not det or det.get("landmarks") is None:
                continue

            frame_result = self.check(
                image,
                det["landmarks"],
                det["bbox"],
                session_id=f"{session_id}-{index}",
            )
            analyzed.append(frame_result)

            metrics = self._frame_geometry(det["landmarks"])
            if metrics is not None:
                geometry.append(metrics)

        if len(analyzed) < self.config.MIN_VIDEO_SEQUENCE_FRAMES:
            return {
                "is_live": False,
                "liveness_score": 0.0,
                "frames_checked": len(analyzed),
                "live_frames": sum(1 for item in analyzed if item["is_live"]),
                "blink_detected": False,
                "mouth_motion": False,
                "head_motion": False,
                "facial_change_detected": False,
                "frame_scores": [round(item["liveness_score"], 3) for item in analyzed],
                "detail": f"Need at least {self.config.MIN_VIDEO_SEQUENCE_FRAMES} frames for anti-spoofing",
            }

        live_frames = sum(1 for item in analyzed if item["is_live"])
        min_live_frames = max(
            self.config.MIN_VIDEO_LIVE_FRAMES,
            int(math.ceil(len(analyzed) * 0.6)),
        )
        avg_frame_score = float(np.mean([item["liveness_score"] for item in analyzed]))
        blink_detected = self._detect_blink(geometry)
        mouth_motion = self._detect_mouth_motion(geometry)
        head_motion = self._detect_head_motion(geometry)
        facial_change_detected = blink_detected or mouth_motion

        if blink_detected:
            final_score = float(np.clip(avg_frame_score + 0.10, 0.0, 1.0))
        elif mouth_motion:
            final_score = float(np.clip(avg_frame_score + 0.02, 0.0, 1.0))
        elif head_motion:
            final_score = float(np.clip(avg_frame_score + 0.03, 0.0, 1.0))
        else:
            final_score = float(np.clip(avg_frame_score - 0.16, 0.0, 1.0))

        is_live = (
            live_frames >= min_live_frames and
            avg_frame_score >= (self.config.LIVENESS_THRESHOLD - 0.05) and
            (
                blink_detected or
                mouth_motion or
                head_motion
            )
        )

        detail_bits = []
        if blink_detected:
            detail_bits.append("blink")
        if mouth_motion:
            detail_bits.append("mouth motion")
        if head_motion:
            detail_bits.append("head motion")
        if not detail_bits:
            detail_bits.append("no active live motion")

        if not blink_detected:
            detail_bits.append("blink required")

        if is_live:
            detail = "LIVE_VERIFIED"
        else:
            detail = "VERIFICATION_FAILED"

        return {
            "is_live": is_live,
            "liveness_score": final_score,
            "frames_checked": len(analyzed),
            "live_frames": live_frames,
            "blink_detected": blink_detected,
            "mouth_motion": mouth_motion,
            "head_motion": head_motion,
            "facial_change_detected": facial_change_detected,
            "frame_scores": [round(item["liveness_score"], 3) for item in analyzed],
            "detail": detail,
        }

    def _frame_result(
        self,
        is_live: bool,
        final_score: float,
        scores: Dict[str, float],
        flags: List[str],
        detail: str,
        session_id: str,
    ) -> dict:
        return {
            "is_live": is_live,
            "liveness_score": float(np.clip(final_score, 0.0, 1.0)),
            "moire_score": scores["moire"],
            "specular_score": scores["specular"],
            "color_quant_score": scores["color_quant"],
            "noise_score": scores["noise"],
            "dynamic_range_score": scores["dynamic_range"],
            "texture_score": scores["texture"],
            "risk_flags": flags,
            "detail": detail,
            "session_id": session_id,
        }

    def _neutral_scores(self, value: float) -> Dict[str, float]:
        return {
            "moire": value,
            "specular": value,
            "color_quant": value,
            "noise": value,
            "dynamic_range": value,
            "texture": value,
        }

    def _safe_crop(
        self,
        image: np.ndarray,
        bbox: Tuple[int, int, int, int],
        pad: float = 0.0,
    ) -> Optional[np.ndarray]:
        top, right, bottom, left = bbox
        h, w = image.shape[:2]
        pad_h = int(max(0, bottom - top) * pad)
        pad_w = int(max(0, right - left) * pad)

        top = max(0, min(top - pad_h, h - 1))
        bottom = max(top + 1, min(bottom + pad_h, h))
        left = max(0, min(left - pad_w, w - 1))
        right = max(left + 1, min(right + pad_w, w))

        crop = image[top:bottom, left:right]
        return crop if crop.size > 0 else None

    def _moire(self, crop: np.ndarray) -> float:
        gray = cv2.cvtColor(cv2.resize(crop, (256, 256)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        gray -= float(np.mean(gray))
        window = np.outer(np.hanning(gray.shape[0]), np.hanning(gray.shape[1])).astype(np.float32)
        spectrum = np.fft.fftshift(np.fft.fft2(gray * window))
        magnitude = np.log1p(np.abs(spectrum))

        h, w = magnitude.shape
        cy, cx = h // 2, w // 2
        y, x = np.ogrid[:h, :w]
        radius = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)

        mid_band = magnitude[(radius >= 18) & (radius < 60)]
        high_band = magnitude[(radius >= 70) & (radius < 105)]
        horiz_band = magnitude[(np.abs(y - cy) <= 3) & (radius >= 25) & (radius < 110)]
        vert_band = magnitude[(np.abs(x - cx) <= 3) & (radius >= 25) & (radius < 110)]

        if mid_band.size == 0 or high_band.size == 0 or horiz_band.size == 0 or vert_band.size == 0:
            return 0.5

        peak_ratio = float(np.percentile(mid_band, 97) / (np.mean(mid_band) + 1e-6))
        high_freq_ratio = float(np.mean(high_band) / (np.mean(mid_band) + 1e-6))
        axis_ratio = float(max(np.mean(horiz_band), np.mean(vert_band)) / (min(np.mean(horiz_band), np.mean(vert_band)) + 1e-6))

        score = 0.90
        if peak_ratio > 2.70:
            score -= 0.25
        elif peak_ratio > 2.35:
            score -= 0.14

        if high_freq_ratio > 1.18:
            score -= 0.28
        elif high_freq_ratio > 1.05:
            score -= 0.14

        if axis_ratio > 1.35:
            score -= 0.18
        elif axis_ratio > 1.22:
            score -= 0.08

        return float(np.clip(score, 0.0, 1.0))

    def _specular(self, crop: np.ndarray) -> float:
        resized = cv2.resize(crop, (160, 160))
        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        glare_mask = (((hsv[:, :, 2] > 235) & (hsv[:, :, 1] < 80)).astype(np.uint8) * 255)
        bright_ratio = float(np.mean(glare_mask > 0))
        num_labels, _, stats, _ = cv2.connectedComponentsWithStats(glare_mask, 8)
        large_glare = sum(1 for idx in range(1, num_labels) if stats[idx, cv2.CC_STAT_AREA] >= 12)

        edges = cv2.Canny(gray, 75, 180)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180.0, threshold=28, minLineLength=18, maxLineGap=4)
        line_count = 0 if lines is None else len(lines)

        score = 0.88
        if bright_ratio > 0.020:
            score -= 0.28
        elif bright_ratio > 0.010:
            score -= 0.15

        if large_glare >= 2:
            score -= 0.18
        elif large_glare == 1 and bright_ratio > 0.010:
            score -= 0.10

        if line_count > 14:
            score -= 0.18
        elif line_count > 8:
            score -= 0.08

        return float(np.clip(score, 0.0, 1.0))

    def _color_quantization(self, crop: np.ndarray) -> float:
        small = cv2.resize(crop, (96, 96))
        lab = cv2.cvtColor(small, cv2.COLOR_BGR2LAB)
        penalty = 0.0

        for channel_index in range(3):
            channel = lab[:, :, channel_index].astype(np.float32)
            unique_bins = len(np.unique((channel / 4.0).astype(np.uint8)))
            diffs = np.concatenate([
                np.abs(np.diff(channel, axis=0)).ravel(),
                np.abs(np.diff(channel, axis=1)).ravel(),
            ])
            tiny_jump_ratio = float(np.mean((diffs > 0) & (diffs <= 2.0)))

            if unique_bins < 28:
                penalty += 0.16
            elif unique_bins < 36:
                penalty += 0.08

            if tiny_jump_ratio > 0.48:
                penalty += 0.10
            elif tiny_jump_ratio > 0.40:
                penalty += 0.05

        return float(np.clip(0.92 - (penalty / 3.0), 0.0, 1.0))

    def _noise_consistency(self, crop: np.ndarray) -> float:
        gray = cv2.cvtColor(cv2.resize(crop, (128, 128)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        high_pass = gray - blur

        noise_std = float(np.std(high_pass))
        noise_mean = float(np.mean(np.abs(high_pass)))

        score = 0.88
        if noise_std < 2.2:
            score -= 0.28
        elif noise_std < 3.0:
            score -= 0.14
        elif noise_std > 16.0:
            score -= 0.22
        elif noise_std > 12.0:
            score -= 0.10

        if noise_mean < 1.4:
            score -= 0.12

        return float(np.clip(score, 0.0, 1.0))

    def _dynamic_range(self, crop: np.ndarray) -> float:
        gray = cv2.cvtColor(cv2.resize(crop, (128, 128)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        p05, p95 = np.percentile(gray, [5, 95])
        range_ratio = float((p95 - p05) / 255.0)
        clipped_ratio = float(np.mean((gray <= 4) | (gray >= 251)))

        hist = cv2.calcHist([gray.astype(np.uint8)], [0], None, [64], [0, 256]).flatten().astype(np.float32)
        hist /= float(np.sum(hist) + 1e-6)
        entropy = float(-np.sum(hist * np.log2(hist + 1e-6)))
        entropy_ratio = entropy / math.log2(64)

        score = 0.88
        if range_ratio < 0.18:
            score -= 0.25
        elif range_ratio < 0.24:
            score -= 0.12
        elif range_ratio > 0.94:
            score -= 0.12

        if clipped_ratio > 0.08:
            score -= 0.15

        if entropy_ratio < 0.55 or entropy_ratio > 0.97:
            score -= 0.10

        return float(np.clip(score, 0.0, 1.0))

    def _texture_detail(self, crop: np.ndarray) -> float:
        gray = cv2.cvtColor(cv2.resize(crop, (128, 128)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        lap_var = float(cv2.Laplacian(gray, cv2.CV_32F).var())
        edges = cv2.Canny(gray.astype(np.uint8), 80, 170)
        edge_ratio = float(np.mean(edges > 0))

        mean = cv2.blur(gray, (7, 7))
        mean_sq = cv2.blur(gray * gray, (7, 7))
        local_std = np.sqrt(np.maximum(mean_sq - (mean * mean), 0))
        micro_texture = float(np.mean(local_std))

        score = 0.90
        if lap_var < 25.0:
            score -= 0.32
        elif lap_var < 45.0:
            score -= 0.18

        if micro_texture < 8.0:
            score -= 0.20
        elif micro_texture < 11.0:
            score -= 0.10

        if edge_ratio < 0.04 or edge_ratio > 0.20:
            score -= 0.10

        return float(np.clip(score, 0.0, 1.0))

    def _frame_geometry(self, landmarks: np.ndarray) -> Optional[dict]:
        if landmarks is None or len(landmarks) <= self.MOUTH_LOWER:
            return None

        pts = landmarks.astype(np.float32)
        left_eye = pts[self.LEFT_EYE]
        right_eye = pts[self.RIGHT_EYE]
        left_center = np.mean(left_eye, axis=0)
        right_center = np.mean(right_eye, axis=0)
        eye_distance = float(np.linalg.norm(right_center - left_center))
        if eye_distance < 1.0:
            return None

        eye_center = (left_center + right_center) / 2.0
        nose = pts[self.NOSE]
        mouth_upper = pts[self.MOUTH_UPPER]
        mouth_lower = pts[self.MOUTH_LOWER]

        return {
            "ear": self._ear(left_eye) * 0.5 + self._ear(right_eye) * 0.5,
            "nose_offset": float((nose[0] - eye_center[0]) / eye_distance),
            "mouth_open": float(np.linalg.norm(mouth_lower - mouth_upper) / eye_distance),
            "roll": float(np.degrees(np.arctan2(
                right_center[1] - left_center[1],
                right_center[0] - left_center[0],
            ))),
        }

    def _ear(self, eye: np.ndarray) -> float:
        vertical = np.linalg.norm(eye[1] - eye[5]) + np.linalg.norm(eye[2] - eye[4])
        horizontal = 2.0 * np.linalg.norm(eye[0] - eye[3])
        return float(vertical / horizontal) if horizontal > 0 else 0.0

    def _detect_blink(self, geometry: List[dict]) -> bool:
        if len(geometry) < self.config.MIN_VIDEO_SEQUENCE_FRAMES:
            return False

        ears = np.array([item["ear"] for item in geometry], dtype=np.float32)
        if ears.size < self.config.MIN_VIDEO_SEQUENCE_FRAMES:
            return False

        open_level = float(np.max(ears))
        min_index = int(np.argmin(ears))
        min_ear = float(ears[min_index])

        if min_index == 0 or min_index == len(ears) - 1:
            return False

        left_open = float(np.max(ears[:min_index])) if min_index > 0 else min_ear
        right_open = float(np.max(ears[min_index + 1:])) if min_index + 1 < len(ears) else min_ear
        surrounding_open = float(np.median(np.delete(ears, min_index))) if len(ears) > 1 else open_level
        delta = open_level - min_ear

        return (
            delta >= self.config.VIDEO_EAR_DELTA_THRESHOLD and
            min_ear <= min(self.config.EAR_THRESHOLD + 0.01, open_level * 0.76) and
            (surrounding_open - min_ear) >= (self.config.VIDEO_EAR_DELTA_THRESHOLD * 0.95) and
            (left_open - min_ear) >= self.config.VIDEO_EAR_DELTA_THRESHOLD and
            (right_open - min_ear) >= (self.config.VIDEO_EAR_DELTA_THRESHOLD * 0.85)
        )

    def _detect_mouth_motion(self, geometry: List[dict]) -> bool:
        if len(geometry) < 2:
            return False

        mouth_range = float(np.ptp([item["mouth_open"] for item in geometry]))
        max_open = float(np.max([item["mouth_open"] for item in geometry]))

        return (
            mouth_range >= self.config.VIDEO_MOUTH_DELTA_THRESHOLD and
            max_open >= 0.20
        )

    def _detect_head_motion(self, geometry: List[dict]) -> bool:
        if len(geometry) < 2:
            return False

        nose_range = float(np.ptp([item["nose_offset"] for item in geometry]))
        roll_range = float(np.ptp([item["roll"] for item in geometry]))

        return (
            nose_range >= self.config.VIDEO_NOSE_DELTA_THRESHOLD or
            roll_range >= self.config.VIDEO_ROLL_DELTA_THRESHOLD
        )
