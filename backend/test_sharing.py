import re

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from models import Owner, ShareLink
from sharing import get_or_create_link, new_token, owner_for_token, revoke_link


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(Owner(name="Sam"))
        s.add(Owner(name="Alex"))
        s.commit()
        yield s


def test_tokens_are_long_url_safe_and_different_each_time():
    a, b = new_token(), new_token()
    assert a != b
    assert len(a) >= 20
    assert re.fullmatch(r"[A-Za-z0-9_-]+", a)


def test_creating_a_link_stores_one_row(session):
    link = get_or_create_link(session, 1)
    assert link.owner_id == 1 and link.token
    assert len(session.exec(select(ShareLink)).all()) == 1


def test_asking_again_returns_the_same_link(session):
    first = get_or_create_link(session, 1)
    second = get_or_create_link(session, 1)
    assert second.token == first.token
    assert len(session.exec(select(ShareLink)).all()) == 1


def test_different_owners_get_different_tokens(session):
    assert get_or_create_link(session, 1).token != get_or_create_link(session, 2).token


def test_a_token_finds_its_owner(session):
    link = get_or_create_link(session, 2)
    assert owner_for_token(session, link.token) == 2


def test_unknown_or_empty_tokens_find_nobody(session):
    get_or_create_link(session, 1)
    assert owner_for_token(session, "nope") is None
    assert owner_for_token(session, "") is None


def test_revoking_removes_the_link(session):
    link = get_or_create_link(session, 1)
    assert revoke_link(session, 1) is True
    assert owner_for_token(session, link.token) is None


def test_revoking_with_no_link_is_false(session):
    assert revoke_link(session, 1) is False


def test_revoking_one_owner_leaves_the_other(session):
    get_or_create_link(session, 1)
    other = get_or_create_link(session, 2)
    revoke_link(session, 1)
    assert owner_for_token(session, other.token) == 2


def test_a_new_link_after_revoking_has_a_new_token(session):
    old = get_or_create_link(session, 1).token
    revoke_link(session, 1)
    new = get_or_create_link(session, 1).token
    assert new != old
    assert owner_for_token(session, old) is None