import { AvailabilitySlotView, Booking, BookingStatus } from "./booking.types";

const statuses: BookingStatus[] = ["pending", "confirmed", "cancelled"];

export function renderPublicPage(message?: string) {
  return page(
    "MiniCal 예약",
    `<main class="shell public-shell">
      <section class="intro">
        <p class="eyebrow">MiniCal</p>
        <h1>작은 팀을 위한 빠른 예약 접수</h1>
        <p class="lede">고객 예약을 받고, 관리자가 상태를 바꾸고, 리마인더 mock 로그까지 한 번에 확인합니다.</p>
        <div class="status-strip">
          <span>SQLite 저장</span>
          <span>Mock Telegram</span>
          <span>VPS ready</span>
        </div>
      </section>
      <section class="booking-panel" aria-label="예약 입력">
        <div class="panel-head">
          <p class="eyebrow">New booking</p>
          <h2>예약 정보</h2>
        </div>
        ${message ? `<div class="notice" role="status">${escapeHtml(message)}</div>` : ""}
        <form method="post" action="/book" class="booking-form">
          <label>이름 <input name="name" autocomplete="name" required placeholder="홍길동"></label>
          <label>연락처 <input name="contact" autocomplete="tel" required placeholder="010-0000-0000"></label>
          <input type="hidden" name="date" id="booking-date" required>
          <div class="calendar-card" aria-label="예약 가능 날짜 달력">
            <div class="calendar-head">
              <button type="button" class="ghost-button" id="calendar-prev" aria-label="이전 달">‹</button>
              <strong id="calendar-title"></strong>
              <button type="button" class="ghost-button" id="calendar-next" aria-label="다음 달">›</button>
            </div>
            <div class="calendar-weekdays" aria-hidden="true">
              <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
            </div>
            <div class="calendar-grid" id="calendar-grid"></div>
          </div>
          <label>예약 시간
            <select name="time" id="booking-time" required>
              <option value="">날짜를 선택하세요</option>
            </select>
          </label>
          <p class="slot-help" id="slot-help">관리자가 열어둔 시간만 예약할 수 있습니다.</p>
          <label>메모 <textarea name="note" rows="4" placeholder="요청사항을 적어주세요"></textarea></label>
          <button type="submit">예약 생성</button>
        </form>
        <a class="admin-link" href="/admin">관리자 페이지 열기</a>
      </section>
    </main>
    <script>
      const dateInput = document.querySelector("#booking-date");
      const timeSelect = document.querySelector("#booking-time");
      const slotHelp = document.querySelector("#slot-help");
      const grid = document.querySelector("#calendar-grid");
      const title = document.querySelector("#calendar-title");
      const prev = document.querySelector("#calendar-prev");
      const next = document.querySelector("#calendar-next");
      const today = new Date();
      let visibleYear = today.getFullYear();
      let visibleMonth = today.getMonth();
      let availableDates = new Set();

      function monthKey() {
        return visibleYear + '-' + String(visibleMonth + 1).padStart(2, '0');
      }

      function dateKey(day) {
        return monthKey() + '-' + String(day).padStart(2, '0');
      }

      async function loadMonth() {
        title.textContent = visibleYear + '년 ' + (visibleMonth + 1) + '월';
        grid.innerHTML = '<div class="calendar-loading">불러오는 중...</div>';
        const response = await fetch('/api/availability/month?month=' + encodeURIComponent(monthKey()));
        const data = await response.json();
        availableDates = new Set(data.available_dates || []);
        renderCalendar();
      }

      function renderCalendar() {
        const first = new Date(visibleYear, visibleMonth, 1);
        const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < first.getDay(); i += 1) {
          cells.push('<span class="calendar-day spacer"></span>');
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
          const key = dateKey(day);
          const isAvailable = availableDates.has(key);
          const isSelected = dateInput.value === key;
          cells.push('<button type="button" class="calendar-day ' + (isAvailable ? 'available' : 'disabled') + (isSelected ? ' selected' : '') + '" data-date="' + key + '" ' + (isAvailable ? '' : 'disabled') + '>' + day + '</button>');
        }
        grid.innerHTML = cells.join('');
        grid.querySelectorAll('button[data-date]').forEach((button) => {
          button.addEventListener('click', () => selectDate(button.dataset.date));
        });
      }

      async function selectDate(date) {
        dateInput.value = date;
        renderCalendar();
        timeSelect.innerHTML = '<option value="">불러오는 중...</option>';
        if (!date) {
          timeSelect.innerHTML = '<option value="">날짜를 선택하세요</option>';
          slotHelp.textContent = "관리자가 열어둔 시간만 예약할 수 있습니다.";
          return;
        }
        const response = await fetch('/api/availability?date=' + encodeURIComponent(date));
        const data = await response.json();
        if (!data.slots.length) {
          timeSelect.innerHTML = '<option value="">예약 가능한 시간이 없습니다</option>';
          slotHelp.textContent = "이 날짜에는 열려 있는 시간이 없습니다. 다른 날짜를 선택해주세요.";
          return;
        }
        timeSelect.innerHTML = '<option value="">시간 선택</option>' + data.slots.map((slot) => '<option value="' + slot.time + '">' + slot.time + '</option>').join('');
        slotHelp.textContent = data.slots.length + "개의 시간이 예약 가능합니다.";
      }
      prev.addEventListener('click', () => {
        visibleMonth -= 1;
        if (visibleMonth < 0) {
          visibleMonth = 11;
          visibleYear -= 1;
        }
        dateInput.value = '';
        timeSelect.innerHTML = '<option value="">날짜를 선택하세요</option>';
        loadMonth();
      });
      next.addEventListener('click', () => {
        visibleMonth += 1;
        if (visibleMonth > 11) {
          visibleMonth = 0;
          visibleYear += 1;
        }
        dateInput.value = '';
        timeSelect.innerHTML = '<option value="">날짜를 선택하세요</option>';
        loadMonth();
      });
      loadMonth();
    </script>`
  );
}

