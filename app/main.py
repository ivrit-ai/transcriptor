from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    admin,
    community,
    consent,
    leaderboard,
    progress,
    session,
    transcription,
    xhost_local_emulation,
)
from app.config import settings
from app.storage import LOCAL_IMAGES_SERVE_ROOT_PATH

app = FastAPI(title="Transcriptor")

if settings.dev_mode:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

_data_dir = Path(settings.local_data_dir)
if _data_dir.exists():
    print(f"Serving images from {_data_dir.absolute()}")
    app.mount(
        f"/{LOCAL_IMAGES_SERVE_ROOT_PATH}",
        StaticFiles(directory=str(_data_dir)),
        name="images",
    )

app.include_router(community.router, prefix="/api")
app.include_router(session.router, prefix="/api")
app.include_router(transcription.router, prefix="/api")
app.include_router(consent.router, prefix="/api")
app.include_router(progress.router, prefix="/api")
app.include_router(leaderboard.router, prefix="/api")
app.include_router(admin.router, prefix="/api/admin")
if settings.dev_mode:
    app.include_router(xhost_local_emulation.router, prefix="/xhost-auth")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount(
        "/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets"
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        candidate = _frontend_dist / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_frontend_dist / "index.html"))
