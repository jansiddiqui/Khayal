# Backups and restore (Voroa free tier)

The free Voroa database has no automatic backups you can rely on, so Khayal keeps its own:
a weekly dump of the whole database, made on your computer, kept for 8 weeks. Photos and
voice recordings live in the database (`KHAYAL_STORAGE=db`), so one dump holds everything.

Backups contain personal data of families and elders. Keep them on your own computer
(`data/` is never committed), and never share or upload them.

## One-time setup

The script uses the portable PostgreSQL 17 tools in `data/pgsql/` (gitignored), the same ones the
Postgres tests use. If that folder is missing:

1. Download the official "PostgreSQL 17 Windows x64 binaries" zip from EnterpriseDB
   (get.enterprisedb.com/postgresql/, file `postgresql-17.x-windows-x64-binaries.zip`, about 330 MB)
   into `data/downloads/`.
2. Unpack it so that `data/pgsql/bin/pg_dump.exe` exists (the zip's top folder is `pgsql`).

## Make a backup (weekly)

In PowerShell, from the repository folder:

```powershell
$env:KHAYAL_BACKUP_DATABASE_URL = "postgres://USER:PASS@HOST:PORT/DB?sslmode=require"
powershell -ExecutionPolicy Bypass -File scripts\backup-voroa.ps1
```

- Copy the address from Voroa: `khayal-db` → **Connection** → the **external** URL (your
  computer is outside Voroa's network). Setting it with `$env:` keeps it in this window only;
  it is never written to a file. Close the window afterwards.
- The script writes `data\backups\voroa\khayal-YYYY-MM-DD.dump`, prints its size, and keeps the
  newest 8 dumps (it deletes only older `khayal-*.dump` files in that folder).
- A good habit: same day every week, and once more before any big change (for example before
  merging a migration).

## Check a backup (restore it locally)

Do this now and then, so you know the backups work. It uses the throwaway local cluster in
`data/pgtest` and never touches the live database:

```powershell
$bin = "data\pgsql\bin"
& "$bin\pg_ctl.exe" -D data\pgtest -o "-p 55432 -c listen_addresses=127.0.0.1" -l data\pgtest.log -w start
& "$bin\createdb.exe" -h 127.0.0.1 -p 55432 -U khayal khayal_restore_check
& "$bin\pg_restore.exe" -h 127.0.0.1 -p 55432 -U khayal --no-owner -d khayal_restore_check data\backups\voroa\khayal-YYYY-MM-DD.dump
& "$bin\psql.exe" -h 127.0.0.1 -p 55432 -U khayal -d khayal_restore_check -c "SELECT count(*) FROM users"
& "$bin\dropdb.exe" -h 127.0.0.1 -p 55432 -U khayal khayal_restore_check
& "$bin\pg_ctl.exe" -D data\pgtest -m fast -w stop
```

If `data\pgtest` does not exist yet, create it once with
`& "$bin\initdb.exe" -D data\pgtest -U khayal -A trust -E UTF8 --locale=C` (it only listens on
127.0.0.1).

## Restore the live database (after data loss)

Only when the live data is lost or broken. It replaces what is in the database with the backup.

1. **Stop traffic:** in Voroa, suspend the `khayal-api` service, so nobody writes while you restore.
2. **Make a backup of the current state first** (even if broken), with the script above.
3. **Restore** (PowerShell, with the external URL in `$env:KHAYAL_BACKUP_DATABASE_URL`):

   ```powershell
   & "data\pgsql\bin\pg_restore.exe" --clean --if-exists --no-owner --no-privileges `
     --dbname "$env:KHAYAL_BACKUP_DATABASE_URL" data\backups\voroa\khayal-YYYY-MM-DD.dump
   ```

4. **Resume** the `khayal-api` service. Its pre-deploy step (`alembic upgrade head`) runs on the
   next deploy; if the backup is from before a migration, trigger a manual deploy so the schema is
   brought up to date.
5. Open `/api/health`, sign in, and check that the people and their recent sessions are there.
   Anything done after the backup was made is lost; tell the families affected.

If the database itself was deleted, create a new DB Nano in the **Mumbai** region, put its URL in
`KHAYAL_DATABASE_URL` on the backend, deploy once (the pre-deploy creates the tables), then restore
into it as above with `--clean --if-exists`.
