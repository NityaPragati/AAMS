"""
Quick liveness debug — run against a test image.
Usage:
  ./venv/Scripts/python.exe debug_liveness.py <image_path>
  ./venv/Scripts/python.exe debug_liveness.py  (uses webcam capture)
"""
import sys
import numpy as np
import cv2
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ai.models.liveness_detector import LivenessDetector
from ai.models.face_detector import FaceDetector
from ai.config import PipelineConfig

config = PipelineConfig()
ld = LivenessDetector(config)
fd = FaceDetector(config)

if len(sys.argv) > 1:
    img = cv2.imread(sys.argv[1])
    if img is None:
        print(f"ERROR: cannot read {sys.argv[1]}")
        sys.exit(1)
    print(f"Loaded: {sys.argv[1]} | shape={img.shape}")
else:
    print("Opening webcam... press SPACE to capture, ESC to exit")
    cap = cv2.VideoCapture(0)
    img = None
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        cv2.imshow("webcam", frame)
        k = cv2.waitKey(30) & 0xFF
        if k == 32:          # SPACE
            img = frame.copy()
            break
        if k == 27:          # ESC
            break
    cap.release()
    cv2.destroyAllWindows()
    if img is None:
        print("No image captured")
        sys.exit(0)

# Detect face
det = fd.detect_single_face(img)
if not det:
    print("NO FACE DETECTED")
    sys.exit(1)

print(f"Face detected | confidence={det['detection_confidence']:.3f} | bbox={det['bbox']}")

# Run liveness check
result = ld.check(img, det['landmarks'], det['bbox'])
print("\n=== LIVENESS RESULT ===")
for k, v in result.items():
    if isinstance(v, float):
        print(f"  {k:30s}: {v:.4f}")
    else:
        print(f"  {k:30s}: {v}")
print(f"\nis_live = {result['is_live']}")
print(f"liveness_score = {result.get('liveness_score', 'N/A')}")
