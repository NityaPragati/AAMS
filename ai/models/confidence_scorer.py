"""
███ LEVEL 3: Confidence Scoring & Failure Handling ███
"Operates with quantifiable confidence levels, moving away from
 binary decisions. Provides actionable logs for supervisors to
 review ambiguous entries."

Three-tier decision system:
  APPROVED       → High confidence, auto-log attendance
  PENDING_REVIEW → Ambiguous, flag for human supervisor
  REJECTED       → Low confidence or failed checks
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
        """
        Compute weighted confidence from all pipeline stages.
        
        Formula:
          base = w_det * detection + w_rec * recognition + w_live * liveness
          penalties: non-frontal (-15%), low quality (-10%)
        
        Decision thresholds:
          ≥ 0.82 → APPROVED (high confidence)
          ≥ 0.68 → APPROVED (standard)
          ≥ 0.50 → PENDING_REVIEW (ambiguous)
          < 0.50 → REJECTED
        """
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

        if final >= self.config.HIGH_CONFIDENCE_THRESHOLD:
            decision = "APPROVED"
            detail = f"High confidence match ({final:.3f})"
        elif final >= self.config.COSINE_SIMILARITY_THRESHOLD:
            decision = "APPROVED"
            detail = f"Standard match ({final:.3f})"
        elif final >= self.config.PENDING_REVIEW_THRESHOLD:
            decision = "PENDING_REVIEW"
            detail = f"Ambiguous — flagged for supervisor review ({final:.3f})"
        else:
            decision = "REJECTED"
            detail = f"Below threshold ({final:.3f})"

        self.logger.info(f"Decision: {decision} | {detail}")

        return {
            "final_score": final, "decision": decision, "detail": detail,
            "breakdown": {
                "detection": detection_conf,
                "recognition": recognition_conf,
                "liveness": liveness_score,
                "frontal": is_frontal,
                "quality": image_quality
            }
        }