# Phase 6 — Manual Testing

The acceptance criteria in `04-build-phases.md` Phase 6 translated into a real-device test pass. Phase 6 is the MVP-hardening gate: when scenarios 1–11 pass and the party simulation runs clean, the MVP is ready for Kraków. This is the last phase — the bar here is "would I actually run this at a real event," not just "does it compile."

## New surface area in the app

After Phase 6, the app newly does the following:

- Queues a capture locally when there's no connectivity and flushes it on reconnect — surviving an app kill in between.
- Shows an unobtrusive "uploading…" indicator while queued posts are pending.
- Retries transient upload failures with backoff.
- Treats a too-long offline gap honestly: the post lands as missed rather than erroring.
- Goes read-only when a group passes its `end_date` — no captures, no prompts, feed still viewable, "event ended" state.
- Records video at constrained resolution/bitrate so R2 objects stay small.
- Builds as a signed release APK for direct sharing / Play internal testing (iOS TestFlight pending Apple Developer enrollment).

## Before you test: EAS rebuild required

Phase 6 adds `expo-network` (and uses `expo-file-system` for persisting queued media). New native modules → new dev-client build.

1. Let Claude Code finish installing deps and updating `package.json` + `app.json`.
2. Build: `eas build --profile development --platform android`
3. Install the new APK on your device (~10–15 min).
4. Start Metro fresh: `npx expo start --dev-client --clear`

The signed *release* APK (scenario 11) is a separate build with the production/preview profile — don't confuse it with the dev-client build above.

## Tools you'll need

- **Airplane mode** on the test device — the primary lever for the offline scenarios.
- **`/dev/fire-prompt`** (from Phase 4) to drive prompts on demand during the simulation instead of waiting for the scheduler.
  ```
  curl -X POST \
    -H "Authorization: Bearer <jwt>" \
    -H "Content-Type: application/json" \
    -d '{"group_id": "<uuid>"}' \
    https://candid-api-7o72.onrender.com/dev/fire-prompt
  ```
- **Supabase dashboard → SQL editor** to inspect `prompts`, `posts`, and `devices` states during the sim, and to confirm offline posts carry the original `captured_at`.
- **R2 dashboard** to check video object sizes (compression) and confirm deletions actually purge.
- **3+ devices or accounts** for the party simulation. Physical devices are best; one device cycling through sign-ins covers most of it but can't test simultaneous push targeting.

## Test pass — hardening features

