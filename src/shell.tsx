import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, CalendarDays, BookOpenCheck, Users, Stethoscope,
  MessagesSquare, Sparkles, FolderTree, Package, UserCog, ShoppingBag,
  Tags, TicketPercent, Truck, Boxes, Building2, Store, Star, BarChart3, ShieldCheck,
  Smartphone, MessageSquareText, CreditCard, BellRing, ToggleRight,
  ClipboardList, CalendarClock, MapPin, Search, Bell, ChevronDown,
  ScrollText, IdCard, Mic, Pill, Receipt, FlaskConical, LifeBuoy, Loader2, CheckCheck, ArrowRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { useStore, ROLE_LABEL, panelAccepts, wrongPanelMessage, type Role } from "./store";
import { Menu, Modal } from "./ui";
import api from "./lib/api";
import { useApi, useDebounced, usePoll } from "./lib/useApi";
import { fmtAgo, initials } from "./lib/format";
import type { Admin } from "./lib/types";
import { ApiError } from "./lib/http";
import logo from "./assets/zennara-logo.png";

type NavItem = { to: string; label: string; icon: ReactNode; badge?: "bookings" | "chat" | "orders" | "lowstock" | "reviews" };
type NavGroup = { g: string; items: NavItem[] };
const ic = "h-[16px] w-[16px]";

const NAV: NavGroup[] = [
  { g: "Floor", items: [
    { to: "/floor", label: "Today’s guests", icon: <ClipboardList className={ic} /> },
  ]},
  { g: "Me", items: [
    { to: "/floor/schedule", label: "My schedule", icon: <CalendarClock className={ic} /> },
  ]},
];

export const HOME = "/floor";

/* ================= live sidebar badges ================= */
function useNavBadges(role: Role, branchId: string) {
  return useApi(async () => {
    if (role !== "admin") return {} as Record<string, number>;

    const settled = await Promise.allSettled([
      api.bookings.list({ status: "Awaiting Confirmation", limit: 1 }),
      api.chat.stats(branchId || undefined),
      api.orders.stats(),
      api.analytics.inventory(),
      api.reviews.products({ isApproved: "false", limit: 1 }),
    ]);

    const val = <T,>(i: number): T | undefined =>
      settled[i].status === "fulfilled" ? ((settled[i] as PromiseFulfilledResult<T>).value) : undefined;

    const pending = val<{ total?: number; count?: number; data?: unknown[] }>(0);
    const chatStats = val<{ overall?: { totalUnread?: number; activeChats?: number }; byBranch?: { branchId: string; totalUnread: number; activeChats: number }[] }>(1);
    const orderStats = val<{ newOrders?: number; processingOrders?: number; confirmedOrders?: number }>(2);
    const inv = val<{ summary?: { lowStockCount?: number } }>(3);
    const rev = val<{ count?: number; pagination?: { total?: number } }>(4);

    const mine = branchId
      ? (chatStats?.byBranch ?? []).find((b) => String(b.branchId) === branchId)
      : { totalUnread: (chatStats?.byBranch ?? []).reduce((a, b) => a + (b.totalUnread || 0), 0), activeChats: (chatStats?.byBranch ?? []).reduce((a, b) => a + (b.activeChats || 0), 0) };

    return {
      bookings: pending?.total ?? pending?.count ?? pending?.data?.length ?? 0,
      // Unread first; fall back to open threads so the badge still signals work.
      chat: mine?.totalUnread || mine?.activeChats || 0,
      orders: (orderStats?.newOrders ?? 0) + (orderStats?.confirmedOrders ?? 0) + (orderStats?.processingOrders ?? 0),
      lowstock: inv?.summary?.lowStockCount ?? 0,
      reviews: rev?.pagination?.total ?? rev?.count ?? 0,
    } as Record<string, number>;
  }, [role, branchId]);
}

