"""
Multi-stage face recognition pipeline.

Security changes in this version:
- liveness failures now fail closed instead of defaulting to live
- video verification uses sequence liveness instead of a single best frame
- enrollment also requires liveness, so spoofed frames are not stored
"""

import time
from datetime import datetime
from typing import List, Optional

import numpy as np

from .config import PipelineConfig
from .database.face_db import FaceDatabase
from .models.confidence_scorer import ConfidenceScorer
from .models.face_detector import FaceDetector
from .models.face_embedder import FaceEmbedder
from .models.liveness_detector import LivenessDetector
from .models.pose_estimator import PoseEstimator
from .utils.image_utils import ImageProcessor
from .utils.logging_utils import setup_logger
from .utils.vector_utils import VectorOps


class FaceRecognitionPipeline:

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or PipelineConfig()
        self.logger = setup_logger("pipeline", self.config.LOG_FILE, self.config.LOG_LEVEL)

        self.logger.info("=" * 55)
        self.logger.info("  MULTI-STAGE FACE RECOGNITION PIPELINE")
        self.logger.info("  MediaPipe + DeepFace (FaceNet)")
        self.logger.info("=" * 55)

        validation = self.config.validate()
        for name, valid in validation.items():
            self.logger.info(f"  {name}: {'OK' if valid else 'MISSING'}")

        self.detector = FaceDetector(self.config)
        self.embedder = FaceEmbedder(self.config)
        self.liveness = LivenessDetector(self.config)
        self.pose = PoseEstimator(self.config)
        self.scorer = ConfidenceScorer(self.config)
        self.db = FaceDatabase(self.config)
        self.img = ImageProcessor()
        self.vec = VectorOps()

        self.logger.info(f"Pipeline READY | {self.db.total()} registered faces")

    def register_face(self, image: np.ndarray, person_id: str, person_name: str, meta: dict = None) -> dict:
        t0 = time.time()
        self.logger.info(f"REGISTER: {person_name} ({person_id})")

        analysis = self._analyze_frame(image, session_id=f"enroll-{person_id}", frame_index=0)
        if not analysis["det"]:
            return self._fail("No face detected", "detection", [], t0)
        if analysis["qual"]["overall_quality"] < 0.25:
            return self._fail(
                "Low image quality",
                "quality",
                self._base_stages(analysis),
                t0,
                quality=analysis["qual"],
                face_box=analysis["face_box"],
            )
        if not analysis["live"]["is_live"]:
            return self._fail(
                analysis["live"]["detail"],
                "liveness",
                self._base_stages(analysis),
                t0,
                liveness=analysis["live"],
                face_box=analysis["face_box"],
            )
        if not analysis["pose"].get("is_frontal", True):
            return self._fail(
                "Look straight at the camera during registration",
                "pose",
                self._base_stages(analysis),
                t0,
                pose=analysis["pose"],
                face_box=analysis["face_box"],
            )

        try:
            embedding = self.embedder.compute_robust(image, analysis["det"])
        except Exception as exc:
            return self._fail(str(exc), "embedding", self._base_stages(analysis), t0, face_box=analysis["face_box"])

        result = self.db.register(person_id, person_name, embedding, meta)
        result["time_ms"] = round((time.time() - t0) * 1000, 2)
        result["quality"] = analysis["qual"]
        result["liveness"] = analysis["live"]
        result["pose"] = analysis["pose"]
        self.logger.info(f"REGISTERED: {person_name} | {result['time_ms']}ms")
        return result

    def register_faces_from_frames(
        self,
        images: List[np.ndarray],
        person_id: str,
        person_name: str,
        meta: dict = None,
        min_samples: int = 3,
    ) -> dict:
        t0 = time.time()
        self.logger.info(f"VIDEO REGISTER: {person_name} ({person_id}) | frames={len(images)}")

        analyses = [
            self._analyze_frame(image, session_id=f"enroll-{person_id}-{index}", frame_index=index)
            for index, image in enumerate(images)
        ]
        detections = [item for item in analyses if item["det"]]
        if len(detections) < 2:
            return self._fail("Need multiple clear face frames for enrollment", "detection", [], t0)

        sequence_live = self.liveness.check_sequence(
            [item["image"] for item in detections],
            [item["det"] for item in detections],
            session_id=f"enroll-{person_id}",
        )
        if not sequence_live["is_live"]:
            return self._fail(
                sequence_live["detail"],
                "liveness",
                [],
                t0,
                liveness=sequence_live,
                face_box=detections[0]["face_box"],
            )

        embeddings = []
        accepted = []
        rejected = []

        for analysis in analyses:
            index = analysis["frame_index"]
            if not analysis["det"]:
                rejected.append({"frame": index, "stage": "detection", "error": "No face detected"})
                continue
            if analysis["qual"]["overall_quality"] < 0.25:
                rejected.append({
                    "frame": index,
                    "stage": "quality",
                    "error": "Low image quality",
                    "quality": analysis["qual"],
                })
                continue
            if not analysis["live"]["is_live"]:
                rejected.append({
                    "frame": index,
                    "stage": "liveness",
                    "error": analysis["live"]["detail"],
                    "liveness": analysis["live"],
                })
                continue
            if not analysis["pose"].get("is_frontal", True):
                rejected.append({
                    "frame": index,
                    "stage": "pose",
                    "error": analysis["pose"]["detail"],
                    "pose": analysis["pose"],
                })
                continue

            try:
                embedding = self.embedder.compute_robust(analysis["image"], analysis["det"], n_aug=2)
                embeddings.append(embedding)
                accepted.append({
                    "frame": index,
                    "quality": analysis["qual"]["overall_quality"],
                    "detection_confidence": analysis["det"]["detection_confidence"],
                    "liveness_score": analysis["live"]["liveness_score"],
                })
            except Exception as exc:
                rejected.append({"frame": index, "stage": "embedding", "error": str(exc)})

        if len(embeddings) < min_samples:
            return {
                "success": False,
                "error": f"Need at least {min_samples} live enrollment frames",
                "stage": "video_enrollment",
                "accepted_samples": len(embeddings),
                "accepted_frames": accepted,
                "rejected_frames": rejected,
                "liveness": sequence_live,
                "time_ms": round((time.time() - t0) * 1000, 2),
            }

        result = self.db.register_many(person_id, person_name, embeddings, meta)
        result["time_ms"] = round((time.time() - t0) * 1000, 2)
        result["accepted_samples"] = len(accepted)
        result["accepted_frames"] = accepted
        result["rejected_frames"] = rejected
        result["liveness"] = sequence_live
        self.logger.info(
            f"VIDEO REGISTERED: {person_name} | +{len(embeddings)} samples | {result['time_ms']}ms"
        )
        return result

    def verify_face(self, image: np.ndarray) -> dict:
        t0 = time.time()
        self.logger.info("-" * 40)
        self.logger.info("VERIFICATION PIPELINE START")

        analysis = self._analyze_frame(image, session_id="verify", frame_index=0)
        if not analysis["det"]:
            stages = [{"stage": "detection", "status": "FAILED"}]
            return self._fail("No face detected", "detection", stages, t0)
        if not analysis["live"]["is_live"]:
            return self._fail(
                analysis["live"]["detail"],
                "liveness",
                self._base_stages(analysis),
                t0,
                liveness=analysis["live"],
                face_box=analysis["face_box"],
            )

        return self._recognize_from_analysis(analysis, t0)

    def verify_faces_from_frames(self, images: List[np.ndarray]) -> dict:
        t0 = time.time()
        self.logger.info(f"VIDEO VERIFY START | frames={len(images)}")

        if not images:
            return self._fail("No frames supplied", "video", [], t0)

        analyses = [
            self._analyze_frame(image, session_id=f"verify-video-{index}", frame_index=index)
            for index, image in enumerate(images)
        ]
        detected = [item for item in analyses if item["det"]]
        if len(detected) < 2:
            return self._fail("Need multiple clear frames for anti-spoofing", "detection", [], t0)

        sequence_live = self.liveness.check_sequence(
            [item["image"] for item in detected],
            [item["det"] for item in detected],
            session_id="verify-video",
        )
        if not sequence_live["is_live"]:
            return self._fail(
                sequence_live["detail"],
                "liveness",
                [],
                t0,
                liveness=sequence_live,
                face_box=detected[0]["face_box"],
                video={
                    "frames_received": len(images),
                    "frames_with_face": len(detected),
                    "sequence_liveness": sequence_live,
                },
            )

        candidate_frames = [
            item for item in detected
            if item["qual"]["overall_quality"] >= 0.25 and item["live"]["is_live"]
        ]
        if not candidate_frames:
            return self._fail(
                "No live frames passed quality and anti-spoofing checks",
                "liveness",
                [],
                t0,
                liveness=sequence_live,
                face_box=detected[0]["face_box"],
            )

        candidate_frames.sort(
            key=lambda item: (
                item["qual"]["overall_quality"],
                item["live"]["liveness_score"],
                item["det"]["detection_confidence"],
                1 if item["pose"].get("is_frontal", True) else 0,
            ),
            reverse=True,
        )
        candidate_frames = candidate_frames[:3]

        results = []
        for analysis in candidate_frames:
            result = self._recognize_from_analysis(analysis, time.time())
            result["frame_index"] = analysis["frame_index"]
            results.append(result)

        matched = [item for item in results if item.get("success") and item.get("matched")]
        if matched:
            counts = {}
            for item in matched:
                person_id = item.get("person_id")
                counts[person_id] = counts.get(person_id, 0) + 1

            dominant_person_id = max(
                counts.items(),
                key=lambda item: (item[1], item[0] is not None),
            )[0]
            dominant = [item for item in matched if item.get("person_id") == dominant_person_id]
            dominant.sort(
                key=lambda item: (
                    item.get("decision") == "APPROVED",
                    item.get("confidence") or 0,
                    item.get("cosine_similarity") or 0,
                ),
                reverse=True,
            )

            best = dict(dominant[0])
            if len(dominant) < self.config.MIN_VIDEO_LIVE_FRAMES:
                best["decision"] = "PENDING_REVIEW"
                best["confidence"] = min(
                    float(best.get("confidence") or 0.0),
                    self.config.APPROVED_CONFIDENCE_THRESHOLD - 0.01,
                )
                if best.get("scoring"):
                    best["scoring"] = dict(best["scoring"])
                    best["scoring"]["decision"] = "PENDING_REVIEW"
                    best["scoring"]["detail"] = "Identity seen in too few frames for auto-approval"
            elif best.get("decision") == "REJECTED":
                best["decision"] = "PENDING_REVIEW"
        else:
            usable = [item for item in results if item.get("success")]
            if usable:
                best = dict(sorted(
                    usable,
                    key=lambda item: item.get("confidence") or item.get("cosine_similarity") or 0,
                    reverse=True,
                )[0])
            else:
                best = dict(results[-1]) if results else self._fail("No usable frames", "video", [], t0)

        best = self._require_approved_live_match(best)
        best["video"] = {
            "frames_received": len(images),
            "frames_with_face": len(detected),
            "candidate_frames": len(candidate_frames),
            "matched_frames": len(matched),
            "sequence_liveness": sequence_live,
            "best_frame": best.get("frame_index"),
            "total_processing_time_ms": round((time.time() - t0) * 1000, 2),
        }
        return best

    def _analyze_frame(self, image: np.ndarray, session_id: str, frame_index: int) -> dict:
        detection = self.detector.detect_single_face(image)
        face_box = self._face_box(detection, image) if detection else None
        if not detection:
            return {
                "image": image,
                "frame_index": frame_index,
                "det": None,
                "qual": None,
                "live": self._liveness_failure("No landmarks for liveness"),
                "pose": self._pose_default("No face detected"),
                "face_box": None,
            }

        crop = self.img.crop_face(image, detection["bbox"])
        quality = self.img.assess_quality(crop)
        liveness = self._check_liveness(image, detection, session_id)
        pose = self._check_pose(image, detection)
        return {
            "image": image,
            "frame_index": frame_index,
            "det": detection,
            "qual": quality,
            "live": liveness,
            "pose": pose,
            "face_box": face_box,
        }

    def _check_liveness(self, image: np.ndarray, detection: dict, session_id: str) -> dict:
        landmarks = detection.get("landmarks")
        if landmarks is None:
            return self._liveness_failure("No landmarks for liveness")
        try:
            return self.liveness.check(image, landmarks, detection["bbox"], session_id=session_id)
        except Exception as exc:
            self.logger.exception("Liveness detector error")
            return self._liveness_failure(f"Liveness detector error: {exc}")

    def _check_pose(self, image: np.ndarray, detection: dict) -> dict:
        landmarks = detection.get("landmarks")
        if landmarks is None:
            return self._pose_default("No landmarks for pose")
        try:
            return self.pose.estimate(image, landmarks)
        except Exception as exc:
            self.logger.exception("Pose estimation error")
            return self._pose_default(f"Pose estimation error: {exc}")

    def _recognize_from_analysis(self, analysis: dict, t0: float) -> dict:
        stages = self._base_stages(analysis)
        if not analysis["live"]["is_live"]:
            return self._fail(
                analysis["live"]["detail"],
                "liveness",
                stages,
                t0,
                liveness=analysis["live"],
                face_box=analysis["face_box"],
            )

        try:
            embedding = self.embedder.compute_from_detection(analysis["image"], analysis["det"])
        except Exception:
            try:
                enhanced = self.img.enhance(analysis["image"])
                embedding = self.embedder.compute_from_detection(enhanced, analysis["det"])
            except Exception as exc:
                return self._fail(
                    f"Embedding error: {exc}",
                    "embedding",
                    stages,
                    t0,
                    face_box=analysis["face_box"],
                )

        stored = self.db.get_all_embeddings()
        if not stored:
            return self._fail("No faces registered", "matching", stages, t0, face_box=analysis["face_box"])

        match = self.vec.find_best_match(
            embedding,
            stored,
            self.config.COSINE_SIMILARITY_THRESHOLD,
        )
        stages.append({
            "stage": "matching",
            "status": "MATCH" if match["matched"] else "NO_MATCH",
            "confidence": match["confidence"],
            "cosine": match["cosine_similarity"],
        })

        scoring = self.scorer.score(
            analysis["det"]["detection_confidence"],
            match["confidence"],
            analysis["live"]["liveness_score"],
            analysis["pose"].get("is_frontal", True),
            analysis["qual"]["overall_quality"] if analysis["qual"] else None,
        )
        stages.append({
            "stage": "scoring",
            "decision": scoring["decision"],
            "score": scoring["final_score"],
        })

        approved_match = match["matched"] and scoring["decision"] == "APPROVED"
        review_required = match["matched"] and scoring["decision"] == "PENDING_REVIEW"
        person = self.db.get_person(match["person_id"]) if approved_match and match["person_id"] else None
        total = round((time.time() - t0) * 1000, 2)

        error = None
        if review_required:
            error = "Not live enough - blink challenge failed or spoof suspected"
        elif match["matched"] and scoring["decision"] == "REJECTED":
            error = "Verification rejected"

        result = {
            "success": True,
            "matched": approved_match,
            "decision": scoring["decision"],
            "review_required": review_required,
            "person_id": match["person_id"] if approved_match else None,
            "best_person_id": match.get("best_person_id"),
            "person_name": person["person_name"] if person else None,
            "confidence": scoring["final_score"],
            "cosine_similarity": match["cosine_similarity"],
            "error": error,
            "liveness": {
                "is_live": analysis["live"]["is_live"],
                "score": analysis["live"]["liveness_score"],
                "detail": analysis["live"].get("detail", ""),
            },
            "pose": {
                "is_frontal": analysis["pose"].get("is_frontal", True),
                "yaw": analysis["pose"].get("yaw", 0),
                "pitch": analysis["pose"].get("pitch", 0),
                "roll": analysis["pose"].get("roll", 0),
                "detail": analysis["pose"].get("detail", ""),
            },
            "quality": analysis["qual"],
            "face_box": analysis["face_box"],
            "scoring": scoring,
            "pipeline_stages": stages,
            "processing_time_ms": total,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        self.logger.info(
            f"RESULT: {scoring['decision']} | {result['person_name']} | "
            f"conf={scoring['final_score']:.3f} | {total}ms"
        )
        return result

    def _require_approved_live_match(self, result: dict) -> dict:
        if not result or not result.get("success"):
            return result

        liveness = result.get("liveness") or {}
        approved_live_match = bool(
            result.get("matched") and
            result.get("person_id") and
            result.get("decision") == "APPROVED" and
            liveness.get("is_live")
        )
        if approved_live_match:
            return result

        normalized = dict(result)
        decision = normalized.get("decision")
        normalized["matched"] = False
        normalized["person_id"] = None
        normalized["person_name"] = None

        if decision == "PENDING_REVIEW":
            normalized["review_required"] = True
            normalized["error"] = (
                normalized.get("error") or
                "Not live enough - blink challenge failed or spoof suspected"
            )
        elif not liveness.get("is_live"):
            normalized["error"] = normalized.get("error") or liveness.get("detail") or "Not live"
        else:
            normalized["error"] = normalized.get("error") or "Verification rejected"

        return normalized

    def _base_stages(self, analysis: dict) -> List[dict]:
        stages = []
        if analysis["det"]:
            stages.append({
                "stage": "detection",
                "status": "OK",
                "confidence": analysis["det"]["detection_confidence"],
            })
        else:
            stages.append({"stage": "detection", "status": "FAILED"})

        if analysis["qual"] is not None:
            stages.append({
                "stage": "quality",
                "status": "OK" if analysis["qual"]["overall_quality"] >= 0.30 else "WARN",
                "score": analysis["qual"]["overall_quality"],
            })

        if analysis["live"] is not None:
            stages.append({
                "stage": "liveness",
                "status": "PASS" if analysis["live"]["is_live"] else "FAIL",
                "score": analysis["live"]["liveness_score"],
            })

        if analysis["pose"] is not None:
            stages.append({
                "stage": "pose",
                "status": "OK" if analysis["pose"].get("is_frontal", True) else "WARN",
                "detail": analysis["pose"].get("detail"),
            })
        return stages

    def _liveness_failure(self, detail: str) -> dict:
        return {
            "is_live": False,
            "liveness_score": 0.0,
            "moire_score": 0.0,
            "specular_score": 0.0,
            "color_quant_score": 0.0,
            "noise_score": 0.0,
            "dynamic_range_score": 0.0,
            "texture_score": 0.0,
            "risk_flags": ["unverified"],
            "detail": detail,
        }

    def _pose_default(self, detail: str) -> dict:
        return {
            "success": False,
            "yaw": 0,
            "pitch": 0,
            "roll": 0,
            "is_frontal": True,
            "detail": detail,
            "yaw_ok": True,
            "pitch_ok": True,
            "roll_ok": True,
        }

    def _fail(self, error, stage, stages, t0, **extra):
        result = {
            "success": False,
            "error": error,
            "stage_failed": stage,
            "pipeline_stages": stages,
            "processing_time_ms": round((time.time() - t0) * 1000, 2),
        }
        result.update(extra)
        self.logger.warning(f"FAILED at {stage}: {error}")
        return result

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
                "height": round(((bottom - top) / h) * 100, 2) if h else 0,
            }
        }

    def status(self) -> dict:
        return {
            "status": "operational",
            "registered": self.db.total(),
            "persons": self.db.list_all(),
            "validation": self.config.validate(),
        }

    def delete_person(self, person_id: str) -> bool:
        return self.db.delete(person_id)

    def list_persons(self) -> list:
        return self.db.list_all()