export function renderAdminLoginPage(error?: string) {
  return page(
    "MiniCal 관리자 로그인",
    `<main class="shell login-shell">
      <section class="intro login-intro">
        <p class="eyebrow">MiniCal Admin</p>
        <h1>관리자 로그인</h1>
        <p class="lede">예약 목록과 상태 변경은 관리자 비밀번호 입력 후 접근할 수 있습니다.</p>
      </section>
      <section class="booking-panel login-panel" aria-label="관리자 로그인">
        <div class="panel-head">
          <p class="eyebrow">Password</p>
          <h2>비밀번호 입력</h2>
        </div>
        ${error ? `<div class="notice error" role="alert">${escapeHtml(error)}</div>` : ""}
        <form method="post" action="/admin/login" class="booking-form">
          <label>관리자 비밀번호 <input type="password" name="password" required autocomplete="current-password"></label>
          <button type="submit">관리자 페이지 열기</button>
        </form>
        <a class="admin-link" href="/">예약 페이지로 돌아가기</a>
      </section>
    </main>`
  );
}

export function renderAdminPage(bookings: Booking[], slots: AvailabilitySlotView[], selectedDate: string) {
  const rows = bookings
    .map(
      (booking) => `<tr>
        <td class="id">#${booking.id}</td>
        <td>
          <strong>${escapeHtml(booking.name)}</strong>
          <small>${escapeHtml(booking.contact)}</small>
        </td>
        <td>${escapeHtml(booking.date)} <span>${escapeHtml(booking.time)}</span></td>
        <td>${escapeHtml(booking.note ?? "-")}</td>
        <td><span class="badge ${booking.status}">${booking.status}</span></td>
        <td>
          <form method="post" action="/admin/status" class="status-form">
            <input type="hidden" name="booking_id" value="${booking.id}">
            <select name="status" aria-label="예약 #${booking.id} 상태">
              ${statuses.map((status) => `<option value="${status}" ${status === booking.status ? "selected" : ""}>${status}</option>`).join("")}
            </select>
            <button type="submit">변경</button>
          </form>
        </td>
      </tr>`
    )
    .join("");

  return page(
    "MiniCal 관리자",
    `<main class="shell admin-shell">
      <header class="admin-header">
        <div>
          <p class="eyebrow">Admin</p>
          <h1>예약 관리</h1>
          <p class="lede">최신 예약부터 확인하고 상태를 갱신합니다.</p>
        </div>
        <nav>
          <a href="/">예약 페이지</a>
          <a href="/admin/reminders/check">리마인더 체크</a>
          <a href="/api/bookings">JSON API</a>
        </nav>
      </header>
      <section class="availability-grid" aria-label="가능 시간 관리">
        <div class="booking-panel availability-panel">
          <div class="panel-head compact">
            <p class="eyebrow">Availability</p>
            <h2>가능 시간 열기</h2>
          </div>
          <form method="post" action="/admin/availability" class="booking-form">
            <label>날짜 <input type="date" name="date" value="${escapeHtml(selectedDate)}" required></label>
            <div class="form-row">
              <label>시작 <input type="time" name="start_time" required></label>
              <label>종료 <input type="time" name="end_time" required></label>
            </div>
            <label>간격
              <select name="interval_minutes">
                <option value="30">30분</option>
                <option value="60">60분</option>
                <option value="15">15분</option>
              </select>
            </label>
            <button type="submit">가능 시간 추가</button>
          </form>
        </div>
        <div class="booking-panel availability-panel">
          <div class="panel-head compact">
            <p class="eyebrow">Slots</p>
            <h2>${escapeHtml(selectedDate)} 시간표</h2>
          </div>
          <form method="get" action="/admin" class="date-filter">
            <input type="date" name="date" value="${escapeHtml(selectedDate)}" required>
            <button type="submit">조회</button>
          </form>
          <div class="slot-list">
            ${renderAdminSlots(slots, selectedDate)}
          </div>
        </div>
      </section>
      <section class="table-wrap" aria-label="예약 목록">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>고객</th>
              <th>일시</th>
              <th>메모</th>
              <th>상태</th>
              <th>변경</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6" class="empty">아직 예약이 없습니다.</td></tr>`}
          </tbody>
        </table>
      </section>
    </main>`
  );
}

function renderAdminSlots(slots: AvailabilitySlotView[], selectedDate: string) {
  if (!slots.length) {
    return `<p class="empty slots-empty">이 날짜에는 아직 열린 시간이 없습니다.</p>`;
  }

  return slots
    .map((slot) => {
      const nextActive = slot.is_active === 1 ? "0" : "1";
      const label = slot.is_active === 1 ? "닫기" : "열기";
      const state = slot.is_booked ? "예약됨" : slot.is_active === 1 ? "열림" : "닫힘";
      return `<form method="post" action="/admin/availability/toggle" class="slot-row">
        <input type="hidden" name="slot_id" value="${slot.id}">
        <input type="hidden" name="date" value="${escapeHtml(selectedDate)}">
        <input type="hidden" name="is_active" value="${nextActive}">
        <span class="slot-time">${escapeHtml(slot.time)}</span>
        <span class="badge ${slot.is_booked ? "cancelled" : slot.is_active === 1 ? "confirmed" : ""}">${state}</span>
        <button type="submit" ${slot.is_booked ? "disabled" : ""}>${label}</button>
      </form>`;
    })
    .join("");
}

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${styles}</style>
</head>
<body>
  ${body}
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const styles = `
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css");
:root {
  --ink: #17211b;
  --muted: #5d6c62;
  --line: #d9e1db;
  --paper: #f7f5ef;
  --panel: #ffffff;
  --accent: #22745f;
  --accent-strong: #135844;
  --warn: #b76b19;
  --danger: #a33d3d;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  background:
    linear-gradient(135deg, rgba(34,116,95,.12), transparent 34%),
    linear-gradient(315deg, rgba(183,107,25,.10), transparent 28%),
    var(--paper);
  font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
input, textarea, select, button {
  font: inherit;
}
.shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 56px 0;
}
.public-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 460px;
  gap: 56px;
  align-items: center;
}
.login-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 48px;
  align-items: center;
}
.intro h1, .admin-header h1 {
  margin: 0;
  max-width: 720px;
  font-size: clamp(42px, 7vw, 84px);
  line-height: 1.02;
  font-weight: 850;
  letter-spacing: 0;
}
.booking-panel, .table-wrap {
  background: rgba(255,255,255,.88);
  border: 1px solid rgba(23,33,27,.12);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(23,33,27,.13);
}
.booking-panel {
  padding: 28px;
}
.eyebrow {
  margin: 0 0 12px;
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}
.lede {
  max-width: 560px;
  color: var(--muted);
  font-size: 19px;
  line-height: 1.6;
}
.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}
.status-strip span {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 9px 13px;
  background: rgba(255,255,255,.65);
  color: var(--muted);
}
.panel-head h2 {
  margin: 0 0 22px;
  font-size: 30px;
}
.panel-head.compact h2 {
  font-size: 24px;
  margin-bottom: 18px;
}
.notice {
  margin-bottom: 18px;
  padding: 13px 14px;
  border: 1px solid rgba(34,116,95,.25);
  border-radius: 8px;
  background: rgba(34,116,95,.08);
  color: var(--accent-strong);
  font-weight: 700;
}
.notice.error {
  border-color: rgba(163,61,61,.25);
  background: rgba(163,61,61,.09);
  color: var(--danger);
}
.booking-form {
  display: grid;
  gap: 16px;
}
.slot-help {
  margin: -4px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.calendar-card {
  display: grid;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
  background: #fffdfa;
}
.calendar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.calendar-head strong {
  font-size: 18px;
}
.ghost-button {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--line);
  background: white;
  color: var(--ink);
}
.ghost-button:hover {
  background: rgba(34,116,95,.08);
  color: var(--accent-strong);
}
.calendar-weekdays, .calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}
.calendar-weekdays span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}
.calendar-day {
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f2f4f0;
  color: #99a49d;
  font-weight: 800;
  cursor: not-allowed;
}
.calendar-day.available {
  background: rgba(34,116,95,.10);
  color: var(--accent-strong);
  cursor: pointer;
}
.calendar-day.available:hover, .calendar-day.selected {
  background: var(--accent);
  color: white;
}
.calendar-day.spacer {
  border: 0;
  background: transparent;
}
.calendar-loading {
  grid-column: 1 / -1;
  padding: 24px 0;
  color: var(--muted);
  text-align: center;
}
label {
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 700;
}
input, textarea, select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 13px;
  background: #fffdfa;
  color: var(--ink);
}
input:focus, textarea:focus, select:focus, button:focus-visible, a:focus-visible {
  outline: 3px solid rgba(34,116,95,.24);
  outline-offset: 2px;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
button, .admin-header a, .admin-link {
  border: 0;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font-weight: 800;
  text-decoration: none;
  transition: transform .18s ease, background .18s ease;
}
button {
  padding: 13px 16px;
}
button:hover, .admin-header a:hover, .admin-link:hover {
  background: var(--accent-strong);
  transform: translateY(-1px);
}
.admin-link {
  display: inline-flex;
  margin-top: 16px;
  padding: 11px 13px;
  background: #26352d;
}
.admin-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  margin-bottom: 30px;
}
.admin-header h1 {
  font-size: clamp(38px, 5vw, 64px);
}
.admin-header nav {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.admin-header a {
  padding: 10px 12px;
  background: #26352d;
}
.availability-grid {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 18px;
  margin-bottom: 24px;
}
.availability-panel {
  padding: 22px;
  box-shadow: 0 18px 54px rgba(23,33,27,.10);
}
.date-filter {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-bottom: 14px;
}
.date-filter button {
  padding: 10px 12px;
}
.slot-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 10px;
}
.slot-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fffdfa;
}
.slot-time {
  font-weight: 850;
}
.slot-row .badge {
  min-width: 64px;
  padding: 6px 8px;
}
.slot-row button {
  padding: 8px 10px;
}
.slot-row button:disabled {
  cursor: not-allowed;
  opacity: .45;
  transform: none;
}
.slots-empty {
  padding: 22px 0 4px;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 860px;
}
th, td {
  padding: 16px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: middle;
}
th {
  color: var(--muted);
  font-size: 13px;
  text-transform: uppercase;
}
td small {
  display: block;
  margin-top: 5px;
  color: var(--muted);
}
.id {
  color: var(--muted);
  font-weight: 800;
}
.badge {
  display: inline-flex;
  min-width: 86px;
  justify-content: center;
  border-radius: 999px;
  padding: 7px 10px;
  background: #eef1ec;
  color: var(--muted);
  font-weight: 800;
}
.badge.confirmed {
  background: rgba(34,116,95,.12);
  color: var(--accent-strong);
}
.badge.cancelled {
  background: rgba(163,61,61,.12);
  color: var(--danger);
}
.status-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.status-form button {
  padding: 10px 12px;
}
.empty {
  padding: 42px 16px;
  text-align: center;
  color: var(--muted);
}
@media (max-width: 820px) {
  .shell { padding: 32px 0; }
  .public-shell, .login-shell { grid-template-columns: 1fr; gap: 28px; align-items: start; }
  .booking-panel { padding: 22px; }
  .form-row { grid-template-columns: 1fr; }
  .admin-header { display: grid; align-items: start; }
  .availability-grid { grid-template-columns: 1fr; }
}
`;
