from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


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
    user = User(google_sub=google_sub, email=email, display_name=display_name)
    session.add(user)
    session.flush()
    return user
