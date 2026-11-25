# Drone Sound Recognition Dashboard

[![CI](https://github.com/sergiudanstan/drone-sound-recognition/actions/workflows/ci.yml/badge.svg)](https://github.com/sergiudanstan/drone-sound-recognition/actions/workflows/ci.yml)
[![CodeQL](https://github.com/sergiudanstan/drone-sound-recognition/actions/workflows/codeql.yml/badge.svg)](https://github.com/sergiudanstan/drone-sound-recognition/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sergiudanstan/drone-sound-recognition/badge)](https://scorecard.dev/viewer/?uri=github.com/sergiudanstan/drone-sound-recognition)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Interactive browser dashboard for exploring how drone-like acoustic signatures can be recognized from microphone input, an uploaded audio file, or a synthesized drone sound.

**Live:** https://sergiudanstan.github.io/drone-sound-recognition/

## Run

```bash
python3 -m http.server 5174
```

Open `http://127.0.0.1:5174` from this folder.

## Notes

- The dashboard uses the Web Audio API and canvas visualizations.
- The output is framed as evidence strength, not a definitive drone detector.
- Microphone access requires a secure browser context; `localhost` and `127.0.0.1` satisfy that requirement in modern browsers.
- MATLAB was not needed for this version because the recognition logic is implemented directly in the browser for live interaction.

## Development

```sh
npm ci --ignore-scripts    # test tooling only (playwright-core)
npm test                   # headless Chrome smoke test
```

The test serves the folder locally, grants the microphone permission to the browser context and replaces `getUserMedia` with a synthetic oscillator stream, so it does not need a real microphone or a permission prompt. It exercises the simulated-drone path and the (stubbed) microphone path. It needs Google Chrome (`PW_CHANNEL=chromium` for Playwright's Chromium).

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [CHANGELOG.md](CHANGELOG.md).
