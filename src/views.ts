import {
  AvailabilitySlotView,
  Booking,
  BookingStatus,
  PlatformAvailabilitySlotView,
  Store,
  StoreSummary
} from "./booking.types";

const statuses: BookingStatus[] = ["pending", "confirmed", "cancelled"];

interface NavOptions {
  storeAdminHref?: string;
  logoutAction?: string;
}

interface PublicStoreView {
  slug: string;
  name: string;
  basePath: string;
}

export function renderLandingPage() {
  return page(
    "MiniCal - 가게 예약 관리",
    `<main class="landing">
      <section class="landing-hero">
        <div class="landing-copy">
          <p class="eyebrow">MiniCal Booking Platform</p>
          <h1>입점하고 고객 예약을 받는 작은 예약 플랫폼</h1>
          <p class="lede">가게마다 전용 예약 주소와 관리자 화면을 만들고, 고객은 열린 시간만 골라 바로 예약합니다.</p>
          <div class="landing-actions">
            <a class="primary-action" href="/signup">가게 입점하기</a>
            <a class="secondary-action" href="/stores">예약할 가게 보기</a>
          </div>
        </div>
        <div class="screenshot-stack" aria-label="MiniCal 화면 미리보기">
          <figure class="product-shot customer-shot">
            <figcaption>고객 예약 화면</figcaption>
            <div class="shot-browser">
              <span></span><span></span><span></span>
            </div>
            <div class="shot-title">맛집 예약</div>
            <div class="shot-calendar" aria-hidden="true">
              <b>12</b><b>13</b><b class="is-open">14</b><b class="is-open">15</b><b>16</b><b class="is-open">17</b><b>18</b>
            </div>
            <div class="shot-field">예약 시간 <strong>18:00</strong></div>
            <div class="shot-button">예약 생성</div>
          </figure>
          <figure class="product-shot admin-shot">
            <figcaption>관리자 화면</figcaption>
            <div class="shot-browser">
              <span></span><span></span><span></span>
            </div>
            <div class="shot-title">플랫폼 대시보드</div>
            <div class="shot-table" aria-hidden="true">
              <span>가게</span><span>예약</span><span>슬롯</span>
              <strong>맛집</strong><strong>12</strong><strong>예약됨</strong>
              <strong>살롱</strong><strong>8</strong><strong>열림</strong>
            </div>
          </figure>
        </div>
      </section>
      <section class="landing-flow" aria-label="서비스 흐름">
        <article>
          <span>1</span>
          <h2>가게 입점</h2>
          <p>아이디를 만들면 /matjib 같은 예약 주소와 관리자 주소가 생깁니다.</p>
        </article>
        <article>
          <span>2</span>
          <h2>시간표 열기</h2>
          <p>가게 주인은 가능한 날짜와 시간을 열고, 예약된 슬롯은 자동으로 막습니다.</p>
        </article>
        <article>
          <span>3</span>
          <h2>전체 현황 확인</h2>
          <p>플랫폼 관리자는 입점 가게, 예약 내역, 슬롯 상태를 한 화면에서 봅니다.</p>
        </article>
      </section>
    </main>`
  );
}

export function renderPublicPage(store: PublicStoreView, message?: string) {
  return page(
    `${store.name} 예약`,
    `<main class="shell public-shell">
      <section class="intro">
        <p class="eyebrow">MiniCal</p>
        <h1>${escapeHtml(store.name)} 예약</h1>
        <p class="lede">원하는 날짜와 시간을 골라 예약을 접수하세요.</p>
        <div class="status-strip">
          <span>온라인 예약</span>
          <span>시간표 기반 접수</span>
          <span>${escapeHtml(store.basePath || "/")}</span>
        </div>
      </section>
      <section class="booking-panel" aria-label="예약 입력">
        <div class="panel-head">
          <p class="eyebrow">New booking</p>
          <h2>예약 정보</h2>
        </div>
        ${message ? `<div class="notice" role="status">${escapeHtml(message)}</div>` : ""}
        <form method="post" action="${escapeHtml(store.basePath)}/book" class="booking-form">
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
        <a class="admin-link" href="${escapeHtml(store.basePath || "")}/admin">관리자 페이지 열기</a>
      </section>
    </main>
    <script>
      const basePath = ${JSON.stringify(store.basePath)};
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
        const response = await fetch(basePath + '/api/availability/month?month=' + encodeURIComponent(monthKey()));
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
        const response = await fetch(basePath + '/api/availability?date=' + encodeURIComponent(date));
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
    </script>`,
    { storeAdminHref: `${store.basePath || ""}/admin` }
  );
}

