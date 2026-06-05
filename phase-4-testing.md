# Phase 4 — Manual Testing

The acceptance criteria in `04-build-phases.md` Phase 4 translated into a real-device test pass. If scenarios 1–8 below pass cleanly on a real Android device, Phase 4 is solid and Phase 5 can start. Scenarios 9–10 are spot-checks.

## New surface area in the app

After Phase 4, the app newly does the following:

- Asks for notifications (with the priming screen first) on first authed open.
- Auto-fires the photo-booth when you join or create a group, before you can do anything else.
- Registers an FCM token with the backend silently in the background.
- Receives push notifications titled "Time to capture" when prompts dispatch.
- Renders an active-prompt screen at `/groups/{id}/prompts/{prompt_id}` with a server-driven countdown and capture CTA.
- Shows a persistent banner on the groups list and group detail if notifications are denied.
- Hydrates on cold start — if you killed the app while a prompt was active, re-opening routes you to it.

## Tools you'll need

- **`curl`** to hit `/dev/fire-prompt`. The command shape:
  ```
  curl -X POST \
    -H "Authorization: Bearer <jwt>" \
    -H "Content-Type: application/json" \
    -d '{"group_id": "<uuid>"}' \
    https://candid-api-7o72.onrender.com/dev/fire-prompt
  ```
  Grab the JWT from the device — the app may log it in dev, or you can pull it from `expo-secure-store`.
- **Supabase dashboard → SQL editor** to peek at the `prompts`, `posts`, and `devices` tables during testing.
- **Render dashboard → worker logs** to confirm the three internal jobs (generator, dispatcher, expirer) are ticking and the dispatcher is actually sending pushes.

## Test pass

### 1. Permission priming
- [ ] Fresh install (or revoke notifications first) → sign in → first authed app open.
- [ ] **Expect:** the rationale screen appears *before* the OS prompt.
- [ ] Grant permission.
- [ ] **Expect:** a row in `devices` with your FCM token + `platform=android`; API logs show `POST /devices/register`.

### 2. Permission denial recovery
- [ ] Revoke notifications via system settings → return to app.
- [ ] **Expect:** persistent banner on the groups list AND on group detail saying notifications are needed.
- [ ] Tap the banner.
- [ ] **Expect:** system settings opens to the app's notifications page.
- [ ] Re-grant → return to app.
- [ ] **Expect:** banner disappears, FCM re-registers.

### 3. Photo-booth-on-join auto-fire
- [ ] Create a new group (or join one via code).
- [ ] **Expect:** on landing on group detail, app immediately routes to `photobooth.tsx` — no taps required.
- [ ] Complete the 3-frame strip.
- [ ] **Expect:**
  - [ ] A `posts` row exists with `kind=photobooth`, `media_type=strip`, `prompt_id=null`.
  - [ ] Your `profiles.avatar_url` is set.
  - [ ] Your avatar shows in the member list.
- [ ] Re-enter the same group.
- [ ] **Expect:** does NOT re-fire.

### 4. The core loop via `/dev/fire-prompt`
- [ ] Background the app.
- [ ] `curl /dev/fire-prompt` with the group_id.
- [ ] **Expect:** push notification titled "Time to capture" lands on the device within seconds.
- [ ] Tap it.
- [ ] **Expect:** app opens directly to the active-prompt screen with the countdown ticking down from `response_window_seconds` (default 300s).
- [ ] Tap the CTA.
- [ ] **Expect:** camera opens with the prompt's `media_type` pre-set.
- [ ] Capture and upload.
- [ ] **Expect:**
  - [ ] `prompts` row went from `active` → `responded`.
  - [ ] `posts` row has `prompt_id` set and `is_late=false`.

### 5. Late and missed states

**Late:**
- [ ] Dev-fire a prompt.
- [ ] Wait past `response_window_seconds` but before `late_deadline` (default: between 5 and 35 min after dispatch).
- [ ] Capture.
- [ ] **Expect:** prompt is `late`, post is `is_late=true`.

**Missed:**
- [ ] Dev-fire a prompt.
- [ ] Ignore it entirely past `late_deadline` (default: 35 min after dispatch).
- [ ] Re-open the prompt screen.
- [ ] **Expect:**
  - [ ] Expirer flipped the prompt to `missed`.
  - [ ] Prompt screen shows "you missed this one" with no capture CTA.

### 6. Foreground push handling
- [ ] Keep the app open in the foreground.
- [ ] Dev-fire a prompt from a separate terminal.
- [ ] **Expect:** in-app banner appears (non-intrusive), tappable.
- [ ] Tap.
- [ ] **Expect:** routes to the active-prompt screen.

### 7. Cold-start hydration

Two flavors, both must work:

**a) Kill + relaunch via launcher:**
- [ ] Dev-fire a prompt.
- [ ] Kill the app from the recents tray *before* tapping the push.
- [ ] Re-open via the launcher icon (NOT via the push notification).
- [ ] **Expect:** app detects the actionable prompt and routes you to it.

**b) Cold-tap:**
- [ ] Dev-fire a prompt.
- [ ] With the app killed, tap the push notification directly.
- [ ] **Expect:** app cold-starts straight into the active-prompt screen (`getInitialNotification` path).

### 8. The real scheduler (not just dev-fire)

This validates the worker stack end-to-end, not just the push plumbing.

- [ ] Create a group with:
  - `start_date = today`
  - `end_date = tomorrow`
  - `prompts_per_day = 2`
  - A wide daily window that includes the next hour (e.g., 09:00–23:00 if it's noon).
- [ ] Wait up to an hour for the generator to run.
- [ ] Check the `prompts` table: ~2 rows with `status=scheduled` and `scheduled_at` in the window.
- [ ] Wait for the earliest `scheduled_at`.
- [ ] **Expect:** within a minute, a real push lands on the device. Capture round-trip works.
- [ ] Check Render worker logs.
- [ ] **Expect:** generator/dispatcher/expirer all logging regular ticks.

### 9. Lifecycle boundary (spot-check)
- [ ] Create a group with `start_date` 2 days in the future. Wait an hour.
- [ ] **Expect:** no prompts scheduled yet for that group.
- [ ] Create a group with `end_date` yesterday.
- [ ] **Expect:** group is locked, no prompts.

### 10. Multi-user device targeting (if you have 2 devices)
- [ ] Device A creates a group; device B joins via code.
- [ ] Dev-fire a prompt for user A.
- [ ] **Expect:** push lands only on A.
- [ ] Dev-fire for user B.
- [ ] **Expect:** push lands only on B.

## Bar for moving to Phase 5

- Scenarios **1–8 pass cleanly** on a real Android device.
- Scenario 9 is a quick sanity check.
- Scenario 10 is nice-to-have if logistics allow.

## Things you won't be able to test until Phase 5

- The "late" badge rendering in a feed — there's no feed yet, only the active-prompt screen. Verify the `is_late=true` post exists in `posts`; the visual badge comes in Phase 5.
- The `view_delay_seconds` knob (groups setting that defers when posts become visible to others) — also a feed concern.
- A second user seeing the first user's posts in the feed — Phase 5.
