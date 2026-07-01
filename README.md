# MiniCal

MiniCal is a small booking service built with NestJS and SQLite. Visitors can create bookings from store-defined available time slots, store owners can review and update their own bookings, the platform owner can view all stores from one dashboard, and Telegram notifications are mocked as append-only log lines.

## Stack

- NestJS
- SQLite at `data/minical.sqlite3`
- Plain HTML/CSS rendered by NestJS controllers
- Mock Telegram log at `logs/telegram_mock.log`

## Availability Flow

Store owners open bookable times from `/<store>/admin`, for example `/matjib/admin`:

1. Log in with the admin password.
2. Pick a date from the visible admin calendar.
3. Choose start time, end time, and interval.
4. Submit `가능 시간 추가`.

Admins can also copy one date's slots to another date from the slots panel. Pick the source date in the admin calendar, enter the target date under `복사할 날짜`, then submit `현재 날짜 슬롯 복사`.

Visitors see a service landing page on `/`, then choose a store from `/stores` or use a store-specific booking page such as `/main` or `/matjib`. Dates with no remaining bookable slots are dimmed and disabled. Clicking an available date loads the remaining times for that date. A slot disappears from the public selector when it is inactive or already has a `pending` or `confirmed` booking.

## Multi-Store Flow

New stores sign up from `/signup`. A store id becomes the public booking subpath and owner admin subpath:

- Store id `matjib`
- Public booking page: `/matjib`
- Store owner admin page: `/matjib/admin`

The platform owner uses `/admin` for the site-wide dashboard. That dashboard shows store information, reservations, and slots across stores. Existing root API routes such as `/book` and `/api/availability` continue to use the built-in `main` store for backward compatibility; the public booking UI for that store is available at `/main`.

## Install and Run

```powershell
npm install
npm run build
npm start
```

Default URL:

- Landing page: `http://localhost:3000/`
- Store list page: `http://localhost:3000/stores`
- Built-in main store booking page: `http://localhost:3000/main`
- Store signup page: `http://localhost:3000/signup`
- Platform admin dashboard: `http://localhost:3000/admin`
- Example store booking page: `http://localhost:3000/matjib`
- Example store owner admin page: `http://localhost:3000/matjib/admin`
- JSON API: `http://localhost:3000/api/bookings`

Default platform admin password:

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

Set `ADMIN_PASSWORD` in the service environment before public deployment. Store owner passwords are created during `/signup` and currently stored in SQLite for this MVP.

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

Copy one date's slots to another date:

```bash
curl -b cookies.txt -X POST http://localhost:3000/admin/availability/copy \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "source_date=2026-06-23&target_date=2026-06-24"
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
