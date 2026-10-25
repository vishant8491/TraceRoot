import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from sqlalchemy import update

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.api.investigations_v2 import router as core_api_router
from app.exceptions import (
    TraceRootException,
    traceroot_exception_handler,
    validation_exception_handler,
    generic_exception_handler,
)

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("traceroot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan handler: manages DB connection pool, auto-generates schema,
    and cleans up any interrupted AI runs from previous server restarts.
    """
    logger.info("Initializing TraceRoot database connection...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Primary PostgreSQL database schema verified successfully.")
    except Exception as e:
        logger.warning(f"Could not connect to configured PostgreSQL instance ({e}). Activating SQLite local dev fallback.")
        from app.database import switch_to_sqlite_fallback
        fallback_engine = switch_to_sqlite_fallback()
        async with fallback_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Local fallback database schema initialized.")

    # Interrupted run recovery: mark any orphaned PENDING/RUNNING runs as FAILED
    try:
        from app.models.ai_run import AIRun
        async with AsyncSessionLocal() as session:
            stmt = (
                update(AIRun)
                .where(AIRun.status.in_(["PENDING", "RUNNING"]))
                .values(
                    status="FAILED",
                    failure_code="SERVER_RESTARTED_INTERRUPTED",
                    failure_message="Analysis execution was interrupted by server restart.",
                    finished_at=datetime.now(timezone.utc)
                )
            )
            res = await session.execute(stmt)
            if res.rowcount and res.rowcount > 0:
                logger.info(f"Reconciled {res.rowcount} interrupted AI run(s) from prior session.")
            await session.commit()
    except Exception as e:
        logger.warning(f"Note during startup interrupted run check: {e}")

    yield

    logger.info("Shutting down TraceRoot database connections...")
    await engine.dispose()


def create_application() -> FastAPI:
    """
    Factory function to initialize and configure the FastAPI application.
    Separates application initialization from runtime startup.
    """
    app = FastAPI(
        title=settings.APP_NAME,
        version="2.0.0",
        description="AI-assisted Root Cause Analysis workspace for pharmaceutical API manufacturing investigations with strict provenance and review contracts.",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Configure CORS
    origins = settings.CORS_ORIGINS
    if isinstance(origins, str):
        origins = [origins]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Central Error Handlers
    app.add_exception_handler(TraceRootException, traceroot_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    # Mount Core Contract Routes at /api and alias /api/v1
    app.include_router(core_api_router, prefix="/api")
    app.include_router(core_api_router, prefix="/api/v1")

    @app.get("/health", tags=["Health"])
    async def legacy_health():
        return {"status": "healthy", "service": "TraceRoot API", "version": "2.0.0"}

    return app


app = create_application()
