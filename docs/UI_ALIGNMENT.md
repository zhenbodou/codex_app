# Megvii Code desktop UI alignment

Reference checked on 2026-10-23:

- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/desktop-quickstart
- https://claude.com/resources/articles/claude-code-desktop-redesign

The current documentation takes precedence over the older redesign announcement. In particular, transcript views are Normal, Thinking, and Verbose; Ctrl+O cycles them. Shift+Tab retains normal focus navigation on desktop.

## Implemented

- Project-grouped session sidebar with search, status filtering, collapse, rename, and delete actions.
- Centered new-session screen and graphical composer with project, model, permission, and skill controls.
- Create a session on first send; suggestions populate an editable draft.
- User bubbles, collapsible thinking, and tool activity cards instead of terminal prompt markers.
- Session details with actual transcript usage, project path, and tool activity; pointer and keyboard resizing.
- Neutral light/dark surfaces, shared typography and spacing, restrained menu and panel transitions, an SVG activity mark, and reduced-motion support.
- Login and startup visuals use the same desktop visual language.
- Login defaults to a separate high-contrast light theme, offers a dark theme toggle, explicit field labels, accessible validation, and password visibility controls. There are no initially transparent login containers.
- Independent in-memory transcripts and drafts per session; background replies cannot overwrite the foreground session. Logout clears account state and invalidates pending chat results.
- Ctrl+Tab session cycling, Ctrl+Shift+M permission menu, Ctrl+Shift+I model menu, Ctrl+/ shortcut reference, and keyboard menu navigation.
- Modals contain keyboard focus and restore it on close. Menu Escape is consumed before the global stop shortcut.
- The details rail stays beside the chat at the 940×600 desktop minimum, with composer controls wrapping instead of being covered by an overlay.

## Verification

`npm.cmd run build` runs TypeScript and the production frontend build.

Browser verification scripts and captures are in `output/playwright/`. Browser concurrency samples use isolated in-memory stores and stubbed API methods.

The native smoke check connects to the freshly built Windows application's actual WebView2, verifies the readable login screen, logs in using the local built-in demo account, loads backend projects/settings, and opens/closes shortcut help. Existing local login credentials are restored after the check. The result is recorded in `output/playwright/native-result.json`. This is separate from browser fixture checks; external remote-provider integration is not verified.

The browser checks cover suggestion drafts, model menu, detail-panel resizing, session search and filtering, transcript shortcuts, normal Shift+Tab focus navigation, tool expansion, sidebar collapse, first-send session creation, and the 940×600 minimum window size.

Additional checks cover light/dark login placeholder contrast (at least 4.5:1), validation, duplicate auth submission protection, independent session drafts, simultaneous delayed replies, logout during an active reply, menu Escape isolation, modal focus, and visibility of the send button beside the details rail.

`cargo test --manifest-path src-tauri/Cargo.toml --lib` passes all five existing backend tests: invalid-token rejection, demo login, project cascade/settings merge, cancellation, and streaming persistence. `npm.cmd run tauri -- build --debug --no-bundle` produces `src-tauri/target/debug/claude-code-desktop.exe` with embedded frontend assets.

## Remaining fidelity limits

This is an alignment of the existing app, not a verified pixel-identical reproduction of an installed official build. Exact animation curves and durations are not published; current transition values are approximations. No specific official desktop binary or user recording was available for direct comparison.

The existing backend does not expose the integrated terminal, file editor, browser preview, Git diff data, SSH/cloud environments, or draggable multi-pane workspace. Those official capabilities and their layouts remain unimplemented; their controls have not been added as inactive placeholders. Chat and Cowork are separate product surfaces and are outside this app's Code functionality.
