---
title: Global admin navigation and platform visibility
date: 2026-06-30
category: design-patterns
module: booking-platform
problem_type: design_pattern
component: authentication
severity: medium
applies_when:
  - "A booking app has public pages, store-owner admin pages, and a platform admin dashboard"
  - "Signup or logout flows are reachable only from hidden or context-specific pages"
tags: [navigation, logout, platform-admin, multitenancy, dashboard]
---

# Global admin navigation and platform visibility

## Context

MiniCal expanded from one shop to many shops. Store signup existed, but it was buried under the platform admin flow. Admin sessions also had no explicit logout control, and the platform dashboard showed stores and bookings but not each store's slot state.

## Guidance

Use a shared page wrapper for cross-cutting navigation instead of duplicating links inside each page body. Keep the navigation role-aware through small options:

```ts
function page(title: string, body: string, nav: NavOptions = {}) {
  return `<!doctype html>
<html lang="ko">
...
<body>
  ${renderGlobalNav(nav)}
  ${body}
</body>
</html>`;
}
```

Expose signup, public booking, store admin, platform admin, and logout from this wrapper. Pass logout actions only on authenticated admin pages:

```ts
{ publicHref: basePath || "/", storeAdminHref: `${basePath}/admin`, logoutAction: `${basePath}/admin/logout` }
```

Implement logout by clearing the exact cookie path used at login:

```ts
response.clearCookie("minical_admin", { path: "/admin" });
response.clearCookie(`minical_store_${slug}`, { path: `/${slug}/admin` });
```

For platform dashboards, add an aggregate availability query that joins slots to stores and computes booked/available state with the same blocking-booking rule used by store admin pages.

## Why This Matters

Hidden signup blocks store onboarding. Missing logout makes shared-device admin use risky. A platform owner also needs both demand and supply visibility: bookings show reservations, while slots show whether each shop has capacity open, closed, or already booked.

Keeping global navigation in the shared wrapper prevents future pages from forgetting critical access paths. Keeping logout cookie paths aligned with login cookie paths avoids stale sessions.

## When to Apply

- When a public booking page, store admin page, and platform admin page all coexist.
- When a route should be globally reachable rather than discovered through an admin-only flow.
- When session cookies are scoped by tenant or route prefix.
- When the platform owner needs cross-store operational visibility.

## Examples

The platform admin route should compose all dashboard data in one place:

```ts
renderPlatformAdminPage(
  this.bookings.storeSummaries(),
  this.bookings.platformBookings(),
  this.bookings.platformAvailability()
);
```

Tests should cover the actual HTML contract users depend on:

```ts
expect(publicPage.text).toContain('class="global-nav"');
expect(publicPage.text).toContain('href="/signup"');
expect(platformPage.text).toContain('action="/admin/logout"');
expect(ownerAdmin.text).toContain('action="/matjib/admin/logout"');
expect(platformPage.text).toContain("가게별 예약 및 슬롯");
```

## Related

- `docs/solutions/architecture-patterns/multitenant-booking-subpath-expansion-2026-06-30.md`
