# Drone Sound Recognition Dashboard

Interactive browser dashboard for exploring how drone-like acoustic signatures can be recognized from microphone input, an uploaded audio file, or a synthesized drone sound.

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