### 1. Offline capture queues and flushes
- [x] Put the device in airplane mode.
- [x] Dev-fire a prompt (it'll already be on the device if fired before airplane mode), open it, and capture.
- [x] **Expect:** capture succeeds locally; UI shows "Saved — will upload when you're back online"; an "uploading…" indicator reflects 1 pending.
- [x] Turn airplane mode off.
- [x] **Expect:** within a few seconds the queue flushes; the post appears in the feed; the `posts` row exists; the indicator clears.

### 2. Offline capture survives an app kill (the hard one)
- [x] Airplane mode on → capture (queues).
- [x] Kill the app from the recents tray while still offline.
- [x] Turn airplane mode off.
- [x] Re-launch the app from the launcher.
- [x] **Expect:** on launch (or first foreground), the persisted queue flushes; the post uploads and appears in the feed. The local media file was kept (document dir), not evicted.

### 3. `captured_at` is preserved
> **Automated (pytest):** `test_confirm_stores_client_captured_at_not_server_time` in `tests/test_posts.py` — confirms the insert payload carries the client-supplied `captured_at` (45 min in the past), not the server-receipt time. ✅ passing.

- [x] Capture offline, wait several minutes before reconnecting, then let it flush.
- [x] Check the `posts` row in Supabase.
- [x] **Expect:** `captured_at` reflects the original capture moment, NOT the (later) upload time. The feed timestamp matches when you actually took it.

### 4. Too-long offline gap lands as missed (cleanly)
- [ ] Dev-fire a prompt → go airplane mode → capture.
- [ ] Stay offline past the `late_deadline` (default 35 min after dispatch).
- [ ] Reconnect.
- [ ] **Expect:** the flush gets a 410 from the server; the queue item is removed; the local file is deleted; the UI surfaces "you missed this one" — no error spew, no infinite retry loop. The `prompts` row is `missed`.

### 5. Queue indicator
- [ ] Capture two posts offline back-to-back (if a prompt is active) or via the test-capture path.
- [ ] **Expect:** the indicator shows the correct pending count; it decrements as items flush.

### 6. Transient-failure retry (best-effort)
- [ ] Start a capture+upload, then toggle airplane mode briefly mid-upload to interrupt it.
- [ ] **Expect:** the item lands in the queue with an incremented attempt count; on reconnect it retries fresh (new `post_id`) and succeeds — no duplicate post in the feed.

### 7. Locked group is read-only
- [ ] Use a group whose `end_date` is in the past (or edit one via Supabase for testing).
- [ ] Open it.
- [ ] **Expect:** lifecycle shows `locked`; no test-capture button; no active-prompt CTA; photo-booth does NOT fire on entry; the feed is fully viewable.

### 8. Backend rejects capture to a locked group
> **Automated (pytest):** `test_upload_url_locked_group_returns_409_group_locked` and `test_confirm_locked_group_returns_409_group_locked` in `tests/test_posts.py` — both endpoints return `409 {"error": "group_locked"}` for a member of a locked group; no presigned URL is minted and no insert fires. ✅ passing.

- [x] With a locked group, call `POST /posts/upload-url` (or `/confirm`) directly via curl with a member JWT.
- [x] **Expect:** `409` with `{ "error": "group_locked" }`. The mobile app handles this gracefully if a capture races the boundary.

### 9. Dispatcher respects a lock that lands after scheduling (spot-check)
> **Automated (pytest):** `test_dispatcher_cancels_prompt_when_group_locked` in `tests/test_dispatcher.py` — a scheduled prompt whose group's `end_date` is in the past is set to `status='missed'`, no push is sent, and `prompts_cancelled_locked` increments. ✅ passing.

- [x] Create a group ending today with a prompt scheduled for later today, then move `end_date` to yesterday in Supabase before the dispatcher runs.
- [x] **Expect:** the dispatcher skips the push and sets the prompt to a terminal state — no push lands for a now-locked group.

### 10. Video compression
- [x] Capture a 10-second video and let it upload.
- [x] Check the R2 object size in the dashboard.
- [x] **Expect:** meaningfully smaller than a raw full-resolution recording, while still watchable. Eyeball the playback quality — the goal is "small AND watchable," not "tiny and unusable."

### 11. Signed release APK builds and installs
- [x] `eas build --profile production --platform android` (or preview).
- [x] **Expect:** a signed APK lands. Install it on a *clean* device (not the dev build).
- [x] **Expect:** the release build launches, signs in via magic link, and completes onboarding without the dev server running.

## The party simulation (the acceptance gate)

This is the full end-to-end with 3+ devices. It's the single most important test — it's the closest thing to the real Kraków event. Use `/dev/fire-prompt` to drive prompts so you don't wait hours.

**Setup**
- [ ] 3+ devices (or accounts), each on the release or dev build.
- [ ] Device A creates a group: `start_date = today`, `end_date = today or tomorrow`, defaults otherwise.
- [ ] A shares the invite link/code; B and C (and more) join.

**Run the loop**
1. **Joins + photo-booths.** Each device joins and is auto-routed to the photo-booth. Everyone completes their strip.
   - [ ] **Expect:** each member's strip appears in the shared feed; each avatar shows in the member list; nobody re-fires on re-entry.
2. **Random prompts to different people at different times.** Dev-fire prompts to A, then B, then C in sequence (not simultaneously — the whole point is independent per-person timing).
   - [ ] **Expect:** each push lands ONLY on the targeted device.
3. **Mixed responses.**
   - [ ] A responds on-time → on-time post.
   - [ ] B responds during the late window → late post with badge.
   - [ ] C ignores theirs entirely → missed, no post.
   - [ ] **Expect:** the feed reflects all of this correctly across every device.
4. **Offline participant.** Put C in airplane mode, dev-fire C a prompt, have C capture, then bring C back online.
   - [ ] **Expect:** C's post flushes and appears for everyone once C reconnects.
5. **Shared browsing.** Everyone scrolls the feed.
   - [ ] **Expect:** a coherent, chronological, multi-perspective record — photos and videos from different people, strips, late badges where applicable. It should feel like a developing roll of film, not a timeline.
6. **Delete propagation.** B deletes one of B's own posts.
   - [ ] **Expect:** it disappears from A's and C's feeds on refresh; the R2 object is purged.
7. **Lock the event.** If feasible, let the group reach `end_date` (or set it to yesterday in Supabase).
   - [ ] **Expect:** every device flips to feed-only; no new prompts arrive; captures are blocked; the feed remains viewable.

**Pass condition:** the group ends up with a believable, candid, multi-angle record of the "event" assembled from everyone's captures — and nothing broke along the way.

## Distribution check

- **Android:** share the signed APK directly (or via Play internal testing). A friend installs it cold and completes onboarding unaided — no hand-holding, no dev server.
- **iOS:** blocked until Apple Developer enrollment completes. Once it does: upload via EAS Submit, add testers to TestFlight, send invites. iPhone guests cannot be onboarded any other way — there is no sideload path.

## Bar for shipping the MVP

- Scenarios **1–7 pass cleanly** on a real Android device (offline queue, locked group, compression).
- Scenario **8** confirmed via curl; **9–10** spot-checked.
- Scenario **11** — the signed APK installs and onboards on a clean device.
- The **party simulation passes** with 3+ devices.
- At least one friend installs from the shared APK and onboards unaided.
- iOS path validated only if Apple enrollment is done; otherwise Kraków is Android-only until it lands (decide whether that's acceptable for your guest list).

If all of that holds, the MVP is ready for the party.
