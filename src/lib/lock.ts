// Each game locks at its own kickoff. A game with no kickoff time falls back
// to the week's picks_lock_at. Shared by the picks page and the picks APIs.
export function isGameLocked(
  kickoffTime: string | null,
  weekLockAt: string | null,
  now: Date = new Date()
): boolean {
  const lockAt = kickoffTime ?? weekLockAt;
  return lockAt ? new Date(lockAt) <= now : false;
}
