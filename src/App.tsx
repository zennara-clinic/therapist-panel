import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { StoreProvider } from "./store";
import { Shell, HOME } from "./shell";
import { Tours } from "./tours";
import { ErrorBoundary } from "./lib/ErrorBoundary";
import { Floor, Session, Summary, Schedule } from "./pages/therapist";
import { MyProfile } from "./pages/profile";

/**
 * One boundary per route, keyed on the path so navigating away from a screen
 * that errored clears the error rather than leaving it stuck.
 */
function Guarded({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return <ErrorBoundary key={loc.pathname}>{children}</ErrorBoundary>;
}

const page = (el: React.ReactNode) => <Guarded>{el}</Guarded>;

export default function App() {
  return (
    <StoreProvider>
      <Tours />
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to={HOME} replace />} />

          <Route path="/floor" element={page(<Floor />)} />
          <Route path="/floor/session" element={page(<Session />)} />
          <Route path="/floor/summary" element={page(<Summary />)} />
          <Route path="/floor/schedule" element={page(<Schedule />)} />
          <Route path="/floor/profile" element={page(<MyProfile />)} />

          <Route path="*" element={<Navigate to={HOME} replace />} />
        </Routes>
      </Shell>
    </StoreProvider>
  );
}
