# MiniCal SQLite backup and restore

## What to back up

Back up the SQLite database files from `MINICAL_DATA_DIR`.

- `minical.sqlite3`
- `minical.sqlite3-wal`
- `minical.sqlite3-shm`

The `-wal` and `-shm` files may exist while the app is running. Keep them with the main database file when taking a filesystem backup.

## Manual backup

Run this from the repository root:

```powershell
.\scripts\backup-sqlite.ps1 -DataDir .\data -BackupDir .\backups
```

The script creates a timestamped folder and copies the database files into it.

## Restore rehearsal

1. Stop the app.
2. Copy the chosen backup files into a clean data directory.
3. Start the app with `MINICAL_DATA_DIR` pointing to that restored directory.
4. Open `/healthz`.
5. Log in as an admin and confirm stores, bookings, and availability slots are present.

Do this rehearsal before public launch and after any schema migration.

## Production notes

- Encrypt backups at rest.
- Store backups outside the application server.
- Limit access to operators who are allowed to handle customer data.
- Document retention periods for active backups and deleted customer data.
