"""
Embedding math: L2 distance + cosine similarity + matching.
Core of Level 1 — comparing deep learning face representations.
"""

import numpy as np
from typing import List, Tuple


class VectorOps:

    @staticmethod
    def l2_distance(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.linalg.norm(np.array(a) - np.array(b)))

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        a, b = np.array(a), np.array(b)
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        return float(np.dot(a, b) / (na * nb)) if na > 0 and nb > 0 else 0.0

    @staticmethod
    def normalize(emb: np.ndarray) -> np.ndarray:
        n = np.linalg.norm(emb)
        return emb / n if n > 0 else emb

    @staticmethod
    def average(embeddings: List[np.ndarray]) -> np.ndarray:
        if not embeddings:
            raise ValueError("Empty list")
        return np.mean(np.array(embeddings), axis=0)

    @staticmethod
    def quality_check(emb: np.ndarray) -> dict:
        e = np.array(emb)
        return {
            "dim": len(e), "norm": float(np.linalg.norm(e)),
            "valid": not np.any(np.isnan(e)) and not np.any(np.isinf(e)) and not np.all(e == 0)
        }

    @staticmethod
    def find_best_match(
        query: np.ndarray, stored: List[Tuple[str, np.ndarray]],
        threshold: float = 0.68
    ) -> dict:
        """
        Level 1 + Level 3: Match query against stored embeddings.
        Uses BOTH cosine similarity AND L2 distance for robustness.
        Returns confidence score, not just binary match.
        """
        if not stored:
            return {"matched": False, "person_id": None, "distance": float("inf"),
                    "cosine_similarity": 0.0, "confidence": 0.0, "candidates": []}

        candidates = []
        for pid, emb in stored:
            cos = VectorOps.cosine_similarity(query, emb)
            l2 = VectorOps.l2_distance(query, emb)
            candidates.append({"person_id": pid, "cosine": cos, "l2": l2})

        candidates.sort(key=lambda x: x["cosine"], reverse=True)
        best = candidates[0]
        matched = best["cosine"] > threshold

        return {
            "matched": matched,
            "person_id": best["person_id"] if matched else None,
            "best_person_id": best["person_id"],
            "distance": best["l2"],
            "cosine_similarity": best["cosine"],
            "confidence": float(np.clip(best["cosine"], 0, 1)),
            "candidates": candidates[:5]
        }
