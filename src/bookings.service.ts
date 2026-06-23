import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AvailabilitySlot,
  AvailabilitySlotView,
  Booking,
  BookingStatus,
  CreateAvailabilityInput,
  CreateBookingInput
} from "./booking.types";
import { DatabaseService } from "./database.service";
import { formatNow, MockTelegramLogger } from "./mock-telegram.logger";

const STATUSES: BookingStatus[] = ["pending", "confirmed", "cancelled"];

@Injectable()
export class BookingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly logger: MockTelegramLogger
  ) {}

  create(input: CreateBookingInput): Booking {
    const name = required(input.name, "name");
    const contact = required(input.contact, "contact");
    const date = required(input.date, "date");
    const time = required(input.time, "time");
    const note = normalize(input.note);
    const now = formatNow();

    if (!this.isSlotBookable(date, time)) {
      throw new BadRequestException("selected time is not available");
    }

    const result = this.database
      .prepare(
        `INSERT INTO bookings (name, contact, date, time, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(name, contact, date, time, note, now, now);

    const booking = this.findById(Number(result.lastInsertRowid));
    this.logger.write(`NEW_BOOKING name=${name} contact=${contact} datetime=${date} ${time}`);
    return booking;
  }

  all(): Booking[] {
    return this.database
      .prepare("SELECT * FROM bookings ORDER BY datetime(created_at) DESC, id DESC")
      .all() as Booking[];
  }

  publicAvailability(dateInput: unknown): AvailabilitySlotView[] {
    const date = required(String(dateInput ?? ""), "date");
    return this.availabilityForDate(date).filter((slot) => slot.is_available);
  }

  publicAvailabilityMonth(monthInput: unknown): string[] {
    const month = String(monthInput ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException("month must use YYYY-MM format");
    }

    const rows = this.database
      .prepare(
        `SELECT DISTINCT date
         FROM availability_slots
         WHERE date LIKE ? AND is_active = 1
         ORDER BY date ASC`
      )
      .all(`${month}-%`) as Array<{ date: string }>;

    return rows
      .map((row) => row.date)
      .filter((date) => this.publicAvailability(date).length > 0);
  }

  adminAvailability(dateInput: unknown): AvailabilitySlotView[] {
    const date = required(String(dateInput ?? ""), "date");
    return this.availabilityForDate(date);
  }

  createAvailability(input: CreateAvailabilityInput): AvailabilitySlot[] {
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
      `INSERT INTO availability_slots (date, time, is_active, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(date, time) DO UPDATE SET is_active = 1, updated_at = excluded.updated_at`
    );

    for (let minute = startMinutes; minute < endMinutes; minute += interval) {
      const time = minutesToTime(minute);
      insert.run(date, time, now, now);
      slots.push(this.findSlot(date, time));
    }

    return slots;
  }

  toggleAvailability(slotIdInput: unknown, isActiveInput: unknown): AvailabilitySlot {
    const slotId = Number(slotIdInput);
    if (!Number.isInteger(slotId) || slotId <= 0) {
      throw new BadRequestException("slot_id is required");
    }

    const isActive = ["1", "true", "on", "active"].includes(String(isActiveInput ?? "").toLowerCase()) ? 1 : 0;
    const now = formatNow();
    const result = this.database
      .prepare("UPDATE availability_slots SET is_active = ?, updated_at = ? WHERE id = ?")
      .run(isActive, now, slotId);

    if (result.changes === 0) {
      throw new NotFoundException(`slot ${slotId} not found`);
    }

    return this.database.prepare("SELECT * FROM availability_slots WHERE id = ?").get(slotId) as AvailabilitySlot;
  }

  copyAvailability(sourceDateInput: unknown, targetDateInput: unknown): AvailabilitySlot[] {
    const sourceDate = required(String(sourceDateInput ?? ""), "source_date");
    const targetDate = required(String(targetDateInput ?? ""), "target_date");
    if (sourceDate === targetDate) {
      throw new BadRequestException("source_date and target_date must be different");
    }

    const sourceSlots = this.database
      .prepare("SELECT * FROM availability_slots WHERE date = ? ORDER BY time ASC")
      .all(sourceDate) as AvailabilitySlot[];

    if (!sourceSlots.length) {
      throw new BadRequestException("source_date has no slots to copy");
    }

    const now = formatNow();
    const upsert = this.database.prepare(
      `INSERT INTO availability_slots (date, time, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date, time) DO UPDATE SET
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    );

    for (const slot of sourceSlots) {
      upsert.run(targetDate, slot.time, slot.is_active, now, now);
    }

    return this.database
      .prepare("SELECT * FROM availability_slots WHERE date = ? ORDER BY time ASC")
      .all(targetDate) as AvailabilitySlot[];
  }

  findById(id: number): Booking {
    const booking = this.database.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as
      | Booking
      | undefined;
    if (!booking) {
      throw new NotFoundException(`booking ${id} not found`);
    }
    return booking;
  }

  updateStatus(idInput: unknown, statusInput: unknown): Booking {
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
      .prepare("UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, id);

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

  private availabilityForDate(date: string): AvailabilitySlotView[] {
    const slots = this.database
      .prepare("SELECT * FROM availability_slots WHERE date = ? ORDER BY time ASC")
      .all(date) as AvailabilitySlot[];

    return slots.map((slot) => {
      const isBooked = this.hasBlockingBooking(slot.date, slot.time);
      return {
        ...slot,
        is_booked: isBooked,
        is_available: slot.is_active === 1 && !isBooked
      };
    });
  }

  private isSlotBookable(date: string, time: string) {
    const slot = this.database
      .prepare("SELECT * FROM availability_slots WHERE date = ? AND time = ? AND is_active = 1")
      .get(date, time) as AvailabilitySlot | undefined;

    return Boolean(slot) && !this.hasBlockingBooking(date, time);
  }

  private hasBlockingBooking(date: string, time: string) {
    const booking = this.database
      .prepare("SELECT id FROM bookings WHERE date = ? AND time = ? AND status IN ('pending', 'confirmed') LIMIT 1")
      .get(date, time);
    return Boolean(booking);
  }

  private findSlot(date: string, time: string) {
    return this.database.prepare("SELECT * FROM availability_slots WHERE date = ? AND time = ?").get(date, time) as AvailabilitySlot;
  }
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
