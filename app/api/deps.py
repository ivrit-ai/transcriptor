from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models.user import User
from app.services.consent import has_active_contribution_consent
from app.services.users import get_or_create_user

_DEV_USER_SUB = "dev-user-001"
_DEV_USER_EMAIL = "dev@localhost"
_DEV_USER_NAME = "Dev User"

_XHOST_COOKIE = "__Host-xhost_id"
_XHOST_JWKS_URL = "https://auth.xhostd.com/xhost-auth/jwks"
_XHOST_ISSUER = "https://auth.xhostd.com"

_jwks_client = PyJWKClient(_XHOST_JWKS_URL, cache_keys=True)


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if settings.dev_mode:
        return get_or_create_user(
            db,
            google_sub=_DEV_USER_SUB,
            email=_DEV_USER_EMAIL,
            display_name=_DEV_USER_NAME,
        )
    cookie = request.cookies.get(_XHOST_COOKIE)
    if not cookie:
        raise HTTPException(status_code=401, detail="Not authenticated")
    host = request.url.hostname or ""
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(cookie)
        claims = jwt.decode(
            cookie,
            signing_key.key,
            algorithms=["RS256"],
            issuer=_XHOST_ISSUER,
            audience=host,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    sub = claims.get("sub")
    email = claims.get("email")
    name = claims.get("name") or email
    if not sub or not email:
        raise HTTPException(status_code=401, detail="Incomplete token claims")
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
