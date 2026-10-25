import sys
import asyncio
import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

logger = logging.getLogger(__name__)

# On Windows, Psycopg / async sockets require WindowsSelectorEventLoopPolicy
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

# Base class for all declarative SQLAlchemy models
class Base(DeclarativeBase):
    pass


# Normalize connection string for async engine:
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql+psycopg://"):
    # If psycopg has proactor issues on windows, asyncpg provides seamless compatibility
    db_url = db_url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)

# SQLite fallback support for local machines where PostgreSQL daemon is not currently active
engine_kwargs = {"echo": settings.DEBUG}
if "sqlite" in db_url:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(db_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


def switch_to_sqlite_fallback():
    global engine, AsyncSessionLocal
    import os
    db_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "traceroot.db")).replace("\\", "/")
    fallback_url = f"sqlite+aiosqlite:///{db_file}"
    logger.warning(
        f"PostgreSQL connection offline or unreachable. "
        f"Switching active runtime session to '{fallback_url}'."
    )
    engine = create_async_engine(fallback_url, connect_args={"check_same_thread": False}, echo=settings.DEBUG)
    AsyncSessionLocal.configure(bind=engine)
    return engine


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an isolated async database session per request.
    Rolls back automatically if an unhandled exception occurs.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
