import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { AppModule } from "../src/app.module";

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
      .expect(200);

    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({
      id: 1,
      name: "Kim Hana",
      status: "pending"
    });

    const log = fs.readFileSync(path.join(tempRoot, "logs", "telegram_mock.log"), "utf8");
    expect(log).toContain("NEW_BOOKING name=Kim Hana contact=010-1234-5678 datetime=2026-06-23 16:30");
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

    const listResponse = await request(app.getHttpServer()).get("/api/bookings").expect(200);
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

  it("renders admin date selection as a calendar UI", async () => {
    const response = await request(app.getHttpServer())
      .get("/admin?date=2026-06-29")
      .set("Cookie", adminCookie)
      .expect(200);

    expect(response.text).toContain("admin-calendar-grid");
    expect(response.text).toContain("copy-source-date");
    expect(response.text).toContain("copy-target-date");
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
