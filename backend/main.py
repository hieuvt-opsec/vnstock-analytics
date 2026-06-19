import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure UTF-8 output encoding to prevent Windows console UnicodeEncodeError/charmap issues
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
from api.endpoints import router as api_router

app = FastAPI(
    title="Vietnamese Stock Market Analysis API",
    description="API cho ứng dụng phân tích thị trường chứng khoán Việt Nam sử dụng FastAPI và vnstock.",
    version="1.0.0"
)

# Configure CORS to allow frontend connections
# In production, specify actual allowed origins instead of ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the API router
app.include_router(api_router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Vietnamese Stock Market Analysis Boilerplate API is running.",
        "documentation": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
