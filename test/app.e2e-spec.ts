import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { adminPassword } from "../src/admin-auth";
import { AppModule } from "../src/app.module";
import { assertSafeEnvironment } from "../src/environment";

const BetterSqlite3 = require("better-sqlite3");

describe("MiniCal bookings", () => {
  let app: INestApplication;
  let tempRoot: string;
  let adminCookie: string;

  beforeEach(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "minical-test-"));
    process.env.MINICAL_DATA_DIR = path.join(tempRoot, "data");
    process.env.MINICAL_LOG_DIR = path.join(tempRoot, "logs");
    process.env.ADMIN_PASSWORD = "test-secret";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .post("/admin/login")
      .type("form")
      .send({ password: "test-secret" })
      .expect(302);
    adminCookie = loginResponse.headers["set-cookie"];
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    delete process.env.MINICAL_DATA_DIR;
    delete process.env.MINICAL_LOG_DIR;
    delete process.env.ADMIN_PASSWORD;
  });

  it("renders the root page as a service landing page instead of the main booking form", async () => {
    const response = await request(app.getHttpServer()).get("/").expect(200);

    expect(response.text).toContain("MiniCal");
    expect(response.text).toContain("입점하고 고객 예약을 받는");
    expect(response.text).toContain("고객 예약 화면");
    expect(response.text).toContain("관리자 화면");
    expect(response.text).toContain("href=\"/signup\"");
    expect(response.text).toContain("href=\"/stores\"");
    expect(response.text).not.toContain("action=\"/book\"");
  });

  it("creates bookings from JSON, returns them newest first, and writes a mock telegram log", async () => {
    await createSlots(app, adminCookie, "2026-06-23", "16:30", "17:00");

    const createResponse = await request(app.getHttpServer())
      .post("/book")
      .send({
        name: "Kim Hana",
        contact: "010-1234-5678",
        date: "2026-06-23",
        time: "16:30",
        note: "Window seat"
      })
      .expect(201);

    expect(createResponse.body.booking).toMatchObject({
      id: 1,
      name: "Kim Hana",
      contact: "010-1234-5678",
      date: "2026-06-23",
      time: "16:30",
      note: "Window seat",
      status: "pending"
    });

    const listResponse = await request(app.getHttpServer())
      .get("/api/bookings")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({
      id: 1,
      name: "Kim Hana",
      status: "pending"
    });

    const log = fs.readFileSync(path.join(tempRoot, "logs", "telegram_mock.log"), "utf8");
    expect(log).toContain("NEW_BOOKING booking_id=1 store=main datetime=2026-06-23 16:30");
    expect(log).not.toContain("Kim Hana");
    expect(log).not.toContain("010-1234-5678");
  });

  it("accepts form-urlencoded bookings and rejects missing required fields", async () => {
    await createSlots(app, adminCookie, "2026-06-24", "09:00", "09:30");

    await request(app.getHttpServer())
      .post("/book")
      .type("form")
      .send({
        name: "Lee Min",
        contact: "min@example.test",
        date: "2026-06-24",
        time: "09:00"
      })
      .expect(201);

    const badResponse = await request(app.getHttpServer())
      .post("/book")
      .send({ name: "No Contact", date: "2026-06-24", time: "09:00" })
      .expect(400);

    expect(badResponse.body.message).toContain("contact is required");
  });

  it("updates status and writes a status change log", async () => {
    await createSlots(app, adminCookie, "2026-06-24", "10:00", "10:30");

    const created = await request(app.getHttpServer())
      .post("/book")
      .send({
        name: "Park Jun",
        contact: "jun@example.test",
        date: "2026-06-24",
        time: "10:00"
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/admin/status")
      .set("Cookie", adminCookie)
      .type("form")
      .send({ booking_id: created.body.booking.id, status: "confirmed" })
      .expect(302);

    const listResponse = await request(app.getHttpServer())
      .get("/api/bookings")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(listResponse.body[0].status).toBe("confirmed");

    const log = fs.readFileSync(path.join(tempRoot, "logs", "telegram_mock.log"), "utf8");
    expect(log).toContain("STATUS_CHANGED id=1 status=confirmed");
  });

  it("logs reminders only once for confirmed bookings within the next 30 minutes", async () => {
    const soon = new Date(Date.now() + 20 * 60 * 1000);
    const date = soon.toISOString().slice(0, 10);
    const time = soon.toTimeString().slice(0, 5);
    const end = new Date(soon.getTime() + 30 * 60 * 1000).toTimeString().slice(0, 5);
    await createSlots(app, adminCookie, date, time, end);

    const created = await request(app.getHttpServer())
      .post("/book")
      .send({
        name: "Soon Guest",
        contact: "soon@example.test",
        date,
        time
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/admin/status")
      .set("Cookie", adminCookie)
      .send({ booking_id: created.body.booking.id, status: "confirmed" })
      .expect(200);

    const firstCheck = await request(app.getHttpServer())
      .get("/admin/reminders/check")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(firstCheck.body.reminded).toHaveLength(1);

    const secondCheck = await request(app.getHttpServer())
      .get("/admin/reminders/check")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(secondCheck.body.reminded).toHaveLength(0);

    const log = fs.readFileSync(path.join(tempRoot, "logs", "telegram_mock.log"), "utf8");
    expect((log.match(/REMINDER booking_id=1/g) ?? []).length).toBe(1);
  });

  it("lets admins create bookable time slots and hides booked slots from visitors", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/admin/availability")
      .set("Cookie", adminCookie)
      .type("form")
      .send({
        date: "2026-06-25",
        start_time: "09:00",
        end_time: "10:30",
        interval_minutes: "30"
      })
      .expect(302);

    expect(createResponse.headers.location).toBe("/admin?date=2026-06-25");

    const availability = await request(app.getHttpServer())
      .get("/api/availability?date=2026-06-25")
      .expect(200);

    expect(availability.body.slots.map((slot: { time: string }) => slot.time)).toEqual(["09:00", "09:30", "10:00"]);

    await request(app.getHttpServer())
      .post("/book")
      .send({
        name: "Slot Booker",
        contact: "slot@example.test",
        date: "2026-06-25",
        time: "09:30"
      })
      .expect(201);

    const afterBooking = await request(app.getHttpServer())
      .get("/api/availability?date=2026-06-25")
      .expect(200);

    expect(afterBooking.body.slots.map((slot: { time: string }) => slot.time)).toEqual(["09:00", "10:00"]);

    await request(app.getHttpServer())
      .post("/book")
      .send({
        name: "Double Booker",
        contact: "double@example.test",
        date: "2026-06-25",
        time: "09:30"
      })
      .expect(400);
  });

  it("returns month availability with only dates that still have bookable slots", async () => {
    await createSlots(app, adminCookie, "2026-06-27", "09:00", "10:00");
    await createSlots(app, adminCookie, "2026-06-28", "09:00", "09:30");

    await request(app.getHttpServer())
      .post("/book")
      .send({
        name: "Full Day",
        contact: "full@example.test",
        date: "2026-06-28",
        time: "09:00"
      })
      .expect(201);

    const month = await request(app.getHttpServer())
      .get("/api/availability/month?month=2026-06")
      .expect(200);

    expect(month.body.available_dates).toContain("2026-06-27");
    expect(month.body.available_dates).not.toContain("2026-06-28");
  });

  it("requires admin auth for availability changes and supports slot toggling", async () => {
    await request(app.getHttpServer())
      .post("/admin/availability")
      .send({ date: "2026-06-26", start_time: "11:00", end_time: "11:30" })
      .expect(401);

    await createSlots(app, adminCookie, "2026-06-26", "11:00", "11:30");

    const adminSlots = await request(app.getHttpServer())
      .get("/api/admin/availability?date=2026-06-26")
      .set("Cookie", adminCookie)
      .expect(200);

    const slotId = adminSlots.body.slots[0].id;

    await request(app.getHttpServer())
      .post("/admin/availability/toggle")
      .set("Cookie", adminCookie)
      .type("form")
      .send({ slot_id: slotId, is_active: "0", date: "2026-06-26" })
      .expect(302);

    const publicSlots = await request(app.getHttpServer())
      .get("/api/availability?date=2026-06-26")
      .expect(200);

    expect(publicSlots.body.slots).toHaveLength(0);
  });

  it("rejects cross-site admin form posts", async () => {
    await createSlots(app, adminCookie, "2026-06-26", "12:00", "12:30");

    const created = await request(app.getHttpServer())
      .post("/book")
      .send({
        name: "Csrf Target",
        contact: "csrf@example.test",
        date: "2026-06-26",
        time: "12:00"
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/admin/status")
      .set("Cookie", adminCookie)
      .set("Origin", "https://evil.example")
      .type("form")
      .send({ booking_id: created.body.booking.id, status: "confirmed" })
      .expect(403);
  });

  it("requires admin auth for the default store bookings API", async () => {
    await request(app.getHttpServer())
      .get("/api/bookings")
      .expect(401);

    await request(app.getHttpServer())
      .get("/api/bookings")
      .set("Cookie", adminCookie)
      .expect(200);
  });

  it("copies one date's availability slots to another date", async () => {
    await createSlots(app, adminCookie, "2026-06-29", "09:00", "10:30");

    const sourceSlots = await request(app.getHttpServer())
      .get("/api/admin/availability?date=2026-06-29")
      .set("Cookie", adminCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post("/admin/availability/toggle")
      .set("Cookie", adminCookie)
      .type("form")
      .send({ slot_id: sourceSlots.body.slots[1].id, is_active: "0", date: "2026-06-29" })
      .expect(302);

    await request(app.getHttpServer())
      .post("/admin/availability/copy")
      .set("Cookie", adminCookie)
      .type("form")
      .send({ source_date: "2026-06-29", target_date: "2026-06-30" })
      .expect(302)
      .expect("Location", "/admin?date=2026-06-30");

    const copied = await request(app.getHttpServer())
      .get("/api/admin/availability?date=2026-06-30")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(copied.body.slots.map((slot: { time: string; is_active: 0 | 1 }) => [slot.time, slot.is_active])).toEqual([
      ["09:00", 1],
      ["09:30", 0],
      ["10:00", 1]
    ]);
  });

  it("renders platform admin as an owner dashboard", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin?date=2026-06-29")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(response.text).toContain("플랫폼 대시보드");
    expect(response.text).toContain("가게 목록");
    expect(response.text).toContain("전체 예약 목록");
  });

  it("renders global navigation with signup access on public and admin pages", async () => {
    await createStore(app, "matjib", "맛집", "owner-secret");

    const publicPage = await request(app.getHttpServer()).get("/matjib").expect(200);
    expect(publicPage.text).toContain("global-nav");
    expect(publicPage.text).toContain("href=\"/stores\"");
    expect(publicPage.text).toContain("가게 목록");
    expect(publicPage.text).not.toContain("<a href=\"/matjib\">예약</a>");
    expect(publicPage.text).toContain("href=\"/signup\"");
    expect(publicPage.text).toContain("가게 입점");

    const signupPage = await request(app.getHttpServer()).get("/signup").expect(200);
    expect(signupPage.text).toContain("global-nav");
    expect(signupPage.text).toContain("href=\"/admin\"");

    const platformPage = await request(app.getHttpServer())
      .get("/admin")
      .set("Cookie", adminCookie)
      .expect(200);
    expect(platformPage.text).toContain("global-nav");
    expect(platformPage.text).toContain("action=\"/admin/logout\"");

    const ownerLogin = await request(app.getHttpServer())
      .post("/matjib/admin/login")
      .type("form")
      .send({ password: "owner-secret" })
      .expect(302);

    const ownerAdmin = await request(app.getHttpServer())
      .get("/matjib/admin")
      .set("Cookie", ownerLogin.headers["set-cookie"])
      .expect(200);
    expect(ownerAdmin.text).toContain("global-nav");
    expect(ownerAdmin.text).toContain("action=\"/matjib/admin/logout\"");
  });

  it("renders a public store list sorted by store name", async () => {
    await createStore(app, "salon", "살롱", "owner-secret");
    await createStore(app, "matjib", "맛집", "owner-secret");
    await createStore(app, "bakery", "가게빵", "owner-secret");

    const response = await request(app.getHttpServer()).get("/stores").expect(200);

    expect(response.text).toContain("입점 가게 목록");
    expect(response.text).toContain("href=\"/matjib\"");
    expect(response.text).toContain("href=\"/salon\"");

    const bakeryIndex = response.text.indexOf("가게빵");
    const matjibIndex = response.text.indexOf("맛집");
    const salonIndex = response.text.indexOf("살롱");
    expect(bakeryIndex).toBeGreaterThan(-1);
    expect(matjibIndex).toBeGreaterThan(bakeryIndex);
    expect(salonIndex).toBeGreaterThan(matjibIndex);
  });

  it("logs out platform and store admins", async () => {
    await request(app.getHttpServer())
      .post("/admin/logout")
      .set("Cookie", adminCookie)
      .expect(302)
      .expect("Location", "/admin");

    await createStore(app, "matjib", "맛집", "owner-secret");
    const ownerLogin = await request(app.getHttpServer())
      .post("/matjib/admin/login")
      .type("form")
      .send({ password: "owner-secret" })
      .expect(302);

    await request(app.getHttpServer())
      .post("/matjib/admin/logout")
      .set("Cookie", ownerLogin.headers["set-cookie"])
      .expect(302)
      .expect("Location", "/matjib/admin");
  });

  it("requires the admin password before rendering admin pages or mutating admin state", async () => {
    await request(app.getHttpServer())
      .get("/admin")
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain("관리자 로그인");
        expect(response.text).not.toContain("예약 관리");
      });

    await request(app.getHttpServer())
      .post("/admin/status")
      .send({ booking_id: 1, status: "confirmed" })
      .expect(401);

    await request(app.getHttpServer())
      .get("/admin/reminders/check")
      .expect(401);

    await request(app.getHttpServer())
      .post("/admin/login")
      .type("form")
      .send({ password: "wrong" })
      .expect(401);

    const loginResponse = await request(app.getHttpServer())
      .post("/admin/login")
      .type("form")
      .send({ password: "test-secret" })
      .expect(302);

    await request(app.getHttpServer())
      .get("/admin")
      .set("Cookie", loginResponse.headers["set-cookie"])
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain("예약 관리");
      });
  });

  it("rate limits repeated failed platform admin logins", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post("/admin/login")
        .type("form")
        .send({ password: "wrong-password" })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post("/admin/login")
      .type("form")
      .send({ password: "wrong-password" })
      .expect(429);
  });

  it("anonymizes booking personal data while preserving operational records", async () => {
    await createSlots(app, adminCookie, "2026-06-30", "13:00", "13:30");

    const created = await request(app.getHttpServer())
      .post("/book")
      .send({
        name: "Privacy Guest",
        contact: "privacy@example.test",
        date: "2026-06-30",
        time: "13:00",
        note: "Delete me"
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/admin/bookings/anonymize")
      .set("Cookie", adminCookie)
      .type("form")
      .send({ booking_id: created.body.booking.id })
      .expect(302);

    const bookings = await request(app.getHttpServer())
      .get("/api/bookings")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(bookings.body[0]).toMatchObject({
      id: created.body.booking.id,
      name: "삭제된 고객",
      contact: "deleted",
      note: null
    });
  });

  it("serves launch readiness pages for health, policies, and refund terms", async () => {
    await request(app.getHttpServer())
      .get("/healthz")
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ ok: true, service: "minical" });
      });

    for (const path of ["/terms", "/privacy", "/refund"]) {
      await request(app.getHttpServer())
        .get(path)
        .expect(200)
        .expect((response) => {
          expect(response.text).toContain("MiniCal");
        });
    }
  });

  it("creates a store signup with its own public and owner admin routes", async () => {
    await request(app.getHttpServer())
      .post("/signup")
      .type("form")
      .send({ slug: "matjib", name: "맛집", password: "owner-secret" })
      .expect(302)
      .expect("Location", "/matjib/admin");

    const db = new BetterSqlite3(path.join(tempRoot, "data", "minical.sqlite3"));
    const stored = db.prepare("SELECT admin_password FROM stores WHERE slug = ?").get("matjib");
    db.close();
    expect(stored.admin_password).not.toBe("owner-secret");
    expect(stored.admin_password).toMatch(/^scrypt\$/);

    const ownerLogin = await request(app.getHttpServer())
      .post("/matjib/admin/login")
      .type("form")
      .send({ password: "owner-secret" })
      .expect(302);

    const ownerCookie = ownerLogin.headers["set-cookie"];

    await request(app.getHttpServer())
      .post("/matjib/admin/availability")
      .set("Cookie", ownerCookie)
      .type("form")
      .send({
        date: "2026-07-01",
        start_time: "12:00",
        end_time: "13:00",
        interval_minutes: "30"
      })
      .expect(302)
      .expect("Location", "/matjib/admin?date=2026-07-01");

    const matjibAvailability = await request(app.getHttpServer())
      .get("/matjib/api/availability?date=2026-07-01")
      .expect(200);

    expect(matjibAvailability.body.slots.map((slot: { time: string }) => slot.time)).toEqual(["12:00", "12:30"]);

    const defaultAvailability = await request(app.getHttpServer())
      .get("/api/availability?date=2026-07-01")
      .expect(200);

    expect(defaultAvailability.body.slots).toHaveLength(0);

    const booking = await request(app.getHttpServer())
      .post("/matjib/book")
      .send({
        name: "Tenant Guest",
        contact: "tenant@example.test",
        date: "2026-07-01",
        time: "12:00"
      })
      .expect(201);

    expect(booking.body.booking).toMatchObject({
      store_slug: "matjib",
      name: "Tenant Guest",
      status: "pending"
    });

    const ownerBookings = await request(app.getHttpServer())
      .get("/matjib/api/bookings")
      .set("Cookie", ownerCookie)
      .expect(200);

    expect(ownerBookings.body).toHaveLength(1);
    expect(ownerBookings.body[0].store_slug).toBe("matjib");
  });

  it("rejects reserved store ids during signup", async () => {
    for (const slug of ["admin", "signup"]) {
      const response = await request(app.getHttpServer())
        .post("/signup")
        .send({ slug, name: "Reserved Store", password: "owner-secret" })
        .expect(400);

      expect(response.body.message).toBe("slug is reserved");
    }
  });

  it("renders signup errors for reserved and duplicate store ids on form posts", async () => {
    await request(app.getHttpServer())
      .post("/signup")
      .type("form")
      .send({ slug: "admin", name: "Reserved Store", password: "owner-secret" })
      .expect(400)
      .expect((response) => {
        expect(response.text).toContain("가게 입점");
        expect(response.text).toContain("다른 가게 아이디를 사용해주세요.");
      });

    await createStore(app, "matjib", "맛집", "owner-secret");

    await request(app.getHttpServer())
      .post("/signup")
      .type("form")
      .send({ slug: "matjib", name: "다른 맛집", password: "owner-secret" })
      .expect(400)
      .expect((response) => {
        expect(response.text).toContain("가게 입점");
        expect(response.text).toContain("이미 사용 중인 가게 아이디입니다.");
      });
  });

  it("keeps two signed-up stores' schedules and bookings isolated", async () => {
    await createStore(app, "matjib", "맛집", "matjib-secret");
    await createStore(app, "salon", "살롱", "salon-secret");

    const matjibLogin = await request(app.getHttpServer())
      .post("/matjib/admin/login")
      .type("form")
      .send({ password: "matjib-secret" })
      .expect(302);

    const salonLogin = await request(app.getHttpServer())
      .post("/salon/admin/login")
      .type("form")
      .send({ password: "salon-secret" })
      .expect(302);

    await createStoreSlots(app, matjibLogin.headers["set-cookie"], "matjib", "2026-07-03", "12:00", "13:00");
    await createStoreSlots(app, salonLogin.headers["set-cookie"], "salon", "2026-07-03", "15:00", "16:00");

    await request(app.getHttpServer())
      .post("/matjib/book")
      .send({
        name: "Matjib Guest",
        contact: "matjib@example.test",
        date: "2026-07-03",
        time: "12:00"
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/salon/book")
      .send({
        name: "Salon Guest",
        contact: "salon@example.test",
        date: "2026-07-03",
        time: "15:00"
      })
      .expect(201);

    const matjibAvailability = await request(app.getHttpServer())
      .get("/matjib/api/availability?date=2026-07-03")
      .expect(200);

    const salonAvailability = await request(app.getHttpServer())
      .get("/salon/api/availability?date=2026-07-03")
      .expect(200);

    expect(matjibAvailability.body.slots.map((slot: { time: string }) => slot.time)).toEqual(["12:30"]);
    expect(salonAvailability.body.slots.map((slot: { time: string }) => slot.time)).toEqual(["15:30"]);

    const matjibBookings = await request(app.getHttpServer())
      .get("/matjib/api/bookings")
      .set("Cookie", matjibLogin.headers["set-cookie"])
      .expect(200);

    const salonBookings = await request(app.getHttpServer())
      .get("/salon/api/bookings")
      .set("Cookie", salonLogin.headers["set-cookie"])
      .expect(200);

    expect(matjibBookings.body.map((booking: { name: string }) => booking.name)).toEqual(["Matjib Guest"]);
    expect(salonBookings.body.map((booking: { name: string }) => booking.name)).toEqual(["Salon Guest"]);
  });

  it("renders a platform admin dashboard with store and booking totals", async () => {
    await request(app.getHttpServer())
      .post("/signup")
      .type("form")
      .send({ slug: "matjib", name: "맛집", password: "owner-secret" })
      .expect(302);

    const ownerLogin = await request(app.getHttpServer())
      .post("/matjib/admin/login")
      .type("form")
      .send({ password: "owner-secret" })
      .expect(302);

    await createStoreSlots(app, ownerLogin.headers["set-cookie"], "matjib", "2026-07-02", "18:00", "18:30");

    await request(app.getHttpServer())
      .post("/matjib/book")
      .send({
        name: "Dashboard Guest",
        contact: "dash@example.test",
        date: "2026-07-02",
        time: "18:00"
      })
      .expect(201);

    const dashboard = await request(app.getHttpServer())
      .get("/admin")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(dashboard.text).toContain("플랫폼 대시보드");
    expect(dashboard.text).toContain("맛집");
    expect(dashboard.text).toContain("/matjib");
    expect(dashboard.text).toContain("Dashboard Guest");
    expect(dashboard.text).toContain("가게별 예약 및 슬롯");
    expect(dashboard.text).toContain("18:00");
    expect(dashboard.text).toContain("예약됨");
  });

  it("fails closed in production when the platform admin password is missing", () => {
    const originalAdminPassword = process.env.ADMIN_PASSWORD;
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.ADMIN_PASSWORD;
    process.env.NODE_ENV = "production";

    expect(() => adminPassword()).toThrow("ADMIN_PASSWORD is required in production");

    if (originalAdminPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("fails startup when TLS verification is disabled", () => {
    const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    expect(() => assertSafeEnvironment()).toThrow("NODE_TLS_REJECT_UNAUTHORIZED=0 is not allowed");

    if (original === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = original;
    }
  });
});

async function createSlots(app: INestApplication, cookie: string, date: string, start: string, end: string) {
  await request(app.getHttpServer())
    .post("/admin/availability")
    .set("Cookie", cookie)
    .type("form")
    .send({
      date,
      start_time: start,
      end_time: end,
      interval_minutes: "30"
    })
    .expect(302);
}

async function createStore(app: INestApplication, slug: string, name: string, password: string) {
  await request(app.getHttpServer())
    .post("/signup")
    .type("form")
    .send({ slug, name, password })
    .expect(302);
}

async function createStoreSlots(
  app: INestApplication,
  cookie: string,
  slug: string,
  date: string,
  start: string,
  end: string
) {
  await request(app.getHttpServer())
    .post(`/${slug}/admin/availability`)
    .set("Cookie", cookie)
    .type("form")
    .send({
      date,
      start_time: start,
      end_time: end,
      interval_minutes: "30"
    })
    .expect(302);
}
