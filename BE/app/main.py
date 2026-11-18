import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from app.core.config import settings
from app.db.session import engine, Base
import app.models.entities  # Ensure all SQLAlchemy models are registered
from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router
from app.api.v1.assets import router as assets_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.library import router as library_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.rag import router as rag_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION} [{settings.ENVIRONMENT}]")
    # For local development or testing with SQLite, create tables if they do not exist
    if settings.DATABASE_URL.startswith("sqlite"):
        logger.info("Initializing local SQLite database tables...")
        Base.metadata.create_all(bind=engine)
        try:
            with engine.connect() as conn:
                for table_name, table in Base.metadata.tables.items():
                    try:
                        res = conn.execute(text(f"PRAGMA table_info('{table_name}');")).fetchall()
                        existing_cols = {row[1] for row in res}
                    except Exception:
                        continue
                    for col in table.columns:
                        if col.name not in existing_cols:
                            try:
                                col_type = col.type.compile(engine.dialect)
                                logger.info(f"Aligning SQLite schema: ADD COLUMN {table_name}.{col.name} {col_type}")
                                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}"))
                                conn.commit()
                            except Exception as alter_err:
                                logger.debug(f"Column alignment skip for {table_name}.{col.name}: {alter_err}")
        except Exception as e:
            logger.debug(f"SQLite schema alignment: {e}")
    yield
    logger.info("Shutting down MediaMind backend.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend API for MediaMind personal media library",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail,
                "details": {}
            },
            "detail": exc.detail
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    logger.exception(f"Unhandled server error on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": str(exc),
                "details": {}
            },
            "detail": str(exc)
        }
    )

# Mount Routers
app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(assets_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(library_router, prefix="/api/v1")
app.include_router(reviews_router, prefix="/api/v1")
app.include_router(rag_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs_url": "/docs"
    }
