import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { Request, Response } from "express";
import { adminPassword, isAdminAuthenticated, setAdminCookie } from "./admin-auth";
import { BookingsService } from "./bookings.service";
import { renderAdminLoginPage, renderAdminPage, renderPublicPage } from "./views";

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get("/")
  publicPage(@Res() response: Response) {
    response.type("html").send(renderPublicPage());
  }

  @Post("/book")
  createBooking(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    const booking = this.bookings.create(body);
    if (wantsJson(request)) {
      response.status(201).json({ ok: true, booking });
      return;
    }

    response.status(201).type("html").send(renderPublicPage(`예약이 접수되었습니다. 접수번호 #${booking.id}`));
  }

  @Get("/admin")
  adminPage(@Req() request: Request, @Res() response: Response) {
    if (!isAdminAuthenticated(request)) {
      response.type("html").send(renderAdminLoginPage());
      return;
    }

    const selectedDate = typeof request.query.date === "string" ? request.query.date : todayString();
    response.type("html").send(renderAdminPage(this.bookings.all(), this.bookings.adminAvailability(selectedDate), selectedDate));
  }

  @Post("/admin/login")
  login(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    if (String(body.password ?? "") !== adminPassword()) {
      if (wantsJson(request)) {
        throw new UnauthorizedException("invalid admin password");
      }
      response.status(401).type("html").send(renderAdminLoginPage("비밀번호가 올바르지 않습니다."));
      return;
    }

    setAdminCookie(response);
    response.redirect(302, "/admin");
  }

  @Post("/admin/status")
  @HttpCode(200)
  updateStatus(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    requireAdmin(request);
    const booking = this.bookings.updateStatus(body.booking_id, body.status);
    if (wantsJson(request)) {
      response.json({ ok: true, booking });
      return;
    }

    response.redirect(302, "/admin");
  }

  @Post("/admin/availability")
  createAvailability(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    requireAdmin(request);
    const slots = this.bookings.createAvailability(body);
    if (wantsJson(request)) {
      response.status(201).json({ ok: true, slots });
      return;
    }

    response.redirect(302, `/admin?date=${encodeURIComponent(body.date ?? "")}`);
  }

  @Post("/admin/availability/toggle")
  toggleAvailability(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    requireAdmin(request);
    const slot = this.bookings.toggleAvailability(body.slot_id, body.is_active);
    if (wantsJson(request)) {
      response.json({ ok: true, slot });
      return;
    }

    response.redirect(302, `/admin?date=${encodeURIComponent(body.date ?? slot.date)}`);
  }

  @Get("/api/bookings")
  apiBookings() {
    return this.bookings.all();
  }

  @Get("/api/availability")
  apiAvailability(@Req() request: Request) {
    return {
      date: request.query.date,
      slots: this.bookings.publicAvailability(request.query.date)
    };
  }

  @Get("/api/availability/month")
  apiAvailabilityMonth(@Req() request: Request) {
    const availableDates = this.bookings.publicAvailabilityMonth(request.query.month);
    return {
      month: request.query.month,
      available_dates: availableDates
    };
  }

  @Get("/api/admin/availability")
  apiAdminAvailability(@Req() request: Request) {
    requireAdmin(request);
    return {
      date: request.query.date,
      slots: this.bookings.adminAvailability(request.query.date)
    };
  }

  @Get("/admin/reminders/check")
  checkReminders(@Req() request: Request) {
    requireAdmin(request);
    const reminded = this.bookings.checkReminders();
    return { ok: true, reminded_count: reminded.length, reminded };
  }
}

function requireAdmin(request: Request) {
  if (!isAdminAuthenticated(request)) {
    throw new UnauthorizedException("admin password required");
  }
}

function wantsJson(request: Request) {
  return request.is("application/json") || request.accepts(["html", "json"]) === "json";
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}
