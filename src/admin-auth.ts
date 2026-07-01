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

export function clearAdminCookie(response: Response) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin"
  });
}

export function storeAdminToken(slug: string, password: string) {
  return createHash("sha256").update(`minical:store:${slug}:${password}`).digest("hex");
}

export function isStoreAdminAuthenticated(request: Request, slug: string, password: string) {
  const cookies = parseCookies(request.headers.cookie ?? "");
  const value = cookies[storeCookieName(slug)];
  if (!value) {
    return false;
  }

  const expected = storeAdminToken(slug, password);
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function setStoreAdminCookie(response: Response, slug: string, password: string) {
  response.cookie(storeCookieName(slug), storeAdminToken(slug, password), {
    httpOnly: true,
    sameSite: "lax",
    path: `/${slug}/admin`,
    maxAge: 1000 * 60 * 60 * 12
  });
}

export function clearStoreAdminCookie(response: Response, slug: string) {
  response.clearCookie(storeCookieName(slug), {
    httpOnly: true,
    sameSite: "lax",
    path: `/${slug}/admin`
  });
}

function storeCookieName(slug: string) {
  return `minical_store_${slug}`;
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
