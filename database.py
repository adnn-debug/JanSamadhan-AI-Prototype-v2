import os
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()


def enabled():
    return bool(DATABASE_URL)


@contextmanager
def connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database():
    if not enabled():
        return False
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    role TEXT,
                    name TEXT,
                    username TEXT,
                    email TEXT,
                    organisation TEXT,
                    status TEXT,
                    submitted_at TEXT,
                    reviewed_at TEXT,
                    data JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS challenges (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    category TEXT,
                    priority TEXT,
                    stage TEXT,
                    district TEXT,
                    location TEXT,
                    assigned_university TEXT,
                    updated_at_text TEXT,
                    data JSONB NOT NULL,
                    db_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS citizen_daily_limits (
                    day DATE NOT NULL,
                    citizen_hash TEXT NOT NULL,
                    count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (day, citizen_hash)
                )
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_accounts_role_status ON accounts(role, status)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_challenges_category ON challenges(category)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_challenges_priority ON challenges(priority)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_challenges_stage ON challenges(stage)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_challenges_district ON challenges(district)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_challenges_updated ON challenges(db_updated_at DESC)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_challenges_data_gin ON challenges USING GIN(data)")
    return True


def health():
    if not enabled():
        return {"enabled": False, "ok": False, "engine": "postgresql"}
    try:
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT current_database() AS database, version() AS version")
                row = cur.fetchone()
        return {
            "enabled": True,
            "ok": True,
            "engine": "postgresql",
            "database": row["database"],
            "version": row["version"].split(",")[0],
        }
    except Exception as exc:
        return {"enabled": True, "ok": False, "engine": "postgresql", "error": str(exc)[:240]}


def _priority(data):
    ai = data.get("ai") or {}
    return ai.get("priority") or data.get("priority") or "Normal"


def _get_payload(table, record_id):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT data FROM {table} WHERE id = %s", (record_id,))
            row = cur.fetchone()
    return dict(row["data"]) if row else None


def get_account(record_id):
    return _get_payload("accounts", record_id)


def get_challenge(record_id):
    return _get_payload("challenges", record_id)


def list_accounts():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT data FROM accounts ORDER BY updated_at DESC, id")
            return [dict(row["data"]) for row in cur.fetchall()]


def list_challenges():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT data FROM challenges ORDER BY db_updated_at DESC, id")
            return [dict(row["data"]) for row in cur.fetchall()]


def upsert_account(record_id, incoming, merge=True):
    incoming = dict(incoming or {})
    incoming["id"] = record_id
    if merge:
        existing = get_account(record_id) or {}
        existing.update(incoming)
        data = existing
    else:
        data = incoming
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO accounts
                    (id, role, name, username, email, organisation, status, submitted_at, reviewed_at, data, updated_at)
                VALUES
                    (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                ON CONFLICT (id) DO UPDATE SET
                    role=EXCLUDED.role,
                    name=EXCLUDED.name,
                    username=EXCLUDED.username,
                    email=EXCLUDED.email,
                    organisation=EXCLUDED.organisation,
                    status=EXCLUDED.status,
                    submitted_at=EXCLUDED.submitted_at,
                    reviewed_at=EXCLUDED.reviewed_at,
                    data=EXCLUDED.data,
                    updated_at=NOW()
                """,
                (
                    record_id,
                    data.get("role"),
                    data.get("name"),
                    data.get("username"),
                    data.get("email"),
                    data.get("organisation"),
                    data.get("status"),
                    data.get("submittedAt"),
                    data.get("reviewedAt"),
                    Jsonb(data),
                ),
            )
    return data


def upsert_challenge(record_id, incoming, merge=True):
    incoming = dict(incoming or {})
    incoming["id"] = record_id
    if merge:
        existing = get_challenge(record_id) or {}
        existing.update(incoming)
        data = existing
    else:
        data = incoming
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO challenges
                    (id, title, category, priority, stage, district, location, assigned_university, updated_at_text, data, db_updated_at)
                VALUES
                    (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                ON CONFLICT (id) DO UPDATE SET
                    title=EXCLUDED.title,
                    category=EXCLUDED.category,
                    priority=EXCLUDED.priority,
                    stage=EXCLUDED.stage,
                    district=EXCLUDED.district,
                    location=EXCLUDED.location,
                    assigned_university=EXCLUDED.assigned_university,
                    updated_at_text=EXCLUDED.updated_at_text,
                    data=EXCLUDED.data,
                    db_updated_at=NOW()
                """,
                (
                    record_id,
                    data.get("title"),
                    data.get("category"),
                    _priority(data),
                    data.get("stage"),
                    data.get("district"),
                    data.get("location"),
                    data.get("assignedUniversity"),
                    data.get("updatedAt"),
                    Jsonb(data),
                ),
            )
    return data


def seed_data(accounts, challenges, force=False):
    accounts = list(accounts or [])
    challenges = list(challenges or [])
    with connection() as conn:
        with conn.cursor() as cur:
            if force:
                cur.execute("DELETE FROM citizen_daily_limits")
                cur.execute("DELETE FROM accounts")
                cur.execute("DELETE FROM challenges")
            else:
                cur.execute("SELECT (SELECT COUNT(*) FROM accounts) AS a, (SELECT COUNT(*) FROM challenges) AS c")
                counts = cur.fetchone()
                if counts["a"] or counts["c"]:
                    return {"seeded": False, "reason": "database-not-empty", "accounts": counts["a"], "challenges": counts["c"]}

    for account in accounts:
        record_id = str(account.get("id") or "").strip()
        if record_id:
            upsert_account(record_id, account, merge=False)
    for challenge in challenges:
        record_id = str(challenge.get("id") or "").strip()
        if record_id:
            upsert_challenge(record_id, challenge, merge=False)
    return {"seeded": True, "accounts": len(accounts), "challenges": len(challenges)}


def reserve_daily_limit(day, citizen_hash, limit=10):
    limit = max(1, min(int(limit or 10), 100))
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO citizen_daily_limits(day, citizen_hash, count, updated_at)
                VALUES (%s, %s, 1, NOW())
                ON CONFLICT (day, citizen_hash) DO UPDATE SET
                    count = citizen_daily_limits.count + 1,
                    updated_at = NOW()
                WHERE citizen_daily_limits.count < %s
                RETURNING count
                """,
                (day, citizen_hash, limit),
            )
            row = cur.fetchone()
            if row:
                count = int(row["count"])
                return {"ok": True, "count": count, "remaining": max(0, limit - count), "mode": "postgresql"}
            cur.execute(
                "SELECT count FROM citizen_daily_limits WHERE day=%s AND citizen_hash=%s",
                (day, citizen_hash),
            )
            row = cur.fetchone()
            count = int(row["count"]) if row else limit
            return {"ok": False, "count": count, "remaining": 0, "mode": "postgresql"}
