---
title: Root landing page for multistore booking platform
date: 2026-06-30
category: design-patterns
module: booking-platform
problem_type: design_pattern
component: frontend_stimulus
severity: medium
applies_when:
  - "A formerly single-store booking app becomes a multistore platform"
  - "The root path needs to explain the service instead of acting as one store's booking form"
tags: [landing-page, multitenancy, root-route, booking-ui, screenshots]
---

# Root landing page for multistore booking platform

## Context

MiniCal originally used `/` as the built-in `main` store booking page. After adding store signup, store-specific booking pages, a store list, and platform administration, that root behavior no longer explained the product to first-time visitors.

The root path needed to become a service landing page: what MiniCal does, how stores join, how customers book, and what admins can see.

## Guidance

Separate platform discovery from store booking:

```ts
@Get("/")
publicPage(@Res() response: Response) {
  response.type("html").send(renderLandingPage());
}
```

Keep the actual booking workflow on store-specific routes:

- `/main` for the seeded built-in store
- `/:storeSlug` for each signed-up store
- `/stores` for customer store discovery

The landing page should show concrete product states, not abstract claims. In this implementation, `renderLandingPage()` uses static UI mockups that look like screenshots:

- customer booking screen
- platform admin dashboard
- store onboarding and slot-management flow

This avoids needing image assets while still showing what users and store owners will actually use.

## Why This Matters

When `/` is a booking form for one store, new visitors cannot tell that the service supports store signup, tenant-specific booking URLs, and platform-level operations. A landing page makes the product obvious before the visitor commits to a workflow.

Preserving `/main` keeps the built-in store accessible without making it the public face of the platform.

## When to Apply

- A product moves from single-tenant to multitenant.
- The root route previously belonged to a default tenant.
- Store owners and end customers both need orientation from the same domain.
- Real screenshots are not available yet, but the UI states are stable enough to preview.

## Examples

Regression coverage should assert the root no longer renders the booking form:

```ts
expect(response.text).toContain("입점하고 고객 예약을 받는");
expect(response.text).toContain("고객 예약 화면");
expect(response.text).toContain("관리자 화면");
expect(response.text).toContain('href="/signup"');
expect(response.text).toContain('href="/stores"');
expect(response.text).not.toContain('action="/book"');
```

Documentation should also reflect the split:

- `/` is the landing page
- `/stores` is the store list
- `/main` is the built-in main store booking page

## Related

- `docs/solutions/architecture-patterns/multitenant-booking-subpath-expansion-2026-06-30.md`
- `docs/solutions/design-patterns/global-admin-navigation-and-platform-visibility-2026-06-30.md`
