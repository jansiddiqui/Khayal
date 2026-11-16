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

## The restore command

`python -m app.restore_backup <zip>` restores a backup into an **empty** database. It refuses
to run unless:

- the target database is empty (no rows in any table, no stored files), and
- the target is at the **same migration revision** as the backup (`alembic_revision` in
  `manifest.json`).

It also checks every file's SHA-256 before writing anything. Then it inserts all tables in the
right order (parents before children) and all photos and recordings in one transaction, moves
the Postgres id counters past the restored ids, and finally compares row counts and file
checksums with the backup.

## Restore into Voroa

The Voroa database is reachable only from inside the workspace, so the command runs **inside
the `khayal-api` container**, reached with Voroa's **SSH Access** (free tier: key-only login,
a shell inside the running container). Your laptop only copies the zip in.

In the commands below, `<service-user>` is the SSH user shown in Voroa → `khayal-api` →
**SSH Access**. It is personal to your workspace: never write it into this repository.

### Once: an SSH key

In PowerShell on your laptop:

```powershell
ssh-keygen -t ed25519 -C "khayal-voroa"
```

Press Enter for the default file (`C:\Users\<you>\.ssh\id_ed25519`) and choose a passphrase.
Then open the **public** key, `C:\Users\<you>\.ssh\id_ed25519.pub` (one line starting with
`ssh-ed25519`), and paste it in Voroa → `khayal-api` → **SSH Access** → **Add key**. Never share
or upload the private key (the file without `.pub`). Test it:

```powershell
ssh -p 2222 <service-user>@ssh.getvoroa.com
```

You land in a shell inside the running container; type `exit` to leave.

### The restore

1. **Stop traffic:** in Voroa, suspend the **`khayal-web`** service (the website), so no family
   uses the app while you restore. Keep **`khayal-api` running**: SSH needs its container.
2. **A fresh, empty database:** create a new DB in the **Mumbai** region (Starter if you have
   upgraded), and put its URL in `KHAYAL_DATABASE_URL` on `khayal-api`. Keep the old database
   until the restore is checked.
3. **Create the tables:** trigger a manual deploy of `khayal-api`. The pre-deploy command
   (`alembic upgrade head`) creates every table at the newest revision. Wait until the deploy
   is live: a redeploy replaces the container, and anything copied in before it is lost.
4. **Copy the zip in**, from the repository folder on your laptop (PowerShell):

   ```powershell
   scp -P 2222 data\backups\voroa\khayal-backup-2026-11-22-0930.zip <service-user>@ssh.getvoroa.com:/tmp/khayal-backup.zip
   ```

   Note the capital `-P` for scp (ssh uses a small `-p`). `/tmp` is not on a persistent disk,
   which is what you want: the copy disappears on the next redeploy at the latest.

   **If scp is refused** (some SSH gateways allow a shell but not file copies), send the file
   through a plain SSH connection instead. Use **Git Bash**, not PowerShell (PowerShell can
   damage binary data in a pipe):

   ```bash
   ssh -p 2222 <service-user>@ssh.getvoroa.com 'cat > /tmp/khayal-backup.zip' < data/backups/voroa/khayal-backup-2026-11-22-0930.zip
   ```

   Either way, check that the copy is complete: `Get-FileHash <the zip>` on your laptop (PowerShell)
   and `sha256sum /tmp/khayal-backup.zip` in the SSH shell must show the same hash (ignore
   upper/lower case). The restore checks every file inside the zip too, and refuses a damaged one.
5. **Restore**, in the SSH shell (`ssh -p 2222 <service-user>@ssh.getvoroa.com`):

   ```
   ls                                  # shows backend/ and frontend/; otherwise cd to the app folder
   test -n "$KHAYAL_DATABASE_URL$DATABASE_URL" && echo "database set" || echo "MISSING"
   cd backend
   python -m app.restore_backup /tmp/khayal-backup.zip
   ```

   If the second line prints `MISSING`, the shell does not have the service's environment
   variables: stop and do not restore (it would fill a throwaway SQLite file in the container
   instead). The command prints the target with the password hidden: it must be the new
   Postgres database, with file storage `db`. It ends with
   "Done. Row counts and file checksums match the backup." If it says **Refused**, nothing was
   written; fix what it names and run it again:
   - *other migration revision* (the backup is older than the deployed code): on this empty
     database run `python -m alembic downgrade <backup revision>` (from `backend/`, harmless on
     an empty database), restore, then `python -m alembic upgrade head`;
   - *not empty*: someone used the app; start again from step 2 with a new database;
   - *damaged zip*: copy it in again (step 4), or use an older backup.
6. **Delete the zip** in the SSH shell, then leave:

   ```
   rm /tmp/khayal-backup.zip
   exit
   ```

7. **Resume** `khayal-web`, open `/api/health`, sign in, and check that the people and their
   recent sessions are there. Anything done after the backup was made is lost; tell the
   families affected. When everything looks right, delete the old database in Voroa.

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
