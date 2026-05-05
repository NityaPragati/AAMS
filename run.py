import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ai.api.routes import app, config
import uvicorn

if __name__ == "__main__":
    print("=" * 50)
    print("  AI FACE RECOGNITION SERVICE")
    print(f"  http://localhost:{config.API_PORT}")
    print(f"  Docs: http://localhost:{config.API_PORT}/docs")
    print("=" * 50)
    uvicorn.run(app, host=config.API_HOST, port=config.API_PORT)