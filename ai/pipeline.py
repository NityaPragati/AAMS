"""
████████████████████████████████████████████████████████████████
██  MULTI-STAGE FACE RECOGNITION PIPELINE                    ██
██                                                            ██
██  Level 1: Detection → FaceNet Embedding → Matching         ██
██  Level 2A: Liveness (LBP + Blink + Color + Moiré)         ██
██  Level 2B: Pose Estimation (solvePnP ±20°)                ██
██  Level 3: Weighted Confidence → 3-Tier Decision            ██
██                                                            ██
██  Stack: MediaPipe + DeepFace | Zero dlib                   ██
████████████████████████████████████████████████████████████████
"""

import time
import numpy as np
from typing import Optional, List
from datetime import datetime

from .config import PipelineConfig
from .models.face_detector import FaceDetector
from .models.face_embedder import FaceEmbedder
from .models.liveness_detector import LivenessDetector
from .models.pose_estimator import PoseEstimator
from .models.confidence_scorer import ConfidenceScorer
from .database.face_db import FaceDatabase
from .utils.image_utils import ImageProcessor
from .utils.vector_utils import VectorOps
from .utils.logging_utils import setup_logger


class FaceRecognitionPipeline:

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or PipelineConfig()
        self.logger = setup_logger("pipeline", self.config.LOG_FILE, self.config.LOG_LEVEL)

        self.logger.info("=" * 55)
        self.logger.info("  MULTI-STAGE FACE RECOGNITION PIPELINE")
        self.logger.info("  MediaPipe + DeepFace (FaceNet) | Zero dlib")
        self.logger.info("=" * 55)

        val = self.config.validate()
        for k, v in val.items():
            self.logger.info(f"  {k}: {'OK' if v else 'MISSING'}")

        self.detector = FaceDetector(self.config)
        self.embedder = FaceEmbedder(self.config)
        self.liveness = LivenessDetector(self.config)
        self.pose = PoseEstimator(self.config)
        self.scorer = ConfidenceScorer(self.config)
        self.db = FaceDatabase(self.config)
        self.img = ImageProcessor()
        self.vec = VectorOps()

        self.logger.info(f"Pipeline READY | {self.db.total()} registered faces")

    # ═══════════════════════════════════════
    # REGISTRATION (Enrollment)
    # ═══════════════════════════════════════
    def register_face(self, image: np.ndarray, person_id: str,
                      person_name: str, meta: dict = None) -> dict:
        t0 = time.time()
        self.logger.info(f"REGISTER: {person_name} ({person_id})")

        # Detect
        det = self.detector.detect_single_face(image)
        if not det:
            return {"success": False, "error": "No face detected", "stage": "detection"}

        # Quality
        crop = self.img.crop_face(image, det["bbox"])
        qual = self.img.assess_quality(crop)
        if qual["overall_quality"] < 0.25:
            return {"success": False, "error": "Low image quality", "stage": "quality", "quality": qual}

        # Embedding
        try:
            emb = self.embedder.compute_robust(image, det)
        except Exception as e:
            return {"success": False, "error": str(e), "stage": "embedding"}

        # Store
        res = self.db.register(person_id, person_name, emb, meta)
        res["time_ms"] = round((time.time() - t0) * 1000, 2)
        res["quality"] = qual
        self.logger.info(f"REGISTERED: {person_name} | {res['time_ms']}ms")
        return res

    def register_faces_from_frames(self, images: List[np.ndarray], person_id: str,
                                   person_name: str, meta: dict = None,
                                   min_samples: int = 3) -> dict:
        t0 = time.time()
        embeddings = []
        accepted = []
        rejected = []

        self.logger.info(f"VIDEO REGISTER: {person_name} ({person_id}) | frames={len(images)}")

        for idx, image in enumerate(images):
            det = self.detector.detect_single_face(image)
            if not det:
                rejected.append({"frame": idx, "stage": "detection", "error": "No face detected"})
                continue

            crop = self.img.crop_face(image, det["bbox"])
            qual = self.img.assess_quality(crop)
            if qual["overall_quality"] < 0.25:
                rejected.append({
                    "frame": idx, "stage": "quality", "error": "Low image quality",
                    "quality": qual
                })
                continue

            try:
                emb = self.embedder.compute_robust(image, det, n_aug=2)
                embeddings.append(emb)
                accepted.append({
                    "frame": idx,
                    "quality": qual["overall_quality"],
                    "detection_confidence": det["detection_confidence"]
                })
            except Exception as e:
                rejected.append({"frame": idx, "stage": "embedding", "error": str(e)})

        if len(embeddings) < min_samples:
            return {
                "success": False,
                "error": f"Need at least {min_samples} usable video frames",
                "stage": "video_enrollment",
                "accepted_samples": len(embeddings),
                "rejected_frames": rejected,
                "time_ms": round((time.time() - t0) * 1000, 2)
            }

        res = self.db.register_many(person_id, person_name, embeddings, meta)
        res["time_ms"] = round((time.time() - t0) * 1000, 2)
        res["accepted_samples"] = len(accepted)
        res["accepted_frames"] = accepted
        res["rejected_frames"] = rejected
        self.logger.info(
            f"VIDEO REGISTERED: {person_name} | +{len(embeddings)} samples | {res['time_ms']}ms"
        )
        return res

    # ═══════════════════════════════════════
    # VERIFICATION (Full 7-Stage Pipeline)
    # ═══════════════════════════════════════
    def verify_face(self, image: np.ndarray) -> dict:
        t0 = time.time()
        stages = []
        self.logger.info("─" * 40)
        self.logger.info("VERIFICATION PIPELINE START")

        # ── Stage 1: Face Detection ──
        ts = time.time()
        det = self.detector.detect_single_face(image)
        dt = round((time.time() - ts) * 1000, 2)
        if not det:
            stages.append({"stage": "detection", "status": "FAILED", "ms": dt})
            return self._fail("No face detected", "detection", stages, t0)
        stages.append({"stage": "detection", "status": "OK", "ms": dt,
                        "confidence": det["detection_confidence"]})
        face_box = self._face_box(det, image)

        # ── Stage 2: Image Quality ──
        crop = self.img.crop_face(image, det["bbox"])
        qual = self.img.assess_quality(crop)
        stages.append({"stage": "quality", "status": "OK" if qual["overall_quality"] >= 0.3 else "WARN",
                        "score": qual["overall_quality"]})

        # ── Stage 3: Liveness Detection (Level 2A) ──
        ts = time.time()
        live = {"is_live": True, "liveness_score": 0.5, "detail": "Skipped (no landmarks)"}
        if det["landmarks"] is not None:
            try:
                live = self.liveness.check(image, det["landmarks"], det["bbox"])
            except Exception as e:
                live = {"is_live": True, "liveness_score": 0.5, "detail": f"Error: {e}"}
        lt = round((time.time() - ts) * 1000, 2)
        stages.append({"stage": "liveness", "status": "PASS" if live["is_live"] else "FAIL",
                        "ms": lt, "score": live["liveness_score"]})
        if not live["is_live"]:
            return self._fail(
                "Liveness failed — possible spoofing", "liveness", stages, t0,
                liveness=live, face_box=face_box
            )

        # ── Stage 4: Pose Estimation (Level 2B) ──
        ts = time.time()
        pose = {"success": True, "is_frontal": True, "detail": "Skipped", "yaw": 0, "pitch": 0, "roll": 0}
        if det["landmarks"] is not None:
            try:
                pose = self.pose.estimate(image, det["landmarks"])
            except Exception as e:
                pose = {"success": True, "is_frontal": True, "detail": f"Error: {e}",
                        "yaw": 0, "pitch": 0, "roll": 0}
        pt = round((time.time() - ts) * 1000, 2)
        stages.append({"stage": "pose", "status": "OK" if pose.get("is_frontal") else "WARN",
                        "ms": pt, "detail": pose["detail"]})

        # ── Stage 5: Face Embedding (Level 1) ──
        ts = time.time()
        try:
            emb = self.embedder.compute_from_detection(image, det)
        except Exception as e:
            # Retry with full-frame enhancement if the direct path fails.
            try:
                enhanced = self.img.enhance(image)
                emb = self.embedder.compute_from_detection(enhanced, det)
            except Exception as e2:
                return self._fail(f"Embedding error: {e2}", "embedding", stages, t0, face_box=face_box)

        # ── Stage 6: Matching (Level 1) ──
        ts = time.time()
        stored = self.db.get_all_embeddings()
        if not stored:
            return self._fail("No faces registered", "matching", stages, t0, face_box=face_box)
        match = self.vec.find_best_match(emb, stored, self.config.COSINE_SIMILARITY_THRESHOLD)
        mt = round((time.time() - ts) * 1000, 2)
        stages.append({"stage": "matching", "status": "MATCH" if match["matched"] else "NO_MATCH",
                        "ms": mt, "confidence": match["confidence"],
                        "cosine": match["cosine_similarity"]})

        # ── Stage 7: Confidence Scoring (Level 3) ──
        sc = self.scorer.score(
            det["detection_confidence"], match["confidence"],
            live["liveness_score"], pose.get("is_frontal", True),
            qual["overall_quality"]
        )
        stages.append({"stage": "scoring", "decision": sc["decision"], "score": sc["final_score"]})

        # ── Build Response ──
        person = None
        if match["matched"] and match["person_id"]:
            person = self.db.get_person(match["person_id"])

        total = round((time.time() - t0) * 1000, 2)

        result = {
            "success": True,
            "matched": match["matched"],
            "decision": sc["decision"],
            "person_id": match["person_id"],
            "person_name": person["person_name"] if person else None,
            "confidence": sc["final_score"],
            "cosine_similarity": match["cosine_similarity"],
            "liveness": {"is_live": live["is_live"], "score": live["liveness_score"],
                         "detail": live.get("detail", "")},
            "pose": {"is_frontal": pose.get("is_frontal", True),
                     "yaw": pose.get("yaw", 0), "pitch": pose.get("pitch", 0),
                     "roll": pose.get("roll", 0), "detail": pose.get("detail", "")},
            "quality": qual,
            "face_box": face_box,
            "scoring": sc,
            "pipeline_stages": stages,
            "processing_time_ms": total,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

        self.logger.info(f"RESULT: {sc['decision']} | {result['person_name']} | "
                          f"conf={sc['final_score']:.3f} | {total}ms")
        return result

    def _fail(self, error, stage, stages, t0, **extra):
        r = {"success": False, "error": error, "stage_failed": stage,
             "pipeline_stages": stages,
             "processing_time_ms": round((time.time() - t0) * 1000, 2)}
        r.update(extra)
        self.logger.warning(f"FAILED at {stage}: {error}")
        return r

    def _face_box(self, detection: dict, image: np.ndarray) -> dict:
        top, right, bottom, left = detection["bbox"]
        h, w = image.shape[:2]
        top = max(0, min(top, h))
        bottom = max(0, min(bottom, h))
        left = max(0, min(left, w))
        right = max(0, min(right, w))

        return {
            "bbox": {"top": top, "right": right, "bottom": bottom, "left": left},
            "image": {"width": w, "height": h},
            "normalized": {
                "top": round((top / h) * 100, 2) if h else 0,
                "left": round((left / w) * 100, 2) if w else 0,
                "width": round(((right - left) / w) * 100, 2) if w else 0,
                "height": round(((bottom - top) / h) * 100, 2) if h else 0
            }
        }

    def verify_faces_from_frames(self, images: List[np.ndarray]) -> dict:
        t0 = time.time()
        results = []
        self.logger.info(f"VIDEO VERIFY START | frames={len(images)}")

        for idx, image in enumerate(images):
            result = self.verify_face(image)
            result["frame_index"] = idx
            results.append(result)

        matched = [r for r in results if r.get("success") and r.get("matched")]
        if matched:
            counts = {}
            for r in matched:
                pid = r.get("person_id")
                counts[pid] = counts.get(pid, 0) + 1

            def rank(item):
                return (
                    counts.get(item.get("person_id"), 0),
                    item.get("confidence") or 0,
                    item.get("cosine_similarity") or 0
                )

            best = dict(sorted(matched, key=rank, reverse=True)[0])
        else:
            usable = [r for r in results if r.get("success")]
            if usable:
                best = dict(sorted(
                    usable,
                    key=lambda r: r.get("confidence") or r.get("cosine_similarity") or 0,
                    reverse=True
                )[0])
            elif results:
                best = dict(results[-1])
            else:
                best = self._fail("No frames supplied", "video", [], t0)

        best["video"] = {
            "frames_received": len(images),
            "frames_processed": len(results),
            "matched_frames": len(matched),
            "best_frame": best.get("frame_index"),
            "total_processing_time_ms": round((time.time() - t0) * 1000, 2)
        }
        return best

    # ═══════════════════════════════════════
    # UTILITY
    # ═══════════════════════════════════════
    def status(self) -> dict:
        return {"status": "operational", "registered": self.db.total(),
                "persons": self.db.list_all(), "validation": self.config.validate()}

    def delete_person(self, pid: str) -> bool:
        return self.db.delete(pid)

    def list_persons(self) -> list:
        return self.db.list_all()
