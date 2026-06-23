export type BookingStatus = "pending" | "confirmed" | "cancelled";

export interface Booking {
  id: number;
  name: string;
  contact: string;
  date: string;
  time: string;
  note: string | null;
  status: BookingStatus;
  reminded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySlot {
  id: number;
  date: string;
  time: string;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySlotView extends AvailabilitySlot {
  is_booked: boolean;
  is_available: boolean;
}

export interface CreateBookingInput {
  name?: string;
  contact?: string;
  date?: string;
  time?: string;
  note?: string;
}

export interface CreateAvailabilityInput {
  date?: string;
  start_time?: string;
  end_time?: string;
  interval_minutes?: string;
}
