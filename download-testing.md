# Post-event Download — Manual Testing

Real-device test pass for the post-event download feature (single + bulk save
to camera roll, plus the retention nudge banner). This is a follow-on after
Phase 6. The bar is "would I trust this to be the group's only archive" — saving
must actually land in the camera roll, and failures must be surfaced honestly,
never silent.

## New surface area in the app

- Tap any feed post → full-size viewer modal (pan-to-dismiss) with a **Save to
  camera roll** button. Works for photo, video (inline playback), and strip
  (saved as the single composite image, not 3 frames).
- **Bulk download** of the whole group feed once the group is `locked`, from two
  entry points: the retention banner CTA and a permanent row in the group Info
  screen. Sequential, abortable, with a progress bar and an honest summary.
- **Retention banner** above the feed when a locked group is within 7 days of
  `retention_purge_at` (= `end_date` + 60 days, computed server-side).
- A local "Saved ✓"-style hint (button reads **Save again**) once you've pulled a
  post down. Local-only state; resets on reinstall.

## Before you test: EAS rebuild required

This feature adds `expo-media-library` (and `expo-keep-awake`). New native module
→ **new dev-client build**.

1. Let Claude Code finish installing deps and updating `package.json` +
   `app.config.ts`.
2. Build: `eas build --profile development --platform android` (and/or `ios`).
3. Install the new build on your device.
4. Start Metro fresh: `npx expo start --dev-client --clear`

iOS note: the OS prompt must say **"Add Only"** (not full library access). If you
see a full-access prompt, the write-only config didn't take — stop and fix before
continuing.

## Tools you'll need

- A group with a handful of posts (photo + video + strip) for the single-save
  cases.
- A **locked** group for the bulk cases. Either use one whose `end_date` is in
  the past, or temporarily set a test group's `end_date` to yesterday via the
  Supabase SQL editor.
- To exercise the retention banner: set a locked group's `end_date` so that
  `end_date + 60 days` is **within 7 days** of now (e.g. `end_date = today − 54
  days`).
- **R2 dashboard** to delete a single object and simulate a mid-bulk 404.
- iOS **Settings → Candid** and Android **App info → Permissions** to verify the
  permission is add/write-only and to toggle it for the denial paths.

## Test pass

- [ ] **Single photo**: tap a photo in the feed → modal opens → Save → it's in
      the camera roll, inside the **Candid** album.
- [ ] **Single video**: same flow; the video is in the album and plays.
- [ ] **Single strip**: the single composite image is saved (NOT 3 separate
      frames).
- [ ] **First-download priming**: the first save triggers the rationale + OS
      prompt; subsequent saves do not re-prompt.
- [ ] **Permission denied**: deny the prompt → a non-blocking explainer appears
      with a working deep link to Settings. No silent failure, no auto re-prompt.
- [ ] **Pan-to-dismiss**: drag the viewer down to close; a short drag springs
      back.
- [ ] **Bulk entry point while active**: in a non-locked group, the Info-screen
      row is disabled with "Available when the event ends." and the banner is not
      shown.
- [ ] **Bulk happy path**: in a locked group with posts, open the sheet → it
      shows the real total → run it end to end → summary reads "Saved N of N … in
      the Candid album," and the album contains every post.
- [ ] **Retention banner**: with a locked group inside the 7-day window, the
      banner shows the correct "in N days." CTA opens the bulk sheet. Dismissing
      (✕) hides it for the session only — **restart the app and it returns**.
- [ ] **Mid-bulk single failure**: delete one object in R2, run bulk → summary
      shows "Saved X of Y," offers **Try again (1)**, and the retry saves just the
      missing one.
- [ ] **Cancel mid-bulk**: hit Cancel → it stops at the next item boundary →
      summary reflects what was actually saved, with **Continue** for the rest.
- [ ] **Background mid-bulk**: background the app while saving → on return the UI
      says it paused and offers to continue from where it stopped (it does NOT
      claim it kept running).
- [ ] **Already-downloaded hint**: save a post, reopen its viewer → the button
      reads **Save again**.
- [ ] **Zero-posts locked group**: open bulk on a locked group with no posts →
      "No posts to save," not a 0/0 progress sheet.
- [ ] **Reinstall**: after reinstall, the download store is reset (acceptable),
      but the camera-roll items remain.
- [ ] **iOS access level**: Settings → Candid shows **Add Photos Only**, not Full
      Access.
- [ ] **Onboarding honesty line**: the join screen shows "Anything you post can be
      saved to other members' phones."
