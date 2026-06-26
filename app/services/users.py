import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User

log = logging.getLogger(__name__)


def get_or_create_user(
    session: Session,
    google_sub: str,
    email: str,
    display_name: str,
) -> User:
    user = session.execute(
        select(User).where(User.google_sub == google_sub)
    ).scalar_one_or_none()
    if user is not None:
        return user
    try:
        user = User(google_sub=google_sub, email=email, display_name=display_name)
        session.add(user)
        session.flush()
        log.info("created user %s (%s)", email, google_sub)
        return user
    except IntegrityError:
        # Two concurrent requests raced to create the same user — re-fetch.
        session.rollback()
        log.warning("get_or_create_user race condition for %s — re-fetching", email)
        return session.execute(
            select(User).where(User.google_sub == google_sub)
        ).scalar_one()
