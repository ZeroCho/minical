import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { Request, Response } from "express";
import {
  adminPassword,
  clearAdminCookie,
  clearStoreAdminCookie,
  isAdminAuthenticated,
  isStoreAdminAuthenticated,
  setAdminCookie,
  setStoreAdminCookie
} from "./admin-auth";
import { BookingsService, DEFAULT_STORE_SLUG } from "./bookings.service";
import {
  renderAdminLoginPage,
  renderAdminPage,
  renderLandingPage,
  renderPlatformAdminPage,
  renderPublicPage,
  renderStoreListPage,
  renderSignupPage
} from "./views";

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get("/")
  publicPage(@Res() response: Response) {
    response.type("html").send(renderLandingPage());
  }

  @Get("/signup")
  signupPage(@Res() response: Response) {
    response.type("html").send(renderSignupPage());
  }

  @Get("/stores")
  storeListPage(@Res() response: Response) {
    response.type("html").send(renderStoreListPage(this.bookings.publicStores()));
  }

  @Post("/signup")
  signup(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    try {
      const store = this.bookings.createStore(body);
      if (wantsJson(request)) {
        response.status(201).json({ ok: true, store });
        return;
      }

      response.redirect(302, `/${store.slug}/admin`);
    } catch (error) {
      if (wantsJson(request) || !(error instanceof BadRequestException)) {
        throw error;
      }

      response.status(400).type("html").send(renderSignupPage(signupErrorMessage(error)));
    }
  }

  @Post("/book")
  createBooking(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    const booking = this.bookings.create(body, DEFAULT_STORE_SLUG);
    if (wantsJson(request)) {
      response.status(201).json({ ok: true, booking });
      return;
    }

    response.status(201).type("html").send(renderPublicPage({ slug: DEFAULT_STORE_SLUG, name: "MiniCal", basePath: "" }, `예약이 접수되었습니다. 접수번호 #${booking.id}`));
  }

  @Get("/admin")
  adminPage(@Req() request: Request, @Res() response: Response) {
    if (!isAdminAuthenticated(request)) {
      response.type("html").send(renderAdminLoginPage());
      return;
    }

    response
      .type("html")
      .send(
        renderPlatformAdminPage(
          this.bookings.storeSummaries(),
          this.bookings.platformBookings(),
          this.bookings.platformAvailability()
        )
      );
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

  @Post("/admin/logout")
  logout(@Res() response: Response) {
    clearAdminCookie(response);
    response.redirect(302, "/admin");
  }

  @Post("/admin/status")
  @HttpCode(200)
  updateStatus(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    requireAdmin(request);
    const booking = this.bookings.updateStatus(body.booking_id, body.status, DEFAULT_STORE_SLUG);
    if (wantsJson(request)) {
      response.json({ ok: true, booking });
      return;
    }

    response.redirect(302, "/admin");
  }

  @Post("/admin/availability")
  createAvailability(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    requireAdmin(request);
    const slots = this.bookings.createAvailability(body, DEFAULT_STORE_SLUG);
    if (wantsJson(request)) {
      response.status(201).json({ ok: true, slots });
      return;
    }

    response.redirect(302, `/admin?date=${encodeURIComponent(body.date ?? "")}`);
  }

  @Post("/admin/availability/toggle")
  toggleAvailability(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    requireAdmin(request);
    const slot = this.bookings.toggleAvailability(body.slot_id, body.is_active, DEFAULT_STORE_SLUG);
    if (wantsJson(request)) {
      response.json({ ok: true, slot });
      return;
    }

    response.redirect(302, `/admin?date=${encodeURIComponent(body.date ?? slot.date)}`);
  }

  @Post("/admin/availability/copy")
  copyAvailability(@Body() body: Record<string, string>, @Req() request: Request, @Res() response: Response) {
    requireAdmin(request);
    const slots = this.bookings.copyAvailability(body.source_date, body.target_date, DEFAULT_STORE_SLUG);
    if (wantsJson(request)) {
      response.status(201).json({ ok: true, slots });
      return;
    }

    response.redirect(302, `/admin?date=${encodeURIComponent(body.target_date ?? "")}`);
  }

  @Get("/api/bookings")
  apiBookings() {
    return this.bookings.all(DEFAULT_STORE_SLUG);
  }

  @Get("/api/availability")
  apiAvailability(@Req() request: Request) {
    return {
      date: request.query.date,
      slots: this.bookings.publicAvailability(request.query.date, DEFAULT_STORE_SLUG)
    };
  }

  @Get("/api/availability/month")
  apiAvailabilityMonth(@Req() request: Request) {
    const availableDates = this.bookings.publicAvailabilityMonth(request.query.month, DEFAULT_STORE_SLUG);
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
      slots: this.bookings.adminAvailability(request.query.date, DEFAULT_STORE_SLUG)
    };
  }

  @Get("/admin/reminders/check")
  checkReminders(@Req() request: Request) {
    requireAdmin(request);
    const reminded = this.bookings.checkReminders();
    return { ok: true, reminded_count: reminded.length, reminded };
  }

  @Get("/:storeSlug")
  storePublicPage(@Param("storeSlug") storeSlug: string, @Res() response: Response) {
    const store = this.bookings.storeBySlug(storeSlug);
    response.type("html").send(renderPublicPage({ slug: store.slug, name: store.name, basePath: `/${store.slug}` }));
  }

  @Post("/:storeSlug/book")
  createStoreBooking(
    @Param("storeSlug") storeSlug: string,
    @Body() body: Record<string, string>,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const store = this.bookings.storeBySlug(storeSlug);
    const booking = this.bookings.create(body, store.slug);
    if (wantsJson(request)) {
      response.status(201).json({ ok: true, booking });
      return;
    }

    response.status(201).type("html").send(renderPublicPage({ slug: store.slug, name: store.name, basePath: `/${store.slug}` }, `예약이 접수되었습니다. 접수번호 #${booking.id}`));
  }

  @Get("/:storeSlug/admin")
  storeAdminPage(@Param("storeSlug") storeSlug: string, @Req() request: Request, @Res() response: Response) {
    const store = this.bookings.storeBySlug(storeSlug);
    if (!isStoreAdminAuthenticated(request, store.slug, store.admin_password)) {
      response.type("html").send(renderAdminLoginPage(undefined, `/${store.slug}/admin/login`, `/${store.slug}`));
      return;
    }

    const selectedDate = typeof request.query.date === "string" ? request.query.date : todayString();
    response.type("html").send(renderAdminPage(store, this.bookings.all(store.slug), this.bookings.adminAvailability(selectedDate, store.slug), selectedDate));
  }

  @Post("/:storeSlug/admin/login")
  storeLogin(
    @Param("storeSlug") storeSlug: string,
    @Body() body: Record<string, string>,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const store = this.bookings.storeBySlug(storeSlug);
    if (String(body.password ?? "") !== store.admin_password) {
      if (wantsJson(request)) {
        throw new UnauthorizedException("invalid store admin password");
      }
      response.status(401).type("html").send(renderAdminLoginPage("비밀번호가 올바르지 않습니다.", `/${store.slug}/admin/login`, `/${store.slug}`));
      return;
    }

    setStoreAdminCookie(response, store.slug, store.admin_password);
    response.redirect(302, `/${store.slug}/admin`);
  }

  @Post("/:storeSlug/admin/logout")
  storeLogout(@Param("storeSlug") storeSlug: string, @Res() response: Response) {
    const store = this.bookings.storeBySlug(storeSlug);
    clearStoreAdminCookie(response, store.slug);
    response.redirect(302, `/${store.slug}/admin`);
  }

  @Post("/:storeSlug/admin/status")
  @HttpCode(200)
  updateStoreStatus(
    @Param("storeSlug") storeSlug: string,
    @Body() body: Record<string, string>,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const store = requireStoreAdmin(this.bookings, storeSlug, request);
    const booking = this.bookings.updateStatus(body.booking_id, body.status, store.slug);
    if (wantsJson(request)) {
      response.json({ ok: true, booking });
      return;
    }

    response.redirect(302, `/${store.slug}/admin`);
  }

  @Post("/:storeSlug/admin/availability")
  createStoreAvailability(
    @Param("storeSlug") storeSlug: string,
    @Body() body: Record<string, string>,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const store = requireStoreAdmin(this.bookings, storeSlug, request);
    const slots = this.bookings.createAvailability(body, store.slug);
    if (wantsJson(request)) {
      response.status(201).json({ ok: true, slots });
      return;
    }

    response.redirect(302, `/${store.slug}/admin?date=${encodeURIComponent(body.date ?? "")}`);
  }

  @Post("/:storeSlug/admin/availability/toggle")
  toggleStoreAvailability(
    @Param("storeSlug") storeSlug: string,
    @Body() body: Record<string, string>,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const store = requireStoreAdmin(this.bookings, storeSlug, request);
    const slot = this.bookings.toggleAvailability(body.slot_id, body.is_active, store.slug);
    if (wantsJson(request)) {
      response.json({ ok: true, slot });
      return;
    }

    response.redirect(302, `/${store.slug}/admin?date=${encodeURIComponent(body.date ?? slot.date)}`);
  }

  @Post("/:storeSlug/admin/availability/copy")
  copyStoreAvailability(
    @Param("storeSlug") storeSlug: string,
    @Body() body: Record<string, string>,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const store = requireStoreAdmin(this.bookings, storeSlug, request);
    const slots = this.bookings.copyAvailability(body.source_date, body.target_date, store.slug);
    if (wantsJson(request)) {
      response.status(201).json({ ok: true, slots });
      return;
    }

    response.redirect(302, `/${store.slug}/admin?date=${encodeURIComponent(body.target_date ?? "")}`);
  }

  @Get("/:storeSlug/api/bookings")
  apiStoreBookings(@Param("storeSlug") storeSlug: string, @Req() request: Request) {
    const store = requireStoreAdmin(this.bookings, storeSlug, request);
    return this.bookings.all(store.slug);
  }

  @Get("/:storeSlug/api/availability")
  apiStoreAvailability(@Param("storeSlug") storeSlug: string, @Req() request: Request) {
    const store = this.bookings.storeBySlug(storeSlug);
    return {
      date: request.query.date,
      slots: this.bookings.publicAvailability(request.query.date, store.slug)
    };
  }

  @Get("/:storeSlug/api/availability/month")
  apiStoreAvailabilityMonth(@Param("storeSlug") storeSlug: string, @Req() request: Request) {
    const store = this.bookings.storeBySlug(storeSlug);
    const availableDates = this.bookings.publicAvailabilityMonth(request.query.month, store.slug);
    return {
      month: request.query.month,
      available_dates: availableDates
    };
  }

  @Get("/:storeSlug/api/admin/availability")
  apiStoreAdminAvailability(@Param("storeSlug") storeSlug: string, @Req() request: Request) {
    const store = requireStoreAdmin(this.bookings, storeSlug, request);
    return {
      date: request.query.date,
      slots: this.bookings.adminAvailability(request.query.date, store.slug)
    };
  }
}

function requireAdmin(request: Request) {
  if (!isAdminAuthenticated(request)) {
    throw new UnauthorizedException("admin password required");
  }
}

function requireStoreAdmin(bookings: BookingsService, storeSlug: string, request: Request) {
  const store = bookings.storeBySlug(storeSlug);
  if (!isStoreAdminAuthenticated(request, store.slug, store.admin_password)) {
    throw new UnauthorizedException("store admin password required");
  }
  return store;
}

function wantsJson(request: Request) {
  return request.is("application/json") || request.accepts(["html", "json"]) === "json";
}

function signupErrorMessage(error: BadRequestException) {
  const response = error.getResponse();
  const message =
    typeof response === "object" && response !== null && "message" in response
      ? String((response as { message: unknown }).message)
      : error.message;

  if (message === "slug is reserved") {
    return "예약어입니다. 다른 가게 아이디를 사용해주세요.";
  }
  if (message === "slug already exists") {
    return "이미 사용 중인 가게 아이디입니다.";
  }
  return "입점 정보를 확인해주세요.";
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}