export function renderStoreListPage(stores: Store[]) {
  const storeCards = stores
    .map(
      (store) => `<article class="store-card">
        <div>
          <h2>${escapeHtml(store.name)}</h2>
          <p>/${escapeHtml(store.slug)}</p>
        </div>
        <a href="/${escapeHtml(store.slug)}">예약 페이지 열기</a>
      </article>`
    )
    .join("");

  return page(
    "MiniCal 가게 목록",
    `<main class="shell store-list-shell">
      <section class="intro">
        <p class="eyebrow">MiniCal Stores</p>
        <h1>입점 가게 목록</h1>
        <p class="lede">예약할 가게를 선택하세요. 가게 이름순으로 정렬되어 있습니다.</p>
      </section>
      <section class="store-grid" aria-label="입점 가게 목록">
        ${storeCards || `<p class="empty">입점 가게가 없습니다.</p>`}
      </section>
    </main>`
  );
}

export function renderSignupPage(error?: string) {
  return page(
    "MiniCal 입점 신청",
    `<main class="shell login-shell">
      <section class="intro login-intro">
        <p class="eyebrow">MiniCal Stores</p>
        <h1>가게 입점</h1>
        <p class="lede">아이디를 만들면 전용 예약 주소와 관리자 주소가 생성됩니다.</p>
      </section>
      <section class="booking-panel login-panel" aria-label="가게 입점">
        <div class="panel-head">
          <p class="eyebrow">Signup</p>
          <h2>가게 정보</h2>
        </div>
        ${error ? `<div class="notice error" role="alert">${escapeHtml(error)}</div>` : ""}
        <form method="post" action="/signup" class="booking-form">
          <label>가게 아이디 <input name="slug" required pattern="[a-z0-9][a-z0-9-]{2,30}" placeholder="matjib"></label>
          <label>가게 이름 <input name="name" required placeholder="맛집"></label>
          <label>관리 비밀번호 <input type="password" name="password" required autocomplete="new-password"></label>
          <button type="submit">전용 시간표 만들기</button>
        </form>
        <a class="admin-link" href="/admin">플랫폼 관리자</a>
      </section>
    </main>`,
    {}
  );
}

