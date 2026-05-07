"""
REST API for Face Recognition Attendance System.
Connects AI pipeline to your website backend.
"""

from pathlib import Path
import sys

# Fix import path
_project_root = str(Path(__file__).parent.parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
import traceback

from ai.config import PipelineConfig
from ai.pipeline import FaceRecognitionPipeline
from ai.utils.image_utils import ImageProcessor

# ── Initialize ──
config = PipelineConfig()
pipeline = FaceRecognitionPipeline(config)
ip = ImageProcessor()

app = FastAPI(
    title="Face Recognition Attendance API",
    description=(
        "Multi-stage pipeline:\n"
        "- Level 1: FaceNet 128-d Embedding\n"
        "- Level 2A: Anti-Spoofing (LBP + Blink + Color + Moiré)\n"
        "- Level 2B: Head Pose Check (±20°)\n"
        "- Level 3: Weighted Confidence Scoring (3-tier)"
    ),
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ──
class Base64Request(BaseModel):
    image: str
    person_id: Optional[str] = None
    person_name: Optional[str] = None


class Base64VideoRequest(BaseModel):
    frames: List[str]
    person_id: Optional[str] = None
    person_name: Optional[str] = None
    min_samples: Optional[int] = 3


# ── Global error handler ──
@app.exception_handler(Exception)
async def global_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": type(exc).__name__}
    )


# ── Endpoints ──

@app.get("/")
def root():
    return {
        "service": "Face Recognition Attendance API",
        "version": "1.0.0",
        "endpoints": {
            "health": "GET /health",
            "register_upload": "POST /register/upload",
            "register_base64": "POST /register/base64",
            "register_video": "POST /register/video",
            "verify_upload": "POST /verify/upload",
            "verify_base64": "POST /verify/base64",
            "verify_video": "POST /verify/video",
            "list_persons": "GET /persons",
            "delete_person": "DELETE /persons/{id}",
            "docs": "GET /docs"
        }
    }


@app.get("/health")
def health():
    return pipeline.status()


@app.post("/register/upload")
async def register_upload(
    file: UploadFile = File(...),
    person_id: str = Form(...),
    person_name: str = Form(...)
):
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(400, "Empty file uploaded")
        image = ip.load_from_bytes(contents)
        result = pipeline.register_face(image, person_id, person_name)
        if not result["success"]:
            raise HTTPException(400, detail=result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Registration failed: {str(e)}")


@app.post("/register/base64")
async def register_base64(req: Base64Request):
    if not req.person_id or not req.person_name:
        raise HTTPException(400, "person_id and person_name are required")
    try:
        image = ip.load_from_base64(req.image)
        result = pipeline.register_face(image, req.person_id, req.person_name)
        if not result["success"]:
            raise HTTPException(400, detail=result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Registration failed: {str(e)}")


@app.post("/register/video")
async def register_video(req: Base64VideoRequest):
    if not req.person_id or not req.person_name:
        raise HTTPException(400, "person_id and person_name are required")
    if not req.frames:
        raise HTTPException(400, "frames are required")
    try:
        images = [ip.load_from_base64(frame) for frame in req.frames[:8]]
        result = pipeline.register_faces_from_frames(
            images, req.person_id, req.person_name,
            min_samples=max(1, int(req.min_samples or 3))
        )
        if not result["success"]:
            raise HTTPException(400, detail=result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Video registration failed: {str(e)}")


@app.post("/verify/upload")
async def verify_upload(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(400, "Empty file uploaded")
        image = ip.load_from_bytes(contents)
        return pipeline.verify_face(image)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Verification failed: {str(e)}")


@app.post("/verify/base64")
async def verify_base64(req: Base64Request):
    try:
        image = ip.load_from_base64(req.image)
        return pipeline.verify_face(image)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Verification failed: {str(e)}")


@app.post("/verify/video")
async def verify_video(req: Base64VideoRequest):
    if not req.frames:
        raise HTTPException(400, "frames are required")
    try:
        images = [ip.load_from_base64(frame) for frame in req.frames[:12]]
        return pipeline.verify_faces_from_frames(images)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Video verification failed: {str(e)}")


@app.get("/persons")
def list_persons():
    persons = pipeline.list_persons()
    return {"persons": persons, "total": len(persons)}


@app.delete("/persons/{person_id}")
def delete_person(person_id: str):
    if pipeline.delete_person(person_id):
        return {"success": True, "deleted": person_id}
    raise HTTPException(404, f"Person {person_id} not found")


# ── Startup ──
if __name__ == "__main__":
    print()
    print("=" * 50)
    print("  FACE RECOGNITION ATTENDANCE API")
    print(f"  Server:  http://localhost:{config.API_PORT}")
    print(f"  Docs:    http://localhost:{config.API_PORT}/docs")
    print(f"  Health:  http://localhost:{config.API_PORT}/health")
    print("=" * 50)
    print()
    uvicorn.run(app, host=config.API_HOST, port=config.API_PORT)
