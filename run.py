import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ai.api.routes import app, config
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "run:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", config.API_PORT)),
        reload=False
    )