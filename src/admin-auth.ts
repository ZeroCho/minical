import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { Request, Response } from "express";

const COOKIE_NAME = "minical_admin";
const PASSWORD_HASH_PREFIX = "scrypt";

export function adminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (password) {
    return password;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PASSWORD is required in production");
  }
  return "minical-admin";
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
    secure: secureCookies(),
    path: "/admin",
    maxAge: 1000 * 60 * 60 * 12
  });
}

export function clearAdminCookie(response: Response) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/admin"
  });
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${PASSWORD_HASH_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedPassword: string) {
  if (!storedPassword.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    return timingSafeStringEqual(password, storedPassword);
  }

  const [, salt, expectedHash] = storedPassword.split("$");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeStringEqual(actualHash, expectedHash);
}

export function storeAdminToken(slug: string, storedPassword: string) {
  return createHash("sha256").update(`minical:store:${slug}:${storedPassword}`).digest("hex");
}

export function isStoreAdminAuthenticated(request: Request, slug: string, storedPassword: string) {
  const cookies = parseCookies(request.headers.cookie ?? "");
  const value = cookies[storeCookieName(slug)];
  if (!value) {
    return false;
  }

  const expected = storeAdminToken(slug, storedPassword);
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function setStoreAdminCookie(response: Response, slug: string, storedPassword: string) {
  response.cookie(storeCookieName(slug), storeAdminToken(slug, storedPassword), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: `/${slug}/admin`,
    maxAge: 1000 * 60 * 60 * 12
  });
}

export function clearStoreAdminCookie(response: Response, slug: string) {
  response.clearCookie(storeCookieName(slug), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: `/${slug}/admin`
  });
}

function storeCookieName(slug: string) {
  return `minical_store_${slug}`;
}

function secureCookies() {
  return process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
}

function timingSafeStringEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
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
