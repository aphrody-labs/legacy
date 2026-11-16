# Android testing setup (analysis, 2026-11-16)

Scope: every Gradle Android module in the tree (`fd AndroidManifest.xml`, outside `third_party/`).

| Module | Kind | DI | Unit | Mocking | Robolectric | UI | UI tests | Screenshot | E2E |
|---|---|---|---|---|---|---|---|---|---|
| `frameworks/tauri/mobile/android` | library (Kotlin) | none | JUnit 4.13.2, `ExampleUnitTest.kt` only | none | none | WebView host, no Compose | Espresso 3.5.1 declared, `ExampleInstrumentedTest.kt` only | none | none |
| `frameworks/tauri-plugin-*/android` (13 plugins) | library (Kotlin) | none | JUnit 4.13.2 declared, no tests | none | none | none (native bridges) | Espresso 3.5.1 declared, no tests | none | none |
| `frameworks/tauri-plugin-opener/android` | library | none | none declared | none | none | none | none | none | none |
| `frameworks/tauri-cli/templates/{mobile,plugin}/android` | generator templates | none | JUnit 4.13.2 | none | none | WebView | Espresso 3.5.0 / 3.5.1 | none | none |
| `apps/gemini-super-app/**/gemini_voice_app/android` | Flutter host | Flutter | Flutter tests | n/a | n/a | Flutter | n/a | n/a | n/a |

Findings:
- No dependency injection, mocking, Robolectric, screenshot or end-to-end framework anywhere.
- The Tauri modules are thin Kotlin bridges between the Rust core and Android APIs; their behaviour is driven from Rust, so the meaningful tests are plugin-command round trips on a device, not ViewModel unit tests.
- No JaCoCo.

Proposed setup (not applied):
1. Keep JUnit 4 and the current Espresso versions; bump them to the newest stable only with the Tauri upstream sync.
2. Add Robolectric unit tests for each plugin's `@Command` handlers (fake `Invoke`, fake Android services), no Hilt: the plugins have no object graph to inject.
3. Add one instrumented test per plugin on the `canary-20261104` x86_64 image already installed, driven by `android` CLI journeys.
4. Add JaCoCo to the plugin modules.
5. The Flutter app keeps Flutter's own test stack.