export function renderAdminLoginPage(error?: string, action = "/admin/login", returnPath = "/") {
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
        <form method="post" action="${escapeHtml(action)}" class="booking-form">
          <label>관리자 비밀번호 <input type="password" name="password" required autocomplete="current-password"></label>
          <button type="submit">관리자 페이지 열기</button>
        </form>
        <a class="admin-link" href="${escapeHtml(returnPath)}">예약 페이지로 돌아가기</a>
      </section>
    </main>`,
    { storeAdminHref: action.replace(/\/login$/, "") }
  );
}

export function renderAdminPage(store: Store, bookings: Booking[], slots: AvailabilitySlotView[], selectedDate: string) {
  const basePath = store.slug === "main" ? "" : `/${store.slug}`;
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
          <form method="post" action="${escapeHtml(basePath)}/admin/status" class="status-form">
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
    `${store.name} 관리자`,
    `<main class="shell admin-shell">
      <header class="admin-header">
        <div>
          <p class="eyebrow">${escapeHtml(store.slug)} Admin</p>
          <h1>${escapeHtml(store.name)} 예약 관리</h1>
          <p class="lede">최신 예약부터 확인하고 상태를 갱신합니다.</p>
        </div>
        <nav>
          <a href="${escapeHtml(basePath || "/")}">예약 페이지</a>
          <a href="/admin">플랫폼 관리자</a>
          <a href="${escapeHtml(basePath)}/api/bookings">JSON API</a>
        </nav>
      </header>
      <section class="availability-grid" aria-label="가능 시간 관리">
        <div class="booking-panel availability-panel">
          <div class="panel-head compact">
            <p class="eyebrow">Availability</p>
            <h2>가능 시간 열기</h2>
          </div>
          <form method="post" action="${escapeHtml(basePath)}/admin/availability" class="booking-form">
            <input type="hidden" name="date" value="${escapeHtml(selectedDate)}">
            <div class="admin-calendar-card" aria-label="관리자 날짜 선택 달력">
              ${renderAdminCalendar(selectedDate, basePath)}
            </div>
            <p class="slot-help">선택한 날짜: <strong>${escapeHtml(selectedDate)}</strong></p>
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
          <form method="post" action="${escapeHtml(basePath)}/admin/availability/copy" class="copy-form">
            <input type="hidden" id="copy-source-date" name="source_date" value="${escapeHtml(selectedDate)}">
            <label>복사할 날짜
              <input type="date" id="copy-target-date" name="target_date" required>
            </label>
            <button type="submit">현재 날짜 슬롯 복사</button>
          </form>
          <div class="slot-list">
            ${renderAdminSlots(slots, selectedDate, basePath)}
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
    </main>`,
    { storeAdminHref: `${basePath}/admin`, logoutAction: `${basePath}/admin/logout` }
  );
}

export function renderPlatformAdminPage(
  stores: StoreSummary[],
  bookings: Booking[],
  slots: PlatformAvailabilitySlotView[]
) {
  const storeRows = stores
    .map(
      (store) => `<tr>
        <td><strong>${escapeHtml(store.name)}</strong><small>/${escapeHtml(store.slug)}</small></td>
        <td><a href="/${escapeHtml(store.slug)}">/${escapeHtml(store.slug)}</a></td>
        <td>${Number(store.booking_count ?? 0)}</td>
        <td>${Number(store.pending_count ?? 0)}</td>
        <td>${Number(store.confirmed_count ?? 0)}</td>
        <td><a href="/${escapeHtml(store.slug)}/admin">가게 관리자</a></td>
      </tr>`
    )
    .join("");

  const bookingRows = bookings
    .map(
      (booking) => `<tr>
        <td class="id">#${booking.id}</td>
        <td>${escapeHtml(booking.store_name)} <small>/${escapeHtml(booking.store_slug)}</small></td>
        <td><strong>${escapeHtml(booking.name)}</strong><small>${escapeHtml(booking.contact)}</small></td>
        <td>${escapeHtml(booking.date)} <span>${escapeHtml(booking.time)}</span></td>
        <td><span class="badge ${booking.status}">${booking.status}</span></td>
      </tr>`
    )
    .join("");

  const slotRows = slots
    .map((slot) => {
      const state = slot.is_booked ? "예약됨" : slot.is_active === 1 ? "열림" : "닫힘";
      const badgeClass = slot.is_booked ? "cancelled" : slot.is_active === 1 ? "confirmed" : "";
      return `<tr>
        <td>${escapeHtml(slot.store_name)} <small>/${escapeHtml(slot.store_slug)}</small></td>
        <td>${escapeHtml(slot.date)}</td>
        <td><strong>${escapeHtml(slot.time)}</strong></td>
        <td><span class="badge ${badgeClass}">${state}</span></td>
      </tr>`;
    })
    .join("");

  return page(
    "MiniCal 플랫폼 관리자",
    `<main class="shell admin-shell">
      <header class="admin-header">
        <div>
          <p class="eyebrow">Platform Admin</p>
          <h1>플랫폼 대시보드</h1>
          <p class="lede">입점 가게 정보와 전체 예약 현황을 확인합니다. 예약 관리 요약 화면입니다.</p>
        </div>
        <nav>
          <a href="/signup">가게 입점</a>
          <a href="/api/bookings">기본 가게 API</a>
        </nav>
      </header>
      <section class="table-wrap platform-section" aria-label="가게 목록">
        <table>
          <thead>
            <tr>
              <th>가게</th>
              <th>예약 주소</th>
              <th>전체 예약</th>
              <th>대기</th>
              <th>확정</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            ${storeRows || `<tr><td colspan="6" class="empty">입점 가게가 없습니다.</td></tr>`}
          </tbody>
        </table>
      </section>
      <section class="table-wrap" aria-label="전체 예약 목록">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>가게</th>
              <th>고객</th>
              <th>일시</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${bookingRows || `<tr><td colspan="5" class="empty">아직 예약이 없습니다.</td></tr>`}
          </tbody>
        </table>
      </section>
      <section class="table-wrap" aria-label="가게별 예약 및 슬롯">
        <div class="table-title">
          <p class="eyebrow">Store slots</p>
          <h2>가게별 예약 및 슬롯</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>가게</th>
              <th>날짜</th>
              <th>시간</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${slotRows || `<tr><td colspan="4" class="empty">등록된 슬롯이 없습니다.</td></tr>`}
          </tbody>
        </table>
      </section>
    </main>`,
    { logoutAction: "/admin/logout" }
  );
}

function renderAdminCalendar(selectedDate: string, basePath = "") {
  const [year, month, selectedDay] = selectedDate.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const previousMonth = shiftMonth(year, month, -1);
  const nextMonth = shiftMonth(year, month, 1);
  const cells: string[] = [];

  for (let index = 0; index < first.getDay(); index += 1) {
    cells.push(`<span class="calendar-day spacer"></span>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push(
      `<a class="calendar-day admin-day${day === selectedDay ? " selected" : ""}" href="${escapeHtml(basePath)}/admin?date=${date}">${day}</a>`
    );
  }

  return `<div class="calendar-head">
      <a class="ghost-button" href="${escapeHtml(basePath)}/admin?date=${previousMonth}" aria-label="이전 달">‹</a>
      <strong>${year}년 ${month}월</strong>
      <a class="ghost-button" href="${escapeHtml(basePath)}/admin?date=${nextMonth}" aria-label="다음 달">›</a>
    </div>
    <div class="calendar-weekdays" aria-hidden="true">
      <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
    </div>
    <div class="calendar-grid admin-calendar-grid">
      ${cells.join("")}
    </div>`;
}

