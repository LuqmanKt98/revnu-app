"use client";
import api from "@/lib/data/api";
export default function SignOutButton({ label = "Sign out" }) {
  return <button className="btn btn-primary" onClick={async () => { await api.auth.signOut(); location.href = "/login"; }}>{label}</button>;
}
