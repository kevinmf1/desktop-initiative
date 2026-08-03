# Contract: Embeddable Capture SDK Public API (iOS + Android)

**Contract version: `1.0.0`** (semver per FR-000c; **raising an OS floor is a major bump** — FR-050c).

The surface a host app integrates. iOS (Swift/SPM) and Android (Kotlin/AAR) MUST expose the **same capabilities with equivalent semantics** (Principle II). Names follow each platform's idiom; behaviour is identical. The SDK MUST NOT block the host's main thread (FR-029).

## Platform support floor (FR-050)

| | Minimum | Note |
|---|---|---|
| iOS | **13.0** | Also the floor at which SwiftUI exists — consistent with dual-host support below |
| Android | **6.0 (API 23)** | |

The full core capture set — API traffic, app logs, user actions, crashes, screenshots, overlay — **works at these floors** (FR-050a). Where a capability needs a newer OS it is presented as unavailable-on-this-OS with the version required, never hidden and never inert (FR-050b). Two such cases exist, both *enhancements* over a working baseline rather than the baseline itself:

| Enhancement | Available from | Baseline that works at the floor |
|---|---|---|
| `OSLogStore` host-log reading (iOS) | iOS 15 | SDK log facade + `stderr` interception |
| `PixelCopy` screenshot fidelity (Android) | API 24 | `View.draw(Canvas)` |

## Integration — iOS supports SwiftUI *and* UIKit (FR-049)

Both are first-class; neither is a wrapper around the other. One shared capture core, two entry points:

| Host style | Entry point |
|---|---|
| UIKit | `QASDK.start(config:)` from `application(_:didFinishLaunchingWithOptions:)` |
| SwiftUI | `.qaSDK(config:)` scene/view modifier, or `QASDK.start(config:)` from an `App` initialiser |
| Mixed | Either; one call is enough |

The overlay lives in **its own `UIWindow`** owned by the SDK. Consequences that satisfy the spec directly: the host never relayouts, wraps its root view, or subclasses SDK types (FR-049b); presentation and captured data are identical in both host styles (FR-049a); and the overlay is trivially excluded from screenshots because it simply is not among the host windows enumerated during capture (FR-046). Android's equivalent is a `WindowManager` overlay outside the Activity decor view.

## Configuration

| Capability | iOS (Swift) | Android (Kotlin) | Source |
|---|---|---|---|
| Initialize | `QASDK.start(config:)` | `QASDK.start(context, config)` | FR-023 |
| Headless vs overlay | `config.mode = .headless / .overlay` | `HEADLESS / OVERLAY` | FR-027 |
| Pause / resume capture | `QASDK.pauseCapture()` / `resumeCapture()` | same | FR-027 |
| Read device ID (copyable) | `QASDK.deviceId` | `QASDK.deviceId` | FR-028 |
| Pair via QR / code | `QASDK.pair(payload:)` | `QASDK.pair(payload)` | FR-016 |
| Manual endpoint (dev only) | `config.manualEndpoint` | `config.manualEndpoint` | FR-016 (non-default) |
| Clear local log | `QASDK.clearLog(tab:)` | `QASDK.clearLog(tab)` | FR-035a |
| Log facade | `QALog.debug/info/warn/error` | `QALog.d/i/w/e` | FR-037 |
| Take screenshot | `QASDK.captureScreenshot()` | same | FR-040 |
| Capture library | `QASDK.captures` | `QASDK.captures` | FR-043 |
| Capture storage cap | `config.captureLibraryLimitBytes` (default 500 MB) | same | FR-047 |
| Recording max duration | `config.recordingMaxDuration` (default 5 min) | same | FR-045a *(EX-001)* |

### Deliberately absent

**There is no API for declaring or labelling user actions.** FR-039f forbids it: action capture is entirely SDK-derived. A host app cannot name an interaction, and does not need to — detection requires no host modification and works on apps whose source is unavailable (FR-039h). This was an explicit `/speckit-clarify` decision, not an omission; adding such an API later would be a contract change.

## Capture behavior (identical on both platforms)

