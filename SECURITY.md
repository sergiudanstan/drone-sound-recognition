# Security Policy

This is a static, browser-only dashboard: `index.html`, `app.js` and `styles.css`, with no backend, no accounts, no third-party scripts and no network requests. Audio from the microphone or an uploaded file is analysed in the browser with the Web Audio API and is never uploaded. The only output that leaves the page is a JSON file of detected events that the user chooses to download.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ Current |

Single maintainer; only the latest release receives fixes.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** Report it privately:
**[Report a vulnerability](https://github.com/sergiudanstan/drone-sound-recognition/security/advisories/new)**
(Security → Advisories → Report a vulnerability).

| Stage | Target |
|---|---|
| Acknowledgement | within 3 business days |
| Triage | within 10 business days |
| Fix, or a documented decision not to fix | within 90 days |

These are best-effort targets from a single unpaid maintainer, not a contractual SLA.
There is no bug bounty; credit is offered in the advisory and changelog.

## Scope

In scope: anything that would send microphone audio or file contents off the device, script injection through the page (event timeline entries are rendered with `innerHTML` from values the app generates itself; rendering untrusted input there would be a finding), microphone access being requested or kept open without the user's action, and anything in this repository's workflows that could publish a release not built from `main`.

Out of scope: browser Web Audio or `getUserMedia` vulnerabilities (report to the browser vendor), and detection accuracy: the dashboard reports evidence strength, not a verdict, and a missed or false detection is a normal issue.

## Supply chain

CI runs a headless page smoke test on every push (microphone stubbed, no hardware needed), `npm audit` on the test tooling, `pip-audit` on the hash-pinned CI toolchain, CodeQL, and `zizmor` on the workflows.
Actions are pinned to full commit SHAs and kept current by Dependabot. Releases attach a
source archive with Sigstore build provenance:

```
gh attestation verify drone-sound-recognition-v0.1.0.tar.gz --repo sergiudanstan/drone-sound-recognition
```
