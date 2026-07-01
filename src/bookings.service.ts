import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AvailabilitySlot,
  AvailabilitySlotView,
  Booking,
  BookingStatus,
  CreateAvailabilityInput,
  CreateBookingInput,
  CreateStoreInput,
  PlatformAvailabilitySlotView,
  Store,
  StoreSummary
} from "./booking.types";
import { DatabaseService } from "./database.service";
import { formatNow, MockTelegramLogger } from "./mock-telegram.logger";

const STATUSES: BookingStatus[] = ["pending", "confirmed", "cancelled"];
export const DEFAULT_STORE_SLUG = "main";

@Injectable()
export class BookingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly logger: MockTelegramLogger
  ) {}

  create(input: CreateBookingInput, storeSlug = DEFAULT_STORE_SLUG): Booking {
    const store = this.storeBySlug(storeSlug);
    const name = required(input.name, "name");
    const contact = required(input.contact, "contact");
    const date = required(input.date, "date");
    const time = required(input.time, "time");
    const note = normalize(input.note);
    const now = formatNow();

    if (!this.isSlotBookable(store.id, date, time)) {
      throw new BadRequestException("selected time is not available");
    }

    const result = this.database
      .prepare(
        `INSERT INTO bookings (store_id, name, contact, date, time, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(store.id, name, contact, date, time, note, now, now);

    const booking = this.findById(Number(result.lastInsertRowid));
    this.logger.write(`NEW_BOOKING name=${name} contact=${contact} datetime=${date} ${time} store=${store.slug}`);
    return booking;
  }

  all(storeSlug = DEFAULT_STORE_SLUG): Booking[] {
    const store = this.storeBySlug(storeSlug);
    return this.database
      .prepare(`${bookingSelect()} WHERE b.store_id = ? ORDER BY datetime(b.created_at) DESC, b.id DESC`)
      .all(store.id) as Booking[];
  }

  platformBookings(): Booking[] {
    return this.database
      .prepare(`${bookingSelect()} ORDER BY datetime(b.created_at) DESC, b.id DESC`)
      .all() as Booking[];
  }

  storeSummaries(): StoreSummary[] {
    return this.database
      .prepare(
        `SELECT s.*,
          COUNT(b.id) AS booking_count,
          SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN b.status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count
         FROM stores s
         LEFT JOIN bookings b ON b.store_id = s.id
         GROUP BY s.id
         ORDER BY datetime(s.created_at) ASC, s.id ASC`
      )
      .all() as StoreSummary[];
  }

  publicStores(): Store[] {
    return this.database
      .prepare("SELECT * FROM stores ORDER BY name COLLATE NOCASE ASC, slug ASC")
      .all() as Store[];
  }

  platformAvailability(): PlatformAvailabilitySlotView[] {
    const slots = this.database
      .prepare(
        `SELECT a.*, s.slug AS store_slug, s.name AS store_name
         FROM availability_slots a
         JOIN stores s ON s.id = a.store_id
         ORDER BY s.slug ASC, a.date ASC, a.time ASC`
      )
      .all() as Array<AvailabilitySlot & { store_slug: string; store_name: string }>;

    return slots.map((slot) => {
      const isBooked = this.hasBlockingBooking(slot.store_id, slot.date, slot.time);
      return {
        ...slot,
        is_booked: isBooked,
        is_available: slot.is_active === 1 && !isBooked
      };
    });
  }

  createStore(input: CreateStoreInput): Store {
    const slug = required(input.slug, "slug").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,30}$/.test(slug)) {
      throw new BadRequestException("slug must be 3-31 lowercase letters, numbers, or hyphens");
    }
    if (["admin", "api", "book", "signup", "stores"].includes(slug)) {
      throw new BadRequestException("slug is reserved");
    }
    if (this.storeExists(slug)) {
      throw new BadRequestException("slug already exists");
    }

    const name = required(input.name, "name");
    const password = required(input.password, "password");
    const now = formatNow();
    const result = this.database
      .prepare(
        `INSERT INTO stores (slug, name, admin_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(slug, name, password, now, now);

    return this.storeById(Number(result.lastInsertRowid));
  }

  storeBySlug(slugInput: unknown): Store {
    const slug = required(String(slugInput ?? ""), "store");
    const store = this.database.prepare("SELECT * FROM stores WHERE slug = ?").get(slug) as Store | undefined;
    if (!store) {
      throw new NotFoundException(`store ${slug} not found`);
    }
    return store;
  }

  publicAvailability(dateInput: unknown, storeSlug = DEFAULT_STORE_SLUG): AvailabilitySlotView[] {
    const date = required(String(dateInput ?? ""), "date");
    return this.availabilityForDate(this.storeBySlug(storeSlug).id, date).filter((slot) => slot.is_available);
  }

  publicAvailabilityMonth(monthInput: unknown, storeSlug = DEFAULT_STORE_SLUG): string[] {
    const store = this.storeBySlug(storeSlug);
    const month = String(monthInput ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException("month must use YYYY-MM format");
    }

    const rows = this.database
      .prepare(
        `SELECT DISTINCT date
         FROM availability_slots
         WHERE store_id = ? AND date LIKE ? AND is_active = 1
         ORDER BY date ASC`
      )
      .all(store.id, `${month}-%`) as Array<{ date: string }>;

    return rows
      .map((row) => row.date)
      .filter((date) => this.publicAvailability(date, store.slug).length > 0);
  }

  adminAvailability(dateInput: unknown, storeSlug = DEFAULT_STORE_SLUG): AvailabilitySlotView[] {
    const date = required(String(dateInput ?? ""), "date");
    return this.availabilityForDate(this.storeBySlug(storeSlug).id, date);
  }

  createAvailability(input: CreateAvailabilityInput, storeSlug = DEFAULT_STORE_SLUG): AvailabilitySlot[] {
    const store = this.storeBySlug(storeSlug);
    const date = required(input.date, "date");
    const start = required(input.start_time, "start_time");
    const end = required(input.end_time, "end_time");
    const interval = Number(input.interval_minutes ?? "30");
    if (!Number.isInteger(interval) || interval <= 0 || interval > 240) {
      throw new BadRequestException("interval_minutes must be a positive integer up to 240");
    }

    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    if (endMinutes <= startMinutes) {
      throw new BadRequestException("end_time must be after start_time");
    }

    const now = formatNow();
    const slots: AvailabilitySlot[] = [];
    const insert = this.database.prepare(
      `INSERT INTO availability_slots (store_id, date, time, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(store_id, date, time) DO UPDATE SET is_active = 1, updated_at = excluded.updated_at`
    );

    for (let minute = startMinutes; minute < endMinutes; minute += interval) {
      const time = minutesToTime(minute);
      insert.run(store.id, date, time, now, now);
      slots.push(this.findSlot(store.id, date, time));
    }

    return slots;
  }

  toggleAvailability(slotIdInput: unknown, isActiveInput: unknown, storeSlug = DEFAULT_STORE_SLUG): AvailabilitySlot {
    const store = this.storeBySlug(storeSlug);
    const slotId = Number(slotIdInput);
    if (!Number.isInteger(slotId) || slotId <= 0) {
      throw new BadRequestException("slot_id is required");
    }

    const isActive = ["1", "true", "on", "active"].includes(String(isActiveInput ?? "").toLowerCase()) ? 1 : 0;
    const now = formatNow();
    const result = this.database
      .prepare("UPDATE availability_slots SET is_active = ?, updated_at = ? WHERE id = ? AND store_id = ?")
      .run(isActive, now, slotId, store.id);

    if (result.changes === 0) {
      throw new NotFoundException(`slot ${slotId} not found`);
    }

    return this.database.prepare("SELECT * FROM availability_slots WHERE id = ? AND store_id = ?").get(slotId, store.id) as AvailabilitySlot;
  }

  copyAvailability(sourceDateInput: unknown, targetDateInput: unknown, storeSlug = DEFAULT_STORE_SLUG): AvailabilitySlot[] {
    const store = this.storeBySlug(storeSlug);
    const sourceDate = required(String(sourceDateInput ?? ""), "source_date");
    const targetDate = required(String(targetDateInput ?? ""), "target_date");
    if (sourceDate === targetDate) {
      throw new BadRequestException("source_date and target_date must be different");
    }

    const sourceSlots = this.database
      .prepare("SELECT * FROM availability_slots WHERE store_id = ? AND date = ? ORDER BY time ASC")
      .all(store.id, sourceDate) as AvailabilitySlot[];

    if (!sourceSlots.length) {
      throw new BadRequestException("source_date has no slots to copy");
    }

    const now = formatNow();
    const upsert = this.database.prepare(
      `INSERT INTO availability_slots (store_id, date, time, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(store_id, date, time) DO UPDATE SET
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    );

    for (const slot of sourceSlots) {
      upsert.run(store.id, targetDate, slot.time, slot.is_active, now, now);
    }

    return this.database
      .prepare("SELECT * FROM availability_slots WHERE store_id = ? AND date = ? ORDER BY time ASC")
      .all(store.id, targetDate) as AvailabilitySlot[];
  }

  findById(id: number): Booking {
    const booking = this.database.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as
      | Booking
      | undefined;
    if (!booking) {
      throw new NotFoundException(`booking ${id} not found`);
    }
    return this.database.prepare(`${bookingSelect()} WHERE b.id = ?`).get(id) as Booking;
  }

  updateStatus(idInput: unknown, statusInput: unknown, storeSlug = DEFAULT_STORE_SLUG): Booking {
    const store = this.storeBySlug(storeSlug);
    const id = Number(idInput);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("booking_id is required");
    }

    const status = String(statusInput ?? "") as BookingStatus;
    if (!STATUSES.includes(status)) {
      throw new BadRequestException("status must be pending, confirmed, or cancelled");
    }

    const now = formatNow();
    const result = this.database
      .prepare("UPDATE bookings SET status = ?, updated_at = ? WHERE id = ? AND store_id = ?")
      .run(status, now, id, store.id);

    if (result.changes === 0) {
      throw new NotFoundException(`booking ${id} not found`);
    }

    this.logger.write(`STATUS_CHANGED id=${id} status=${status}`);
    return this.findById(id);
  }

  checkReminders(now = new Date()): Booking[] {
    const confirmed = this.database
      .prepare("SELECT * FROM bookings WHERE status = 'confirmed' AND reminded_at IS NULL ORDER BY date ASC, time ASC")
      .all() as Booking[];

    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);
    const reminded: Booking[] = [];

    for (const booking of confirmed) {
      const startsAt = parseBookingDateTime(booking.date, booking.time);
      if (startsAt >= now && startsAt <= windowEnd) {
        const remindedAt = formatNow(now);
        this.database
          .prepare("UPDATE bookings SET reminded_at = ?, updated_at = ? WHERE id = ? AND reminded_at IS NULL")
          .run(remindedAt, remindedAt, booking.id);
        this.logger.write(
          `REMINDER booking_id=${booking.id} name=${booking.name} datetime=${booking.date} ${booking.time}`
        );
        reminded.push({ ...booking, reminded_at: remindedAt, updated_at: remindedAt });
      }
    }

    return reminded;
  }

  private availabilityForDate(storeId: number, date: string): AvailabilitySlotView[] {
    const slots = this.database
      .prepare("SELECT * FROM availability_slots WHERE store_id = ? AND date = ? ORDER BY time ASC")
      .all(storeId, date) as AvailabilitySlot[];

    return slots.map((slot) => {
      const isBooked = this.hasBlockingBooking(slot.store_id, slot.date, slot.time);
      return {
        ...slot,
        is_booked: isBooked,
        is_available: slot.is_active === 1 && !isBooked
      };
    });
  }

  private isSlotBookable(storeId: number, date: string, time: string) {
    const slot = this.database
      .prepare("SELECT * FROM availability_slots WHERE store_id = ? AND date = ? AND time = ? AND is_active = 1")
      .get(storeId, date, time) as AvailabilitySlot | undefined;

    return Boolean(slot) && !this.hasBlockingBooking(storeId, date, time);
  }

  private hasBlockingBooking(storeId: number, date: string, time: string) {
    const booking = this.database
      .prepare("SELECT id FROM bookings WHERE store_id = ? AND date = ? AND time = ? AND status IN ('pending', 'confirmed') LIMIT 1")
      .get(storeId, date, time);
    return Boolean(booking);
  }

  private findSlot(storeId: number, date: string, time: string) {
    return this.database.prepare("SELECT * FROM availability_slots WHERE store_id = ? AND date = ? AND time = ?").get(storeId, date, time) as AvailabilitySlot;
  }

  private storeExists(slug: string) {
    return Boolean(this.database.prepare("SELECT id FROM stores WHERE slug = ? LIMIT 1").get(slug));
  }

  private storeById(id: number): Store {
    return this.database.prepare("SELECT * FROM stores WHERE id = ?").get(id) as Store;
  }
}

function bookingSelect() {
  return `SELECT b.*, s.slug AS store_slug, s.name AS store_name
    FROM bookings b
    JOIN stores s ON s.id = b.store_id`;
}

function required(value: string | undefined, field: string) {
  const normalized = normalize(value);
  if (!normalized) {
    throw new BadRequestException(`${field} is required`);
  }
  return normalized;
}

function normalize(value: string | undefined) {
  return typeof value === "string" ? value.trim() : undefined;
}

function parseBookingDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function parseTimeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new BadRequestException("time must use HH:mm format");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new BadRequestException("time must use HH:mm format");
  }
  return hour * 60 + minute;
}

function minutesToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
