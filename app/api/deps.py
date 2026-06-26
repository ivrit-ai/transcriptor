import logging
import traceback
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models.user import User
from app.services.consent import has_active_contribution_consent
from app.services.users import get_or_create_user

log = logging.getLogger(__name__)

_DEV_USER_SUB = "dev-user-001"
_DEV_USER_EMAIL = "dev@localhost"
_DEV_USER_NAME = "Dev User"


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:  # noqa: C901
    try:
        return _get_current_user(request, db)
    except HTTPException:
        raise
    except Exception:
        tb = traceback.format_exc()
        sub = request.headers.get("x-xhost-user-sub", "(missing)")
        email = request.headers.get("x-xhost-user-email", "(missing)")
        log.error("get_current_user crashed for sub=%s email=%s\n%s", sub, email, tb)
        try:
            from app.main import _recent_errors
            _recent_errors.append({"path": request.url.path, "sub": sub, "email": email, "traceback": tb})
            if len(_recent_errors) > 20:
                _recent_errors.pop(0)
        except Exception:
            pass
        raise


def _get_current_user(
    request: Request,
    db: Session,
) -> User:
    if settings.dev_mode:
        return get_or_create_user(
            db,
            google_sub=_DEV_USER_SUB,
            email=_DEV_USER_EMAIL,
            display_name=_DEV_USER_NAME,
        )
    sub = request.headers.get("x-xhost-user-sub")
    email = request.headers.get("x-xhost-user-email")
    name = request.headers.get("x-xhost-user-name") or email
    if not sub or not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return get_or_create_user(
        db,
        google_sub=sub,
        email=email,
        display_name=name,
    )


def _effective_role(user: User) -> str:
    """Return the effective role for a user.

    A user listed in ``settings.admin_emails`` is treated as an admin
    regardless of the role stored in the database.
    """
    if user.email in settings.admin_emails:
        return "admin"
    return user.role


def require_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if settings.dev_mode:
        return user
    if _effective_role(user) != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_curator(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Allow access to users with role 'curator' or 'admin'.

    Users listed in ``settings.admin_emails`` are also granted access as they
    are implicitly treated as admins.  In dev mode all users are allowed.
    """
    if settings.dev_mode:
        return user
    if _effective_role(user) not in ("curator", "admin"):
        raise HTTPException(status_code=403, detail="Curator access required")
    return user


def require_contribution_consent(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if settings.dev_mode:
        return user
    if not has_active_contribution_consent(db, user, settings.consent_version):
        raise HTTPException(status_code=403, detail="Contribution consent required")
    return user
