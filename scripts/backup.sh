#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - "${DB_PATH:-data/db/scum.db}" "${BACKUP_DIR:-data/backups}" <<'PY'
from contextlib import closing
import sqlite3, sys, datetime
from pathlib import Path
import shutil, os
source, destination = Path(sys.argv[1]), Path(sys.argv[2])
if not source.is_file(): raise SystemExit('Database missing; backup skipped')
destination.mkdir(parents=True, exist_ok=True)
name = destination / ('scum-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.db')
with closing(sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)) as src, closing(sqlite3.connect(name)) as dst:
    src.backup(dst)
    if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise SystemExit('Backup integrity failed')
key = Path('data/.datakey')
if key.is_file():
    keycopy = Path(str(name) + '.datakey')
    shutil.copyfile(key, keycopy)
    os.chmod(keycopy, 0o600)
for old in sorted(destination.glob('scum-*.db'), reverse=True)[30:]:
    old.unlink()
    Path(str(old) + '.datakey').unlink(missing_ok=True)
print('SQLite online backup complete; latest 30 scheduled backups retained')
PY
