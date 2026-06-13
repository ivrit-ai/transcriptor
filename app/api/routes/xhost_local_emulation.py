from typing import Annotated


from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse


from app.api.deps import get_current_user
from app.config import settings
from app.models.user import User

router = APIRouter()


@router.get("/whoami")
async def whoami(user: Annotated[User, Depends(get_current_user)]):
    """This is provided in prod by the hosting platform. Locally, we need this path to allow "dev_mode" to work.
    the get_current_user, in dev_mode will fake a test user which allows the client to assume a logged in state
    """

    return {
        "logged_in": True,
        "sub": user.google_sub,
        "email": user.email,
        "name": user.display_name,
    }


@router.get("/login")
async def login(
    return_to: str,
):
    """Take in a path like '/xhost-auth/login?return_to=/work' and redirect in dev_mode to '/work'"""
    if settings.dev_mode:
        return RedirectResponse(return_to)

    # this is invalid - we only emulate xhost-auth in dev_mode
    raise HTTPException(status_code=400, detail="Not implemented")


@router.get("/logout")
async def logout():
    """In local dev_mode - this is a noop"""
    if settings.dev_mode:
        return RedirectResponse("/")

    # this is invalid - we only emulate xhost-auth in dev_mode
    raise HTTPException(status_code=400, detail="Not implemented")
