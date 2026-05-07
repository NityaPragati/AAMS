"""
Level 3 confidence scoring.

The final attendance decision should only be APPROVED when both identity
matching and liveness are genuinely strong. Borderline matches are sent for
review instead of being auto-accepted.
"""

import numpy as np
from typing import Optional
from ..config import PipelineConfig
from ..utils.logging_utils import setup_logger


class ConfidenceScorer:

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.logger = setup_logger("scorer", config.LOG_FILE, config.LOG_LEVEL)
        self.logger.info("ConfidenceScorer ready (3-tier weighted)")

    def score(
        self, detection_conf: float, recognition_conf: float,
        liveness_score: float, is_frontal: bool,
        image_quality: Optional[float] = None
    ) -> dict:
        base = (
            self.config.DETECTION_WEIGHT * detection_conf +
            self.config.RECOGNITION_WEIGHT * recognition_conf +
            self.config.LIVENESS_WEIGHT * liveness_score
        )

        if not is_frontal:
            base *= 0.85
        if image_quality is not None and image_quality < 0.5:
            base *= 0.90

        final = float(np.clip(base, 0, 1))

        min_recognition_for_approval = max(
            self.config.COSINE_SIMILARITY_THRESHOLD + 0.05,
            self.config.APPROVED_CONFIDENCE_THRESHOLD - 0.03
        )
        min_liveness_for_approval = max(
            self.config.LIVENESS_THRESHOLD,
            self.config.APPROVED_CONFIDENCE_THRESHOLD - 0.08
        )

        if (
            final >= self.config.HIGH_CONFIDENCE_THRESHOLD and
            recognition_conf >= min_recognition_for_approval and
            liveness_score >= min_liveness_for_approval
        ):
            decision = "APPROVED"
            detail = f"High confidence match ({final:.3f})"
        elif (
            final >= self.config.APPROVED_CONFIDENCE_THRESHOLD and
            recognition_conf >= min_recognition_for_approval and
            liveness_score >= min_liveness_for_approval
        ):
            decision = "APPROVED"
            detail = f"Standard match ({final:.3f})"
        elif (
            final >= self.config.PENDING_REVIEW_THRESHOLD and
            recognition_conf >= self.config.COSINE_SIMILARITY_THRESHOLD and
            liveness_score >= (self.config.LIVENESS_THRESHOLD - 0.05)
        ):
            decision = "PENDING_REVIEW"
            detail = f"Ambiguous - flagged for supervisor review ({final:.3f})"
        else:
            decision = "REJECTED"
            detail = f"Below threshold ({final:.3f})"

        self.logger.info(f"Decision: {decision} | {detail}")

        return {
            "final_score": final,
            "decision": decision,
            "detail": detail,
            "breakdown": {
                "detection": detection_conf,
                "recognition": recognition_conf,
                "liveness": liveness_score,
                "frontal": is_frontal,
                "quality": image_quality,
                "min_recognition_for_approval": min_recognition_for_approval,
                "min_liveness_for_approval": min_liveness_for_approval,
            }
        }
