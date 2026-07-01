export type BookingStatus = "pending" | "confirmed" | "cancelled";

export interface Booking {
  id: number;
  store_id: number;
  store_slug: string;
  store_name: string;
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
  store_id: number;
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

export interface PlatformAvailabilitySlotView extends AvailabilitySlotView {
  store_slug: string;
  store_name: string;
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

export interface Store {
  id: number;
  slug: string;
  name: string;
  admin_password: string;
  created_at: string;
  updated_at: string;
}

export interface CreateStoreInput {
  slug?: string;
  name?: string;
  password?: string;
}

export interface StoreSummary extends Store {
  booking_count: number;
  pending_count: number;
  confirmed_count: number;
}
