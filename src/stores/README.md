Zustand stores for UI / onboarding / offline-queue state (see `/docs/03-technical-architecture.md` §7).

- `uploadQueue.ts` — the Phase-6 offline capture queue: raw captures + metadata that
  failed to upload, flushed on reconnect / launch / foreground. Persisted across app
  kills via Zustand `persist` over AsyncStorage; media bytes live in the document dir
  (`src/features/capture/queueStorage.ts`).
