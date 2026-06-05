# Phase 5 — Manual Testing

The acceptance criteria in `04-build-phases.md` Phase 5 translated into a real-device test pass. If scenarios 1–9 pass cleanly on a real Android device, Phase 5 is solid and Phase 6 can start. Scenarios 10–14 are important if you have multi-user capability or want to spot-check edge cases.

## New surface area in the app

After Phase 5, the app newly does the following:

- Tapping into a group lands on the **feed** (not the metadata screen it was after Phase 2).
- A header "Info" button opens the group metadata sub-screen (name, dates, lifecycle, invite, members, delete-group).
- Posts render inline: photos, capped videos (tap-to-play, muted by default), and photo-booth strips.
- "Late" badge appears on `is_late=true` posts.
- Pull-to-refresh and infinite scroll on the feed.
- Long-press your own post → action sheet → Delete → confirm → it's gone everywhere.
- Empty state copy when no posts exist yet.
- Post-photobooth completion lands on the feed (not the old detail screen).

## Before you test: EAS rebuild required

Phase 5 adds two native modules — `expo-image` and `expo-video`. You cannot test on a real device without a new dev-client build.

1. Let Claude Code finish installing deps and updating `package.json` + `app.json`.
2. Build: `eas build --profile development --platform android`
3. Install the new APK on your device once the build lands (~10–15 min).
4. Start Metro fresh: `npx expo start --dev-client --clear`

After the new APK is installed, all subsequent JS changes hot-reload normally.

## Tools you'll need

- **`/dev/fire-prompt`** (from Phase 4) to quickly seed the feed with prompted posts. You need enough posts to test pagination (> 20) and to have at least one photo and one video.
  ```
  curl -X POST \
    -H "Authorization: Bearer <jwt>" \
    -H "Content-Type: application/json" \
    -d '{"group_id": "<uuid>"}' \
    https://candid-api-7o72.onrender.com/dev/fire-prompt
  ```
- **Supabase dashboard → SQL editor** to verify `posts.deleted_at` is set after a delete, and that `visible_at` is correctly in the past for visible posts.
- **R2 dashboard (or `curl --head`)** on the `storage_path` to confirm the media object is actually purged after a delete.
- **Two accounts** for cross-device propagation tests. Two physical devices is ideal; one device with sign-out + sign-in-as-another also works.

## Test pass

### 1. Feed loads with existing posts
- [x] Open a group that has at least one prompted post from Phase 4 testing, plus your photo-booth strip.
- [x] **Expect:** posts appear newest-first; each shows author avatar, display name, relative timestamp ("2h ago"), and the media. The strip from your join is somewhere in the list.

### 2. All three media types render
- [x] Ensure you have at least one photo post, one video post, and the photo-booth strip in the feed. Use `/dev/fire-prompt` to seed specific media types if needed.
- [ ] **Expect:**
  - [x] Photo renders inline, fills the card width.
  - [x] Video shows a first-frame poster with a play button overlay — does NOT autoplay.
  - [x] Strip renders as the composed vertical image without distortion.

### 3. Photo-booth completion lands on the feed
- [ ] Join a brand-new group (use a second account if needed) and complete the photo-booth.
- [ ] **Expect:** after the strip uploads, you land on the **feed** (not the old group detail), with your strip visible as the first and only post.

### 4. Info screen accessible from header
- [ ] On any group feed, tap the "Info" button in the header.
- [x] **Expect:** the info sub-screen opens with name, dates, lifecycle badge, invite affordance (code + share), member list, and the delete-group action (creator only).
- [x] Navigate back.
- [x] **Expect:** returns to the feed without losing scroll position.

### 5. Pull-to-refresh
- [x] Pull down on the feed.
- [x] **Expect:** spinner appears, refetch fires, list updates to reflect any newly-visible posts.

### 6. Infinite scroll
- [ ] Seed a group with more than 20 posts (dev-fire + capture, or reuse existing test data). Scroll to the bottom.
- [ ] **Expect:** footer spinner briefly appears; next page loads seamlessly; no duplicate posts; no missing gaps; scroll position holds stable through the load.

### 7. Late badge
- [ ] Dev-fire a prompt → wait past `response_window_seconds` but before `late_deadline` (default: 5–35 min after dispatch) → capture.
- [ ] Open the feed.
- [ ] **Expect:** that post shows the "late" badge inline with the timestamp. Other on-time posts have no badge.

### 8. Video playback
- [x] Tap a video post.
- [x] **Expect:** video plays from the first-frame poster, muted by default. An unmute control is visible.
- [x] Tap to pause. Scroll past other video posts.
- [x] **Expect:** no autoplay — only videos you tap explicitly play. Scrolling past them does nothing.

### 9. Delete own post (core flow)
- [x] Long-press one of your own posts.
- [x] **Expect:** action sheet appears with a "Delete" option.
- [x] Tap Delete → confirm.
- [x] **Expect:**
  - [x] Post disappears from the feed immediately (optimistic update).
  - [ ] `posts` row has `deleted_at` set (check Supabase SQL editor).
  - [ ] R2 object at `storage_path` is **actually gone** — `HEAD` on it returns 404 (verify via R2 dashboard or `curl --head "<storage_path>"`).
  - [x] Pull-to-refresh confirms the post does not reappear.

### 10. Cross-device delete propagation
- [ ] Two accounts in the same group. Both have the feed open.
- [ ] Delete a post from account A.
- [ ] On account B, pull-to-refresh.
- [ ] **Expect:** the post is gone from B's feed.

### 11. Cannot delete others' posts
- [ ] Long-press a post authored by another user.
- [ ] **Expect:** no "Delete" option appears in the action sheet. UI-level gating — not just a server rejection.

### 12. RLS: non-member cannot read the feed
- [ ] With a JWT from a user who is NOT a member of the group, call `GET /groups/{id}/feed` directly (via curl).
- [ ] **Expect:** 403 or 404. Feed contents are never returned.

### 13. Empty state
- [ ] Create a fresh group, complete the photo-booth, then delete the strip post (your only post).
- [ ] **Expect:** empty state copy appears: "Nothing here yet. Wait for a prompt — or check back."

### 14. View delay (spot-check)
- [ ] Create a group with `view_delay_seconds = 60` (Advanced settings on create). Capture a post via the test-capture button.
- [ ] Immediately check the feed on the same device (or another device signed into the group).
- [ ] **Expect:** the post is NOT visible yet.
- [ ] Wait 60 seconds, then pull-to-refresh.
- [ ] **Expect:** the post now appears. This validates the knob that holds posts until `visible_at` elapses.

## Bar for moving to Phase 6

- Scenarios **1–9 pass cleanly** on a real Android device — the full core experience.
- Scenarios **10–12** are essential if you have multi-account capability; RLS and cross-user delete correctness matter for a real group.
- Scenarios **13–14** are spot-checks; confirm them if time allows.

## Things you won't be able to test until Phase 6

- **Offline capture queue** — capture with no signal, post queues locally, flushes and appears on reconnect.
- **Locked group behavior** — after `end_date`, the group is read-only: feed still viewable, no new captures or prompts.
- **Client-side video compression** — keeps R2 objects small; not yet wired.
- **Full release builds** — TestFlight distribution for iOS and a signed APK / Play internal-testing track for Android.
- **Full multi-device "party simulation"** with 3+ participants — the Phase 6 acceptance criteria gate.
