import logging
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.common import HealthResponse
from app.core.config import settings
from app.adapters.storage import get_storage_adapter

router = APIRouter(tags=["Health"])
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse)
def get_health(db: Session = Depends(get_db)):
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = f"unhealthy: {str(e)}"

    storage_status = "connected"
    try:
        adapter = get_storage_adapter()
        storage_status = f"ready ({adapter.__class__.__name__})"
    except Exception as e:
        logger.error(f"Storage health check failed: {e}")
        storage_status = f"unhealthy: {str(e)}"

    overall_status = "healthy" if db_status == "connected" else "degraded"

    return HealthResponse(
        status=overall_status,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        database=db_status,
        storage=storage_status
    )
