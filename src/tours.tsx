/* React Joyride tours — one 5-7 step walkthrough per panel on first login,
   plus short feature tours inside complex modules. */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Joyride, { STATUS, type Step, type CallBackProps } from "react-joyride";
import { useStore } from "./store";
import { api } from "./lib/api";

const styles = {
  options: {
    primaryColor: "#032F22",
    textColor: "#111714",
    backgroundColor: "#FFFFFF",
    arrowColor: "#FFFFFF",
    overlayColor: "rgba(3, 47, 34, 0.45)",
    zIndex: 200,
  },
  tooltip: { borderRadius: 16, fontFamily: "inherit", fontSize: 13.5, padding: 18 },
  buttonNext: { borderRadius: 10, fontWeight: 700, padding: "8px 16px" },
  buttonBack: { color: "#4F5853" },
};

const T = (target: string, title: string, content: string, placement?: Step["placement"]): Step =>
  ({ target, title, content, placement: placement ?? "auto", disableBeacon: true });
const C = (title: string, content: string): Step =>
  ({ target: "body", title, content, placement: "center", disableBeacon: true });

/* ---- panel walkthroughs (5–7 steps each) ---- */
const PANEL_TOURS: Record<string, Step[]> = {
  therapist: [
    C("Welcome to the floor", "This tablet is your day — who's waiting, who's in a chair, and what each session used."),
    T("[data-tour=nav-floor]", "Today's guests", "Amber cards are waiting guests — always your next action. Tap Start session and enter the guest's check-in code from their app."),
    T("[data-tour=nav-schedule]", "My schedule", "What is booked at your centre this week, plus a log of every session you completed."),
    C("In a session", "Steppers log exact usage — billable items go to the guest's bill at reception, clinic supplies are cost-only. Pick consumables from stock; the batch and expiry come with them."),
    C("Finish at the front desk", "COMPLETE deducts stock, writes the service card and sends the bill to reception before the guest walks over. Check the lines first — it cannot be undone."),
  ],
};

/* ---- feature tours inside complex modules (3–4 steps) ---- */
const MODULE_TOURS: Record<string, { key: string; steps: Step[] }> = {
};

/**
 * A tour is "seen" when the account has completed it — the list lives on the
 * Admin record (`toursSeen`), not in localStorage, so switching browser or
 * clearing site data no longer replays the first-login walkthrough. The local
 * key is still written as a same-session cache so a slow /me round-trip can't
 * flash the tour a second time.
 */
const REPLAY_EVENT = "zennara:replay-tour";

/** Ask the Tours component to run the panel walkthrough again. */
export function replayTour() {
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT));
}

export function Tours() {
  const { role, loggedIn, admin } = useStore();
  const loc = useLocation();
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [tourKey, setTourKey] = useState("");
  const seen = (key: string) =>
    (admin?.toursSeen ?? []).includes(key) || Boolean(localStorage.getItem(key));

  // "View tutorial again" from the profile menu.
  useEffect(() => {
    const onReplay = () => {
      const panelKey = `tour-${role}`;
      localStorage.removeItem(panelKey);
      api.auth.resetTours().catch(() => undefined);
      setSteps(PANEL_TOURS[role] ?? []);
      setTourKey(panelKey);
      setRun(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [role]);

  useEffect(() => {
    if (!loggedIn) { setRun(false); return; }
    const panelKey = `tour-${role}`;
    if (!seen(panelKey)) {
      setSteps(PANEL_TOURS[role] ?? []); setTourKey(panelKey);
      const t = setTimeout(() => setRun(true), 600);
      return () => clearTimeout(t);
    }
    const mod = MODULE_TOURS[loc.pathname];
    // The consultation tour points at the open-consult screen, not the guest picker.
    const consultWithoutGuest = loc.pathname === "/doctor/consultation" && !(loc.state as { bookingId?: string } | null)?.bookingId;
    if (mod && !consultWithoutGuest && !seen(mod.key)) {
      setSteps(mod.steps); setTourKey(mod.key);
      const t = setTimeout(() => setRun(true), 600);
      return () => clearTimeout(t);
    }
    setRun(false);
  }, [role, loggedIn, loc.pathname, admin?.toursSeen]);

  const cb = (data: CallBackProps) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      if (tourKey) {
        localStorage.setItem(tourKey, "1");
        // Persist against the account so this never replays on another device.
        api.auth.markTourSeen(tourKey).catch(() => undefined);
      }
      setRun(false);
    }
  };

  return (
    <Joyride
      steps={steps} run={run} callback={cb}
      continuous showSkipButton showProgress
      disableScrolling={false}
      locale={{ back: "Back", close: "Close", last: "Done", next: "Next", skip: "Skip tour" }}
      styles={styles}
    />
  );
}
