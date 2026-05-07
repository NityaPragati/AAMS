import os
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path


@dataclass
class PipelineConfig:
    """
    Central configuration for the multi-stage face recognition pipeline.
    """

    # ── Directories ──
    BASE_DIR: str = str(Path(__file__).parent)
    REGISTERED_FACES_DIR: str = str(Path(__file__).parent / "data" / "registered_faces")

    # ── Level 1: Face Detection (MediaPipe) ──
    FACE_DETECTION_CONFIDENCE: float = 0.5
    MAX_FACES_PER_FRAME: int = 5

    # ── Level 1: Face Recognition (DeepFace → FaceNet) ──
    RECOGNITION_MODEL: str = "Facenet"
    # Webcam frames are noisier than controlled ID photos. Keep this strict enough
    # for one-to-one classroom use, but realistic for live browser video.
    COSINE_SIMILARITY_THRESHOLD: float = 0.58
    EMBEDDING_DIMENSION: int = 128
    FACE_INPUT_SIZE: tuple = (160, 160)

    # ── Level 2A: Liveness / Anti-Spoofing ──
    LIVENESS_THRESHOLD: float = 0.48
    LIVENESS_TEXTURE_ANALYSIS: bool = True
    LIVENESS_BLINK_DETECTION: bool = False
    EAR_THRESHOLD: float = 0.21
    LBP_RADIUS: int = 3
    LBP_POINTS: int = 24
    LAPLACIAN_VARIANCE_THRESHOLD: float = 25.0
    MIN_VIDEO_SEQUENCE_FRAMES: int = 5
    MIN_VIDEO_LIVE_FRAMES: int = 2
    VIDEO_EAR_DELTA_THRESHOLD: float = 0.028
    VIDEO_NOSE_DELTA_THRESHOLD: float = 0.06
    VIDEO_MOUTH_DELTA_THRESHOLD: float = 0.06
    VIDEO_ROLL_DELTA_THRESHOLD: float = 6.0

    # ── Level 2B: Pose Estimation ──
    POSE_YAW_LIMIT: float = 30.0
    POSE_PITCH_LIMIT: float = 30.0
    POSE_ROLL_LIMIT: float = 30.0

    # ── Level 3: Confidence Scoring ──
    PENDING_REVIEW_THRESHOLD: float = 0.48
    APPROVED_CONFIDENCE_THRESHOLD: float = 0.63
    HIGH_CONFIDENCE_THRESHOLD: float = 0.75
    DETECTION_WEIGHT: float = 0.15
    RECOGNITION_WEIGHT: float = 0.65
    LIVENESS_WEIGHT: float = 0.20

    # ── Logging ──
    LOG_LEVEL: str = "INFO"
    LOG_FILE: Optional[str] = str(Path(__file__).parent / "logs" / "pipeline.log")

    # ── API ──
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8001
    CORS_ORIGINS: list = field(default_factory=lambda: [
        "http://localhost:3000", "http://localhost:8000",
        "http://localhost:5173", "http://127.0.0.1:3000",
        "http://127.0.0.1:8000", "http://127.0.0.1:5173"
    ])

    def __post_init__(self):
        os.makedirs(self.REGISTERED_FACES_DIR, exist_ok=True)
        if self.LOG_FILE:
            os.makedirs(str(Path(self.LOG_FILE).parent), exist_ok=True)

        env_path = Path(self.BASE_DIR) / ".env"
        if env_path.exists():
            try:
                from dotenv import load_dotenv
                load_dotenv(env_path)
                port = os.getenv("AI_API_PORT")
                if port:
                    self.API_PORT = int(port)
                model = os.getenv("AI_RECOGNITION_MODEL")
                if model:
                    self.RECOGNITION_MODEL = model
            except ImportError:
                pass

    def validate(self) -> dict:
        checks = {"data_dir": os.path.isdir(self.REGISTERED_FACES_DIR)}
        for lib in ["cv2", "mediapipe", "deepface", "scipy", "skimage", "fastapi"]:
            try:
                __import__(lib)
                checks[lib] = True
            except ImportError:
                checks[lib] = False
        return checks
