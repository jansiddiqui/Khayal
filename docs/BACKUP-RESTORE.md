# Backups and restore (Voroa free tier)

Khayal keeps a weekly backup of the whole pilot database, saved on your own computer and kept
for 8 weeks. Photos and voice recordings live in the database (`KHAYAL_STORAGE=db`), so one
backup holds everything.

The Voroa database (`khayal-db`) is **reachable only from apps inside the Voroa workspace** and
runs **PostgreSQL 18**, so it cannot be backed up from a laptop with `pg_dump`. Backups are
taken from Voroa's dashboard instead.

Backups contain personal data of families and elders. Keep them on your own computer (`data/`
is never committed), and never share or upload them anywhere else.

## Make a backup (weekly)

1. Voroa dashboard → **`khayal-db`** → **Backups**.
2. Download the most recent backup (if there is none from today, create one there first).
3. Save it in this repository under `data\backups\voroa\`, named with the date, for example
   `data\backups\voroa\khayal-2026-11-22.<extension Voroa gives it>`.
4. Keep the newest 8 and delete older ones by hand, one file at a time.

Same day every week, and once more before any big change (for example before merging a
migration, which Voroa's pre-deploy applies to the live database).

## Check a backup

Now and then, make sure a downloaded backup is complete and readable:

- The file is not tiny (with the demo data gone, expect at least tens of kilobytes; it grows
  with the pilot) and its size is in line with last week's.
- To look inside it, you need PostgreSQL **18** client tools: the portable PostgreSQL 17 tools
  in `data\pgsql\` cannot read a version 18 backup. With version 18 tools installed, a custom-format
  backup restores into a throwaway local database with `pg_restore --no-owner -d <local database> <file>`;
  then check a few row counts (`users`, `game_sessions`). Never restore into the live database to "test".

## Restore the live database (after data loss)

Only when the live data is lost or broken; it replaces what is in the database.

1. **Stop traffic:** in Voroa, suspend the `khayal-api` service, so nobody writes while you restore.
2. **Keep the current state:** take one more backup in the dashboard, even if the data looks broken.
3. **Restore** the chosen backup from Voroa's dashboard (`khayal-db` → **Backups**). Because the
   database is reachable only from inside the workspace, the restore has to happen there, not
   from your laptop. If the dashboard does not offer a restore for that backup, ask Voroa support
   how to restore it into `khayal-db`.
4. **Resume** the `khayal-api` service. If the backup is from before a migration, trigger a manual
   deploy: its pre-deploy step (`alembic upgrade head`) brings the schema up to date.
5. Open `/api/health`, sign in, and check that the people and their recent sessions are there.
   Anything done after the backup was made is lost; tell the families affected.

If the database itself was deleted, create a new DB Nano in the **Mumbai** region, put its URL in
`KHAYAL_DATABASE_URL` on the backend, deploy once (the pre-deploy creates the tables), then restore
into it as above.

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
