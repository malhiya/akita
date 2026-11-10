import secrets

from sqlmodel import Session, select

from models import ShareLink


def new_token() -> str:
    """Unguessable, URL-safe (about 22 characters)."""
    return secrets.token_urlsafe(16)


def get_or_create_link(session: Session, owner_id: int) -> ShareLink:
    """One link per owner: asking again returns the same one."""
    link = session.exec(select(ShareLink).where(ShareLink.owner_id == owner_id)).first()
    if link is None:
        link = ShareLink(owner_id=owner_id, token=new_token())
        session.add(link)
        session.commit()
        session.refresh(link)
    return link


def revoke_link(session: Session, owner_id: int) -> bool:
    """Delete the owner's link. True if there was one."""
    link = session.exec(select(ShareLink).where(ShareLink.owner_id == owner_id)).first()
    if link is None:
        return False
    session.delete(link)
    session.commit()
    return True


def owner_for_token(session: Session, token: str) -> int | None:
    """Which owner does this token belong to? None if unknown or revoked."""
    if not token:
        return None
    link = session.exec(select(ShareLink).where(ShareLink.token == token)).first()
    return link.owner_id if link else None