// Permission helpers for Route Handlers — mirror of the SQL helpers in 0002_rls.sql.
import type { ProfileLike } from "./routing";

export const perms = (p: ProfileLike) => p.effectivePerms || p.perms || [];
export const isRevnu = (p: ProfileLike) => !p.developerId;
export const revnuHas = (p: ProfileLike, perm: string) => isRevnu(p) && perms(p).includes(perm);
export const devHas = (p: ProfileLike, perm: string) => !!p.developerId && perms(p).includes(perm);
/** Can `p` manage (invite / edit / remove / reset) a member of developer `dev` (null = Revnu staff)? */
export function canManage(p: ProfileLike, dev: string | null) {
  if (dev == null) return revnuHas(p, "team");
  return revnuHas(p, "developers") || (p.developerId === dev && devHas(p, "team"));
}
