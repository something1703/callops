#!/usr/bin/env python3
"""
archive_call_events.py — CallOps Phase 4 Archival Lambda

Moves call_events rows older than ARCHIVE_AFTER_DAYS from Postgres into
Parquet files in S3, then deletes the archived rows from Postgres.

This keeps Neon's operational DB lean while preserving every event permanently
in S3 as columnar Parquet — queryable later via DuckDB or Athena if needed.

Usage (local / manual):
    source venv/bin/activate
    python archive_call_events.py [--dry-run] [--days 90]

Environment variables (same as ingest_clean.py):
    DATABASE_URL, CALLS_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

Lambda handler:
    handler = archive_call_events.lambda_handler
    Schedule: EventBridge cron(0 2 1 * ? *)  → 02:00 UTC on the 1st of each month
"""

import argparse
import io
import json
import logging
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Load .env for local dev
def _load_env():
    env_paths = [
        Path(__file__).parent.parent / "backend" / ".env",
        Path(__file__).parent / ".env",
        Path(__file__).parent.parent / ".env",
    ]
    for p in env_paths:
        if p.exists():
            for line in p.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    os.environ.setdefault(k.strip(), v.strip())
            break

_load_env()

import boto3
import psycopg2
import psycopg2.extras

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    HAS_PYARROW = True
except ImportError:
    HAS_PYARROW = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("archive_call_events")

# ── Config ────────────────────────────────────────────────────────────────────

def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise EnvironmentError("DATABASE_URL is not set")
    return url

def get_calls_bucket() -> str:
    bucket = os.environ.get("CALLS_BUCKET", "")
    if not bucket:
        raise EnvironmentError("CALLS_BUCKET is not set")
    return bucket

def get_aws_region() -> str:
    return os.environ.get("AWS_REGION", "ap-south-1")

ARCHIVE_AFTER_DAYS_DEFAULT = 90


# ── Core logic ─────────────────────────────────────────────────────────────────

def run_archive(dry_run: bool = False, archive_after_days: int = ARCHIVE_AFTER_DAYS_DEFAULT):
    if not HAS_PYARROW:
        log.error("pyarrow is not installed. Run: pip install pyarrow")
        sys.exit(1)

    cutoff = datetime.now(timezone.utc) - timedelta(days=archive_after_days)
    log.info(f"Archiving call_events older than {cutoff.isoformat()} (dry_run={dry_run})")

    conn = psycopg2.connect(get_database_url())
    s3 = boto3.client(
        "s3",
        region_name=get_aws_region(),
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )
    bucket = get_calls_bucket()

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Fetch rows to archive
            cur.execute(
                """
                SELECT id, call_id, contact_id, agent_id, state,
                       event_timestamp, ring_duration_seconds, talk_duration_seconds,
                       recording_s3_key, created_at
                FROM call_events
                WHERE event_timestamp < %s
                ORDER BY event_timestamp
                """,
                (cutoff,),
            )
            rows = cur.fetchall()

        if not rows:
            log.info("No rows to archive.")
            return {"archived": 0, "dry_run": dry_run}

        log.info(f"Found {len(rows)} rows to archive.")

        # Group by calendar month for separate Parquet files
        months: dict[str, list[dict]] = {}
        for row in rows:
            ts = row["event_timestamp"]
            if isinstance(ts, datetime):
                month_key = ts.strftime("%Y-%m")
            else:
                month_key = str(ts)[:7]
            months.setdefault(month_key, []).append(dict(row))

        archived_ids = []

        for month_key, month_rows in months.items():
            s3_key = f"archive/{month_key}/call_events.parquet"
            log.info(f"  Month {month_key}: {len(month_rows)} rows → s3://{bucket}/{s3_key}")

            if dry_run:
                log.info(f"  [DRY RUN] Would write {len(month_rows)} rows to {s3_key}")
                archived_ids.extend(r["id"] for r in month_rows)
                continue

            # Build Parquet bytes
            table = _rows_to_arrow_table(month_rows)
            buf = io.BytesIO()
            pq.write_table(table, buf, compression="snappy")
            buf.seek(0)

            # Upload (overwrites if same month is re-run — safe because S3 versioning is on)
            s3.put_object(
                Bucket=bucket,
                Key=s3_key,
                Body=buf.read(),
                ContentType="application/octet-stream",
            )
            log.info(f"  ✅ Uploaded {s3_key}")
            archived_ids.extend(r["id"] for r in month_rows)

        if dry_run:
            log.info(f"[DRY RUN] Would delete {len(archived_ids)} rows from Postgres.")
            return {"archived": len(archived_ids), "dry_run": True}

        # Delete from Postgres only after all S3 writes confirmed
        if archived_ids:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM call_events WHERE id = ANY(%s)",
                    (archived_ids,),
                )
                deleted = cur.rowcount
            conn.commit()
            log.info(f"Deleted {deleted} rows from call_events.")

        return {"archived": len(archived_ids), "dry_run": False}

    except Exception as e:
        conn.rollback()
        log.error(f"Archive failed: {e}", exc_info=True)
        raise
    finally:
        conn.close()


def _rows_to_arrow_table(rows: list[dict]) -> "pa.Table":
    """Convert list of dicts (from psycopg2 RealDictCursor) to a PyArrow table."""
    import pyarrow as pa

    cols: dict[str, list] = {
        "id": [], "call_id": [], "contact_id": [], "agent_id": [],
        "state": [], "event_timestamp": [], "ring_duration_seconds": [],
        "talk_duration_seconds": [], "recording_s3_key": [], "created_at": [],
    }
    for r in rows:
        for k in cols:
            cols[k].append(r.get(k))

    schema = pa.schema([
        ("id", pa.string()),
        ("call_id", pa.string()),
        ("contact_id", pa.string()),
        ("agent_id", pa.string()),
        ("state", pa.string()),
        ("event_timestamp", pa.timestamp("us", tz="UTC")),
        ("ring_duration_seconds", pa.int32()),
        ("talk_duration_seconds", pa.int32()),
        ("recording_s3_key", pa.string()),
        ("created_at", pa.timestamp("us", tz="UTC")),
    ])

    arrays = []
    for field in schema:
        col = cols[field.name]
        arrays.append(pa.array(col, type=field.type))

    return pa.table(dict(zip([f.name for f in schema], arrays)), schema=schema)


# ── Lambda handler ─────────────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    """AWS Lambda entrypoint. EventBridge passes event={} on schedule."""
    dry_run = event.get("dry_run", False)
    days = int(event.get("archive_after_days", ARCHIVE_AFTER_DAYS_DEFAULT))
    result = run_archive(dry_run=dry_run, archive_after_days=days)
    return {"statusCode": 200, "body": json.dumps(result)}


# ── CLI ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Archive old call_events to S3 Parquet")
    parser.add_argument("--dry-run", action="store_true", help="Log what would happen without writing")
    parser.add_argument("--days", type=int, default=ARCHIVE_AFTER_DAYS_DEFAULT,
                        help=f"Archive rows older than this many days (default: {ARCHIVE_AFTER_DAYS_DEFAULT})")
    args = parser.parse_args()

    result = run_archive(dry_run=args.dry_run, archive_after_days=args.days)
    log.info(f"Archive complete: {result}")
