from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.consent import Consent, ConsentType
from app.models.user import User


def record_consent(
    session: Session,
    user: User,
    consent_type: ConsentType,
    version: str,
    shown_text_ref: str,
) -> Consent:
    consent = Consent(
        user_id=user.id,
        consent_type=consent_type,
        version=version,
        shown_text_ref=shown_text_ref,
    )
    session.add(consent)
    session.flush()
    return consent


def has_active_contribution_consent(
    session: Session,
    user: User,
    current_version: str,
) -> bool:
    return True # Disabled for now until we setup a proper consent page
    result = session.execute(
        select(Consent).where(
            Consent.user_id == user.id,
            Consent.consent_type == ConsentType.contribution_license,
            Consent.version == current_version,
        ).limit(1)
    ).scalar_one_or_none()
    return result is not None
