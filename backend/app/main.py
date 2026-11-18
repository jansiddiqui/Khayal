import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.background import start_background_tasks, mark_time
from app.db import ensure_schema_current
from app.services import system_state
from app.routes import admin, alerts, auth, caregiver, demo, family, feedback, memories, mood, games, health, internal, invites, me, patients, reminders, speech, trends


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
    mark_time(system_state.LAST_START)
    tasks = start_background_tasks()
    yield
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Khayal API",
        version="1.1.0",
        lifespan=lifespan,
        # No public API explorer in production.
        docs_url=None if config.IS_PRODUCTION else "/docs",
        redoc_url=None if config.IS_PRODUCTION else "/redoc",
        openapi_url=None if config.IS_PRODUCTION else "/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=False,  # bearer tokens, no cookies
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    for router in (
        health.router,
        auth.router,
        patients.router,
        games.router,
        reminders.router,
        alerts.router,
        family.router,
        speech.router,
        trends.router,
        demo.router,
        internal.router,
        invites.router,
        admin.router,
        me.router,
        caregiver.router,
        feedback.router,
        mood.router,
        memories.router,
    ):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
