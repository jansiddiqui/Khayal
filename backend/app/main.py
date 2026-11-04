from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.db import init_db
from app.routes import alerts, auth, games, health, patients, reminders


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Khayal API", version="0.5.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in (health.router, auth.router, patients.router, games.router, reminders.router, alerts.router):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
