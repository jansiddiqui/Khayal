# Backups and restore (Voroa free tier)

The free Voroa database (`khayal-db`, DB Nano) has **no backups of its own** (dashboard backups
are for paid plans only), and it is **reachable only from apps inside the Voroa workspace**, so
it cannot be dumped from a laptop with `pg_dump`. Khayal therefore makes its own backup from
inside the backend: **Admin → Download full backup**.

Photos and voice recordings live in the database (`KHAYAL_STORAGE=db`), and the backup includes
every one of them, so one zip holds everything.

Backups contain personal data of families and elders. Keep them on your own computer (`data/`
is never committed), and never share or upload them anywhere else.

> **Before real families join, upgrade `khayal-db` to the Starter plan (₹299/month).** It adds
> automatic daily backups kept by Voroa. The weekly download below is a free safety net, not a
> replacement: it can lose up to a week of data, and it depends on someone remembering to do it.

## Make a backup (weekly)

1. Sign in to Khayal with an admin account (`KHAYAL_ADMIN_EMAILS`) and open **Admin**.
2. Under **Full backup**, click **Download full backup**. It may take a minute while the server
   packs everything; the file is named `khayal-backup-YYYY-MM-DD-HHMM.zip`.
3. Save it in this repository under `data\backups\voroa\`.
4. Keep the newest 8 and delete older ones by hand, one file at a time.

Same day every week, and once more before any big change (for example before merging a
migration, which Voroa's pre-deploy applies to the live database).

Limits: one backup per 10 minutes for the whole server (a second click shows "Try again a
little later"). Each backup is logged in the backend's logs as
`khayal.backup: Full backup downloaded by admin <id> (<email>): … tables, … rows, … files, … bytes, revision …`.

### What is in the zip

| Path | Contents |
|---|---|
| `manifest.json` | When and by whom it was made, the database's **migration revision** (Alembic), each table's row count and column types, and every stored file with its owner, type, size and SHA-256. |
| `tables/<table>.json` | Every row of every table (users, care links, game sessions and rounds, levels, reminders and logs, alerts, family, voice recordings, consents, devices, invites, …), as JSON. |
| `files/family/…`, `files/speech/…`, `files/profile/…` | Every family photo, elder photo and voice recording. |

## Check a backup

Now and then, open a backup and make sure it looks complete:

- Its size is in line with last week's (it grows with the pilot).
- `manifest.json` lists the tables with sensible row counts (for example `users`), and the
  number of `files` matches the photos and recordings you expect.

For a full check, do a restore drill on your laptop (it touches nothing online), from `backend\`:

```powershell
$env:KHAYAL_DATABASE_URL = "sqlite:///D:/B.Tech/Sem7/CSE471/Khayal/data/restore-drill.db"
$env:KHAYAL_STORAGE = "db"
.venv\Scripts\python -m alembic upgrade <revision from manifest.json>
.venv\Scripts\python -m app.restore_backup ..\data\backups\voroa\khayal-backup-2026-11-22-0930.zip
```

It ends with "Row counts and file checksums match the backup." Delete `data\restore-drill.db`
afterwards (one file). Close the window afterwards so the two variables do not stay set.

## Restore after data loss

`python -m app.restore_backup <zip>` restores a backup into an **empty** database. It refuses
to run unless:

- the target database is empty (no rows in any table, no stored files), and
- the target is at the **same migration revision** as the backup (`alembic_revision` in
  `manifest.json`).

It also checks every file's SHA-256 before writing anything. Then it inserts all tables in the
right order (parents before children) and all photos and recordings in one transaction, moves
the Postgres id counters past the restored ids, and finally compares row counts and file
checksums with the backup.

Because the Voroa database is reachable only from inside the workspace, the command has to run
there, on the `khayal-api` service, not on your laptop.

1. **Stop traffic:** in Voroa, suspend the `khayal-api` service, so nobody writes while you restore.
2. **A fresh, empty database:** create a new DB in the **Mumbai** region (Starter if you have
   upgraded), and put its URL in `KHAYAL_DATABASE_URL` on the backend. Keep the old database
   until the restore is checked.
3. **Create the tables:** trigger a manual deploy. The pre-deploy command
   (`alembic upgrade head`) creates every table, at the newest revision. If the backup is from
   before a newer migration, its revision differs; bring the empty database to the backup's
   revision first (`python -m alembic -c backend/alembic.ini downgrade <backup revision>`,
   harmless on an empty database), restore, then `upgrade head` again.
4. **Put the zip next to the backend:** open a shell on `khayal-api` in the Voroa dashboard and
   upload the backup zip into a temporary folder there (for example `/tmp/`).
5. **Restore**, in that shell, from the repository folder:

   ```
   cd backend && python -m app.restore_backup /tmp/khayal-backup-2026-11-22-0930.zip
   ```

   It prints the target (password hidden), then
   "Done. Row counts and file checksums match the backup." If it says **Refused**, nothing was
   written; fix what it names (not empty, other revision, damaged zip) and run it again.
6. Delete the zip from the shell's temporary folder, **resume** `khayal-api`, open
   `/api/health`, sign in, and check that the people and their recent sessions are there.
   Anything done after the backup was made is lost; tell the families affected.

## The script `scripts/backup-voroa.ps1`

Kept for other setups: **only for databases reachable from outside, with a matching `pg_dump`
version** (the portable tools in `data\pgsql\` are PostgreSQL 17). It does not work with the
current Voroa database. For a database it can reach, it reads the address from
`$env:KHAYAL_BACKUP_DATABASE_URL` (never stored in the repository), writes
`data\backups\voroa\khayal-YYYY-MM-DD.dump` and keeps the newest 8:

```powershell
$env:KHAYAL_BACKUP_DATABASE_URL = "postgres://USER:PASS@HOST:PORT/DB?sslmode=require"
powershell -ExecutionPolicy Bypass -File scripts\backup-voroa.ps1
```
