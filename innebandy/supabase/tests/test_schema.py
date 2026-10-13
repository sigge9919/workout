"""Schema, RLS and trigger tests against a local Postgres.

Run: ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost/postgres pytest supabase/tests
The database is recreated for each test session.
"""

import json
import os
import pathlib
import uuid

import psycopg
import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
ADMIN_URL = os.environ.get("ADMIN_DATABASE_URL", "postgresql://postgres:postgres@localhost/postgres")
DB_NAME = os.environ.get("TEST_DB_NAME", "innebandy_test")


@pytest.fixture(scope="session")
def db_url():
    try:
        admin = psycopg.connect(ADMIN_URL, autocommit=True, connect_timeout=3)
    except psycopg.OperationalError as e:
        pytest.skip(f"no Postgres at ADMIN_DATABASE_URL: {e}")
    with admin as conn:
        conn.execute(f'drop database if exists "{DB_NAME}" with (force)')
        conn.execute(f'create database "{DB_NAME}"')
    url = ADMIN_URL.rsplit("/", 1)[0] + "/" + DB_NAME
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute((ROOT / "tests" / "local_bootstrap.sql").read_text())
        for f in sorted((ROOT / "migrations").glob("*.sql")):
            conn.execute(f.read_text())
    return url


@pytest.fixture
def conn(db_url):
    with psycopg.connect(db_url) as c:
        yield c
        c.rollback()


def new_user(conn, email=None):
    uid = uuid.uuid4()
    conn.execute("insert into auth.users (id, email) values (%s, %s)", (uid, email or f"{uid}@test"))
    return uid


def act_as(conn, uid):
    conn.execute("reset role")
    conn.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(uid)}),))
    conn.execute("set local role authenticated")


def as_admin(conn):
    conn.execute("reset role")


def setup_team(conn, name="IBK Test"):
    """Create a user + team with a match and a video. Returns ids."""
    as_admin(conn)
    uid = new_user(conn)
    act_as(conn, uid)
    team = conn.execute("select public.create_team(%s)", (name,)).fetchone()[0]
    match = conn.execute(
        "insert into matches (team_id) values (%s) returning id", (team,)
    ).fetchone()[0]
    video = conn.execute(
        "insert into videos (team_id, match_id, duration_s) values (%s, %s, 3600) returning id",
        (team, match),
    ).fetchone()[0]
    return {"user": uid, "team": team, "match": match, "video": video}


def event_type(conn, team, key):
    return conn.execute(
        "select id from event_types where team_id = %s and key = %s", (team, key)
    ).fetchone()[0]


def add_event(conn, t, key="turnover", t_s=100, **cols):
    et = event_type(conn, t["team"], key)
    names = ["team_id", "match_id", "video_id", "event_type_id", "video_t", *cols.keys()]
    vals = [t["team"], t["match"], t["video"], et, t_s, *cols.values()]
    q = f"insert into events ({', '.join(names)}) values ({', '.join(['%s'] * len(vals))}) returning id"
    return conn.execute(q, vals).fetchone()[0]


def test_create_team_seeds_defaults(conn):
    t = setup_team(conn)
    keys = {r[0] for r in conn.execute("select key from event_types where team_id = %s", (t["team"],))}
    assert {"shot", "takeaway", "turnover", "zone_entry", "breakout", "counter", "faceoff",
            "penalty", "goalie_action", "note"} <= keys
    role = conn.execute(
        "select role from team_members where team_id = %s and user_id = %s", (t["team"], t["user"])
    ).fetchone()[0]
    assert role == "owner"


def test_rls_isolates_teams(conn):
    a = setup_team(conn, "A")
    add_event(conn, a)
    b = setup_team(conn, "B")
    # User B sees nothing of team A.
    assert conn.execute("select count(*) from events where team_id = %s", (a["team"],)).fetchone()[0] == 0
    assert conn.execute("select count(*) from matches where team_id = %s", (a["team"],)).fetchone()[0] == 0
    assert conn.execute("select count(*) from teams").fetchone()[0] == 1
    # And cannot write into team A.
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("insert into matches (team_id) values (%s)", (a["team"],))


def test_cross_team_reference_rejected(conn):
    a = setup_team(conn, "A")
    b = setup_team(conn, "B")
    # User B tries to attach an event in their own team to team A's video.
    et = event_type(conn, b["team"], "shot")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute(
            "insert into events (team_id, match_id, video_id, event_type_id, video_t) values (%s,%s,%s,%s,10)",
            (b["team"], b["match"], a["video"], et),
        )


def test_player_role_is_read_only(conn):
    t = setup_team(conn)
    as_admin(conn)
    p = new_user(conn)
    conn.execute("insert into team_members (team_id, user_id, role) values (%s, %s, 'player')", (t["team"], p))
    act_as(conn, p)
    assert conn.execute("select count(*) from matches").fetchone()[0] == 1
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("insert into matches (team_id) values (%s)", (t["team"],))


