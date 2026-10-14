#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$#" -eq 1 || { echo 'Usage: scripts/restore.sh data/backups/scum-....db'; exit 2; }
# Compose API must be stopped before restoring the file and its WAL sidecars.
docker compose stop api
python3 - "$1" "${DB_PATH:-data/db/scum.db}" <<'PY'
from contextlib import closing
import sqlite3, sys, datetime, os, stat
from pathlib import Path
src, dst = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
if src == dst: raise SystemExit('Backup and database must differ')
with closing(sqlite3.connect(src.as_uri() + '?mode=ro', uri=True)) as backup:
    if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise SystemExit('Invalid backup')
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        safety = Path('data/backups') / ('pre-restore-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.db')
        safety.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(dst)) as current, closing(sqlite3.connect(safety)) as copy: current.backup(copy)
    temporary = dst.with_suffix('.restore.tmp')
    with closing(sqlite3.connect(temporary)) as restored: backup.backup(restored)
    if dst.exists():
        previous = dst.stat()
        os.chmod(temporary, stat.S_IMODE(previous.st_mode))
        if hasattr(os, "chown"): os.chown(temporary, previous.st_uid, previous.st_gid)
for suffix in ('-wal', '-shm'): Path(str(dst) + suffix).unlink(missing_ok=True)
temporary.replace(dst)
print('Restore complete; previous database preserved in data/backups')
PY
docker compose start api
