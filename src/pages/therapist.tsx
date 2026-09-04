import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Page, Btn, Tag, Stats, Card, DataTable, B, Note, Hint, In, Area, SecH, Modal,
  Async, Empty, Loading, StaleBanner, Otp,
} from "../ui";
import { useStore } from "../store";
import api from "../lib/api";
import { useApi, usePoll } from "../lib/useApi";
import {
  addClinicDays, bookingServiceName, bookingSlotLabel, dayKeyDate, fmtDate,
  fmtDateFull, fmtDayKey, fmtINR, fmtWhen, idOf, isoDay, nameOf, patientFlags, statusKey,
} from "../lib/format";
import { STATUS } from "../ui";
import type { Booking, BookingSession, Inventory, ServiceCard } from "../lib/types";

function TabletFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-primary-hover p-4">
      <div className="overflow-hidden rounded-lg border border-border bg-bg">{children}</div>
    </div>
  );
}

/** Today's bookings for the therapist's centre. */
function useFloor(branch: string, day = isoDay()) {
  return useApi(
    () => api.bookings.list({ date: day, location: branch && branch !== "All branches" ? branch : undefined }),
    [branch, day],
  );
}

/* ================= FLOOR ================= */
export function Floor() {
  const nav = useNavigate();
  const { toast, audit, branch, admin } = useStore();
  const [day, setDay] = useState(isoDay());
  const liveDay = useRef(isoDay());
  // A tablet left open overnight should roll over to the new day by itself.
  useEffect(() => {
    const t = window.setInterval(() => {
      const current = isoDay();
      setDay((selected) => selected === liveDay.current ? current : selected);
      liveDay.current = current;
    }, 60000);
    return () => window.clearInterval(t);
  }, []);

  const q = useFloor(branch, day);
  usePoll(q.reload, 20000);

  const all = q.data?.data ?? [];
  // Reception can assign a session to a specific therapist; those guests lead
  // the board. Everyone else stays visible — the floor still works pull-based
  // when plans change mid-shift.
  const mine = (b: Booking) => b.assignedTherapistId === admin?._id;
  const rows = [...all].sort((a, b) => Number(mine(b)) - Number(mine(a)));
  const waiting = rows.filter((b) => b.status === "Confirmed" || b.status === "Rescheduled");
  const inProgress = rows.filter((b) => b.status === "In Progress");
  const done = rows.filter((b) => b.status === "Completed");
  const myWaiting = waiting.filter(mine);

  // Check-in is OTP-gated: the guest reads the code from their app. Same
  // system as reception — send/resend the code, or manual with a reason.
  const [otpFor, setOtpFor] = useState<Booking | null>(null);
  const [code, setCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState<string | null>(null);
  const [manualIn, setManualIn] = useState(false);
  const [manualInReason, setManualInReason] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const sendCode = async (b: Booking, kind: "checkin" | "checkout", channel: "email" | "whatsapp" | "both") => {
    setSendBusy(true);
    try {
      const r = await api.bookings.sendVisitCode(b._id, { kind, channel });
      const sent = (r.delivered ?? []).join(" + ");
      toast(sent ? `Code sent via ${sent}` : "Could not deliver the code — try another channel");
    } catch (e) { toast((e as Error).message); } finally { setSendBusy(false); }
  };

  const startSession = (b: Booking) => {
    if (b.status === "In Progress") { nav("/floor/session", { state: { bookingId: b._id } }); return; }
    if (b.status === "Confirmed" || b.status === "Rescheduled") { setCode(""); setOtpErr(null); setOtpFor(b); return; }
    toast(`${b.fullName} is ${b.status.toLowerCase()} — reception needs to confirm before a session can start.`);
  };

  const confirmCheckIn = async () => {
    if (!otpFor) return;
    setOtpBusy(true); setOtpErr(null);
    try {
      if (manualIn) {
        if (manualInReason.trim().length < 3) throw new Error("A reason is required to check in without a code.");
        await api.bookings.manualCheckIn(otpFor._id, manualInReason.trim());
      } else {
        await api.bookings.verifyCheckIn(otpFor._id, code);
      }
      audit("BOOKING_CHECKED_IN", `${otpFor.fullName} · floor${manualIn ? " · manual" : ""}`, { bookingId: otpFor._id });
      toast(`${otpFor.fullName} checked in — session started`);
      const id = otpFor._id;
      setOtpFor(null); setManualIn(false); setManualInReason(""); q.reload();
      nav("/floor/session", { state: { bookingId: id } });
    } catch (e) { setOtpErr((e as Error).message); } finally { setOtpBusy(false); }
  };

  return (
    <Page title="Floor" sub={[admin?.name, branch || "All centres", fmtDateFull(day)].filter(Boolean).join(" · ")}
      actions={<input type="date" value={day} onChange={(e) => setDay(e.target.value)}
        className="rounded-(--radius-btn) border border-border bg-surface px-3 py-1.5 text-[12.5px] outline-none focus:border-gold-dark" />}>
      <Modal open={!!otpFor} onClose={() => { setOtpFor(null); setManualIn(false); setManualInReason(""); }}
        title={`Check in ${otpFor?.fullName ?? ""} — guest code`}>
        {!manualIn ? (
          <>
            <Note>Ask the guest for the 6-digit check-in code on their Zennara appointment screen. Don&rsquo;t have it? Resend it below.</Note>
            <div className="mt-3"><Otp value={code} onChange={setCode} length={6} /></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-ink3">Resend code:</span>
              <Btn kind="ghost" className="!px-2.5 !py-1 !text-[11.5px]" disabled={sendBusy}
                onClick={() => otpFor && sendCode(otpFor, "checkin", "email")}>Email</Btn>
              <Btn kind="ghost" className="!px-2.5 !py-1 !text-[11.5px]" disabled={sendBusy}
                onClick={() => otpFor && sendCode(otpFor, "checkin", "whatsapp")}>WhatsApp</Btn>
              <button className="ml-auto text-[11.5px] font-semibold text-ink3 underline-offset-2 hover:underline"
                onClick={() => { setManualIn(true); setOtpErr(null); }}>
                Guest can&rsquo;t receive a code?
              </button>
            </div>
          </>
        ) : (
          <>
            <Note kind="crit">Manual check-in is recorded against your name on the booking and in the audit log — the guest is notified they were checked in without a code.</Note>
            <div className="mt-3">
              <Area label="Reason (required)" value={manualInReason} onChange={setManualInReason} rows={2}
                placeholder="e.g. No phone with them, email bouncing" />
            </div>
            <button className="mt-2 text-[11.5px] font-semibold text-ink3 underline-offset-2 hover:underline"
              onClick={() => { setManualIn(false); setOtpErr(null); }}>← Back to code entry</button>
          </>
        )}
        {otpErr && <Note kind="crit" className="mt-3">{otpErr}</Note>}
        <div className="mt-4 flex justify-end gap-2">
          <Btn kind="ghost" onClick={() => { setOtpFor(null); setManualIn(false); setManualInReason(""); }}>Back</Btn>
          <Btn disabled={otpBusy || (manualIn ? manualInReason.trim().length < 3 : code.length < 6)} onClick={confirmCheckIn}>
            {otpBusy ? "Checking…" : manualIn ? "Check in without code" : "Check in & start"}
          </Btn>
        </div>
      </Modal>
      <Hint id="floor-live">Tap a card to open the session. An amber outline means the guest is checked in and waiting — that is always your next action.</Hint>
      <StaleBanner error={q.data ? q.error : null} onRetry={q.reload} />

      <Async q={q} label="Loading the floor…" rows={4}>
        {() => (
          <>
            <Stats items={[
              { k: "Assigned to you", v: myWaiting.length, d: myWaiting.length ? `next: ${myWaiting[0].fullName}` : "none waiting", hot: myWaiting.length > 0 },
              { k: "Waiting", v: waiting.length, d: waiting.length ? `next: ${waiting[0].fullName}` : "nobody waiting" },
              { k: "In progress", v: inProgress.length, d: "on the floor" },
              { k: "Done today", v: done.length, d: `${rows.length} booked in total` },
            ]} />

            {rows.length === 0 ? (
              <Empty title="Nothing booked here today"
                hint="Guests appear once reception confirms their booking for this centre." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {rows.map((b) => {
                  const key = statusKey(b);
                  const isWaiting = b.status === "Confirmed" || b.status === "Rescheduled";
                  const isDone = b.status === "Completed";
                  const canOpen = isWaiting || b.status === "In Progress" || isDone;
                  return (
                    <Card key={b._id} className={`p-4 ${isWaiting ? "!border-warn" : ""}`}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <b className="block truncate text-[15px] font-bold">{b.fullName}</b>
                          <div className="text-[11.5px] text-ink3">{b.confirmedTime || b.preferredTimeSlots?.[0] || "—"}</div>
                        </div>
                        {STATUS[key]}
                      </div>
                      {b.assignedTherapistName && (
                        <div className="mb-1">
                          {mine(b)
                            ? <Tag kind="gold">Assigned to you</Tag>
                            : <Tag kind="mute">for {b.assignedTherapistName}</Tag>}
                        </div>
                      )}
                      <div className="mb-1 truncate text-[13px] font-semibold">{bookingServiceName(b, "Treatment")}</div>
                      <div className="mb-3 text-[11.5px] text-ink3">
                        {b.specialistName ? `assigned by ${b.specialistName}` : "no dermatologist assigned"}
                        {b.checkInTime ? ` · in since ${fmtWhen(b.checkInTime).split(" ").pop()}` : ""}
                      </div>
                      <button
                        disabled={!canOpen}
                        onClick={() => isDone
                          ? nav("/floor/summary", { state: { bookingId: b._id } })
                          : startSession(b)}
                        className={`w-full rounded-(--radius-btn) py-2.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:bg-dis-bg disabled:text-dis ${
                          isDone ? "bg-sage text-ink3" : "bg-primary text-white"}`}>
                        {b.status === "In Progress" ? "Continue session" : isWaiting ? "Start session — guest code" : isDone ? "View summary" : b.status === "Awaiting Confirmation" ? "Awaiting confirmation" : b.status}
                      </button>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Async>
    </Page>
  );
}

/* ================= SESSION ================= */
type LineItem = {
  inventoryId?: string;
  name: string;
  meta: string;
  unit: string;
  rate: number;
  qty: number;
  onHand?: number;
  billable: boolean;
};


/**
 * Before / after photographs from the treatment room.
 *
 * The same record the dermatologist's panel writes to, so the doctor sees the
 * therapist's "after" shots next to their own "before" ones in one timeline.
 * `capture="environment"` opens the tablet's camera directly; on a desktop it
 * is an ordinary file picker.
 */
function SessionPhotos({ userId, bookingId }: { userId: string; bookingId?: string | null }) {
  const { toast } = useStore();
  const [phase, setPhase] = useState<"before" | "during" | "after">("before");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const photos = useApi(
    () => (userId ? api.patientPhotos.list({ userId, limit: 60 }).then((r) => r.data ?? []) : Promise.resolve([])),
    [userId, nonce],
  );

  const send = async (files: FileList | null) => {
    if (!files?.length || !userId) return;
    setBusy(true);
    try {
      await api.patientPhotos.upload(Array.from(files), { userId, bookingId: bookingId ?? null, phase, bodyArea: area.trim() });
      toast(files.length === 1 ? "Photograph saved" : `${files.length} photographs saved`);
      setArea(""); setNonce((n) => n + 1);
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const groups = [["before", "Before"], ["during", "During"], ["after", "After"]] as const;

  return (
    <div className="mb-3.5 rounded-lg border border-border bg-surface px-3.5 py-3">
      <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink3">Photographs</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {groups.map(([key, label]) => (
          <button key={key} onClick={() => setPhase(key)}
            className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold ${phase === key ? "bg-primary text-white" : "border border-border bg-surface text-ink2"}`}>
            {label}
          </button>
        ))}
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area (e.g. upper lip)"
          className="min-w-[140px] flex-1 rounded-lg border border-border bg-ivory px-2.5 py-1.5 text-[11.5px] outline-none focus:border-gold-dark" />
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple disabled={busy || !userId}
        onChange={(e) => send(e.target.files)}
        className="mt-2 block w-full text-[11.5px] file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-[11.5px] file:font-bold file:text-white" />
      {busy && <div className="mt-1 text-[11.5px] text-ink3">Uploading…</div>}
      {groups.map(([key, label]) => {
        const rows = (photos.data ?? []).filter((ph) => ph.phase === key);
        if (!rows.length) return null;
        return (
          <div key={key} className="mt-2">
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink3">{label} · {rows.length}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {rows.map((ph) => (
                <a key={ph._id} href={ph.url} target="_blank" rel="noreferrer" className="relative overflow-hidden rounded-lg border border-border">
                  <img src={ph.url} alt={ph.bodyArea || label} className="h-20 w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-[9px] text-white">{fmtDate(ph.takenAt)}</span>
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Session() {
  const nav = useNavigate();
  const loc = useLocation();
  const { toast, audit, admin, branch, branchId } = useStore();
  const bookingId = (loc.state as { bookingId?: string } | null)?.bookingId ?? null;

  const [items, setItems] = useState<LineItem[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickSearch, setPickSearch] = useState("");
  const [wasteOpen, setWasteOpen] = useState(false);
  const [wasteIdx, setWasteIdx] = useState(0);
  const [wasteQty, setWasteQty] = useState("1");
  const [wasteWhy, setWasteWhy] = useState("");
  const [waste, setWaste] = useState<{ name: string; qty: number; reason: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [grading, setGrading] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const booking = useApi(() => (bookingId ? api.bookings.get(bookingId) : Promise.resolve(null)), [bookingId]);
  const userId = booking.data ? idOf(booking.data.userId) : "";
  const patient = useApi(() => (userId ? api.patients.get(userId) : Promise.resolve(null)), [userId]);
  // What the dermatologist assigned out of their consultation — the whole
  // point of "assigned by Dr X" on the card. Without this the therapist had
  // the guest's name and nothing else about the plan.
  const plan = useApi(
    () => (userId
      ? api.consultationNotes.list({ userId, status: "Completed", limit: 5 })
          .then((r) => r.data ?? []).catch(() => [])
      : Promise.resolve([])),
    [userId],
  );
  const stock = useApi(() => api.inventory.list({ category: "Consumables" }), []);
  const settings = useApi(() => api.appStudio.get().catch(() => null), []);
  const memberRate = Number((settings.data as { membership?: { discountPercent?: number } } | null)?.membership?.discountPercent ?? 15);

  const consumables = stock.data?.data ?? [];
  const filtered = consumables.filter((c) =>
    !pickSearch || c.inventoryName.toLowerCase().includes(pickSearch.toLowerCase()) ||
    (c.batchNo ?? "").toLowerCase().includes(pickSearch.toLowerCase()));

  const step = (i: number, d: number) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, qty: Math.max(0, +(x.qty + d).toFixed(2)) } : x)));

  const addItem = (inv: Inventory, billable: boolean) => {
    setItems((xs) => {
      if (xs.some((x) => x.inventoryId === inv._id)) return xs;
      return [...xs, {
        inventoryId: inv._id,
        name: inv.inventoryName,
        meta: [inv.batchNo ? `batch ${inv.batchNo}` : null, inv.batchExpiryDate ? `exp ${fmtDate(inv.batchExpiryDate)}` : null]
          .filter(Boolean).join(" · ") || (inv.formulation ?? ""),
        unit: inv.packName || "ea",
        rate: billable ? (inv.inventorySellingPrice ?? 0) : 0,
        qty: 1,
        onHand: inv.qohAllBatches ?? 0,
        billable,
      }];
    });
    setPickOpen(false);
    setPickSearch("");
  };

  const billable = items.filter((x) => x.billable);
  const productTotal = billable.reduce((n, x) => n + x.rate * x.qty, 0);
  const serviceFee = booking.data?.amount ?? 0;
  const isMember = patient.data?.memberType === "Zen Member";
  const discount = isMember ? Math.round((serviceFee + productTotal) * (memberRate / 100)) : 0;
  const total = serviceFee + productTotal - discount;

  const overStock = items.filter((x) => x.onHand !== undefined && x.qty > x.onHand);
  const consumedRef = useRef(false);
  const cardRef = useRef(false);

  // Check-out is the same code-gated system reception uses: the guest reads
  // their 6-digit check-out code from the app, or staff go manual with a
  // recorded reason. The modal collects that; finishSession does the work.
  const [outOpen, setOutOpen] = useState(false);
  const [outCode, setOutCode] = useState("");
  const [outManual, setOutManual] = useState(false);
  const [outReason, setOutReason] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const sendOutCode = async (channel: "email" | "whatsapp") => {
    if (!booking.data) return;
    setSendBusy(true);
    try {
      const r = await api.bookings.sendVisitCode(booking.data._id, { kind: "checkout", channel });
      const sent = (r.delivered ?? []).join(" + ");
      toast(sent ? `Check-out code sent via ${sent}` : "Could not deliver the code — try another channel");
    } catch (e) { toast((e as Error).message); } finally { setSendBusy(false); }
  };

  const complete = () => {
    setErr(null);
    if (!booking.data) return;
    if (booking.data.status !== "In Progress") { setErr("The guest is not checked in — check them in from the floor first."); return; }
    if (overStock.length) { setErr(`Not enough on hand: ${overStock.map((x) => x.name).join(", ")}`); return; }
    setOutCode(""); setOutManual(false); setOutReason("");
    setOutOpen(true);
  };

  const finishSession = async () => {
    if (!booking.data) return;
    setBusy(true); setErr(null);
    try {
      const bk = booking.data;
      if (bk.status !== "In Progress") throw new Error("The guest is not checked in — check them in from the floor first.");
      const usedLine = items.filter((x) => x.qty > 0);
      if (overStock.length) throw new Error(`Not enough on hand: ${overStock.map((x) => x.name).join(", ")}`);
      if (outManual && outReason.trim().length < 3) throw new Error("A reason is required to check out without a code.");
      if (!outManual && outCode.length !== 6) throw new Error("The check-out code is 6 digits.");

      // 1. Take the consumed quantities out of stock — atomically, per line,
      //    with a ledger row each. Refused (not clamped) if something ran out
      //    between picking and completing.
      const lines = usedLine.filter((x) => x.inventoryId).map((x) => ({
        inventoryId: x.inventoryId!,
        qty: x.qty,
        wastedQty: waste.filter((w) => w.name === x.name).reduce((n, w) => n + w.qty, 0),
        reason: waste.filter((w) => w.name === x.name).map((w) => w.reason).join("; ") || `Session ${bookingServiceName(bk, "")}`.trim(),
        batchNo: consumables.find((c) => c._id === x.inventoryId)?.batchNo,
      }));
      if (!consumedRef.current && lines.length) {
        const res = await api.inventory.consume({ bookingId: bk._id, branchId: branchId || null, lines });
        const failed = res.data?.failed ?? [];
        if (failed.length) {
          throw new Error(failed.map((f) => `${f.name || "item"}: ${f.message} (have ${f.available}, need ${f.requested})`).join(" · "));
        }
        consumedRef.current = true; // don't double-deduct if a later step fails and the user retries
      }

      // 2. Record the session on the guest's service card, creating one if this
      //    is their first logged treatment. Failures are real failures.
      const cards = await api.serviceCards.list({ userId, limit: 5 });
      let card: ServiceCard | null = (cards.data ?? []).find((c) => idOf(c.userId) === userId && c.isActive) ?? null;
      if (!card && userId && patient.data) {
        card = await api.serviceCards.create({
          userId,
          clientName: patient.data.fullName,
          clientId: patient.data.patientId || `PAT${userId.slice(-6).toUpperCase()}`,
          primaryDoctor: bk.specialistName || "Unassigned",
          manager: admin?.name,
        });
      }

      const itemSummary = usedLine.map((x) => `${x.qty}${x.unit === "ea" ? "" : ` ${x.unit}`} ${x.name}`).join(", ");
      const wasteSummary = waste.map((w) => `${w.qty} ${w.name} (${w.reason})`).join(", ");

      if (card && !cardRef.current) {
        await api.serviceCards.addService(card._id, {
          date: new Date().toISOString(),
          service: bookingServiceName(bk, "Treatment"),
          grading: grading || null,
          doctorName: bk.specialistName || null,
          therapist: admin?.name ?? null,
          notes: [
            notes.trim(),
            itemSummary ? `Used: ${itemSummary}` : "",
            wasteSummary ? `Wastage: ${wasteSummary}` : "",
            billable.length ? `Billable items ${fmtINR(productTotal)}` : "",
          ].filter(Boolean).join(" | ") || null,
        });
        cardRef.current = true; // a wrong code retry must not write a second card entry
      }

      // 3. Check the guest out with the structured session — reception bills
      //    from this. Code-verified like reception, or manual with a reason.
      const session: BookingSession = {
        items: usedLine.map((x) => ({ inventoryId: x.inventoryId, name: x.name, batchNo: consumables.find((c) => c._id === x.inventoryId)?.batchNo, qty: x.qty, unit: x.unit, rate: x.rate, billable: x.billable })),
        wastage: waste.map((w) => ({ inventoryId: items.find((x) => x.name === w.name)?.inventoryId, name: w.name, qty: w.qty, reason: w.reason })),
        serviceFee, productTotal, discount, total, grading, notes: notes.trim(), therapist: admin?.name ?? "",
      };
      if (outManual) {
        await api.bookings.manualCheckOut(bk._id, outReason.trim(), session);
      } else {
        await api.bookings.verifyCheckOut(bk._id, outCode, undefined, session);
      }
      setOutOpen(false);

      audit("BOOKING_CHECKED_OUT",
        `${bk.fullName} · ${usedLine.length} item${usedLine.length === 1 ? "" : "s"} logged · ${fmtINR(total)}${outManual ? " · manual" : ""}`,
        { bookingId: bk._id });
      toast("Sent to front desk — reception sees the bill now");

      nav("/floor/summary", {
        state: {
          bookingId: bk._id, total, productTotal, serviceFee, discount,
          itemCount: usedLine.length, wasteCount: waste.length,
        },
      });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!bookingId) {
    return (
      <Page title="Session" sub="Open a guest from the floor to start">
        <Empty title="No session selected" action={<Btn onClick={() => nav("/floor")}>← Back to the floor</Btn>} />
      </Page>
    );
  }
  if (booking.initial && !booking.data) return <Page title="Session"><Loading label="Loading the session…" rows={5} /></Page>;
  if (!booking.data) return <Page title="Session"><Empty title="Couldn’t load that booking" hint={booking.error ?? undefined} action={<Btn onClick={() => nav("/floor")}>← Back</Btn>} /></Page>;

  const bk = booking.data;
  const flags = patient.data ? patientFlags(patient.data) : [];

  return (
    <Page title={`Session — ${bk.fullName}`} sub="Everything logged here comes off stock and lands on the reception bill">
      <TabletFrame>
        <div className="flex flex-wrap items-center gap-3 bg-primary px-4 py-2.5 text-white">
          <div>
            <div className="text-[15.5px] font-bold">{bk.fullName}</div>
            <div className="text-[11.5px] text-side-ink">
              {bk.preferredLocation}{isMember ? " · Zen Member" : ""}
            </div>
          </div>
          <div className="ml-auto rounded-md bg-secondary px-2.5 py-1 font-mono text-[13px]">
            {bk.checkInTime ? `in ${fmtWhen(bk.checkInTime).split(" ").pop()}` : "not checked in"}
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3.5 rounded-lg border border-l-4 border-gold-dark bg-surface px-3.5 py-3">
            <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink3">
              {bk.specialistName ? `Assigned by ${bk.specialistName}` : "No dermatologist assigned"} · {bookingSlotLabel(bk)}
            </div>
            <div className="mt-1 text-[16px] font-bold">{bookingServiceName(bk, "Treatment")}</div>
            {flags.length > 0 && (
              <div className="mt-0.5 text-[11.5px] font-semibold text-err">⚠ {flags.join(" · ")}</div>
            )}
            {bk.notes && <div className="mt-0.5 text-[11.5px] text-ink3">{bk.notes}</div>}
          </div>

          {(() => {
            const latest = (plan.data ?? [])[0];
            const assigned = latest?.assignedServices ?? [];
            if (!latest || (!assigned.length && !latest.plan)) return null;
            return (
              <div className="mb-3.5 rounded-lg border border-l-4 border-secondary bg-sage/40 px-3.5 py-3">
                <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.13em] text-ink3">
                  Dermatologist's plan{latest.doctorName ? ` · ${latest.doctorName}` : ""}
                  {latest.completedAt ? ` · ${fmtDate(latest.completedAt)}` : ""}
                </div>
                {assigned.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {assigned.map((a, i) => (
                      <span key={`${a.name}${i}`} className="rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-secondary">
                        {a.name}{(a.sessions ?? 1) > 1 ? ` ×${a.sessions}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {latest.plan && <div className="mt-1.5 text-[11.5px] leading-relaxed text-ink2">{latest.plan}</div>}
              </div>
            );
          })()}

          <SessionPhotos userId={userId} bookingId={bookingId} />

          <SecH t="Billable to the guest" em="· goes to reception"
            right={<span className="font-mono text-[11px] text-ink3">rate × quantity</span>} />
          {billable.length === 0 && <div className="mb-2 text-[12px] text-ink3">Nothing billable logged yet.</div>}
          {items.map((it, i) => it.billable && (
            <div key={it.inventoryId ?? it.name}
              className={`mb-2 flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                it.onHand !== undefined && it.qty > it.onHand ? "border-err bg-err-bg" : "border-border bg-surface"}`}>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-bold">{it.name}</b>
                <span className="font-mono text-[10.5px] text-ink3">
                  {it.meta}{it.onHand !== undefined ? ` · ${it.onHand} on hand` : ""}
                </span>
              </div>
              {it.onHand !== undefined && it.qty > it.onHand && (
                <span className="shrink-0 font-mono text-[10px] font-bold text-err">over stock</span>
              )}
              <div className="flex shrink-0 items-center overflow-hidden rounded-lg bg-sage">
                <button onClick={() => step(i, -1)} className="grid h-10 w-10 place-items-center text-[19px] font-semibold text-primary">−</button>
                <div className="grid h-10 min-w-[56px] place-items-center border-x border-border bg-surface font-mono text-[15px] font-bold">{it.qty}</div>
                <button onClick={() => step(i, 1)} className="grid h-10 w-10 place-items-center text-[19px] font-semibold text-primary">+</button>
              </div>
              <div className="min-w-[74px] shrink-0 text-right font-mono text-[13px] font-bold">{fmtINR(it.rate * it.qty)}</div>
              <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                className="shrink-0 text-[13px] font-bold text-err">×</button>
            </div>
          ))}

          <SecH t="Clinic supplies" em="· cost only, not billed" />
          {items.filter((x) => !x.billable).length === 0 && <div className="mb-2 text-[12px] text-ink3">Nothing logged yet.</div>}
          {items.map((it, i) => !it.billable && (
            <div key={it.inventoryId ?? it.name} className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-ivory px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-bold">{it.name}</b>
                <span className="font-mono text-[10.5px] text-ink3">{it.meta}</span>
              </div>
              <div className="flex shrink-0 items-center overflow-hidden rounded-lg bg-sage">
                <button onClick={() => step(i, -1)} className="grid h-10 w-10 place-items-center text-[19px] font-semibold text-primary">−</button>
                <div className="grid h-10 min-w-[56px] place-items-center border-x border-border bg-surface font-mono text-[15px] font-bold">{it.qty}</div>
                <button onClick={() => step(i, 1)} className="grid h-10 w-10 place-items-center text-[19px] font-semibold text-primary">+</button>
              </div>
              <div className="min-w-[74px] shrink-0 text-right font-mono text-[13px] text-ink3">—</div>
              <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                className="shrink-0 text-[13px] font-bold text-err">×</button>
            </div>
          ))}

          <div className="mt-2.5 flex flex-wrap gap-2">
            <button onClick={() => setPickOpen(true)}
              className="min-w-[140px] flex-1 rounded-lg border-[1.5px] border-dashed border-border bg-surface p-3 text-[13px] font-semibold text-ink2">
              ＋ Add from stock
            </button>
            <button onClick={() => { setWasteOpen(true); setWasteIdx(0); setWasteQty("1"); setWasteWhy(""); }}
              disabled={items.length === 0}
              className="min-w-[140px] flex-1 rounded-lg border-[1.5px] border-dashed border-border bg-surface p-3 text-[13px] font-semibold text-ink2 disabled:opacity-50">
              ⌫ Record wastage
            </button>
          </div>

          {waste.length > 0 && (
            <div className="mt-2.5">
              <SecH t="Wastage this session" em="· comes off stock, never billed" />
              {waste.map((w, i) => (
                <div key={i} className="mb-1.5 flex items-center justify-between rounded-lg border border-warn bg-warn-bg px-3 py-2 text-[12.5px] font-semibold text-warn">
                  ⌫ {w.qty} {w.name} — {w.reason}
                  <button onClick={() => setWaste((xs) => xs.filter((_, j) => j !== i))} className="font-bold">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3.5 grid gap-3">
            <In label="Grading (optional)" value={grading} onChange={setGrading} placeholder="e.g. Grade 2 improvement" />
            <Area label="Session notes — saved on the guest's service card" value={notes} onChange={setNotes} rows={2} />
          </div>

          <Card className="mt-3.5 px-4 py-3">
            <div className="flex justify-between py-1 text-[13px] text-ink2">
              <span>{bookingServiceName(bk, "Treatment")}</span><span className="font-mono">{fmtINR(serviceFee)}</span>
            </div>
            <div className="flex justify-between py-1 text-[13px] text-ink2">
              <span>Products used ({billable.length} billable)</span><span className="font-mono">{fmtINR(productTotal)}</span>
            </div>
            {isMember && (
              <div className="flex justify-between py-1 text-[13px] text-ink2">
                <span>Zen Member discount</span><span className="font-mono text-ok">−{fmtINR(discount)}</span>
              </div>
            )}
            <div className="mt-1.5 flex justify-between border-t border-border pt-2 text-[16px] font-bold">
              <span>To reception</span><span className="font-mono">{fmtINR(total)}</span>
            </div>
            {bk.paymentStatus === "paid" && (
              <div className="mt-1 text-[11px] text-ok">The treatment fee is already paid — reception collects the item total only.</div>
            )}
          </Card>

          {overStock.length > 0 && (
            <Note kind="crit" className="mb-0">
              <B>{overStock.map((x) => x.name).join(", ")}</B> would go below zero on hand. Check the batch before
              completing — stock is deducted for real when you send this to the desk.
            </Note>
          )}
          {err && <Note kind="crit">{err}</Note>}

          <button onClick={complete} disabled={busy || overStock.length > 0}
            className="mt-3 w-full rounded-lg bg-ok p-4 text-[15px] font-bold text-white disabled:bg-dis-bg disabled:text-dis">
            COMPLETE · GUEST CHECK-OUT CODE
          </button>
          <div className="mt-2 text-center text-[11px] text-ink3">
            Completing asks for the guest&rsquo;s check-out code, deducts the logged stock, writes their service card and sends the bill to reception.
          </div>
        </div>
      </TabletFrame>

      {/* check-out — same code-gated flow as reception */}
      <Modal open={outOpen} onClose={() => !busy && setOutOpen(false)} title={`Check out ${bk.fullName} — guest code`}>
        {!outManual ? (
          <>
            <Note>Ask the guest for the 6-digit check-out code on their Zennara appointment screen — it appears once the session is in progress.</Note>
            <div className="mt-3"><Otp value={outCode} onChange={setOutCode} length={6} /></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-ink3">Resend code:</span>
              <Btn kind="ghost" className="!px-2.5 !py-1 !text-[11.5px]" disabled={sendBusy} onClick={() => sendOutCode("email")}>Email</Btn>
              <Btn kind="ghost" className="!px-2.5 !py-1 !text-[11.5px]" disabled={sendBusy} onClick={() => sendOutCode("whatsapp")}>WhatsApp</Btn>
              <button className="ml-auto text-[11.5px] font-semibold text-ink3 underline-offset-2 hover:underline"
                onClick={() => { setOutManual(true); setErr(null); }}>
                Guest can&rsquo;t receive a code?
              </button>
            </div>
          </>
        ) : (
          <>
            <Note kind="crit">Manual check-out is recorded against your name on the booking and in the audit log — the guest is notified they were checked out without a code.</Note>
            <div className="mt-3">
              <Area label="Reason (required)" value={outReason} onChange={setOutReason} rows={2}
                placeholder="e.g. Guest left phone in the locker" />
            </div>
            <button className="mt-2 text-[11.5px] font-semibold text-ink3 underline-offset-2 hover:underline"
              onClick={() => { setOutManual(false); setErr(null); }}>← Back to code entry</button>
          </>
        )}
        {err && <Note kind="crit" className="mt-3">{err}</Note>}
        <div className="mt-4 flex justify-end gap-2">
          <Btn kind="ghost" disabled={busy} onClick={() => setOutOpen(false)}>Back</Btn>
          <Btn kind="gold" disabled={busy || (outManual ? outReason.trim().length < 3 : outCode.length !== 6)} onClick={finishSession}>
            {busy ? "Completing…" : outManual ? "Complete without code" : "Complete & check out"}
          </Btn>
        </div>
      </Modal>

      {/* pick from stock */}
      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title="Add from stock" wide>
        <input value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} autoFocus
          placeholder="Search item or batch number…"
          className="mb-3 w-full rounded-lg border border-border bg-ivory px-3 py-2 text-[13px] outline-none focus:border-gold-dark" />
        <Async q={stock} label="Loading stock…" rows={5}>
          {() => filtered.length === 0 ? (
            <Empty title="Nothing matches" hint="Consumables are managed under Stock → Inventory." />
          ) : (
            <div className="max-h-[46vh] overflow-auto">
              {filtered.slice(0, 60).map((c) => (
                <div key={c._id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-ivory px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[12.5px]">{c.inventoryName}</b>
                    <span className="font-mono text-[10.5px] text-ink3">
                      {c.batchNo ? `batch ${c.batchNo} · ` : ""}{c.qohAllBatches ?? 0} on hand
                      {c.inventorySellingPrice ? ` · ${fmtINR(c.inventorySellingPrice)}` : ""}
                    </span>
                  </div>
                  <Btn kind="ghost" className="!px-2.5 !py-1 !text-[11.5px]" onClick={() => addItem(c, true)}>Billable</Btn>
                  <Btn kind="ghost" className="!px-2.5 !py-1 !text-[11.5px]" onClick={() => addItem(c, false)}>Supply</Btn>
                </div>
              ))}
            </div>
          )}
        </Async>
      </Modal>

      {/* wastage */}
      <Modal open={wasteOpen} onClose={() => setWasteOpen(false)} title="Record wastage">
        <div className="grid gap-3">
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-ink2">Item</div>
            <select value={wasteIdx} onChange={(e) => setWasteIdx(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-ivory px-2.5 py-2 text-[12.5px] outline-none">
              {items.map((it, i) => <option key={it.inventoryId ?? it.name} value={i}>{it.name}</option>)}
            </select>
          </div>
          <In label="Quantity wasted" type="number" value={wasteQty} onChange={setWasteQty} />
          <In label="Reason (required, audited)" value={wasteWhy} onChange={setWasteWhy}
            placeholder="e.g. vial end / dropped tip / expired" />
        </div>
        <Note className="mb-0">Wastage comes off stock along with what was used, and is never billed to the guest.</Note>
        <div className="mt-4 flex justify-end gap-2">
          <Btn kind="ghost" onClick={() => setWasteOpen(false)}>Cancel</Btn>
          <Btn disabled={wasteWhy.trim().length < 3 || !items[wasteIdx]} onClick={() => {
            const it = items[wasteIdx];
            setWaste((w) => [...w, { name: it.name, qty: Number(wasteQty) || 0, reason: wasteWhy.trim() }]);
            toast(`Wastage logged: ${wasteQty} ${it.name}`);
            setWasteOpen(false); setWasteWhy("");
          }}>Log wastage</Btn>
        </div>
      </Modal>
    </Page>
  );
}

/* ================= SUMMARY ================= */
export function Summary() {
  const nav = useNavigate();
  const loc = useLocation();
  const st = (loc.state as {
    bookingId?: string; total?: number; productTotal?: number; serviceFee?: number;
    discount?: number; itemCount?: number; wasteCount?: number;
  } | null) ?? {};

  const booking = useApi(() => (st.bookingId ? api.bookings.get(st.bookingId) : Promise.resolve(null)), [st.bookingId]);
  // Prefer what the server stored — router state only survives one navigation.
  const sess = booking.data?.session;
  const view = sess && (sess.total ?? 0) > 0
    ? { total: sess.total, productTotal: sess.productTotal, serviceFee: sess.serviceFee, discount: sess.discount, itemCount: (sess.items ?? []).filter((i) => i.qty > 0).length, wasteCount: (sess.wastage ?? []).length }
    : st;

  return (
    <Page title="Session summary" sub="Sent to the front desk">
      <TabletFrame>
        <div className="p-4">
          <div className="px-0 py-4 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ok-bg text-[26px] text-ok">✓</div>
            <div className="mt-3 text-[17px] font-extrabold">Sent to the front desk</div>
            <div className="mt-1 text-[12.5px] text-ink3">
              {booking.data?.fullName ?? "The guest"} can head to reception — stock has been updated and the session is
              on their record.
            </div>
          </div>

          {view.total !== undefined ? (
            <Card className="px-4 py-3">
              <div className="flex justify-between py-1 text-[13px] text-ink2">
                <span>Treatment</span><span className="font-mono">{fmtINR(view.serviceFee)}</span>
              </div>
              <div className="flex justify-between py-1 text-[13px] text-ink2">
                <span>Billable items ({view.itemCount ?? 0} logged)</span><span className="font-mono">{fmtINR(view.productTotal)}</span>
              </div>
              {!!view.discount && (
                <div className="flex justify-between py-1 text-[13px] text-ink2">
                  <span>Zen Member discount</span><span className="font-mono text-ok">−{fmtINR(view.discount)}</span>
                </div>
              )}
              {!!view.wasteCount && (
                <div className="flex justify-between py-1 text-[13px] text-ink2">
                  <span>Wastage entries</span><span className="font-mono text-warn">{view.wasteCount} logged</span>
                </div>
              )}
              {!!sess?.items?.length && (
                <div className="mt-1 border-t border-border pt-2 text-[11.5px] text-ink3">
                  {sess.items.filter((i) => i.qty > 0).map((i) => `${i.qty}${i.unit && i.unit !== "ea" ? ` ${i.unit}` : ""} ${i.name}${i.billable ? "" : " (supply)"}`).join(" · ")}
                </div>
              )}
              <div className="mt-1.5 flex justify-between border-t border-border pt-2 text-[16px] font-bold">
                <span>Sent total</span><span className="font-mono">{fmtINR(view.total)}</span>
              </div>
            </Card>
          ) : booking.data ? (
            <Card className="px-4 py-3">
              <div className="flex justify-between py-1 text-[13px] text-ink2">
                <span>{bookingServiceName(booking.data, "Treatment")}</span>
                <span className="font-mono">{fmtINR(booking.data.amount)}</span>
              </div>
              {booking.data.adminNotes && (
                <div className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-[11.5px] text-ink3">
                  {booking.data.adminNotes}
                </div>
              )}
            </Card>
          ) : booking.initial && st.bookingId ? (
            <Loading label="Loading the session…" rows={2} />
          ) : (
            // Reached by opening this URL directly rather than by completing a
            // session — there is nothing to summarise.
            <Empty title="No session to show"
              hint="Open a guest from the floor and complete their session to see a summary here." />
          )}

          <button onClick={() => nav("/floor")}
            className="mt-3 w-full rounded-lg border-[1.5px] border-dashed border-border bg-surface p-3 text-[13px] font-semibold text-ink2">
            Next guest →
          </button>
        </div>
      </TabletFrame>
    </Page>
  );
}

/* ================= SCHEDULE ================= */
export function Schedule() {
  const { admin, branch } = useStore();
  const [weekStart, setWeekStart] = useState(() => {
    const d = dayKeyDate(isoDay());
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
    return d;
  });

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setUTCDate(weekStart.getUTCDate() + i);
      return d;
    }),
    [weekStart],
  );

  const q = useApi(async () => {
    // One request for the week; bucket by the day the booking actually lands on.
    const res = await api.bookings.list({
      startDate: isoDay(days[0]), endDate: isoDay(days[6]),
      location: branch && branch !== "All branches" ? branch : undefined,
    });
    const all = res.data ?? [];
    return days.map((d) => ({ date: d, bookings: all.filter((b) => isoDay(new Date(b.confirmedDate || b.preferredDate)) === isoDay(d)) }));
  }, [weekStart.getTime(), branch]);

  const today = isoDay();
  const todayEntry = (q.data ?? []).find((d) => isoDay(d.date) === today);

  // My sessions = bookings I completed (the structured session names the therapist),
  // plus service-card rows written in my name.
  const mySessions = useApi(async () => {
    if (!admin?._id) return [] as Booking[];
    const res = await api.bookings.list({ therapistId: admin._id, startDate: addClinicDays(isoDay(), -60), limit: 100 });
    return res.data ?? [];
  }, [admin?._id]);
  const cards = useApi(() => api.serviceCards.list({ limit: 100 }).catch(() => ({ data: [] as ServiceCard[] })), []);
  const myRecords = useMemo(() => {
    const mine: { date: string; client: string; service: string; grading?: string | null; notes?: string | null }[] = [];
    for (const b of mySessions.data ?? []) {
      if (b.status !== "Completed") continue;
      mine.push({ date: b.session?.completedAt ?? b.checkOutTime ?? b.preferredDate, client: b.fullName, service: bookingServiceName(b, "Treatment"), grading: b.session?.grading ?? null, notes: b.session?.notes ?? null });
    }
    const seen = new Set(mine.map((m) => `${m.client}|${m.date.slice(0, 10)}`));
    for (const c of cards.data?.data ?? []) {
      for (const s of c.services ?? []) {
        if (!s.therapist || !admin?.name || s.therapist !== admin.name) continue;
        if (seen.has(`${c.clientName}|${String(s.date).slice(0, 10)}`)) continue;
        mine.push({ date: s.date, client: c.clientName, service: s.service, grading: s.grading, notes: s.notes });
      }
    }
    return mine.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 25);
  }, [cards.data, mySessions.data, admin?.name]);

  const shift = (weeks: number) => setWeekStart((d) => {
    const next = new Date(d);
    next.setUTCDate(d.getUTCDate() + weeks * 7);
    return next;
  });

  return (
    <Page title="My schedule" sub={[admin?.name, branch || "All centres"].filter(Boolean).join(" · ")}
      actions={<>
        <Btn kind="ghost" onClick={() => shift(-1)}>← Previous week</Btn>
        <Btn kind="ghost" onClick={() => shift(1)}>Next week →</Btn>
      </>}>
      <StaleBanner error={q.data ? q.error : null} onRetry={q.reload} />

      <Async q={q} label="Loading your week…" rows={5}>
        {(week) => (
          <>
            <Stats items={[
              { k: "This week", v: week.reduce((n, d) => n + d.bookings.length, 0), d: "sessions booked at your centre" },
              { k: "Today", v: todayEntry?.bookings.length ?? 0, d: `${todayEntry?.bookings.filter((b) => b.status === "Completed").length ?? 0} completed`, hot: true },
              { k: "Waiting now", v: todayEntry?.bookings.filter((b) => b.status === "Confirmed").length ?? 0 },
              { k: "In progress", v: todayEntry?.bookings.filter((b) => b.status === "In Progress").length ?? 0 },
            ]} />

            <DataTable cols={["Day", "Date", "Sessions", "Completed", "Still to run"]}
              rows={week.map((d) => {
                const completed = d.bookings.filter((b) => b.status === "Completed").length;
                const pending = d.bookings.filter((b) => ["Confirmed", "In Progress", "Awaiting Confirmation"].includes(b.status)).length;
                return [
                  <B key={d.date.toISOString()}>{fmtDayKey(isoDay(d.date), { weekday: "short" })}</B>,
                  isoDay(d.date) === today ? <Tag key={`${d.date}t`} kind="info">{fmtDate(d.date)} · today</Tag> : fmtDate(d.date),
                  d.bookings.length,
                  completed,
                  pending || "—",
                ];
              })} />

            <SecH t="Today's list" em={`· ${todayEntry?.bookings.length ?? 0} guests`} />
            {(todayEntry?.bookings.length ?? 0) === 0 ? (
              <Empty title="Nothing booked today" />
            ) : (
              <DataTable cols={["Time", "Guest", "Treatment", "Dermatologist", "Status"]}
                rows={(todayEntry?.bookings ?? []).map((b) => [
                  <B key={b._id}>{b.confirmedTime || b.preferredTimeSlots?.[0] || "—"}</B>,
                  b.fullName,
                  bookingServiceName(b),
                  b.specialistName || "—",
                  STATUS[statusKey(b)],
                ])} />
            )}
          </>
        )}
      </Async>

      <SecH t="My session log" em="· sessions you recorded on guests' service cards" />
      <Async q={cards} label="Loading your session log…" rows={4}>
        {() => myRecords.length === 0 ? (
          <Empty title="No sessions logged yet" hint="Completing a session on the floor writes an entry here." />
        ) : (
          <DataTable cols={["Date", "Guest", "Treatment", "Grading", "What was used"]}
            rows={myRecords.map((r, i) => [
              fmtDate(r.date),
              <B key={i}>{r.client}</B>,
              r.service,
              r.grading || "—",
              <span key={`${i}n`} className="line-clamp-2 text-[11.5px] text-ink3">{r.notes || "—"}</span>,
            ])} />
        )}
      </Async>

      <Note>
        Shifts and rotas are set by the branch manager, so this week view is built from what is actually booked at your
        centre. <B>Session logs</B> come from the service cards you write when you complete a session.
      </Note>
    </Page>
  );
}
