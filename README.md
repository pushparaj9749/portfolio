# Kriya — Android automation that explains itself

**Kriya** (क्रिया, "action") is a from-scratch Android automation app built as a direct answer to
the friction people report with MacroDroid: a builder that hides what a macro really does,
silent failures when a permission is missing, and template stores full of macros that need
access the phone won't grant.

Kriya keeps the power and fixes the three pain points:

| Problem in existing automation apps | What Kriya does |
|---|---|
| A macro is a list of abstract tiles; you can't tell what it will do at a glance | **Every automation is printed as one sentence** — "At 7:00 AM, but only when charging → say Good morning" |
| Macros silently do nothing; the user has to guess which permission is missing | **Reason for every skip.** Every run is logged as Ran / Skipped / Blocked / Failed *with the exact constraint or permission* |
| Permission screens are scattered; OEM battery savers kill the app | **live health check** inspects battery optimisation, DND access, exact alarms, usage access, notification and write-settings permission and deep-links each one |
| Template stores ship macros that need unpurchased features | **Only real capabilities** are listed, and the unit tests fail the build if a template references a missing feature |
| Debugging means enabling a global debug mode and reading logs | **Test now** runs a macro and reports the outcome of each step in plain English |

## What it does

**12 triggers** — time of day (weekday-aware), battery level (drop / rise / any change), charger,
Wi-Fi join / leave (optionally by SSID), Bluetooth, screen on / off, app opened, headphones,
airplane mode, ringer mode change, reboot, manual.
**5 conditions** — charging state, named Wi-Fi, screen lock state, minimum battery, days of week.
**14 actions** — Do Not Disturb, ringer mode, volume, speak text, media play/pause, next track,
open Wi-Fi / Bluetooth panels, brightness, torch, vibrate, post notification, launch an app, wait.

Plus: template gallery, duplicate / delete, pause per automation, JSON export & import, run
history, home-screen shortcut receiver, exact-alarm scheduling with a graceful fallback,
permission onboarding, and a light/dark theme.

## Build the APK (no local Android setup needed)

GitHub Actions builds it for you:

1. Push to any branch, or open **Actions → Build APK → Run workflow**.
2. When the run finishes, download the **`kriya-apk`** artifact (or the release attached to tagged
   builds).
3. Copy the `.apk` to your phone, tap it, and allow installing from your browser files app.

The workflow runs the unit tests first; the APK job only runs when they pass. Without signing
secrets it produces a **debug-signed, installable APK**. To get a properly signed release build,
add these repository secrets:

| Secret | Meaning |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
| `KEYSTORE_PASSWORD` | keystore password |
| `KEY_ALIAS` | key alias |
| `KEY_PASSWORD` | key password |

With those present the workflow builds `assembleRelease` and signs it. Tagging `v1.0.0` (or
running the workflow manually with "release" ticked) additionally publishes a GitHub release with
the APK attached.

### Local build

```bash
echo "sdk.dir=/path/to/Android/Sdk" > local.properties
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest  # pure-logic unit tests
```

Requires JDK 17 and Android SDK 35 (build-tools are pulled by AGP).

## Architecture

```
app/src/main/java/com/kriya/app/
├── data/        Model.kt  Codec.kt (JSON)  Prefs.kt (storage)  Apps.kt
├── engine/      Catalog.kt   ← single source of truth for every trigger/action/condition
│                Constraints.kt + DeviceSnapshot ← pure, unit-tested
│                Schedule.kt  ← pure time maths, unit-tested
│                Templates.kt Diagnostics.kt
│                Engine.kt ActionRunner.kt Scheduling.kt KriyaService.kt Receivers.kt
└── ui/          Compose Material 3, custom theme, Home / Build / Activity / Setup + editor
```

The rule that keeps the UI honest: **the engine never speaks a sentence the UI hasn't already
defined in `Catalog.kt`**, and every catalog entry has a test asserting it produces a default,
a title and a readable summary.

## Honest limits

Kriya targets Android 8.0+ (API 26) and does **not** use the Accessibility Service, so it cannot
tap buttons inside other apps. Actions that Android reserves for the system (toggling Wi-Fi or
Bluetooth outright, writing secure settings) either open the relevant panel or ask for the
specific special access — and say so in the UI instead of failing silently.

## Licence

MIT.
