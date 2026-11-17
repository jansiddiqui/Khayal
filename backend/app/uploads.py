"""Helpers for the raw-body upload routes (family photos, the elder's photo, voice recordings).

Those routes are `async` only to read the request body as it arrives. Everything else they do
(database queries, Pillow, the speech model, storage writes) is blocking, so it runs in the
thread pool through `blocking()`; the event loop stays free to serve other requests, which
matters on a 0.1-CPU server.
"""

from collections.abc import Callable
from typing import ParamSpec, TypeVar

from fastapi import HTTPException, Request, status
from starlette.concurrency import run_in_threadpool

P = ParamSpec("P")
T = TypeVar("T")


async def blocking(fn: Callable[P, T], *args: P.args, **kwargs: P.kwargs) -> T:
    """Run blocking work (database, image or audio processing) off the event loop."""
    return await run_in_threadpool(fn, *args, **kwargs)


def content_type(request: Request) -> str:
    return request.headers.get("content-type", "").split(";")[0].strip().lower()


async def read_body(request: Request, limit: int, too_big_message: str) -> bytes:
    """The request body, refused with 413 as soon as it is larger than `limit` bytes."""
    too_big = HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=too_big_message)
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        raise too_big
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise too_big
    return bytes(data)
