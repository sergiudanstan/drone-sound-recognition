const dom = {
  audioStatus: document.querySelector("#audioStatus"),
  statusText: document.querySelector("#statusText"),
  micButton: document.querySelector("#micButton"),
  demoButton: document.querySelector("#demoButton"),
  fileButton: document.querySelector("#fileButton"),
  stopButton: document.querySelector("#stopButton"),
  audioFile: document.querySelector("#audioFile"),
  inputDevice: document.querySelector("#inputDevice"),
  evidenceLabel: document.querySelector("#evidenceLabel"),
  scoreFill: document.querySelector("#scoreFill"),
  scoreNote: document.querySelector("#scoreNote"),
  peakFrequency: document.querySelector("#peakFrequency"),
  peakNote: document.querySelector("#peakNote"),
  harmonicCount: document.querySelector("#harmonicCount"),
  persistenceValue: document.querySelector("#persistenceValue"),
  windowReadout: document.querySelector("#windowReadout"),
  lastUpdate: document.querySelector("#lastUpdate"),
  tonalMeter: document.querySelector("#tonalMeter"),
  harmonicMeter: document.querySelector("#harmonicMeter"),
  bandMeter: document.querySelector("#bandMeter"),
  modulationMeter: document.querySelector("#modulationMeter"),
  thresholdControl: document.querySelector("#thresholdControl"),
  thresholdReadout: document.querySelector("#thresholdReadout"),
  durationControl: document.querySelector("#durationControl"),
  durationReadout: document.querySelector("#durationReadout"),
  backgroundControl: document.querySelector("#backgroundControl"),
  backgroundReadout: document.querySelector("#backgroundReadout"),
  persistenceControl: document.querySelector("#persistenceControl"),
  persistenceReadout: document.querySelector("#persistenceReadout"),
  gainControl: document.querySelector("#gainControl"),
  gainReadout: document.querySelector("#gainReadout"),
  monitorControl: document.querySelector("#monitorControl"),
  calibrateButton: document.querySelector("#calibrateButton"),
  exportButton: document.querySelector("#exportButton"),
  waveformCanvas: document.querySelector("#waveformCanvas"),
  spectrogramCanvas: document.querySelector("#spectrogramCanvas"),
  levelReadout: document.querySelector("#levelReadout"),
  lowBand: document.querySelector("#lowBand"),
  rotorBand: document.querySelector("#rotorBand"),
  motorBand: document.querySelector("#motorBand"),
  highBand: document.querySelector("#highBand"),
  lowBandValue: document.querySelector("#lowBandValue"),
  rotorBandValue: document.querySelector("#rotorBandValue"),
  motorBandValue: document.querySelector("#motorBandValue"),
  highBandValue: document.querySelector("#highBandValue"),
  timeline: document.querySelector("#timeline"),
  eventCount: document.querySelector("#eventCount"),
  labelButtons: document.querySelectorAll(".label-actions button"),
  modeButtons: document.querySelectorAll(".mode-button"),
};