def test_event_creates_clip_with_presets_and_clamps(conn):
    t = setup_team(conn)
    # Default: 5 s before / 5 s after.
    e = add_event(conn, t, "turnover", 100)
    assert conn.execute("select start_s, end_s from clips where event_id = %s", (e,)).fetchone() == (95, 105)
    # Per-type preset: shot has 10 s before.
    e = add_event(conn, t, "shot", 100)
    assert conn.execute("select start_s, end_s from clips where event_id = %s", (e,)).fetchone() == (90, 105)
    # Video start edge.
    e = add_event(conn, t, "turnover", 2)
    assert conn.execute("select start_s, end_s from clips where event_id = %s", (e,)).fetchone() == (0, 7)
    # Video end edge (duration 3600).
    e = add_event(conn, t, "turnover", 3598)
    assert conn.execute("select start_s, end_s from clips where event_id = %s", (e,)).fetchone() == (3593, 3600)


def test_clip_follows_event_unless_adjusted(conn):
    t = setup_team(conn)
    e = add_event(conn, t, "turnover", 100)
    conn.execute("update events set video_t = 200 where id = %s", (e,))
    assert conn.execute("select start_s, end_s from clips where event_id = %s", (e,)).fetchone() == (195, 205)
    conn.execute("update clips set start_s = 180, is_adjusted = true where event_id = %s", (e,))
    conn.execute("update events set video_t = 300 where id = %s", (e,))
    assert conn.execute("select start_s, end_s from clips where event_id = %s", (e,)).fetchone() == (180, 205)


def test_reapply_presets(conn):
    t = setup_team(conn)
    e1 = add_event(conn, t, "turnover", 100)
    e2 = add_event(conn, t, "turnover", 200)
    conn.execute("update clips set start_s = 150, is_adjusted = true where event_id = %s", (e2,))
    conn.execute("update team_settings set clip_pre_s = 8 where team_id = %s", (t["team"],))
    n = conn.execute("select reapply_clip_presets(%s)", (t["team"],)).fetchone()[0]
    assert n == 1
    assert conn.execute("select start_s from clips where event_id = %s", (e1,)).fetchone()[0] == 92
    assert conn.execute("select start_s from clips where event_id = %s", (e2,)).fetchone()[0] == 150


def test_context_autofill_clock_state_and_on_ice(conn):
    t = setup_team(conn)
    tm, v = t["team"], t["video"]
    players = [
        conn.execute("insert into players (team_id, name, jersey_number) values (%s, %s, %s) returning id",
                     (tm, f"P{i}", i)).fetchone()[0]
        for i in range(1, 12)
    ]
    goalie = players[10]
    l1 = conn.execute("insert into lines (team_id, match_id, name, hotkey) values (%s,%s,'Femma 1','1') returning id",
                      (tm, t["match"])).fetchone()[0]
    l2 = conn.execute("insert into lines (team_id, match_id, name, hotkey) values (%s,%s,'Femma 2','2') returning id",
                      (tm, t["match"])).fetchone()[0]
    for p in players[:5]:
        conn.execute("insert into line_members (line_id, player_id, team_id) values (%s,%s,%s)", (l1, p, tm))
    for p in players[5:10]:
        conn.execute("insert into line_members (line_id, player_id, team_id) values (%s,%s,%s)", (l2, p, tm))

    # Period 1 starts at video 60 s; clock stopped at 300 s video showing 3:00.
    conn.execute("insert into clock_anchors (team_id, video_id, video_t, period, clock_s, kind) values (%s,%s,60,1,0,'period_start')", (tm, v))
    conn.execute("insert into clock_anchors (team_id, video_id, video_t, period, clock_s) values (%s,%s,400,1,180)", (tm, v))
    conn.execute("insert into goalie_changes (team_id, video_id, video_t, player_id) values (%s,%s,60,%s)", (tm, v, goalie))
    conn.execute("insert into line_changes (team_id, video_id, video_t, line_id) values (%s,%s,60,%s)", (tm, v, l1))
    conn.execute("insert into line_changes (team_id, video_id, video_t, line_id) values (%s,%s,150,%s)", (tm, v, l2))
    conn.execute("insert into game_state_changes (team_id, video_id, video_t, own_skaters, opp_skaters) values (%s,%s,200,5,4)", (tm, v))

    e1 = add_event(conn, t, "turnover", 100)
    e2 = add_event(conn, t, "turnover", 260)
    e3 = add_event(conn, t, "turnover", 380)

    r = conn.execute("select period, clock_s, game_state from v_events where id = %s", (e1,)).fetchone()
    assert r == (1, 40, "5v5")
    r = conn.execute("select period, clock_s, game_state from v_events where id = %s", (e2,)).fetchone()
    assert r == (1, 180, "pp")  # clock capped by next anchor (stoppage in between)
    on1 = {r[0] for r in conn.execute("select player_id from event_on_ice where event_id = %s", (e1,))}
    on2 = {r[0] for r in conn.execute("select player_id from event_on_ice where event_id = %s", (e2,))}
    assert on1 == set(players[:5]) | {goalie}
    assert on2 == set(players[5:10]) | {goalie}

    # Inserting a line change before e3 after the fact re-derives its snapshot.
    conn.execute("insert into line_changes (team_id, video_id, video_t, line_id) values (%s,%s,370,%s)", (tm, v, l1))
    on3 = {r[0] for r in conn.execute("select player_id from event_on_ice where event_id = %s", (e3,))}
    assert on3 == set(players[:5]) | {goalie}

    # Line shifts view derives intervals.
    shifts = conn.execute(
        "select line_id, start_t, end_t from v_line_shifts where video_id = %s order by start_t", (v,)
    ).fetchall()
    assert [(s[1], s[2]) for s in shifts] == [(60, 150), (150, 370), (370, 3600)]


