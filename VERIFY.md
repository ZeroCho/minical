# MiniCal Verification

Verification date: 2026-06-23

## Automated Tests

Command:

```powershell
npm test
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

Command:

```powershell
npm run build
```

Result: TypeScript build passed.

## Manual Server Verification

Port 3000 was already in use, so the verification server ran on port 3001:

```powershell
$env:PORT='3001'
node dist/main.js
```

Server started successfully at:

```text
http://localhost:3001
```

The server was started with:

```powershell
$env:ADMIN_PASSWORD='minical-admin'
```

## Curl Verification

### POST /book

Created a booking with JSON. Response included:

```json
{
  "ok": true,
  "booking": {
    "id": 1,
    "name": "Curl Tester",
    "contact": "curl@example.test",
    "date": "2026-06-23",
    "time": "16:02",
    "note": "curl verification",
    "status": "pending"
  }
}
```

### GET /api/bookings

Returned the created booking in the booking list with `status: "pending"`.

### POST /admin/status

Unauthenticated access to `/admin` rendered the `관리자 로그인` page. Logging in through `POST /admin/login` returned `302` and set the admin cookie.

Created availability slots for `2026-06-24` from `09:00` to `11:00` at 30-minute intervals. `GET /api/availability?date=2026-06-24` returned:

```text
09:00,09:30,10:00,10:30
```

Created a booking for `09:30`. A second `GET /api/availability?date=2026-06-24` returned:

```text
09:00,10:00,10:30
```

This confirms booked `pending` slots are hidden from visitors.

`GET /api/availability/month?month=2026-06` was covered by automated tests. It returns only dates that still have at least one bookable slot, which drives the public calendar disabled/enabled states.

Changed a booking to `confirmed` with the admin cookie. Response included:

```json
{
  "ok": true,
  "booking": {
    "id": 1,
    "status": "confirmed"
  }
}
```

### GET /admin/reminders/check

First check returned one reminder:

```json
{
  "ok": true,
  "reminded_count": 1
}
```

Second check returned zero reminders, confirming `reminded_at` prevents duplicate reminder logs:

```json
{
  "ok": true,
  "reminded_count": 0,
  "reminded": []
}
```

## Mock Telegram Log

`logs/telegram_mock.log` contained:

```text
[2026-06-23 15:42:59] NEW_BOOKING name=Curl Tester contact=curl@example.test datetime=2026-06-23 16:02
[2026-06-23 15:43:16] STATUS_CHANGED id=1 status=confirmed
[2026-06-23 15:43:28] REMINDER booking_id=1 name=Curl Tester datetime=2026-06-23 16:02
```

## Screenshots

Playwright screenshot capture succeeded. The public screenshot shows the visible booking calendar with unavailable dates dimmed and available dates selectable. The admin screenshot was captured with an authenticated storage state and shows the availability management panel.

- `screenshots/public_booking.png`
- `screenshots/admin_bookings.png`