/* ================= shell ================= */
export function Shell({ children }: { children: ReactNode }) {
  const {
    role, admin, adminRole, branch, branchId, branches, setBranchById,
    toast, setSearchOpen, loggedIn, booting, signIn, logout,
  } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const badges = useNavBadges(role, branchId);

  // Floor staff see only the centres admin assigned on their account: one
  // centre pins the panel to it, several offer a picker of just those, and no
  // assignment keeps the full picker (covering rotas and older accounts).
  const myIds = (admin?.branchIds?.length ? admin.branchIds : admin?.branchId ? [admin.branchId] : []) as string[];
  const myBranches = branches.filter((b) => myIds.includes(b._id));
  const assignedBranch = myBranches.length === 1 ? myBranches[0] : undefined;
  useEffect(() => {
    if (assignedBranch) {
      if (branchId !== assignedBranch._id) setBranchById(assignedBranch._id);
    } else if (myBranches.length > 1 && branchId && !myBranches.some((b) => b._id === branchId)) {
      setBranchById(myBranches[0]._id);
    }
  }, [assignedBranch?._id, myBranches.length, branchId, setBranchById]);

  const [pwOpen, setPwOpen] = useState(false);

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="Zennara" className="h-16 w-auto object-contain opacity-80" />
          <Loader2 className="h-5 w-5 animate-spin text-gold-dark" />
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginPage onSignedIn={(token, me, exp) => { signIn(token, me, exp); nav(HOME); }} />;
  }

  const who = {
    init: initials(admin?.name || admin?.email),
    name: admin?.name || admin?.email || "Signed in",
    role: adminRole ? ROLE_LABEL[adminRole] : "",
  };
  const badgeCounts = badges.data ?? {};

  return (
    <div className="flex min-h-screen items-start">
      <aside className="sticky top-0 flex h-screen w-[236px] shrink-0 flex-col bg-side pb-2 pt-3 text-side-ink">
        <div data-tour="logo" className="shrink-0 flex justify-center border-b border-side-2 px-4 pb-2.5 pt-1">
          <img src={logo} alt="Zennara" className="h-16 w-auto object-contain" />
        </div>

        <div data-tour="nav" className="min-h-0 flex-1 overflow-y-auto pb-1 [scrollbar-color:var(--color-gold-dark)_transparent] [scrollbar-width:thin]">
          {NAV.map((grp) => (
            <div key={grp.g}>
              <div className="px-4 pb-0.5 pt-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-side-mut">{grp.g}</div>
              {grp.items.map((it) => {
                const n = it.badge ? badgeCounts[it.badge] : undefined;
                return (
                  <NavLink key={it.to} to={it.to} data-tour={"nav-" + it.to.split("/").filter(Boolean).pop()}
                    className={({ isActive }) =>
                      `mx-2 flex items-center justify-between gap-2 rounded-lg px-2.5 py-[5px] text-[12.3px] font-medium transition-colors ${
                        isActive || loc.pathname === it.to
                          ? "bg-side-2 text-white shadow-[inset_2px_0_0_var(--color-gold)]"
                          : "hover:bg-side-2/50 hover:text-white"}`}>
                    <span className="flex items-center gap-2.5">{it.icon}{it.label}</span>
                    {!!n && n > 0 && (
                      <span className="rounded-full bg-gold px-1.5 font-mono text-[10px] font-bold text-primary">{n > 99 ? "99+" : n}</span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-side-2 px-4 pb-0.5 pt-2 text-[11px] leading-tight text-side-mut">
          <div className="mb-0.5 font-bold text-white">{who.name}</div>
          <div>{who.role}{branch ? ` · ${branch}` : ""}</div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-2.5">
          {assignedBranch ? (
            <div data-tour="branch" className="flex items-center gap-1.5 px-2 py-1 text-[13.5px] font-bold">
              <MapPin className="h-3.5 w-3.5 text-gold-dark" /> {assignedBranch.name}
            </div>
          ) : myBranches.length > 1 ? (
            <Menu
              button={
                <button data-tour="branch" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13.5px] font-bold hover:bg-ivory">
                  <MapPin className="h-3.5 w-3.5 text-gold-dark" />
                  {myBranches.find((b) => b._id === branchId)?.name ?? myBranches[0].name} <ChevronDown className="h-3.5 w-3.5 text-ink3" />
                </button>
              }
              items={myBranches.map((b) => ({
                label: <span className={b._id === branchId ? "font-bold text-primary" : ""}>{b.name}</span>,
                onClick: () => { setBranchById(b._id); toast(`Switched to ${b.name}`); },
              }))}
            />
          ) : (
            <Menu
              button={
                <button data-tour="branch" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13.5px] font-bold hover:bg-ivory">
                  {branch || "Select branch"} <ChevronDown className="h-3.5 w-3.5 text-ink3" />
                </button>
              }
              items={
                branches.length
                  ? [
                      { label: <span className={!branchId ? "font-bold text-primary" : ""}>All branches</span>,
                        onClick: () => { setBranchById(""); toast("Showing all branches"); } },
                      ...branches.map((b) => ({
                        label: <span className={b._id === branchId ? "font-bold text-primary" : ""}>{b.name}</span>,
                        onClick: () => { setBranchById(b._id); toast(`Switched to ${b.name}`); },
                      })),
                    ]
                  : [{ label: <span className="text-ink3">No branches configured</span>, onClick: () => undefined }]
              }
            />
          )}
          <div className="mx-auto flex-1" />
          <div className="flex items-center gap-3">
            <Menu align="right"
              button={
                <button className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-[10.5px] font-bold text-white">
                  {who.init}
                </button>
              }
              items={[
                { label: <span><b>{who.name}</b><br /><span className="text-[11px] text-ink3">{who.role}{branch ? ` · ${branch}` : ""}</span></span> },
                { label: "My schedule", onClick: () => nav("/floor/schedule") },
                { label: "Change password", onClick: () => setPwOpen(true) },
                { label: "Sign out", onClick: () => { logout(); toast("Signed out"); } },
              ]}
            />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden bg-bg p-5">{children}</main>
      </div>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

/** Self-service password change — same endpoint the dermatologist panel uses. */
function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast, admin } = useStore();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setCur(""); setNext(""); setNext2(""); setErr(null); } }, [open]);

  const save = async () => {
    if (next.length < 8) { setErr("The new password must be at least 8 characters"); return; }
    if (next !== next2) { setErr("The passwords don't match"); return; }
    setBusy(true); setErr(null);
    try {
      await api.auth.updatePassword(cur, next);
      toast("Password changed");
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const field = "rounded-lg border border-border bg-ivory px-3 py-2.5 text-[13.5px] outline-none focus:border-gold-dark";
  return (
    <Modal open={open} onClose={onClose} title="Change my password">
      <div className="grid gap-2.5">
        <label className="grid gap-1 text-[11px] font-bold text-ink2">Current password
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className={field} autoComplete="current-password" /></label>
        <label className="grid gap-1 text-[11px] font-bold text-ink2">New password
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={field} autoComplete="new-password" /></label>
        <label className="grid gap-1 text-[11px] font-bold text-ink2">Confirm new password
          <input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} className={field} autoComplete="new-password" /></label>
        {err && <div className="rounded-lg bg-err-bg px-3 py-2 text-[12px] font-semibold text-err">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-(--radius-btn) px-3.5 py-2 text-[13px] font-bold text-ink3 hover:bg-ivory">Cancel</button>
          <button onClick={save} disabled={busy || !next || !next2}
            className="rounded-(--radius-btn) bg-primary px-3.5 py-2 text-[13px] font-bold text-white disabled:bg-dis-bg disabled:text-dis">
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
        <div className="text-[11px] text-ink3">Signed in as {admin?.email}. Forgot it? The clinic admin can reset it — you&rsquo;ll get the new details by email.</div>
      </div>
    </Modal>
  );
}

/* ================= login ================= */
const LICONS: Record<string, ReactNode> = {
  cal: <CalendarDays className="h-8 w-8 text-gold" />, app: <Smartphone className="h-8 w-8 text-gold" />,
  stock: <Boxes className="h-8 w-8 text-gold" />, stet: <Stethoscope className="h-8 w-8 text-gold" />,
  mic: <Mic className="h-8 w-8 text-gold" />, rx: <Pill className="h-8 w-8 text-gold" />,
  spa: <Sparkles className="h-8 w-8 text-gold" />, bottle: <FlaskConical className="h-8 w-8 text-gold" />,
  bill: <Receipt className="h-8 w-8 text-gold" />,
};

const SLIDES = [
  { icon: "spa", title: "Your floor, on one tablet", lines: ["Today’s guests the moment you sign in", "Amber cards are always your next action", "Sessions start with the guest’s check-in code"] },
  { icon: "bottle", title: "Steppers log exact usage", lines: ["Billable items go to the guest’s bill", "Clinic supplies tracked as cost-only", "Batch and expiry come with each pick"] },
  { icon: "bill", title: "Finish at the front desk", lines: ["COMPLETE deducts stock automatically", "The service card writes itself", "The bill reaches reception before the guest"] },
  { icon: "cal", title: "My schedule, always current", lines: ["This week at your centre", "A log of every session you completed", "All in one place"] },
];

/**
 * Therapists sign in with email + password only — the backend refuses emailed
 * codes for therapist accounts. Passwords are set by the clinic admin (from
 * the Therapists page) and can be changed from the avatar menu here.
 */
function LoginPage({ onSignedIn }: { onSignedIn: (token: string, admin: Admin, expiresAt?: string) => void }) {
  const [slide, setSlide] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setSlide((x) => (x + 1) % SLIDES.length), 4200);
    return () => clearInterval(t);
  }, []);

  const signIn = async () => {
    const addr = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(addr)) { setError("Enter a valid email address"); return; }
    if (!password) { setError("Enter your password"); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.auth.loginPassword(addr, password);
      if (!panelAccepts(r.admin.role)) { setError(wrongPanelMessage(r.admin.role)); return; }
      onSignedIn(r.token, r.admin, r.expiresAt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error)?.message ?? "Something went wrong");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-side p-10 md:flex">
        <img src={logo} alt="Zennara" className="h-28 w-auto self-start object-contain" />
        <div className="relative">
          <div className="overflow-hidden">
            <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${slide * 100}%)` }}>
              {SLIDES.map((s) => (
                <div key={s.title} className="w-full shrink-0 pr-6">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-side-2">{LICONS[s.icon]}</div>
                  <h2 className="mt-5 max-w-[420px] text-[30px] font-extrabold leading-tight text-white">{s.title}</h2>
                  <div className="mt-4 grid gap-2.5">
                    {s.lines.map((l) => (
                      <div key={l} className="flex items-center gap-2.5 text-[14.5px] text-side-ink">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold text-[10px] font-extrabold text-primary">✓</span>{l}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 flex gap-2">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === slide ? "w-7 bg-gold" : "w-2.5 bg-side-2 hover:bg-side-mut"}`} />
            ))}
          </div>
        </div>
        <div className="text-[11.5px] uppercase tracking-[0.2em] text-gold">Skin · Aesthetics · Wellness</div>
      </div>

      <div className="flex flex-col items-center justify-center bg-bg p-8">
        <div className="w-full max-w-[400px]">
          <div className="mx-auto mb-4 grid w-fit place-items-center rounded-2xl bg-side px-6 py-4 md:hidden">
            <img src={logo} alt="Zennara" className="h-24 w-auto object-contain" />
          </div>
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-side">
              <LayoutDashboard className="h-6 w-6 text-gold" />
            </span>
            <div>
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">Zennara Therapist</h1>
              <div className="text-[12.5px] text-ink3">Sign in with your email and password</div>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border bg-surface p-5 shadow-[0_4px_16px_rgba(3,47,34,0.05)]">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-ink2" htmlFor="login-email">Email</label>
              <input id="login-email" autoFocus value={email} type="email" autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && signIn()}
                placeholder="you@zennara.in"
                className="rounded-lg border border-border bg-ivory px-3 py-2.5 text-[13.5px] outline-none focus:border-gold-dark" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-ink2" htmlFor="login-password">Password</label>
              <input id="login-password" value={password} type="password" autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && signIn()}
                placeholder="••••••••"
                className="rounded-lg border border-border bg-ivory px-3 py-2.5 text-[13.5px] outline-none focus:border-gold-dark" />
            </div>
            <button onClick={signIn} disabled={busy}
              className="mt-1 flex items-center justify-center gap-2 rounded-(--radius-btn) bg-primary py-3 text-[14px] font-bold text-white transition-colors hover:bg-primary-hover disabled:bg-dis-bg disabled:text-dis">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
            </button>

            {error && <div className="rounded-lg bg-err-bg px-3 py-2 text-[12px] font-semibold text-err">{error}</div>}
          </div>

          <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink3">
            This panel is for therapist accounts.<br />
            No password yet, or forgotten it? The clinic admin sets and resets it — you get the details by email.
          </p>
        </div>
      </div>
    </div>
  );
}
