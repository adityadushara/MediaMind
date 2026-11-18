import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

logger = logging.getLogger(__name__)

# Handle SQLite vs PostgreSQL specific connect args
connect_args = {}
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

try:
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        connect_args=connect_args
    )
except Exception as e:
    if settings.ENVIRONMENT == "production":
        logger.error(f"FATAL: Database connection failed in production: {e}")
        raise
    logger.warning(f"Failed to connect using DATABASE_URL={settings.DATABASE_URL}. Fallback to sqlite for dev/testing: {e}")
    engine = create_engine("sqlite:///./mediamind_dev.db", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
