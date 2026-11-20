'use strict';

/* ============================================================
   HEARTLAND 26 — Upgraded Multi-Layered WebAudio Sound Engine
   Features:
   - Master DynamicsCompressor + Procedural Urban Canyon Reverb
   - Multi-layered Gunshots (Supersonic Crack, Punch, Mech Cycle,
     Canyon Echo Tail & Bouncing Brass Shell Casings)
   - V8 Engine with 5-Speed Auto Gearbox, Turbo Spool/Blow-Off
     & Dynamic Tire Skid / Drift Screech
   - Continuous LFO Wail Police Siren with Urban Reverb
   - Directional Stereo Bullet Whiz, Ricochets, Footsteps & Pickups
   - 45m Spatial Proximity Voice Chat & Squad Radio Synth
   ============================================================ */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.reverbConvolver = null;
    this.reverbSend = null;
    this.noiseBuf = null;
    this.muted = false;
    this.engine = null;
    this.siren = null;
    this.ambient = null;
    this.rainSound = null;
    this._sirenTimer = null;
    this._stepSide = 1;
    this._lastGear = 1;
    this._shiftCooldown = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    /* Master Dynamics Compressor for punchy, clip-free mix */
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;
    this.compressor.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.62;
    this.master.connect(this.compressor);

    /* Procedural White/Pink-ish Noise Buffer (2 seconds) */
    const len = Math.floor(this.ctx.sampleRate * 2);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    /* Algorithmic Urban Street Canyon Stereo Reverb (0.88s with building reflections) */
    try {
      const revLen = Math.floor(this.ctx.sampleRate * 0.88);
      const irBuf = this.ctx.createBuffer(2, revLen, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const chData = irBuf.getChannelData(ch);
        for (let i = 0; i < revLen; i++) {
          const t = i / this.ctx.sampleRate;
          let env = Math.exp(-t * 4.8);
          /* Early slapback reflections off downtown buildings at 24ms, 55ms, 95ms */
          if (Math.abs(t - 0.024) < 0.004 || Math.abs(t - 0.055) < 0.004 || Math.abs(t - 0.095) < 0.005) {
            env *= 2.1;
          }
          chData[i] = (Math.random() * 2 - 1) * env * 0.45;
        }
      }
      this.reverbConvolver = this.ctx.createConvolver();
      this.reverbConvolver.buffer = irBuf;
      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 0.32;
      this.reverbSend.connect(this.reverbConvolver);
      this.reverbConvolver.connect(this.master);
    } catch (e) {}

    this._startAmbient();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.62, this.ctx.currentTime, 0.03);
    }
  }

  _connectOut(node, reverbAmount = 0, pan = 0) {
    if (!this.ctx || !this.master) return;
    let outNode = node;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner);
      outNode = panner;
    }
    outNode.connect(this.master);
    if (reverbAmount > 0 && this.reverbSend) {
      const sendGain = this.ctx.createGain();
      sendGain.gain.value = reverbAmount;
      outNode.connect(sendGain);
      sendGain.connect(this.reverbSend);
    }
  }

  _noise(duration, filterFreq, gain, type = 'lowpass', delay = 0, q = 1.0, reverb = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g);
    this._connectOut(g, reverb, pan);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  _tone(freq, duration, type, gain, slideTo = null, delay = 0, reverb = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(18, slideTo), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    this._connectOut(g, reverb, pan);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /* Brass shell casing hitting concrete pavement after gunshot */
  _shellCasing(delay = 0.22) {
    if (!this.ctx) return;
    const baseF = 4700 + Math.random() * 800;
    this._tone(baseF, 0.028, 'sine', 0.022, baseF * 0.92, delay, 0.15, 0.25);
    this._tone(baseF * 1.34, 0.022, 'triangle', 0.015, baseF * 1.25, delay + 0.003, 0.15, 0.25);
    /* Second smaller bounce */
    this._tone(baseF * 1.05, 0.02, 'sine', 0.012, baseF * 0.96, delay + 0.11 + Math.random() * 0.04, 0.1, 0.3);
  }

  _startAmbient() {
    if (!this.ctx) return;
    /* Layer 1: Deep downtown urban rumble */
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 210;
    filter.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.036;
    src.connect(filter).connect(g).connect(this.master);
    src.start();

    /* Layer 2: Subtle Midwest breeze / street air */
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuf;
    windSrc.loop = true;
    windSrc.playbackRate.value = 0.55;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 540;
    windFilter.Q.value = 1.2;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.012;
    windSrc.connect(windFilter).connect(windGain).connect(this.master);
    windSrc.start();

    this.ambient = { src, filter, g, windSrc, windFilter, windGain };
  }

  setRainIntensity(level) {
    if (!this.ctx) return;
    const clamped = Math.max(0, Math.min(1, level));
    if (clamped > 0.01 && !this.rainSound) {
      /* Dual-band rain: pattering drops + road spray hiss */
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1450;
      filter.Q.value = 0.65;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(filter).connect(g).connect(this.master);
      src.start();
      this.rainSound = { src, filter, g };
    }
    if (this.rainSound) {
      this.rainSound.g.gain.setTargetAtTime(clamped * 0.085, this.ctx.currentTime, 0.25);
    }
  }

  thunder() {
    if (!this.ctx) return;
    /* Lightning crack + rolling low-frequency thunder across the skyline */
    this._noise(0.18, 2800, 0.25, 'highpass', 0.0, 1.2, 0.7);
    this._noise(1.85, 135, 0.46, 'lowpass', 0.04, 0.9, 0.9);
    this._noise(1.1, 380, 0.22, 'bandpass', 0.08, 1.1, 0.85);
    this._tone(64, 1.55, 'sawtooth', 0.18, 22, 0.05, 0.8);
  }

  flashlight(on = true) {
    if (!this.ctx) return;
    this._noise(0.022, 3900, 0.09, 'highpass');
    this._tone(on ? 1320 : 920, 0.028, 'square', 0.038, on ? 1640 : 640);
  }

  crouch(down = true) {
    if (!this.ctx) return;
    /* Tactical gear fabric rustle + knee pad thud */
    this._noise(0.075, down ? 540 : 720, 0.055, 'bandpass', 0, 1.4);
    this._tone(down ? 115 : 145, 0.06, 'sine', 0.035, down ? 65 : 95);
  }

  slide() {
    if (!this.ctx) return;
    /* Asphalt power-slide friction scrape + wind whoosh */
    this._noise(0.38, 720, 0.13, 'bandpass', 0, 1.1, 0.2);
    this._noise(0.28, 2200, 0.06, 'highpass', 0.02, 0.8);
    this._tone(130, 0.22, 'triangle', 0.06, 52);
  }

  zoom() {
    if (!this.ctx) return;
    /* Optic lens servo click */
    this._tone(920, 0.028, 'sine', 0.032, 1280);
    this._noise(0.018, 4200, 0.04, 'highpass', 0.005);
  }

  crash(intensity = 1) {
    if (!this.ctx) return;
    const k = Math.max(0.28, Math.min(1.5, intensity));
    /* Heavy chassis crunch + glass/metal shrapnel + sub-bass impact */
    this._noise(0.32 * k, 420, 0.3 * k, 'lowpass', 0, 1.2, 0.55);
    this._noise(0.18 * k, 1850, 0.18 * k, 'bandpass', 0.01, 1.5, 0.45);
    this._noise(0.16 * k, 3600, 0.14 * k, 'highpass', 0.02, 1.0, 0.35);
    this._tone(108, 0.22 * k, 'sawtooth', 0.14 * k, 34, 0, 0.4);
    this._tone(240, 0.11 * k, 'square', 0.07 * k, 85, 0.015);
  }

  splash() {
    if (!this.ctx) return;
    /* Hydrant geyser burst + rushing water spray */
    this._noise(0.55, 1650, 0.16, 'bandpass', 0, 0.9, 0.35);
    this._noise(0.4, 3400, 0.09, 'highpass', 0.04, 0.7, 0.25);
  }

  shoot(kind = 'pistol') {
    if (!this.ctx) return;
    const pitchVar = 0.96 + Math.random() * 0.08;
    if (kind === 'rifle') {
      /* Vector Carbine: High-velocity crack + punchy chamber thump + bolt clack + canyon echo */
      this._noise(0.045, 3400 * pitchVar, 0.34, 'highpass', 0, 1.1, 0.45);
      this._noise(0.13, 1350 * pitchVar, 0.28, 'bandpass', 0.003, 1.2, 0.65);
      this._noise(0.24, 380, 0.24, 'lowpass', 0.008, 0.9, 0.75);
      this._tone(195 * pitchVar, 0.085, 'sawtooth', 0.16, 46, 0, 0.4);
      this._tone(125 * pitchVar, 0.1, 'triangle', 0.18, 38, 0.002);
      /* Bolt carrier metallic cycle */
      this._noise(0.024, 4400, 0.11, 'bandpass', 0.028, 2.2);
      this._shellCasing(0.2 + Math.random() * 0.05);
    } else {
      /* 9mm Tactical Pistol: Crisp muzzle snap + deep chest thump + slide snap + canyon tail */
      this._noise(0.055, 2600 * pitchVar, 0.36, 'highpass', 0, 1.0, 0.5);
      this._noise(0.16, 980 * pitchVar, 0.26, 'bandpass', 0.004, 1.1, 0.7);
      this._noise(0.28, 340, 0.24, 'lowpass', 0.01, 0.85, 0.8);
      this._tone(165 * pitchVar, 0.11, 'triangle', 0.2, 42, 0, 0.45);
      this._tone(110 * pitchVar, 0.09, 'square', 0.11, 36, 0.003);
      /* Slide snap */
      this._noise(0.026, 3800, 0.1, 'bandpass', 0.036, 2.0);
      this._shellCasing(0.23 + Math.random() * 0.05);
    }
  }

  dryFire() {
    this._noise(0.025, 3600, 0.08, 'highpass');
    this._tone(1400, 0.02, 'square', 0.03, 800);
  }

  hitmark(kill = false) {
    if (!this.ctx) return;
    if (kill) {
      /* Heavy lethal impact + dual-harmonic kill confirmation chime */
      this._noise(0.065, 1600, 0.14, 'bandpass', 0, 1.5);
      this._tone(145, 0.12, 'sine', 0.14, 45);
      this._tone(740, 0.07, 'triangle', 0.11, 1080);
      this._tone(1110, 0.11, 'triangle', 0.09, 1480, 0.04);
    } else {
      /* Crisp tactical hitmarker tick + meaty thud */
      this._noise(0.035, 2800, 0.09, 'bandpass', 0, 1.8);
      this._tone(1040, 0.038, 'square', 0.055, 780);
      this._tone(160, 0.045, 'sine', 0.07, 85);
    }
  }

  impact() {
    if (!this.ctx) return;
    /* Bullet spall snap + occasional ricochet whine */
    this._noise(0.055, 3800, 0.08, 'highpass', 0, 1.2, 0.25);
    this._tone(180, 0.045, 'triangle', 0.05, 75);
    if (Math.random() < 0.38) {
      const f = 2200 + Math.random() * 900;
      this._tone(f, 0.14, 'sine', 0.028, f * 0.38, 0.01, 0.35);
    }
  }

  bulletWhiz(pan = 0) {
    if (!this.ctx) return;
    /* Directional supersonic pass-by snap & Doppler whistle */
    this._noise(0.07, 2400, 0.07, 'bandpass', 0, 1.8, 0.15, pan);
    this._tone(1650, 0.085, 'sine', 0.032, 520, 0, 0.15, pan);
  }

  reload(stage = 0) {
    if (!this.ctx) return;
    if (stage === 0) {
      /* Stage 0: Mag catch click + empty magazine slide out */
      this._noise(0.03, 3200, 0.11, 'bandpass', 0, 2.2);
      this._tone(240, 0.065, 'square', 0.045, 115);
    } else if (stage === 1) {
      /* Stage 1: Fresh magazine insertion thud + latch lock */
      this._tone(155, 0.055, 'triangle', 0.08, 95);
      this._noise(0.04, 1800, 0.13, 'bandpass', 0.02, 1.8);
      this._tone(980, 0.025, 'square', 0.04, 1320, 0.035);
    } else {
      /* Stage 2: Crisp metallic bolt/slide rack back & snap forward */
      this._noise(0.035, 3400, 0.12, 'highpass', 0, 1.5);
      this._tone(340, 0.04, 'square', 0.045, 220);
      this._noise(0.035, 4200, 0.14, 'highpass', 0.055, 1.6);
      this._tone(480, 0.045, 'square', 0.05, 260, 0.055);
    }
  }

  hurt() {
    if (!this.ctx) return;
    this._noise(0.18, 320, 0.26, 'lowpass', 0, 1.1);
    this._noise(0.08, 1800, 0.1, 'bandpass', 0, 1.4);
    this._tone(105, 0.22, 'sawtooth', 0.12, 34);
  }

  explosion() {
    if (!this.ctx) return;
    this._noise(0.95, 160, 0.55, 'lowpass', 0, 0.9, 0.9);
    this._noise(0.45, 850, 0.28, 'bandpass', 0.02, 1.1, 0.75);
    this._noise(0.32, 2200, 0.2, 'highpass', 0.01, 1.0, 0.5);
    this._tone(78, 0.72, 'sine', 0.28, 24, 0, 0.8);
  }

  ui() {
    this._tone(740, 0.038, 'triangle', 0.042, 980);
  }

  money() {
    /* Crisp cash-register / synth stack chime */
    this._tone(660, 0.08, 'triangle', 0.085, null, 0, 0.2);
    this._tone(880, 0.09, 'triangle', 0.075, null, 0.065, 0.2);
    this._tone(1320, 0.18, 'triangle', 0.065, null, 0.13, 0.3);
    this._noise(0.04, 4800, 0.04, 'highpass', 0.06);
  }

  missionComplete() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this._tone(f, 0.26, 'triangle', 0.08, null, i * 0.1, 0.35);
      this._tone(f * 0.5, 0.26, 'sine', 0.045, null, i * 0.1, 0.2);
    });
  }

  wanted() {
    /* Police dispatch alert double-tone */
    this._tone(520, 0.16, 'square', 0.055, 490, 0, 0.35);
    this._tone(370, 0.28, 'square', 0.055, 340, 0.18, 0.35);
  }

  clearWanted() {
    this._tone(392, 0.14, 'triangle', 0.055, null, 0, 0.25);
    this._tone(523.25, 0.14, 'triangle', 0.055, null, 0.13, 0.25);
    this._tone(783.99, 0.28, 'triangle', 0.06, null, 0.26, 0.35);
  }

  footstep(sprinting = false) {
    if (!this.ctx) return;
    this._stepSide = -this._stepSide;
    const pitch = (sprinting ? 410 : 320) + (this._stepSide > 0 ? 22 : -18) + (Math.random() - 0.5) * 25;
    const vol = sprinting ? 0.052 : 0.036;
    const pan = this._stepSide * 0.12;
    /* Heel thud + pavement grit scuff */
    this._noise(0.048, pitch, vol, 'lowpass', 0, 1.1, 0.05, pan);
    this._noise(0.032, 1650, vol * 0.45, 'bandpass', 0.012, 1.6, 0, pan);
  }

  enterCar() {
    /* Heavy car door latch unclick + solid cabin thud */
    this._noise(0.04, 2400, 0.09, 'bandpass', 0, 1.8);
    this._noise(0.14, 420, 0.16, 'lowpass', 0.07, 1.2);
    this._tone(135, 0.14, 'sine', 0.09, 52, 0.07);
  }

  horn() {
    /* Authentic dual-tone automotive horn chord (F4 + A4) with canyon echo */
    this._tone(349.23, 0.46, 'sawtooth', 0.048, 346, 0, 0.45);
    this._tone(440.0, 0.46, 'sawtooth', 0.042, 437, 0, 0.45);
  }

  policeShot() {
    const p = 0.94 + Math.random() * 0.12;
    this._noise(0.06, 2600 * p, 0.16, 'highpass', 0, 1.1, 0.55);
    this._noise(0.22, 460 * p, 0.12, 'lowpass', 0.005, 0.9, 0.65);
    this._tone(150 * p, 0.08, 'triangle', 0.09, 44, 0, 0.4);
  }

  scream() {
    const base = 440 + Math.random() * 140;
    this._tone(base, 0.24, 'sawtooth', 0.032, base * 1.45, 0, 0.4);
  }

  /* Play a short spatialized voice synth or decoded PCM buffer from a remote player within range */
  playProximityVoiceFrame(samples, pan = 0, distanceGain = 1) {
    if (!this.ctx || this.muted || distanceGain <= 0.005 || !samples || !samples.length) return;
    try {
      const buf = this.ctx.createBuffer(1, samples.length, 16000);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < samples.length; i++) ch[i] = samples[i];
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gainNode = this.ctx.createGain();
      gainNode.gain.value = Math.min(1.2, distanceGain * 0.95);
      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        src.connect(panner).connect(gainNode).connect(this.master);
      } else {
        src.connect(gainNode).connect(this.master);
      }
      src.start();
    } catch (e) {}
  }

  /* Synthesized proximity radio/voice chatter for bot squadmates when speaking in range */
  playProximityChatter(pan = 0, distanceGain = 1, pitchBase = 195) {
    if (!this.ctx || this.muted || distanceGain <= 0.01) return;
    const t = this.ctx.currentTime;
    const syllables = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < syllables; i++) {
      const delay = i * 0.085;
      const dur = 0.065;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const f = pitchBase * (0.88 + Math.random() * 0.28);
      osc.frequency.setValueAtTime(f, t + delay);
      osc.frequency.exponentialRampToValueAtTime(f * (0.9 + Math.random() * 0.2), t + delay + dur);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900 + Math.random() * 700;
      filter.Q.value = 2.5;
      const g = this.ctx.createGain();
      const vol = 0.045 * distanceGain;
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        osc.connect(filter).connect(panner).connect(g).connect(this.master);
      } else {
        osc.connect(filter).connect(g).connect(this.master);
      }
      osc.start(t + delay);
      osc.stop(t + delay + dur + 0.01);
    }
  }

  /* Subtle exhaust pop / turbo blow-off valve on gear upshift */
  _gearShiftPop(boosting = false) {
    if (!this.ctx) return;
    /* Low exhaust burble */
    this._noise(0.09, 260, 0.075, 'lowpass', 0, 1.4);
    this._tone(75, 0.08, 'sawtooth', 0.05, 42);
    if (boosting) {
      /* Turbo blow-off valve hiss */
      this._noise(0.14, 3800, 0.055, 'bandpass', 0.01, 2.2);
    }
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const t = this.ctx.currentTime;

    /* Ignition starter crank & V8 startup bark */
    this._tone(95, 0.11, 'sawtooth', 0.05, 130, 0);
    this._noise(0.18, 420, 0.09, 'bandpass', 0.09, 1.4);
    this._tone(115, 0.22, 'sawtooth', 0.07, 56, 0.1);

    /* Primary V8 cylinder pulse */
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;

    /* Sub-octave rumble */
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 26;

    /* Exhaust throat harmonic */
    const osc3 = this.ctx.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.value = 104;

    /* Overdrive turbocharger spool oscillator */
    const turboOsc = this.ctx.createOscillator();
    turboOsc.type = 'sine';
    turboOsc.frequency.value = 1100;
    const turboGain = this.ctx.createGain();
    turboGain.gain.value = 0.0001;
    turboOsc.connect(turboGain).connect(this.master);

    /* Continuous Tire Skid / Drift Screech generator */
    const skidSrc = this.ctx.createBufferSource();
    skidSrc.buffer = this.noiseBuf;
    skidSrc.loop = true;
    const skidFilter = this.ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 1480;
    skidFilter.Q.value = 4.5;
    const skidGain = this.ctx.createGain();
    skidGain.gain.value = 0.0001;
    skidSrc.connect(skidFilter).connect(skidGain).connect(this.master);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 310;
    filter.Q.value = 2.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.04, t + 0.32);

    osc.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(gain).connect(this.master);

    osc.start(t);
    osc2.start(t);
    osc3.start(t);
    turboOsc.start(t);
    skidSrc.start(t);

    this._lastGear = 1;
    this.engine = { osc, osc2, osc3, turboOsc, turboGain, skidSrc, skidFilter, skidGain, filter, gain };
  }

  updateEngine(speed, throttle, boosting = false, handbrake = false, steer = 0) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.abs(speed);
    const mph = s * 2.237;

    /* Simulated 5-Speed Automatic Transmission RPM curve */
    const gear = Math.max(1, Math.min(5, 1 + Math.floor(mph / 14)));
    if (gear > this._lastGear && s > 4) {
      this._gearShiftPop(boosting);
    }
    this._lastGear = gear;

    const gearMinMph = (gear - 1) * 14;
    const gearSpan = 16;
    const gearRpmNorm = Math.max(0, Math.min(1.15, (mph - gearMinMph) / gearSpan));
    const rpmFreq = 46 + gearRpmNorm * 58 + s * 1.15 + throttle * 14 + (boosting ? 18 : 0);

    this.engine.osc.frequency.setTargetAtTime(rpmFreq, t, 0.06);
    this.engine.osc2.frequency.setTargetAtTime(rpmFreq * 0.5, t, 0.06);
    this.engine.osc3.frequency.setTargetAtTime(rpmFreq * 1.98, t, 0.06);
    this.engine.filter.frequency.setTargetAtTime(250 + gearRpmNorm * 520 + s * 28 + (boosting ? 450 : 0), t, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.026 + Math.min(s / 28, 1) * 0.036 + (boosting ? 0.015 : 0), t, 0.12);

    /* Turbocharger spool whine when boosting */
    const targetTurboGain = (boosting && s > 3) ? 0.018 : 0.0001;
    this.engine.turboOsc.frequency.setTargetAtTime(1150 + s * 48, t, 0.1);
    this.engine.turboGain.gain.setTargetAtTime(targetTurboGain, t, 0.12);

    /* Tire skid / drift screech when cornering hard at speed or handbraking */
    const hardTurn = Math.abs(steer) > 0.35 && s > 10.5;
    const hardSlide = handbrake && s > 4.5;
    const skidAmt = hardSlide ? Math.min(1, s / 18) : (hardTurn ? Math.min(0.65, (s - 10) / 22) : 0);
    this.engine.skidFilter.frequency.setTargetAtTime(1350 + Math.abs(steer) * 320, t, 0.06);
    this.engine.skidGain.gain.setTargetAtTime(skidAmt * 0.048, t, 0.07);
  }

  stopEngine() {
    if (!this.engine) return;
    const { osc, osc2, osc3, turboOsc, skidSrc, gain, turboGain, skidGain } = this.engine;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0.0001, t, 0.08);
    if (turboGain) turboGain.gain.setTargetAtTime(0.0001, t, 0.05);
    if (skidGain) skidGain.gain.setTargetAtTime(0.0001, t, 0.05);
    setTimeout(() => {
      try {
        osc.stop();
        osc2.stop();
        if (osc3) osc3.stop();
        if (turboOsc) turboOsc.stop();
        if (skidSrc) skidSrc.stop();
      } catch (e) {}
    }, 380);
    this.engine = null;
  }

  startSiren() {
    if (!this.ctx || this.siren) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 680;

    /* Continuous LFO for authentic sweeping KCPD wail siren */
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.42;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(osc.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.022, t + 0.4);
    osc.connect(gain);
    this._connectOut(gain, 0.55);

    osc.start(t);
    lfo.start(t);
    this.siren = { osc, lfo, gain };
  }

  stopSiren() {
    if (!this.siren) return;
    if (this._sirenTimer) clearInterval(this._sirenTimer);
    this._sirenTimer = null;
    const { osc, lfo, gain } = this.siren;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0.0001, t, 0.15);
    setTimeout(() => {
      try {
        osc.stop();
        if (lfo) lfo.stop();
      } catch (e) {}
    }, 450);
    this.siren = null;
  }
}

window.SoundEngine = SoundEngine;