- **API traffic** — intercepts host traffic (iOS `URLProtocol`; Android OkHttp `Interceptor`) recording URL, method, headers, body previews, status, timings, duration, size, and any network/decoding error (FR-023).
- **App logs** — captures SDK-facade logs always, and platform-logger output best-effort within the documented boundary (FR-037, research R12).
- **User actions** — detected automatically at the window event-dispatch boundary (`UIWindow.sendEvent` / `Window.Callback.dispatchTouchEvent`), classified into tap/long-press/swipe/scroll/text-input/lifecycle, and labelled by the FR-039i precedence. This is the layer at which SwiftUI and UIKit touches look identical, which is what makes dual-host parity one implementation instead of two.
- **Crashes** — installs an uncaught-exception/signal handler that **chains to any previously installed handler** and never suppresses it (FR-038b), so the SDK coexists with Crashlytics/Sentry. The surrounding log window is copied at crash time and survives restart (FR-038a).
- **Screenshots** — of the host app, excluding the SDK overlay (FR-040, FR-046).
- **Redaction** — listed sensitive keys redacted at capture time before buffer/stream/store, across API bodies **and app-log messages** (FR-024, FR-037b, Principle I).
- **Streaming** — live over `device-desktop-ws.md`, including the in-progress `started` phase (FR-025).
- **Resilience** — bounded rolling backlog during brief disconnects; auto-reconnect to a trusted desktop via the stored credential (FR-026).
- **Threading** — capture and streaming run off the main thread (FR-029).

## Embedded overlay (when `mode = .overlay`)

Per FR-027a–f and `design/mobile-sdk-qa.html`:

- Draggable floating action button that snaps to the nearest screen edge and fades to a low-prominence idle state (FR-027a).
- Partial-height sheet, expandable to full screen, gesture- or button-dismissable (FR-027f).
- Connection row with one-tap pair/disconnect; session identity with rename (FR-027b).
- Separate **API traffic** and **app log** tabs; total/success/error summary; search; sort order; endpoint/tag and status filters; per-tab clear **with confirmation** (FR-027b).
- **Grouped-by-action view** with a flat chronological toggle; empty groups shown; filters apply within groups (FR-039b/d/e).
- Full-screen detail for an API record — method, URL, status, timing, size, and request/response headers and bodies in separate sections — with in-body search and match navigation, per-section copy, and **copy/share as cURL** (FR-027c).
- Crash history, browsable after restart, with each crash's stack trace and captured windows (FR-038a).
- Session history: select, rename, delete, and reopen read-only with an explicit exit (FR-027d).
- Light/dark toggle that does not affect the host app (FR-027e).
- Copyable device ID for manual allowlist registration (FR-028).

In `headless` mode none of this renders; capture and streaming still run fully (FR-027).

## Coverage boundaries (MVP — deliberately matched across platforms)

| Area | iOS | Android |
|---|---|---|
| Traffic | background `URLSession`, raw `Network.framework`, some gRPC not captured | non-OkHttp clients (raw `HttpURLConnection`, Cronet) not captured |
| App logs | platform logs best-effort; facade logs always | platform logs best-effort; facade logs always |
| Screenshots | `AVPlayerLayer` / DRM content may render blank | `SurfaceView`/`TextureView` blank under `View.draw` (fixed by `PixelCopy` on API 24+) |
| Crashes | Swift runtime traps captured as signals, without a Swift-level stack |  equivalent JNI/native limits |

These are matched on purpose: "what the SDK sees" must mean the same thing on both platforms (Principle II). An unmatched boundary is a parity bug, not a platform quirk.

## Not in this contract

**Screen recording is gated behind spike EX-001** and is not committed. `config.recordingMaxDuration` is listed above for completeness of the config surface, but no recording control ships unless the spike concludes. If it does not, the SDK exposes **no** recording affordance — not a disabled one (FR-050b).

## Conformance

The shared `conformance/` suite drives a fixed set of host requests, log lines, and synthetic gestures through each SDK and asserts: identical captured fields and redaction output (SC-006); identical action classification and attribution (SC-010); equivalent reconnect/backlog behaviour; no capture path on the main thread (FR-029); and **identical output from a SwiftUI host and a UIKit host running the same scripted sequence** (SC-015). It runs against a device at each floor (iOS 13, API 23) as well as current OS (SC-018a). Divergence = build failure.
