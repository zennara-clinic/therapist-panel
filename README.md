# Zennara — Therapist Panel

Standalone Therapist Panel for the Zennara clinic. Vite + React, talks to the Zennara
backend for everything (`VITE_API_BASE_URL` in `.env`).

- Sign-in: email OTP or password via `/api/admin/auth/*`.
- Only accounts with role **`therapist`** can use this panel; other roles are told
  which panel to use instead and no session is stored.
- Home route: `/floor` · dev server port: 5175.

```
npm install
npm run dev
```
