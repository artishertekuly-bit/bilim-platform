from pathlib import Path
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
DIST_DIR = BASE_DIR / "dist"
ASSETS_DIR = DIST_DIR / "assets"
INDEX_FILE = DIST_DIR / "index.html"
ENV_FILES = [BASE_DIR / ".env", BACKEND_DIR / ".env"]

for env_file in ENV_FILES:
    if env_file.exists():
        load_dotenv(env_file, override=False)

app = FastAPI(title="Bilim Platform Local Server", version="1.3.1")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

if ASSETS_DIR.exists() and ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.get("/api/health")
def health():
    env_present = any(ef.exists() for ef in ENV_FILES)
    return {
        "status": "ok",
        "project_root": str(BASE_DIR),
        "frontend_dist_present": DIST_DIR.exists(),
        "frontend_index_present": INDEX_FILE.exists(),
        "frontend_assets_present": ASSETS_DIR.exists(),
        "env_file_present": env_present,
        "supabase_url_present": bool(os.getenv("VITE_SUPABASE_URL")),
        "supabase_key_present": bool(os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY")),
        "ai_api_base_url_present": bool(os.getenv("VITE_AI_API_BASE_URL")),
    }


@app.get("/api/config-check")
def config_check():
    missing = []
    env_present = any(ef.exists() for ef in ENV_FILES)

    if not env_present:
        missing.append(".env")
    if not os.getenv("VITE_SUPABASE_URL"):
        missing.append("VITE_SUPABASE_URL")
    if not os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY"):
        missing.append("VITE_SUPABASE_PUBLISHABLE_KEY")
    if not os.getenv("VITE_AI_API_BASE_URL"):
        missing.append("VITE_AI_API_BASE_URL")
    if not DIST_DIR.exists():
        missing.append("dist/")
    if not INDEX_FILE.exists():
        missing.append("dist/index.html")

    return JSONResponse(
        {
            "project_root": str(BASE_DIR),
            "dist_dir": str(DIST_DIR),
            "assets_dir": str(ASSETS_DIR),
            "env_files_checked": [str(ef) for ef in ENV_FILES],
            "missing": missing,
        }
    )


@app.get("/")
def root():
    if not DIST_DIR.exists():
        raise HTTPException(
            status_code=503,
            detail="Frontend build табылмады. Алдымен npm run build орындаңыз.",
        )

    if not INDEX_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="dist/index.html табылмады. Алдымен npm run build орындаңыз.",
        )

    return FileResponse(INDEX_FILE)


@app.get("/{full_path:path}")
def spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint табылмады.")

    if not DIST_DIR.exists():
        raise HTTPException(
            status_code=503,
            detail="Frontend build табылмады. Алдымен npm run build орындаңыз.",
        )

    if full_path:
        try:
            resolved_dist = DIST_DIR.resolve()
            resolved_target = (DIST_DIR / full_path).resolve()
            if (
                resolved_target.is_relative_to(resolved_dist)
                and resolved_target.exists()
                and resolved_target.is_file()
            ):
                return FileResponse(resolved_target)
        except (ValueError, RuntimeError):
            pass

    if not INDEX_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="dist/index.html табылмады. Алдымен npm run build орындаңыз.",
        )

    return FileResponse(INDEX_FILE)