function renderAdminSlots(slots: AvailabilitySlotView[], selectedDate: string, basePath = "") {
  if (!slots.length) {
    return `<p class="empty slots-empty">이 날짜에는 아직 열린 시간이 없습니다.</p>`;
  }

  return slots
    .map((slot) => {
      const nextActive = slot.is_active === 1 ? "0" : "1";
      const label = slot.is_active === 1 ? "닫기" : "열기";
      const state = slot.is_booked ? "예약됨" : slot.is_active === 1 ? "열림" : "닫힘";
      return `<form method="post" action="${escapeHtml(basePath)}/admin/availability/toggle" class="slot-row">
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

function shiftMonth(year: number, month: number, offset: number) {
  const shifted = new Date(year, month - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-01`;
}

function page(title: string, body: string, nav: NavOptions = {}) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${styles}</style>
</head>
<body>
  ${renderGlobalNav(nav)}
  ${body}
</body>
</html>`;
}

function renderGlobalNav(nav: NavOptions) {
  const storeAdminHref = nav.storeAdminHref;
  return `<nav class="global-nav" aria-label="전역 메뉴">
    <a class="brand-link" href="/">MiniCal</a>
    <div class="nav-actions">
      <a href="/stores">가게 목록</a>
      <a href="/signup">가게 입점</a>
      ${storeAdminHref ? `<a href="${escapeHtml(storeAdminHref)}">가게 관리자</a>` : ""}
      <a href="/admin">전체 관리자</a>
      ${
        nav.logoutAction
          ? `<form method="post" action="${escapeHtml(nav.logoutAction)}" class="nav-logout"><button type="submit">로그아웃</button></form>`
          : ""
      }
    </div>
  </nav>`;
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
.global-nav {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 16px 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.brand-link, .global-nav a, .nav-logout button {
  color: var(--ink);
  text-decoration: none;
  font-weight: 850;
}
.brand-link {
  font-size: 18px;
}
.nav-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.global-nav a:not(.brand-link), .nav-logout button {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 8px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255,255,255,.72);
  color: var(--muted);
}
.global-nav a:hover, .nav-logout button:hover {
  color: var(--accent-strong);
  background: white;
}
.nav-logout {
  margin: 0;
}
.nav-logout button {
  cursor: pointer;
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
.landing {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 56px 0 72px;
}
.landing-hero {
  min-height: calc(100vh - 96px);
  display: grid;
  grid-template-columns: minmax(0, .92fr) minmax(420px, 1fr);
  gap: 48px;
  align-items: center;
}
.landing-copy h1 {
  margin: 0;
  max-width: 760px;
  font-size: clamp(46px, 7vw, 88px);
  line-height: 1.02;
  font-weight: 900;
  letter-spacing: 0;
}
.landing-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}
.primary-action, .secondary-action {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  border-radius: 8px;
  padding: 12px 15px;
  font-weight: 850;
  text-decoration: none;
}
.primary-action {
  background: var(--accent);
  color: white;
}
.secondary-action {
  border: 1px solid var(--line);
  background: rgba(255,255,255,.74);
  color: var(--ink);
}
.primary-action:hover {
  background: var(--accent-strong);
}
.secondary-action:hover {
  color: var(--accent-strong);
  background: white;
}
.screenshot-stack {
  position: relative;
  min-height: 560px;
}
.product-shot {
  position: absolute;
  margin: 0;
  border: 1px solid rgba(23,33,27,.14);
  border-radius: 8px;
  background: rgba(255,255,255,.94);
  box-shadow: 0 28px 90px rgba(23,33,27,.16);
  overflow: hidden;
}
.product-shot figcaption {
  padding: 16px 18px 0;
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 900;
}
.customer-shot {
  top: 0;
  right: 26px;
  width: min(430px, 82vw);
  padding-bottom: 20px;
}
.admin-shot {
  left: 0;
  bottom: 0;
  width: min(500px, 88vw);
  padding-bottom: 18px;
}
.shot-browser {
  display: flex;
  gap: 6px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}
.shot-browser span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #c9d3cb;
}
.shot-title {
  padding: 18px;
  font-size: 28px;
  font-weight: 900;
}
.shot-calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 7px;
  padding: 0 18px 16px;
}
.shot-calendar b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border-radius: 8px;
  background: #eef1ec;
  color: #8c9a92;
}
.shot-calendar .is-open {
  background: rgba(34,116,95,.14);
  color: var(--accent-strong);
}
.shot-field {
  margin: 0 18px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 13px;
  color: var(--muted);
}
.shot-field strong {
  float: right;
  color: var(--ink);
}
.shot-button {
  margin: 0 18px;
  border-radius: 8px;
  padding: 13px;
  background: var(--accent);
  color: white;
  text-align: center;
  font-weight: 900;
}
.shot-table {
  display: grid;
  grid-template-columns: 1.4fr .8fr 1fr;
  margin: 0 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.shot-table span, .shot-table strong {
  padding: 12px;
  border-bottom: 1px solid var(--line);
}
.shot-table span {
  background: #f4f6f2;
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
}
.shot-table strong {
  background: white;
  font-size: 14px;
}
.landing-flow {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-top: 24px;
}
.landing-flow article {
  border-top: 2px solid var(--accent);
  padding-top: 18px;
}
.landing-flow span {
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 900;
}
.landing-flow h2 {
  margin: 10px 0 8px;
  font-size: 25px;
}
.landing-flow p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}
.store-list-shell {
  display: grid;
  gap: 32px;
}
.store-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.store-card {
  display: grid;
  gap: 18px;
  align-content: space-between;
  min-height: 170px;
  padding: 22px;
  border: 1px solid rgba(23,33,27,.12);
  border-radius: 8px;
  background: rgba(255,255,255,.88);
  box-shadow: 0 18px 54px rgba(23,33,27,.10);
}
.store-card h2 {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}
.store-card p {
  margin: 8px 0 0;
  color: var(--muted);
  font-weight: 800;
}
.store-card a {
  justify-self: start;
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--accent);
  color: white;
  font-weight: 850;
  text-decoration: none;
}
.store-card a:hover {
  background: var(--accent-strong);
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
.admin-calendar-card {
  display: grid;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--line);
  background: white;
  color: var(--ink);
  text-decoration: none;
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
.calendar-day.admin-day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: white;
  color: var(--ink);
  cursor: pointer;
  text-decoration: none;
}
.calendar-day.admin-day:hover, .calendar-day.admin-day.selected {
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
.copy-form {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  align-items: end;
  gap: 8px;
  margin-bottom: 14px;
}
.copy-form button {
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
  margin-top: 24px;
}
.table-title {
  padding: 20px 20px 0;
}
.table-title h2 {
  margin: 0 0 12px;
  font-size: 24px;
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
  .global-nav { align-items: flex-start; }
  .nav-actions { justify-content: flex-end; }
  .shell { padding: 32px 0; }
  .landing { padding: 32px 0 48px; }
  .landing-hero { grid-template-columns: 1fr; min-height: auto; gap: 30px; }
  .screenshot-stack { min-height: auto; display: grid; gap: 16px; }
  .product-shot { position: static; width: 100%; }
  .landing-flow { grid-template-columns: 1fr; }
  .public-shell, .login-shell { grid-template-columns: 1fr; gap: 28px; align-items: start; }
  .booking-panel { padding: 22px; }
  .form-row { grid-template-columns: 1fr; }
  .admin-header { display: grid; align-items: start; }
  .availability-grid { grid-template-columns: 1fr; }
}
`;
