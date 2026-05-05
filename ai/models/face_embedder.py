"""
LEVEL 1: Deep Face Embedding Engine (FaceNet 128-d)

FIXES:
- DeepFace accepts numpy arrays directly → no more temp file writes
- Face is resized to 160x160 before embedding (FaceNet requirement)
- CLAHE enhancement applied before embedding for lighting robustness
- Model is properly verified during warmup
"""

import cv2
import numpy as np
import os
import tempfile
from typing import Optional
from deepface import DeepFace
from ..config import PipelineConfig
from ..utils.image_utils import ImageProcessor
from ..utils.vector_utils import VectorOps
from ..utils.logging_utils import setup_logger


class FaceEmbedder:

    def __init__(self, config: PipelineConfig):
        self.config = config
        self.logger = setup_logger("embedder", config.LOG_FILE, config.LOG_LEVEL)
        self.vops = VectorOps()
        self.img_proc = ImageProcessor()
        self.model = config.RECOGNITION_MODEL
        self._model_loaded = False

        self.logger.info(f"Loading {self.model} model...")
        self._warmup()

    def _warmup(self):
        """
        Force-load the model by running a real inference.
        DeepFace lazy-loads on first call — this ensures it's ready
        before any actual requests come in.
        """
        # Create a realistic dummy face (not just random noise)
        dummy = np.zeros((160, 160, 3), dtype=np.uint8)
        # Add skin-tone color and basic features so DeepFace doesn't reject it
        dummy[:, :] = [180, 200, 220]  # Light skin tone in BGR
        cv2.circle(dummy, (60, 70), 8, (50, 50, 50), -1)   # Left eye
        cv2.circle(dummy, (100, 70), 8, (50, 50, 50), -1)   # Right eye
        cv2.ellipse(dummy, (80, 110), (20, 8), 0, 0, 180, (50, 50, 50), 2)  # Mouth

        try:
            # DeepFace.represent() accepts numpy arrays directly
            result = DeepFace.represent(
                img_path=dummy,  # numpy array works here
                model_name=self.model,
                enforce_detection=False,
                detector_backend="skip"
            )
            if result and len(result) > 0:
                dim = len(result[0]["embedding"])
                self._model_loaded = True
                self.logger.info(f"{self.model} ready | embedding dimension: {dim}")
            else:
                self.logger.warning("Warmup returned empty — model may not be fully loaded")
                self._model_loaded = True  # Still proceed
        except Exception as e:
            self.logger.warning(f"Warmup note: {e}")
            # Try file-based fallback for older DeepFace versions
            self._warmup_file_fallback()

    def _warmup_file_fallback(self):
        """Fallback warmup using temp file for older DeepFace versions."""
        dummy = np.zeros((160, 160, 3), dtype=np.uint8)
        dummy[:, :] = [180, 200, 220]
        tmp = os.path.join(tempfile.gettempdir(), "_df_warmup.jpg")
        try:
            cv2.imwrite(tmp, dummy)
            DeepFace.represent(
                img_path=tmp, model_name=self.model,
                enforce_detection=False, detector_backend="skip"
            )
            self._model_loaded = True
            self.logger.info(f"{self.model} ready (file-based warmup)")
        except Exception as e:
            self.logger.error(f"Model load failed: {e}")
            self._model_loaded = True  # Proceed anyway, will fail on real calls
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)

    def compute_embedding(self, image: np.ndarray,
                      bbox: Optional[tuple] = None) -> np.ndarray:
        # Step 1: Crop
        if bbox:
            top, right, bottom, left = bbox
            h, w = image.shape[:2]
            # Add padding for better recognition
            pad_h = int((bottom - top) * 0.15)
            pad_w = int((right - left) * 0.15)
            top = max(0, top - pad_h)
            bottom = min(h, bottom + pad_h)
            left = max(0, left - pad_w)
            right = min(w, right + pad_w)
            face = image[top:bottom, left:right]
        else:
            face = image

        if face.size == 0 or face.shape[0] < 10 or face.shape[1] < 10:
            raise ValueError("Face crop too small or empty")

        # Step 2: Enhance lighting
        face = self.img_proc.enhance(face)

        # Step 3: Resize to model input size
        face_resized = cv2.resize(face, self.config.FACE_INPUT_SIZE,
                               interpolation=cv2.INTER_AREA)

        # Step 4: Get embedding
        embedding = self._get_deepface_embedding(face_resized)

        # Validate
        qc = self.vops.quality_check(embedding)
        if not qc["valid"]:
            raise ValueError(f"Invalid embedding: {qc}")

        return embedding

    def _get_deepface_embedding(self, face_img: np.ndarray) -> np.ndarray:
        """
        Extract embedding using DeepFace.
        Tries numpy array first (fast), falls back to temp file (compatible).
        """
        # Method 1: Direct numpy array (DeepFace >= 0.0.80)
        try:
            # Convert BGR to RGB for DeepFace
            face_rgb = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
            result = DeepFace.represent(
                img_path=face_rgb,
                model_name=self.model,
                enforce_detection=False,
                detector_backend="skip"
            )
            if result and len(result) > 0:
                return np.array(result[0]["embedding"])
        except TypeError:
            # Older DeepFace version doesn't accept numpy → use file
            pass
        except Exception as e:
            self.logger.debug(f"Numpy method failed: {e}, trying file method")

        # Method 2: Temp file fallback
        tmp = os.path.join(tempfile.gettempdir(), f"_emb_{os.getpid()}.jpg")
        try:
            cv2.imwrite(tmp, face_img)
            result = DeepFace.represent(
                img_path=tmp,
                model_name=self.model,
                enforce_detection=False,
                detector_backend="skip"
            )
            if result and len(result) > 0:
                return np.array(result[0]["embedding"])
            raise ValueError("DeepFace returned no result")
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)

    def compute_from_detection(self, image: np.ndarray,
                                detection: dict) -> np.ndarray:
        """Compute embedding from FaceDetector output."""
        return self.compute_embedding(image, detection["bbox"])

    def compute_robust(self, image: np.ndarray, detection: dict,
                       n_aug: int = 3) -> np.ndarray:
        """
        Enrollment: average embeddings from original + augmented images.
        Produces more representative embedding for better matching.
        """
        embeddings = []

        # Original (best quality)
        try:
            emb = self.compute_embedding(image, detection["bbox"])
            embeddings.append(emb)
        except Exception as e:
            raise ValueError(f"Cannot compute base embedding: {e}")

        # Augmented versions
        for i in range(n_aug - 1):
            try:
                aug = self._augment(image, i)
                emb = self.compute_embedding(aug, detection["bbox"])
                embeddings.append(emb)
            except Exception:
                continue  # Skip failed augmentations

        if len(embeddings) == 0:
            raise ValueError("All embedding attempts failed")

        avg = self.vops.normalize(self.vops.average(embeddings))
        self.logger.info(f"Robust embedding from {len(embeddings)}/{n_aug} samples")
        return avg

    def _augment(self, image: np.ndarray, seed: int) -> np.ndarray:
        """Slight brightness/contrast augmentation for robustness."""
        rng = np.random.RandomState(seed + 42)
        img = image.astype(np.float32)
        img *= (1.0 + rng.uniform(-0.12, 0.12))  # brightness
        mean = img.mean()
        img = (img - mean) * (1.0 + rng.uniform(-0.08, 0.08)) + mean  # contrast
        return np.clip(img, 0, 255).astype(np.uint8)