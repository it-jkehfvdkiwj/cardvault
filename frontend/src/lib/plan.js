/**
 * Single source of truth for "does this user have the paid feature set?".
 *
 * During the launch phase the backend sets `free_launch` and unlocks every Pro
 * feature without touching the stored `plan`. The UI has to follow that, or a
 * user would see "Auf Pro upgraden" buttons for things they can already do.
 */
export function isPro(user) {
  if (!user) return false
  return Boolean(user.free_launch) || (user.plan || 'free') === 'pro'
}

/** True only when a real paid subscription is active (for billing UI). */
export function hasPaidPlan(user) {
  return (user?.plan || 'free') === 'pro'
}

/** True while everything is free for everyone. */
export function isFreeLaunch(user) {
  return Boolean(user?.free_launch)
}
