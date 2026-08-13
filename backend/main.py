import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kaizenpm")

from sqlalchemy import text

from config import settings
from database import engine, Base
from routers import auth, organizations, projects, tasks, habits, kaizen, time, otp, ikigai, invites, comments, search, email_otp, notifications, analytics, sprints

# Create database tables. This only creates tables that don't exist yet — it
# never alters an existing table, so a new column on an existing model (like
# Task) needs an explicit ALTER TABLE below as well.
Base.metadata.create_all(bind=engine)

# Column migrations for existing tables. SQLite's ALTER TABLE can only add a
# column, not detect whether one is already there, so each statement is tried
# and any failure (column already exists) is swallowed. Keep every migration
# for every feature in this one block rather than scattering ALTER TABLEs
# across the codebase.
with engine.connect() as conn:
    for stmt in [
        "ALTER TABLE tasks ADD COLUMN story_points INTEGER DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN start_date TIMESTAMP",
    ]:
        try:
            conn.execute(text(stmt))
            conn.commit()
        except Exception:
            pass  # column already exists

# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="KaizenPM - Multi-tenant Project & Habit Management API"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # The client is also served from ephemeral Cloudflare preview hosts during
    # tunnel rotation; allow those origins too.
    allow_origin_regex=r"https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "environment": settings.environment}

# Include routers
app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(habits.router)
app.include_router(kaizen.router)
app.include_router(time.router)
app.include_router(otp.router)
app.include_router(ikigai.router)
app.include_router(invites.router)
app.include_router(comments.router)
app.include_router(search.router)
app.include_router(email_otp.router)
app.include_router(notifications.router)
app.include_router(analytics.router)
app.include_router(sprints.router)

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "status": "running"
    }

# Error handlers
@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle unexpected exceptions.

    The traceback is always logged server-side; it is only echoed to the client
    outside production so that real failures stop disappearing silently.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    detail = "Internal server error"
    if settings.environment != "production":
        detail = f"{type(exc).__name__}: {exc}"
    return JSONResponse(status_code=500, content={"detail": detail})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
