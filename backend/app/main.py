from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import ocr, exchange, settlements

# Create FastAPI app
app = FastAPI(
    title="Trip Splitter API",
    description="Backend API for the Trip Expense Splitter application",
    version="1.0.0",
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(ocr.router)
app.include_router(exchange.router)
app.include_router(settlements.router)


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy", "service": "trip-splitter-api"}


@app.get("/")
async def root() -> dict:
    """Root endpoint with API information."""
    return {
        "name": "Trip Splitter API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
