import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.background import start_background_tasks
from app.db import ensure_schema_current
from app.routes import alerts, auth, family, games, health, patients, reminders


def _setup_logging() -> None:
    """Show the app's own log lines (e.g. the background reminder check) next to uvicorn's."""
    logger = logging.getLogger("khayal")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    _setup_logging()
    ensure_schema_current()
    tasks = start_background_tasks()
    yield
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


def create_app() -> FastAPI:
    app = FastAPI(title="Khayal API", version="0.6.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in (
        health.router,
        auth.router,
        patients.router,
        games.router,
        reminders.router,
        alerts.router,
        family.router,
    ):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
