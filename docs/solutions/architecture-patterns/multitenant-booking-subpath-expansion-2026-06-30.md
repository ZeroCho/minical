---
title: Multitenant booking subpath expansion
date: 2026-06-30
category: architecture-patterns
module: booking-platform
problem_type: architecture_pattern
component: service_object
severity: medium
applies_when:
  - "Expanding a single-store booking app into store-specific public and owner-admin routes"
  - "Preserving root routes while adding tenant subpaths"
  - "Adding tenant isolation to existing SQLite-backed bookings and availability slots"
tags: [multitenancy, booking, sqlite, routing, authentication]
related_components: [database, authentication, testing_framework]
---

# Multitenant booking subpath expansion

## Context

MiniCal started as a single-store booking app where `/` was the public booking page and `/admin` was the only admin surface. The product needed to accept additional stores: signing up as `matjib` should create `/matjib` for customer reservations and `/matjib/admin` for that store owner, while `/admin` becomes the platform owner's dashboard across stores.

The main risk was leaking bookings or availability slots between stores while keeping existing root APIs working.

## Guidance

Keep tenant identity explicit at the service boundary. Public and owner-admin routes should resolve a store slug first, then pass the slug into booking and availability service methods.

Use a built-in default store for backward compatibility:

```ts
export const DEFAULT_STORE_SLUG = "main";
```

Root routes call service methods with `DEFAULT_STORE_SLUG`; subpath routes call the same methods with the resolved store slug. This avoids maintaining two booking systems.

Add tenant ownership to both mutable tables:

```sql
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  admin_password TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(store_id, date, time)
);
```

Every query that reads, inserts, updates, or copies store-owned data should include `store_id`. This includes status updates and slot toggles, not only list APIs.

Give store owners their own cookie namespace and path:

```ts
response.cookie(`minical_store_${slug}`, token, {
  httpOnly: true,
  sameSite: "lax",
  path: `/${slug}/admin`
});
```

This keeps platform admin auth separate from store owner auth.

## Why This Matters

Multitenancy failures usually come from partial scoping: reads are tenant-aware, but writes such as status updates, copy operations, or toggles still address rows by global id. Passing tenant identity through the service layer makes those gaps visible and testable.

Keeping root routes attached to a seeded `main` store preserves existing behavior and lets tests prove that `/api/availability` remains isolated from `/matjib/api/availability`.

## When to Apply

- When adding store, team, organization, or customer-specific spaces to a single-tenant app.
- When existing URLs must stay valid during the migration.
- When route-level tenancy, database scoping, and owner authentication all change together.

## Examples

Useful regression coverage:

```ts
await request(app.getHttpServer())
  .post("/signup")
  .type("form")
  .send({ slug: "matjib", name: "맛집", password: "owner-secret" })
  .expect(302)
  .expect("Location", "/matjib/admin");

await request(app.getHttpServer())
  .get("/matjib/api/availability?date=2026-07-01")
  .expect(200);

const defaultAvailability = await request(app.getHttpServer())
  .get("/api/availability?date=2026-07-01")
  .expect(200);

expect(defaultAvailability.body.slots).toHaveLength(0);
```

That pattern proves signup creates the route, tenant availability works, and the default store is not contaminated by the new store.

## Related

- `src/bookings.controller.ts` for root and subpath route split.
- `src/bookings.service.ts` for tenant-scoped service methods.
- `src/database.service.ts` for the `stores` table and `store_id` migration.
- `test/app.e2e-spec.ts` for multistore isolation and platform dashboard coverage.
