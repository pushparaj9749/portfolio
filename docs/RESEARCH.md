# Research: what MacroDroid does, and where it hurts

Notes that drove Kriya's design. Sources are linked; quotes are shortened.

## What MacroDroid ships

From the Play Store listing and the official wiki:

- **Triggers (120+)** — time/date, battery level & temperature, charger, Wi-Fi (incl. SSID), Bluetooth
  events & beacons, call in/out/missed/ended, SMS, app launched/closed/installed, notification,
  clipboard, shake/light/proximity sensors, geofences & cell towers, webhooks, NFC, Wear OS,
  headphone, screen on/off, ringer mode, airplane mode, calendar events, file/activity intents.
  Triggers always combine with **OR**; "A while B" is expressed by attaching a constraint to the
  trigger. ([Triggers wiki](https://wiki.macrodroid.com/wiki/index.php/Triggers))
- **Actions (200+)** — radios, volume/ringer/DND, speak text, send SMS/email, media control,
  open app/URL, brightness, flashlight, screenshot, file copy/move/delete, Tasker plugins, HTTP
  requests, scenes (custom UIs), Java code, shell (root), QR generation, charts.
- **Constraints (80+)** — day/time windows, charging, battery ranges, screen state, Wi-Fi/cell,
  headphones, app foreground, variables, "trigger fired", etc.
- Variables/dictionaries/arrays, if-then-else, loops, scene builder, Wear OS companion, template
  store. Free tier: 5 macros + ads; Pro: one-time purchase, unlimited + community sharing.
- Accessibility Service powers in-app UI automation; the app claims it never logs data via it.

Sources: [Play Store](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid&hl=en_US),
[MacroDroid wiki – Triggers](https://wiki.macrodroid.com/wiki/index.php/Triggers).

## Where users actually get stuck

These recur in reviews, forum and Reddit threads:

1. **Silent failure.** "Too many macros don't work… triggers don't work." The recommended fix is a
   buried hamburger → *Troubleshooting* report, plus manually re-toggling accessibility and battery
   optimisation. ([r/macrodroid](https://www.reddit.com/r/macrodroid/comments/1pht6ii/disappointing_app/))
2. **OEM battery savers silently freeze the background service.** "Press and hold the app icon →
   app info → battery → unrestricted"; the same thread tells users to check whether the optimiser is
   killing the app. ([r/macrodroid](https://www.reddit.com/r/macrodroid/comments/16nyd0t/i_get_this_message_constantly_and_my_automations/))
   Android 15 update reports echo this. ([thread](https://www.reddit.com/r/androidapps/comments/1o5pblt/macrodroid_routines_keep_breaking_in_android_15/))
3. **Accessibility permission gets revoked by the system**, and UI interactions start returning
   `result=false` with no in-app explanation. ([thread](https://www.reddit.com/r/macrodroid/comments/194g24u/ui_interaction_suddenly_stopped_working/))
4. **Steep learning curve** — users say it is easier than Tasker but still needs "breaking down what
   you want" and simplifying community templates that demand permissions and drain battery. ([review](https://rektechworld.com/macrodroid-review-best-android-automation-app/))
5. **Template store quality** — templates that need access the user won't grant, or that are heavy
   on battery.
6. **The surface area is huge**: 120 triggers + 200 actions + 80 constraints + variables + loops +
   scenes. Powerful, but the first screen has to answer "what will this do?" without a debug session.

## What Kriya borrows, and what it changes

Borrowed on purpose (these are the parts that work): the trigger → constraint → action model,
OR-combined triggers with constraints for AND semantics, magic values like battery level crossing a
threshold, an enabled/disabled toggle per automation, a template gallery, a run log, and manual
triggers/shortcuts.

Changed:

| MacroDroid | Kriya |
|---|---|
| Component lists with names only | Every component ships a one-line "what this means" and a **plain-English summary** of the whole automation |
| Debug mode + logs to find out why a macro didn't run | Each run is recorded as Ran / Skipped / Blocked (**naming the failing constraint**) / Failed (**naming the failing step**) |
| Permissions scattered across Android settings; troubleshooting buried | **Health check** probes battery optimisation, DND access, exact alarms, usage access, write-settings and notifications, with deep links and a required/optional flag |
| Template store can include unsupported features | All templates are compile-time checked by unit tests against the engine's capability list |
| No first-run guidance on OEM killers | Onboarding ends with the real permission screens and a one-line reason for each |

## Deliberate scope decisions

- **No Accessibility Service.** It is the source of the "banking apps stop working" complaints and
  cannot be honestly promised to be private. Kriya therefore offers panels/deep links rather than
  tapping inside other apps, and documents this instead of pretending.
- **No anti-feature we cannot test.** Wi-Fi/Bluetooth toggling is done through the system panel; the
  trigger side still watches real state changes.
- **The engine is pure Kotlin.** `Schedule`, `Constraints`, `Diagnostics` and `Catalog` are
  Android-free, so the logic is unit-tested on every push before an APK is produced.
