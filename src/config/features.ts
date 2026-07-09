/**
 * Feature flags — central kill-switches for product surfaces.
 *
 * These control ONLY what is shown to users. They intentionally do NOT touch
 * plan enums, route guards (requireEnterprise), the Lemon Squeezy webhook
 * PLAN_MAP, migrations, or any entitlement logic — all of that stays intact so
 * a flag can be flipped back on with zero re-plumbing.
 */

/**
 * Enterprise tier visibility.
 *
 * When `false`, the Enterprise tier is hidden from every user-facing / purchase
 * surface (Upgrade page, pricing cards, sales callout, nav "ENT" badge, upsell
 * copy). All Enterprise CODE stays live: the `'enterprise'` plan type, the
 * `requireEnterprise()` route guard, the `/cloud` workspaces route, workspace
 * features, and the webhook plan mapping are unchanged. Existing Enterprise
 * accounts keep full access.
 *
 * To re-enable Enterprise for launch/sale: set this to `true`. That is the only
 * change required.
 */
export const ENABLE_ENTERPRISE = true
