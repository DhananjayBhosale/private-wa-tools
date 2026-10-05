# Contributing

Pull requests and issues are welcome. The project stays local-only, small, and easy to audit.

## Where help is needed most

Deleted message recovery does not work on real WhatsApp Web yet. [docs/deleted-message-recovery.md](docs/deleted-message-recovery.md) explains what is known, how to send the data we need, and what a good fix includes.

## Rules

- No analytics, telemetry, accounts, license checks, cloud sync, remote code, or network calls from the extension. `npm test` fails if a network API appears.
- No new permissions or site access without a clear reason in the pull request.
- Keep runtime dependencies at zero.
- Prefer small, readable DOM code over frameworks. WhatsApp changes its markup often, so match on labels, roles and icon names, not generated class names.
- Add or update tests for every behavior change.
- Never post real messages, names, phone numbers, or screenshots of real chats in issues or pull requests. Use a test chat and redact anything personal.

## Setup and checks

Node.js 20 or newer.

```sh
npm ci
npm test
```

`npm test` checks syntax, the manifest, the offline rules, and runs the DOM test suite without starting a browser.

`npm run test:browser` and `npm run test:extension-load` launch Chrome. They expect Chrome at the default macOS path; edit `chromePath` in the scripts for other systems.

To try a change, open `chrome://extensions`, turn on Developer mode, click Load unpacked, and pick this folder. After edits, click the reload arrow on the extension card and reload WhatsApp Web.

## Pull requests

- Keep each pull request focused.
- Say what changed and how you checked it. For changes that depend on real WhatsApp Web behavior, say which browser you used and what you saw.
- `npm test` must pass.

## Releases

Maintainers: set the new `version` in `manifest.json` and `package.json`, then push a tag such as `v0.2.0`. The Release workflow checks that the tag matches the manifest, runs the tests, builds `private-wa-tools.zip` with `npm run package`, and publishes it. The README download link always points to the latest release.
