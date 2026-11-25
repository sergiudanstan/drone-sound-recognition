# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-25

First tagged release of the drone sound recognition dashboard: a browser dashboard (Web Audio API and canvas) that scores how strongly microphone, file or synthesized audio resembles a drone acoustic signature. The output is evidence strength, not a definitive detector. Published at https://sergiudanstan.github.io/drone-sound-recognition/.

### Added
- Headless page smoke test (`npm test`) run in CI on every push and pull request: loads the dashboard, runs the simulated-drone path and a microphone path with a stubbed `getUserMedia`, and fails on any page error.
- CI, CodeQL, OpenSSF Scorecard and a tag-triggered release workflow with build provenance; Dependabot for actions and npm.
- `package.json` as the version source, `SECURITY.md`, `CONTRIBUTING.md` and this changelog.

[Unreleased]: https://github.com/sergiudanstan/drone-sound-recognition/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sergiudanstan/drone-sound-recognition/releases/tag/v0.1.0
