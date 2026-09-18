// Where does a signed-in person land? Ported verbatim from login.html destinationFor():
// route by what the person can DO, not by their title.
export type ProfileLike = {
  id: string; developerId: string | null; role?: string | null; roleId?: string | null;
  effectivePerms?: string[]; perms?: string[] | null; mustChangePassword?: boolean;
  name?: string; nameAr?: string | null; email?: string;
};

const ADMINISH = ["team", "projects", "financials", "inventory", "contracts"];

export function destinationFor(u: ProfileLike): string {
  if (!u.developerId) return "/revnu";
  const perms = u.effectivePerms || u.perms || [];
  const adminish = perms.some((p) => ADMINISH.includes(p));
  if (perms.includes("orders") && !adminish) return "/developer?dev=" + u.developerId + "&as=rep&u=" + u.id;
  return "/developer?dev=" + u.developerId;
}

/** Which portal a path belongs to, for "wrong portal" redirects. */
export function portalOf(pathname: string): "revnu" | "developer" | "sales" | null {
  if (pathname.startsWith("/revnu")) return "revnu";
  if (pathname.startsWith("/developer")) return "developer";
  if (pathname.startsWith("/sales")) return "sales";
  return null;
}