const profiles = {
  small: {
    name: "Small quad",
    baseRange: [120, 520],
    rotorBand: [180, 950],
    motorBand: [950, 5200],
    demoBase: 190,
  },
  cinema: {
    name: "Cine drone",
    baseRange: [85, 360],
    rotorBand: [130, 760],
    motorBand: [760, 4100],
    demoBase: 145,
  },
  large: {
    name: "Large UAV",
    baseRange: [45, 260],
    rotorBand: [70, 560],
    motorBand: [560, 3000],
    demoBase: 92,
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const percent = (value) => `${Math.round(clamp(value, 0, 100))}%`;
const lerp = (a, b, t) => a + (b - a) * t;

class DroneSoundDashboard {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.mediaElement = null;
    this.currentObjectUrl = "";
    this.inputGain = null;
    this.monitorGain = null;
    this.demoNodes = [];
    this.animationId = 0;
    this.profileKey = "small";
    this.frequencyData = null;
    this.timeData = null;
    this.background = null;
    this.bandHistory = [];
    this.candidateHistory = [];
    this.events = [];
    this.lastEventAt = 0;
    this.frameCount = 0;
    this.selectedEventIndex = 0;
    this.candidateRunStarted = 0;
    this.audioSupported = Boolean(window.AudioContext || window.webkitAudioContext);

    this.waveCtx = dom.waveformCanvas.getContext("2d");
    this.specCtx = dom.spectrogramCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    this.resizeCanvas(dom.waveformCanvas);
    this.resizeCanvas(dom.spectrogramCanvas);
    this.paintIdleSpectrogram();
    this.paintIdleWaveform();
    this.renderTimeline();
    this.refreshControlReadouts();
    this.configureAudioSupport();
    this.refreshInputDevices();
  }

  resizeCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  configureAudioSupport() {
    if (this.audioSupported) return;
    [dom.micButton, dom.demoButton, dom.fileButton].forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    });
    dom.inputDevice.disabled = true;
    this.setStatus("Web Audio unsupported", "warning");
    dom.scoreNote.textContent =
      "This browser does not expose the Web Audio API required for analysis.";
  }

  async ensureAudio() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      this.configureAudioSupport();
      throw new Error("Web Audio API is not available in this browser.");
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextCtor();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.72;
      this.inputGain = this.audioContext.createGain();
      this.monitorGain = this.audioContext.createGain();
      this.syncInputGain();
      this.syncMonitorGain();
      this.monitorGain.connect(this.audioContext.destination);
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.fftSize);
      this.background = new Float32Array(this.analyser.frequencyBinCount);
      dom.windowReadout.textContent = `${this.analyser.fftSize} FFT`;
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async startMicrophone() {
    await this.ensureAudio();
    await this.stopSourceOnly();
    this.resetAnalysisState();

    try {
      const deviceId = dom.inputDevice.value;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.inputGain);
      this.inputGain.connect(this.analyser);
      await this.refreshInputDevices();
      this.setStatus("Microphone live", "live");
      this.startLoop();
    } catch (error) {
      this.setStatus("Microphone blocked", "warning");
      dom.scoreNote.textContent =
        "Browser permission or secure context prevented microphone access.";
      console.error(error);
    }
  }

  async startFile(file) {
    if (!file) return;
    await this.ensureAudio();
    await this.stopSourceOnly();
    this.resetAnalysisState();

    const url = URL.createObjectURL(file);
    this.currentObjectUrl = url;
    this.mediaElement = new Audio(url);
    this.mediaElement.crossOrigin = "anonymous";
    this.mediaElement.controls = false;
    this.mediaElement.loop = true;
    this.source = this.audioContext.createMediaElementSource(this.mediaElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.monitorGain);
    await this.mediaElement.play();
    this.setStatus(file.name, "live");
    this.startLoop();
  }

  async startDemo() {
    await this.ensureAudio();
    await this.stopSourceOnly();
    this.resetAnalysisState();

    const profile = profiles[this.profileKey];
    const output = this.audioContext.createGain();
    output.gain.value = 0.045;
    output.connect(this.analyser);
    output.connect(this.monitorGain);
    this.demoNodes.push(output);

    const now = this.audioContext.currentTime;
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 5.3;
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    this.demoNodes.push(lfo, lfoGain);

    [1, 2, 3, 4, 6, 8, 11].forEach((multiple, index) => {
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      const detune = index % 2 === 0 ? 1.015 : 0.985;
      oscillator.type = index < 3 ? "sawtooth" : "triangle";
      oscillator.frequency.value = profile.demoBase * multiple * detune;
      gain.gain.value = 0.028 / Math.sqrt(multiple);
      lfoGain.connect(gain.gain);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(now);
      this.demoNodes.push(oscillator, gain);
    });

    const noise = this.createNoiseSource();
    const noiseFilter = this.audioContext.createBiquadFilter();
    const noiseGain = this.audioContext.createGain();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 2200;
    noiseFilter.Q.value = 0.8;
    noiseGain.gain.value = 0.014;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(output);
    noise.start(now);
    this.demoNodes.push(noise, noiseFilter, noiseGain);

    this.setStatus(`${profile.name} simulation`, "live");
    this.startLoop();
  }

  createNoiseSource() {
    const bufferSize = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(
      1,
      bufferSize,
      this.audioContext.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.8;
    }
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  async stop() {
    await this.stopSourceOnly();
    cancelAnimationFrame(this.animationId);
    this.animationId = 0;
    this.setStatus("Idle", "");
    this.resetAnalysisState();
    this.resetRecognitionUi();
    this.paintIdleSpectrogram();
    this.paintIdleWaveform();
  }

  async stopSourceOnly() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.src = "";
      this.mediaElement = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = "";
    }

    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* source was already disconnected */
      }
      this.source = null;
    }

    this.demoNodes.forEach((node) => {
      try {
        if (typeof node.stop === "function") node.stop();
        node.disconnect();
      } catch {
        /* node was already stopped */
      }
    });
    this.demoNodes = [];

    if (this.inputGain) {
      try {
        this.inputGain.disconnect();
      } catch {
        /* gain node may not be connected */
      }
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        /* analyser may not be connected to output */
      }
    }
  }

  setProfile(profileKey) {
    this.profileKey = profileKey;
    dom.modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.profile === profileKey);
    });
  }

  setStatus(text, state) {
    dom.statusText.textContent = text;
    dom.audioStatus.classList.toggle("live", state === "live");
    dom.audioStatus.classList.toggle("warning", state === "warning");
  }

  resetAnalysisState() {
    this.bandHistory = [];
    this.candidateHistory = [];
    this.candidateRunStarted = 0;
    this.frameCount = 0;
    this.lastEventAt = 0;
    if (this.background) this.background.fill(0);
  }

  resetRecognitionUi() {
    dom.evidenceLabel.textContent = "Waiting for audio";
    dom.scoreFill.style.width = "0%";
    dom.scoreFill.className = "score-fill low";
    dom.scoreNote.textContent = "Sound-only recognition is probabilistic.";
    dom.peakFrequency.textContent = "-- Hz";
    dom.peakNote.textContent = "No stable peak yet";
    dom.harmonicCount.textContent = "0 aligned";
    dom.persistenceValue.textContent = "0 windows";
    dom.lastUpdate.textContent = "No frames";
    dom.levelReadout.textContent = "-∞ dB";
    [dom.tonalMeter, dom.harmonicMeter, dom.bandMeter, dom.modulationMeter].forEach(
      (meter) => {
        meter.value = 0;
      },
    );
    ["low", "rotor", "motor", "high"].forEach((name) => this.updateBand(name, 0));
  }

  calibrateBackground() {
    if (!this.analyser || !this.frequencyData || !this.background) {
      dom.scoreNote.textContent = "Start audio before calibrating the noise floor.";
      return;
    }
    this.analyser.getByteFrequencyData(this.frequencyData);
    for (let i = 0; i < this.frequencyData.length; i += 1) {
      this.background[i] = this.frequencyData[i];
    }
    this.bandHistory = [];
    this.candidateHistory = [];
    this.candidateRunStarted = 0;
    dom.scoreNote.textContent = "Noise floor calibrated from the current frame.";
  }

  async refreshInputDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const currentValue = dom.inputDevice.value;
    let devices = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      return;
    }
    const inputs = devices.filter((device) => device.kind === "audioinput");
    dom.inputDevice.innerHTML = '<option value="">Default input</option>';
    inputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Input ${index + 1}`;
      dom.inputDevice.append(option);
    });
    dom.inputDevice.value = currentValue;
  }

  syncMonitorGain() {
    if (!this.monitorGain) return;
    this.monitorGain.gain.value = dom.monitorControl.checked ? 1 : 0;
  }

  syncInputGain() {
    if (!this.inputGain) return;
    this.inputGain.gain.value = Number(dom.gainControl.value);
  }

  refreshControlReadouts() {
    dom.thresholdReadout.textContent = percent(Number(dom.thresholdControl.value));
    dom.durationReadout.textContent = `${Number(dom.durationControl.value).toFixed(1)} s`;
    dom.backgroundReadout.textContent = dom.backgroundControl.value;
    dom.persistenceReadout.textContent = dom.persistenceControl.value;
    dom.gainReadout.textContent = `${Number(dom.gainControl.value).toFixed(1)}x`;
  }

  exportEvents() {
    const payload = this.events.map((event) => ({
      timestamp: event.time.toISOString(),
      score: event.score,
      peakHz: event.frequency,
      label: event.label || "unlabeled",
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "drone-sound-events.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  startLoop() {
    if (this.animationId) return;
    const tick = () => {
      this.analyzeFrame();
      this.animationId = requestAnimationFrame(tick);
    };
    tick();
  }

  analyzeFrame() {
    if (!this.analyser) return;
    this.frameCount += 1;
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const profile = profiles[this.profileKey];
    const features = this.computeFeatures(profile);
    this.updateBackground(features.score);
    this.drawWaveform(features.rmsDb);
    this.drawSpectrogram();
    this.updateUi(features);
  }

  computeFeatures(profile) {
    const sampleRate = this.audioContext.sampleRate;
    const nyquist = sampleRate / 2;
    const binHz = nyquist / this.frequencyData.length;

    const energy = (minHz, maxHz) => {
      const start = clamp(Math.floor(minHz / binHz), 1, this.frequencyData.length - 1);
      const end = clamp(Math.ceil(maxHz / binHz), start + 1, this.frequencyData.length);
      let sum = 0;
      let bg = 0;
      let max = 0;
      let maxBin = start;
      for (let i = start; i < end; i += 1) {
        const value = this.frequencyData[i];
        sum += value;
        bg += this.background[i] || 0;
        if (value > max) {
          max = value;
          maxBin = i;
        }
      }
      const count = end - start;
      return {
        avg: sum / count,
        background: bg / count,
        max,
        maxHz: Math.round(maxBin * binHz),
      };
    };

    const low = energy(45, 160);
    const rotor = energy(profile.rotorBand[0], profile.rotorBand[1]);
    const motor = energy(profile.motorBand[0], profile.motorBand[1]);
    const high = energy(5200, 9000);
    const wide = energy(80, 7000);
    const peaks = this.findPeaks(profile.baseRange, binHz);
    const harmonic = this.scoreHarmonics(profile, binHz);

    const rms = this.computeRms();
    const rmsDb = 20 * Math.log10(rms || 0.00001);
    const tonalScore = clamp((wide.max - wide.avg) * 1.15, 0, 100);
    const rotorLift = clamp((rotor.avg - rotor.background) * 1.3, 0, 100);
    const motorLift = clamp((motor.avg - motor.background) * 1.12, 0, 100);
    const bandScore = clamp(rotorLift * 0.55 + motorLift * 0.45, 0, 100);
    const modulationScore = this.computeModulation(rotor.avg + motor.avg * 0.4);

    const threshold = Number(dom.thresholdControl.value);
    const persistenceTarget = Number(dom.persistenceControl.value);
    const rawScore =
      harmonic.score * 0.3 +
      tonalScore * 0.2 +
      bandScore * 0.22 +
      modulationScore * 0.13 +
      this.persistenceScore(persistenceTarget) * 0.15;
    const score = clamp(rawScore, 0, 100);
    const candidate = score >= threshold && harmonic.count >= 2 && bandScore >= 22;
    const now = performance.now();
    if (candidate && !this.candidateRunStarted) this.candidateRunStarted = now;
    if (!candidate) this.candidateRunStarted = 0;
    const candidateDuration = this.candidateRunStarted
      ? (now - this.candidateRunStarted) / 1000
      : 0;
    const durationEligible = candidateDuration >= Number(dom.durationControl.value);
    this.candidateHistory.push(candidate ? 1 : 0);
    if (this.candidateHistory.length > 36) this.candidateHistory.shift();

    const persistenceCount = this.candidateHistory.reduce((sum, item) => sum + item, 0);
    const dominant = peaks[0] || { frequency: wide.maxHz, value: wide.max };

    return {
      score,
      rawScore,
      candidate,
      candidateDuration,
      durationEligible,
      persistenceCount,
      tonalScore,
      harmonicScore: harmonic.score,
      harmonicCount: harmonic.count,
      bandScore,
      modulationScore,
      dominant,
      peaks,
      rmsDb,
      bandValues: {
        low: clamp(low.avg - low.background, 0, 100),
        rotor: clamp(rotor.avg - rotor.background, 0, 100),
        motor: clamp(motor.avg - motor.background, 0, 100),
        high: clamp(high.avg - high.background, 0, 100),
      },
      falsePositiveRisk: this.assessFalsePositiveRisk({
        score,
        modulationScore,
        harmonicCount: harmonic.count,
        low: low.avg,
        rotor: rotor.avg,
        motor: motor.avg,
      }),
    };
  }

  findPeaks(baseRange, binHz) {
    const start = clamp(Math.floor(baseRange[0] / binHz), 2, this.frequencyData.length - 2);
    const end = clamp(Math.ceil(7000 / binHz), start + 1, this.frequencyData.length - 2);
    const peaks = [];

    for (let i = start; i < end; i += 1) {
      const value = this.frequencyData[i];
      const localBackground = this.background[i] || 0;
      if (
        value > 42 &&
        value > localBackground + 18 &&
        value > this.frequencyData[i - 1] &&
        value > this.frequencyData[i + 1]
      ) {
        peaks.push({
          frequency: Math.round(i * binHz),
          value,
          lift: value - localBackground,
        });
      }
    }

    return peaks.sort((a, b) => b.lift - a.lift).slice(0, 12);
  }

  scoreHarmonics(profile, binHz) {
    let bestCount = 0;
    let bestStrength = 0;
    const minBase = profile.baseRange[0];
    const maxBase = profile.baseRange[1];

    for (let base = minBase; base <= maxBase; base += 8) {
      let count = 0;
      let strength = 0;
      for (let harmonic = 1; harmonic <= 10; harmonic += 1) {
        const targetHz = base * harmonic;
        if (targetHz > profile.motorBand[1]) break;
        const targetBin = Math.round(targetHz / binHz);
        const tolerance = Math.max(2, Math.round((targetHz * 0.035) / binHz));
        let localMax = 0;
        for (
          let i = Math.max(1, targetBin - tolerance);
          i <= Math.min(this.frequencyData.length - 2, targetBin + tolerance);
          i += 1
        ) {
          localMax = Math.max(localMax, this.frequencyData[i] - (this.background[i] || 0));
        }
        if (localMax > 16) {
          count += 1;
          strength += clamp(localMax, 0, 90);
        }
      }
      if (count > bestCount || (count === bestCount && strength > bestStrength)) {
        bestCount = count;
        bestStrength = strength;
      }
    }

    return {
      count: bestCount,
      score: clamp(bestCount * 14 + bestStrength / 9, 0, 100),
    };
  }

  computeRms() {
    let sumSquares = 0;
    for (let i = 0; i < this.timeData.length; i += 1) {
      const centered = (this.timeData[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    return Math.sqrt(sumSquares / this.timeData.length);
  }

  computeModulation(bandValue) {
    this.bandHistory.push(bandValue);
    if (this.bandHistory.length > 80) this.bandHistory.shift();
    if (this.bandHistory.length < 12) return 0;

    const mean =
      this.bandHistory.reduce((sum, value) => sum + value, 0) /
      this.bandHistory.length;
    const variance =
      this.bandHistory.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      this.bandHistory.length;
    const deviation = Math.sqrt(variance);
    return clamp(deviation * 3.5, 0, 100);
  }

  persistenceScore(target) {
    if (!this.candidateHistory.length) return 0;
    const count = this.candidateHistory.reduce((sum, item) => sum + item, 0);
    return clamp((count / target) * 100, 0, 100);
  }

  updateBackground(score) {
    const adaptation = Number(dom.backgroundControl.value) / 1000;
    const scoreGate = score < 48 ? 1 : 0.18;
    const alpha = adaptation * scoreGate;
    for (let i = 0; i < this.frequencyData.length; i += 1) {
      this.background[i] = lerp(this.background[i], this.frequencyData[i], alpha);
    }
  }

  assessFalsePositiveRisk(values) {
    if (values.score < 35) return "Ambient";
    if (values.modulationScore < 18 && values.harmonicCount >= 3) return "Fan or HVAC";
    if (values.low > values.motor * 1.35 && values.modulationScore > 30) {
      return "Vehicle or motorcycle";
    }
    if (values.motor > values.rotor * 1.6 && values.harmonicCount <= 2) {
      return "Power tool";
    }
    return "Review context";
  }

  drawWaveform(rmsDb = -Infinity) {
    const canvas = dom.waveformCanvas;
    const ctx = this.waveCtx;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#111923";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= height; y += height / 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#55d4ba";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < this.timeData.length; i += 1) {
      const x = (i / (this.timeData.length - 1)) * width;
      const y = (this.timeData[i] / 255) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    dom.levelReadout.textContent =
      Number.isFinite(rmsDb) && rmsDb > -90 ? `${Math.round(rmsDb)} dB` : "-∞ dB";
  }

  drawSpectrogram() {
    const canvas = dom.spectrogramCanvas;
    const ctx = this.specCtx;
    const width = canvas.width;
    const height = canvas.height;
    const shiftPx = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const image = ctx.getImageData(shiftPx, 0, width - shiftPx, height);
    ctx.putImageData(image, 0, 0);

    const nyquist = this.audioContext.sampleRate / 2;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let y = 0; y < height; y += 1) {
      const logPosition = 1 - y / height;
      const hz = 80 * Math.pow(nyquist / 80, logPosition);
      const bin = clamp(
        Math.round((hz / nyquist) * this.frequencyData.length),
        0,
        this.frequencyData.length - 1,
      );
      const value = this.frequencyData[bin];
      ctx.fillStyle = this.spectrogramColor(value);
      ctx.fillRect(width - shiftPx, y, shiftPx, 1);
    }
    ctx.restore();
  }

  spectrogramColor(value) {
    const v = clamp(value / 255, 0, 1);
    const r = Math.round(15 + v * 235);
    const g = Math.round(25 + Math.sin(v * Math.PI) * 175 + v * 45);
    const b = Math.round(36 + (1 - v) * 48);
    return `rgb(${r}, ${g}, ${b})`;
  }

  paintIdleSpectrogram() {
    const canvas = dom.spectrogramCanvas;
    const ctx = this.specCtx;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#172434");
    gradient.addColorStop(1, "#101821");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let y = 40; y < height; y += 44) {
      ctx.fillRect(0, y, width, 1);
    }
  }

  paintIdleWaveform() {
    const canvas = dom.waveformCanvas;
    const ctx = this.waveCtx;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.fillStyle = "#111923";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(85, 212, 186, 0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  updateUi(features) {
    const label =
      features.score >= 72
        ? "Strong drone-like signature"
        : features.score >= 48
          ? "Moderate drone-like signature"
          : features.score >= 28
            ? "Weak acoustic cues"
            : "Ambient or masked sound";

    dom.evidenceLabel.textContent = label;
    dom.scoreFill.style.width = percent(features.score);
    dom.scoreFill.className = "score-fill";
    if (features.score >= 72) dom.scoreFill.classList.add("strong");
    else if (features.score >= 48) dom.scoreFill.classList.add("moderate");
    else dom.scoreFill.classList.add("low");

    dom.scoreNote.textContent = features.candidate
      ? `Candidate held ${features.candidateDuration.toFixed(1)} s. False-positive check: ${features.falsePositiveRisk}.`
      : `False-positive check: ${features.falsePositiveRisk}.`;
    dom.peakFrequency.textContent = `${features.dominant.frequency} Hz`;
    dom.peakNote.textContent =
      features.peaks.length > 1
        ? `${features.peaks.length} tracked peaks`
        : "Single dominant peak";
    dom.harmonicCount.textContent = `${features.harmonicCount} aligned`;
    dom.persistenceValue.textContent = `${features.persistenceCount} windows`;
    dom.lastUpdate.textContent = `Frame ${this.frameCount}`;

    dom.tonalMeter.value = features.tonalScore;
    dom.harmonicMeter.value = features.harmonicScore;
    dom.bandMeter.value = features.bandScore;
    dom.modulationMeter.value = features.modulationScore;

    this.updateBand("low", features.bandValues.low);
    this.updateBand("rotor", features.bandValues.rotor);
    this.updateBand("motor", features.bandValues.motor);
    this.updateBand("high", features.bandValues.high);

    if (features.candidate && features.durationEligible) this.maybeAddEvent(features);
  }

  updateBand(name, value) {
    const bar = dom[`${name}Band`];
    const label = dom[`${name}BandValue`];
    bar.style.width = percent(value);
    label.textContent = percent(value);
  }

  maybeAddEvent(features) {
    const now = Date.now();
    if (now - this.lastEventAt < 2800) return;
    this.lastEventAt = now;
    this.events.unshift({
      time: new Date(),
      score: Math.round(features.score),
      frequency: features.dominant.frequency,
      label: "",
    });
    this.events = this.events.slice(0, 8);
    this.selectedEventIndex = 0;
    this.renderTimeline();
  }

  renderTimeline() {
    dom.eventCount.textContent = `${this.events.length} events`;
    if (!this.events.length) {
      dom.timeline.innerHTML = '<li class="empty">No candidate events yet</li>';
      return;
    }

    dom.timeline.innerHTML = this.events
      .map((event, index) => {
        const time = event.time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const label = event.label ? event.label : `${event.score}% evidence`;
        const selected = index === this.selectedEventIndex ? ' class="selected"' : "";
        return `<li${selected} data-index="${index}"><time>${time}</time><span>${event.frequency} Hz peak</span><strong>${label}</strong></li>`;
      })
      .join("");
  }

  labelLatest(label) {
    if (!this.events.length) return;
    const index = clamp(this.selectedEventIndex, 0, this.events.length - 1);
    this.events[index].label = label;
    this.renderTimeline();
  }

  selectEvent(index) {
    if (!this.events.length) return;
    this.selectedEventIndex = clamp(index, 0, this.events.length - 1);
    this.renderTimeline();
  }
}

const dashboard = new DroneSoundDashboard();

dom.micButton.addEventListener("click", () => dashboard.startMicrophone());
dom.demoButton.addEventListener("click", () => dashboard.startDemo());
dom.fileButton.addEventListener("click", () => dom.audioFile.click());
dom.stopButton.addEventListener("click", () => dashboard.stop());
dom.audioFile.addEventListener("change", (event) => {
  dashboard.startFile(event.target.files[0]);
});
dom.modeButtons.forEach((button) => {
  button.addEventListener("click", () => dashboard.setProfile(button.dataset.profile));
});
dom.labelButtons.forEach((button) => {
  button.addEventListener("click", () => dashboard.labelLatest(button.dataset.label));
});
dom.timeline.addEventListener("click", (event) => {
  const row = event.target.closest("li[data-index]");
  if (!row) return;
  dashboard.selectEvent(Number(row.dataset.index));
});
[dom.thresholdControl, dom.durationControl, dom.backgroundControl, dom.persistenceControl].forEach(
  (control) => {
    control.addEventListener("input", () => dashboard.refreshControlReadouts());
  },
);
dom.gainControl.addEventListener("input", () => {
  dashboard.refreshControlReadouts();
  dashboard.syncInputGain();
});
dom.monitorControl.addEventListener("change", () => dashboard.syncMonitorGain());
dom.calibrateButton.addEventListener("click", () => dashboard.calibrateBackground());
dom.exportButton.addEventListener("click", () => dashboard.exportEvents());

window.addEventListener("resize", () => {
  dashboard.resizeCanvas(dom.waveformCanvas);
  dashboard.resizeCanvas(dom.spectrogramCanvas);
  dashboard.paintIdleSpectrogram();
  dashboard.paintIdleWaveform();
});
