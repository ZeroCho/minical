# MiniCal

MiniCal is a small local booking service built with NestJS and SQLite. Visitors can create bookings from admin-defined available time slots, admins can review and update booking status, and Telegram notifications are mocked as append-only log lines.

## Stack

- NestJS
- SQLite at `data/minical.sqlite3`
- Plain HTML/CSS rendered by NestJS controllers
- Mock Telegram log at `logs/telegram_mock.log`

## Availability Flow

Admins open bookable times from `/admin`:

1. Log in with the admin password.
2. Pick a date.
3. Choose start time, end time, and interval.
4. Submit `가능 시간 추가`.

Visitors see a calendar on `/`. Dates with no remaining bookable slots are dimmed and disabled. Clicking an available date loads the remaining times for that date. A slot disappears from the public selector when it is inactive or already has a `pending` or `confirmed` booking.

## Install and Run

```powershell
npm install
npm run build
npm start
```

Default URL:

- Public booking page: `http://localhost:3000/`
- Admin page: `http://localhost:3000/admin`
- JSON API: `http://localhost:3000/api/bookings`

Default admin password:

```text
minical-admin
```

Change it before exposing the app on a VPS:

```powershell
$env:ADMIN_PASSWORD='change-this-password'
npm start
```

If port 3000 is busy:

```powershell
$env:PORT='3001'
npm start
```

For local development without a build step:

```powershell
npm run start:dev
```

## VPS Deployment Notes

This project is self-contained and can run on a small VPS with Node.js.

```bash
npm ci
npm run build
PORT=3000 npm start
```

For a persistent process, run it under `systemd`, PM2, or your VPS process manager. Put Nginx or Caddy in front if you want HTTPS and a public domain. Keep `data/` and `logs/` on persistent disk.

Set `ADMIN_PASSWORD` in the service environment before public deployment.

## Test Curl Commands

Create a booking:

```bash
curl -X POST http://localhost:3000/book \
  -H "Content-Type: application/json" \
  -d '{"name":"Curl Tester","contact":"curl@example.test","date":"2026-06-23","time":"16:02","note":"curl verification"}'
```

List bookings:

```bash
curl http://localhost:3000/api/bookings
```

List available public slots:

```bash
curl "http://localhost:3000/api/availability?date=2026-06-23"
```

List available public dates for a month:

```bash
curl "http://localhost:3000/api/availability/month?month=2026-06"
```

Create available admin slots:

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "password=minical-admin"

curl -b cookies.txt -X POST http://localhost:3000/admin/availability \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "date=2026-06-23&start_time=09:00&end_time=11:00&interval_minutes=30"
```

Confirm a booking:

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "password=minical-admin"

curl -b cookies.txt -X POST http://localhost:3000/admin/status \
  -H "Content-Type: application/json" \
  -d '{"booking_id":1,"status":"confirmed"}'
```

Check reminders:

```bash
curl -b cookies.txt http://localhost:3000/admin/reminders/check
```

Read mock Telegram logs:

```bash
cat logs/telegram_mock.log
```

## Admin Usage

Open `/admin` in a browser and enter the admin password. Use the availability panel to open or close bookable times by date. Bookings are shown newest first. Each row has a status selector with:

- `pending`
- `confirmed`
- `cancelled`

Choose a status and submit the row form. Status changes are saved to SQLite and logged to `logs/telegram_mock.log`.

## Reminder Check

Open or request:

```text
GET /admin/reminders/check
```

MiniCal finds `confirmed` bookings that start within the next 30 minutes and have no `reminded_at`. It writes mock reminder logs and updates `reminded_at` so the same booking is not logged repeatedly.

## Tests

```powershell
npm test
npm run build
```
