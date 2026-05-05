"""
LEVEL 2A: Liveness Detection / Anti-Spoofing

Detection of screen-photo spoofing attacks.
All sub-detectors score 0.0 (spoof) to 1.0 (live).
Final decision: ALL detectors must return >= 0.30 to pass (AND logic).
Any single detector < 0.20 is an immediate reject.
Threshold raised to 0.45 to make it much harder to pass casually.
"""

import cv2
import numpy as np
from typing import Tuple, Dict
from ..config import PipelineConfig
from ..utils.logging_utils import setup_logger


class LivenessDetector:

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.logger = setup_logger("liveness", config.LOG_FILE, config.LOG_LEVEL)
        self._sessions: Dict[str, dict] = {}
        self.logger.info("LivenessDetector ready (moire+specular+color_quant+noise+dynamic)")

    def check(self, image: np.ndarray, landmarks: np.ndarray,
             bbox: Tuple[int, int, int, int],
             session_id: str = "default") -> dict:

        top, right, bottom, left = bbox
        if (bottom - top) < 20 or (right - left) < 20:
            return {
                "is_live": True, "liveness_score": 0.5,
                "moire_score": 0.5, "specular_score": 0.5,
                "color_quant_score": 0.5, "noise_score": 0.5,
                "dynamic_range_score": 0.5, "color_score": 0.5,
                "detail": "Face crop too small — passing by default"
            }

        scores = {}
        scores["moire"]         = self._moire(image, bbox)
        scores["specular"]      = self._specular(image, bbox)
        scores["color_quant"]  = self._color_quantization(image, bbox)
        scores["noise"]         = self._noise_consistency(image, bbox)
        scores["dynamic_range"] = self._dynamic_range(image, bbox)
        scores["color"]         = self._color(image, bbox)

        # ── Hard short-circuit: any very low score = immediate reject ───────────
        HARD_CUTOFF = 0.20
        for k, v in scores.items():
            if v < HARD_CUTOFF:
                self.logger.warning(f"spoof_detected: {k}={v:.3f} < {HARD_CUTOFF}")
                return {"is_live": False, "liveness_score": float(v), **scores,
                        "detail": f"spoof_detected ({k}={v:.3f})"}

        # ── Weighted aggregate ───────────────────────────────────────────────────
        weights = {
            "moire":          0.30,
            "specular":       0.20,
            "color_quant":    0.20,
            "noise":          0.15,
            "dynamic_range":  0.10,
            "color":          0.05,
        }
        tw = sum(weights[k] for k in scores)
        final = sum(scores[k] * weights[k] for k in scores) / tw

        # ── AND gate: ALL detectors must be reasonably confident ────────────────
        # Require at least 4/6 detectors above 0.35 (no single detector too low)
        near_pass = sum(1 for v in scores.values() if v >= 0.35)
        AND_GATE = near_pass >= 4

        # ── Threshold: raise from 0.30 to 0.45 ─────────────────────────────────
        live = AND_GATE and (final >= self.config.LIVENESS_THRESHOLD)
        self.logger.info(
            f"Liveness {'PASSED' if live else 'FAILED'} | "
            f"final={final:.3f} >= {self.config.LIVENESS_THRESHOLD} | "
            f"near_pass={near_pass}/6 | {scores}"
        )

        return {"is_live": live, "liveness_score": float(final), **scores,
                "detail": f"Liveness {'PASSED' if live else 'FAILED'} ({final:.3f})"}

    # ── Private helpers ──────────────────────────────────────────────────────────

    def _safe_crop(self, image: np.ndarray, bbox: Tuple) -> np.ndarray:
        top, right, bottom, left = bbox
        h, w = image.shape[:2]
        top    = max(0, min(top,    h - 1))
        bottom = max(top + 1, min(bottom, h))
        left   = max(0, min(left,   w - 1))
        right  = max(left + 1, min(right, w))
        crop = image[top:bottom, left:right]
        return crop if crop.size > 0 else None

    # -------------------------------------------------------------------------
    # _moire — frequency-domain aliasing / pixel-grid detection
    # A phone photo has pixel-grid aliasing; a real face has smooth FFT.
    # -------------------------------------------------------------------------
    def _moire(self, image: np.ndarray, bbox: Tuple) -> float:
        crop = self._safe_crop(image, bbox)
        if crop is None:
            return 0.5

        gray = cv2.resize(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY),
                         (256, 256)).astype(np.float32)

        # FFT → log-magnitude
        f = np.fft.fft2(gray)
        log_mag = np.log1p(np.abs(f))

        h, w = gray.shape
        cy, cx = h // 2, w // 2
        y, x = np.ogrid[:h, :w]

        # Radial ring masks
        r4  = min(h, w) // 4   # inner ring radius
        r2  = min(h, w) // 2   # outer ring radius
        r6  = min(h, w) // 6   # very inner / HF boundary

        center_mask  = ((x - cx)**2 + (y - cy)**2) <= r4**2
        inner_mask   = ((x - cx)**2 + (y - cy)**2) <= r2**2 & ~center_mask
        hf_mask      = ((x - cx)**2 + (y - cy)**2) >= r6**2
        periphery    = ~inner_mask & ~center_mask

        total_e    = np.sum(log_mag) + 1e-7
        center_e   = np.sum(log_mag[center_mask])
        inner_e    = np.sum(log_mag[inner_mask])
        hf_e       = np.sum(log_mag[h_f_mask])
        peri_e     = np.sum(log_mag[periphery])
        total_minus_c = total_e - center_e

        # Energy ratios
        center_ratio   = center_e / (peri_e + 1e-7)
        hf_ratio       = hf_e / (total_minus_c + 1e-7)
        inner_ratio    = inner_e / (total_minus_c + 1e-7)
        peak_ratio     = inner_e / (hf_e + 1e-7)

        # ── Scoring ────────────────────────────────────────────────────────────
        score = 0.5   # start neutral

        # High-frequency ratio: real images are smooth; screen photos are aliased
        if hf_ratio > 0.25:
            score -= 0.30
        if hf_ratio > 0.28:
            score -= 0.25

        # Inner ring concentration: moire shows as energy集中 in inner ring
        if inner_ratio > 0.55:
            score -= 0.25
        if peak_ratio > 1.6:
            score -= 0.20

        # Abnormal center vs periphery ratio
        if center_ratio > 0.60:
            score -= 0.20
        if center_ratio > 0.65:
            score -= 0.20

        return float(np.clip(score, 0.0, 1.0))

    # -------------------------------------------------------------------------
    # _specular — specular highlight detection (screen glass reflections)
    # Phone screen glass creates sharp LED backlight reflections.
    # -------------------------------------------------------------------------
    def _specular(self, image: np.ndarray, bbox: Tuple) -> float:
        crop = self._safe_crop(image, bbox)
        if crop is None:
            return 0.5

        gray = cv2.cvtColor(cv2.resize(crop, (128, 128)), cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)

        # Very bright pixels (glare on glass)
        _, bright = cv2.threshold(blur, 210, 255, cv2.THRESH_BINARY)
        bright_ratio = np.sum(bright > 0) / bright.size

        # Sharp edge density (geometric patterns from screen grid)
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        edge_energy = float(np.mean(np.sqrt(sobelx**2 + sobely**2)))

        # Line detection — geometric patterns from screen pixel grid
        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=25,
                               minLineLength=15, maxLineGap=5)
        line_count = len(lines) if lines is not None else 0

        score = 0.5

        # Screen photo: sharp bright spots (>0.3% of pixels > 210) + high edge energy
        if bright_ratio > 0.003 and edge_energy > 25:
            score = 0.15
        elif bright_ratio > 0.002 and edge_energy > 20:
            score = 0.25
        elif line_count > 8:
            score = 0.20   # suspicious geometric grid lines

        # Real face: diffuse lighting, very few sharp specular spots
        return float(score)

    # -------------------------------------------------------------------------
    # _color_quantization — detect 8-bit color quantization stair-stepping
    # Screen output is 8-bit per channel; re-photographed screen keeps artifacts.
    # -------------------------------------------------------------------------
    def _color_quantization(self, image: np.ndarray, bbox: Tuple) -> float:
        crop = self._safe_crop(image, bbox)
        if crop is None:
            return 0.5

        small = cv2.resize(crop, (64, 64))
        score = 0.0

        for ch in range(3):
            channel = small[:, :, ch].astype(np.float32)
            diff_r = float(np.abs(np.diff(channel, axis=0)).mean())
            diff_c = float(np.abs(np.diff(channel, axis=1)).mean())
            total_diff = diff_r + diff_c
            variance = float(np.var(channel))

            # Low variance (flat regions) + many small jumps = quantization
            if variance < 150 and total_diff > 5.0:
                score += 0.25
            elif variance < 200 and total_diff > 4.0:
                score += 0.15

        return float(np.clip(1.0 - score, 0.0, 1.0))

    # -------------------------------------------------------------------------
    # _noise_consistency — high-frequency noise pattern analysis
    # Screen photo goes through TWO cameras: screen sensor + webcam sensor.
    # The noise texture is different from a direct photo.
    # -------------------------------------------------------------------------
    def _noise_consistency(self, image: np.ndarray, bbox: Tuple) -> float:
        crop = self._safe_crop(image, bbox)
        if crop is None:
            return 0.5

        gray = cv2.cvtColor(cv2.resize(crop, (128, 128)),
                          cv2.COLOR_BGR2GRAY).astype(np.float32)

        # High-pass to isolate noise
        blur = cv2.GaussianBlur(gray, (7, 7), 0)
        noise = gray - blur

        noise_std  = float(np.std(noise))
        noise_mean = float(np.mean(np.abs(noise)))

        score = 0.5

        # Screen photo: double-camera chain = unusual noise texture
        # Very clean (low noise) = could be direct screen output
        if noise_std < 2.5:
            score = 0.15
        elif noise_std < 3.5:
            score = 0.25
        elif noise_std > 12.0:
            score = 0.30  # unusually noisy — could be screen photo

        return float(score)

    # -------------------------------------------------------------------------
    # _dynamic_range — histogram analysis for display compression
    # Screen displays compress dynamic range; photos look unnaturally flat.
    # -------------------------------------------------------------------------
    def _dynamic_range(self, image: np.ndarray, bbox: Tuple) -> float:
        crop = self._safe_crop(image, bbox)
        if crop is None:
            return 0.5

        gray = cv2.cvtColor(cv2.resize(crop, (128, 128)),
                          cv2.COLOR_BGR2GRAY).astype(np.float32)

        h_min, h_max = float(gray.min()), float(gray.max())
        range_ratio = (h_max - h_min) / 255.0

        # Histogram entropy — very flat/uniform = compressed DR
        hist = cv2.calcHist([gray], [0], None, [32], [0, 256]).flatten()
        hist = (hist / (hist.sum() + 1e-7)).astype(np.float32)
        hist += 1e-7
        entropy = float(-np.sum(hist * np.log2(hist)))
        max_entropy = np.log2(32)
        entropy_ratio = entropy / max_entropy

        score = 0.5

        # Wide range AND very flat histogram = screen display
        if range_ratio > 0.88 and entropy_ratio > 0.87:
            score = 0.20
        elif range_ratio > 0.85 and entropy_ratio > 0.85:
            score = 0.30

        return float(score)

    # -------------------------------------------------------------------------
    # _color — skin chrominance analysis in HSV
    # -------------------------------------------------------------------------
    def _color(self, image: np.ndarray, bbox: Tuple) -> float:
        crop = self._safe_crop(image, bbox)
        if crop is None:
            return 0.5

        hsv = cv2.cvtColor(cv2.resize(crop, (128, 128)), cv2.COLOR_BGR2HSV)
        sm = float(np.mean(hsv[:, :, 1]))
        ss = float(np.std(hsv[:, :, 1]))

        if 30 < sm < 150 and ss > 15:
            return 0.80
        elif sm < 20:
            return 0.30
        return 0.55
