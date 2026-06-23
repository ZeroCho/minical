import { createHash, timingSafeEqual } from "crypto";
import { Request, Response } from "express";

const COOKIE_NAME = "minical_admin";

export function adminPassword() {
  return process.env.ADMIN_PASSWORD ?? "minical-admin";
}

export function adminToken() {
  return createHash("sha256").update(`minical:${adminPassword()}`).digest("hex");
}

export function isAdminAuthenticated(request: Request) {
  const cookies = parseCookies(request.headers.cookie ?? "");
  const value = cookies[COOKIE_NAME];
  if (!value) {
    return false;
  }

  const expected = adminToken();
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function setAdminCookie(response: Response) {
  response.cookie(COOKIE_NAME, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 1000 * 60 * 60 * 12
  });
}

function parseCookies(header: string) {
  return header.split(";").reduce<Record<string, string>>((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey) {
      cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    }
    return cookies;
  }, {});
}