def test_job_token_flow(conn):
    t = setup_team(conn)
    job_id, token = conn.execute("select * from create_job(%s, 'transcode')", (t["video"],)).fetchone()
    # Workers authenticate with the job token, not a user session.
    conn.execute("reset role")
    conn.execute("set local role anon")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("select job_report(%s, 'wrong', 'running')", (job_id,))
    conn.rollback()


def test_job_report_updates_video(conn):
    t = setup_team(conn)
    job_id, token = conn.execute("select * from create_job(%s, 'transcode')", (t["video"],)).fetchone()
    conn.execute("reset role")
    conn.execute("set local role anon")
    conn.execute("select job_report(%s, %s, 'running', 0.1)", (job_id, token))
    result = {"proxy_key": "p.mp4", "poster_key": "p.jpg", "duration_s": 120.5, "fps": 25, "width": 1920, "height": 1080}
    conn.execute("select job_report(%s, %s, 'succeeded', 1, null, %s)", (job_id, token, json.dumps(result)))
    act_as(conn, t["user"])
    r = conn.execute("select status, proxy_key, duration_s, fps from videos where id = %s", (t["video"],)).fetchone()
    assert r == ("ready", "p.mp4", 120.5, 25)
    # Token hash is not readable by members.
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("select token_hash from job_secrets")
    conn.rollback()
    act_as(conn, t["user"])
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("select token_hash from jobs")


def _ready_match(conn, t, played_at, with_original=True):
    m = conn.execute("insert into matches (team_id, played_at) values (%s, %s) returning id",
                     (t["team"], played_at)).fetchone()[0]
    v = conn.execute(
        "insert into videos (team_id, match_id, status, original_key, proxy_key, duration_s) "
        "values (%s, %s, 'ready', %s, 'p.mp4', 60) returning id",
        (t["team"], m, f"teams/{t['team']}/videos/x/original.mp4" if with_original else None),
    ).fetchone()[0]
    return m, v


def _cleanup(conn, t, keep):
    conn.execute("update team_settings set keep_originals = %s where team_id = %s", (keep, t["team"]))
    job_id, token = conn.execute("select * from create_job(%s, 'transcode')", (t["video"],)).fetchone()
    conn.execute("reset role")
    conn.execute("set local role anon")
    rows = conn.execute("select kind, video_id, key from job_storage_cleanup(%s, %s)", (job_id, token)).fetchall()
    return job_id, token, rows


def test_retention_keeps_originals_of_recent_matches(conn):
    t = setup_team(conn)
    old = [_ready_match(conn, t, f"2026-0{i}-01") for i in range(1, 5)]  # 4 matches Jan-Apr
    job_id, token, rows = _cleanup(conn, t, 2)
    originals = {r[1] for r in rows if r[0] == "original"}
    # The 2 most recent ready matches (Mar, Apr) keep originals; Jan, Feb are purged.
    assert originals == {old[0][1], old[1][1]}

    conn.execute("select job_storage_cleanup_done(%s, %s, %s, '{}')", (job_id, token, list(originals)))
    act_as(conn, t["user"])
    r = conn.execute("select original_key, original_deleted_at is not null from videos where id = %s",
                     (old[0][1],)).fetchone()
    assert r == (None, True)


def test_retention_null_keeps_everything(conn):
    t = setup_team(conn)
    _ready_match(conn, t, "2026-01-01")
    _, _, rows = _cleanup(conn, t, None)
    assert [r for r in rows if r[0] == "original"] == []


def test_deleted_video_files_become_garbage(conn):
    t = setup_team(conn)
    m, v = _ready_match(conn, t, "2026-01-01")
    conn.execute("delete from matches where id = %s", (m,))
    _, _, rows = _cleanup(conn, t, None)
    assert ("prefix", None, f"teams/{t['team']}/videos/{v}/") in rows


def test_cleanup_requires_valid_token(conn):
    t = setup_team(conn)
    job_id, _ = conn.execute("select * from create_job(%s, 'transcode')", (t["video"],)).fetchone()
    conn.execute("reset role")
    conn.execute("set local role anon")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("select * from job_storage_cleanup(%s, 'wrong')", (job_id,))
