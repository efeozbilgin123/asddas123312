const SOUND_POOLS = {
  pickup: [
    '/sounds/ceramic-tile-pickup-1.ogg',
    '/sounds/ceramic-tile-pickup-2.ogg',
    '/sounds/ceramic-tile-pickup-3.ogg'
  ],
  drop: [
    '/sounds/ceramic-tile-drop-1.ogg',
    '/sounds/ceramic-tile-drop-2.ogg',
    '/sounds/ceramic-tile-drop-3.ogg',
    '/sounds/ceramic-tile-drop-4.ogg'
  ],
  flip: [
    '/sounds/ceramic-tile-flip-1.ogg',
    '/sounds/ceramic-tile-flip-2.ogg',
    '/sounds/ceramic-tile-flip-3.ogg'
  ],
  shuffle: [
    '/sounds/ceramic-tile-shuffle-1.ogg',
    '/sounds/ceramic-tile-shuffle-2.ogg',
    '/sounds/ceramic-tile-shuffle-3.ogg'
  ]
};

class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.dryBus = null;
    this.wetBus = null;
    this.convolver = null;
    this.muted = false;
    this.buffers = new Map();
    this.loading = false;
    this.ambianceMode = 'none';
    this.ambianceVol = 0.25;
    this.ambianceNodes = null;
  }

  ensureCtx() {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.setupBuses();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.loading) {
      this.preloadAll();
    }
    return this.ctx;
  }

  setupBuses() {
    if (!this.ctx) return;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.92;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.dryBus = this.ctx.createGain();
    this.dryBus.gain.value = 0.88;
    this.dryBus.connect(this.master);

    // Warm kahvehane wooden room impulse response
    const irLen = Math.floor(this.ctx.sampleRate * 0.42);
    const irBuf = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i += 1) {
        const decay = Math.exp(-i / (irLen * 0.24));
        const earlyTap = i === 180 || i === 420 || i === 790 ? 0.5 : 0;
        data[i] = ((Math.random() * 2 - 1) * 0.35 + earlyTap) * decay;
      }
    }

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = irBuf;

    const wetFilter = this.ctx.createBiquadFilter();
    wetFilter.type = 'lowpass';
    wetFilter.frequency.value = 2600;

    this.wetBus = this.ctx.createGain();
    this.wetBus.gain.value = 0.26;

    this.convolver.connect(wetFilter);
    wetFilter.connect(this.wetBus);
    this.wetBus.connect(this.master);
  }

  routeNode(node, wetAmount = 0.3) {
    if (!this.dryBus || !this.convolver) {
      node.connect(this.ctx.destination);
      return;
    }
    node.connect(this.dryBus);
    if (wetAmount > 0) {
      const send = this.ctx.createGain();
      send.gain.value = wetAmount;
      node.connect(send);
      send.connect(this.convolver);
    }
  }

  preloadAll() {
    if (this.loading || !this.ctx || typeof fetch !== 'function') return;
    this.loading = true;
    const allUrls = Object.values(SOUND_POOLS).flat();
    for (const url of allUrls) {
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((buf) => (buf && this.ctx ? this.ctx.decodeAudioData(buf) : null))
        .then((decoded) => {
          if (decoded) this.buffers.set(url, decoded);
        })
        .catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.stopAmbiance();
    } else if (this.ambianceMode && this.ambianceMode !== 'none') {
      this.setAmbiance(this.ambianceMode, this.ambianceVol);
    }
  }

  playBufferFromPool(poolName, { volume = 0.78, playbackRate = 1, wet = 0.32, filterHz = 5200 } = {}) {
    const ctx = this.ensureCtx();
    if (!ctx) return false;
    const pool = SOUND_POOLS[poolName];
    if (!pool || pool.length === 0) return false;

    const loaded = pool.filter((url) => this.buffers.has(url));
    if (loaded.length === 0) return false;

    const url = loaded[Math.floor(Math.random() * loaded.length)];
    const buffer = this.buffers.get(url);
    if (!buffer) return false;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = playbackRate * (0.95 + Math.random() * 0.1);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = filterHz;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    src.connect(tone);
    tone.connect(gain);
    this.routeNode(gain, wet);
    src.start();
    return true;
  }

  playWoodKnock(freq = 165, volume = 0.24, duration = 0.07) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 1.35, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.62, now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    this.routeNode(gain, 0.35);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  playCeramicSnap(pitch = 1, volume = 0.22) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * 0.045);
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.14));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2100 * pitch, now);
    bp.Q.setValueAtTime(2.2, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * 1.4, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);

    noise.connect(bp);
    bp.connect(nGain);
    this.routeNode(nGain, 0.28);
    noise.start(now);

    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(210 * pitch, now + 0.05);

    oGain.gain.setValueAtTime(volume * 0.75, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(oGain);
    this.routeNode(oGain, 0.25);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playFeltSlide(volume = 0.14, duration = 0.14) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      const env = Math.sin((i / len) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(920, now);
    filter.frequency.linearRampToValueAtTime(1450, now + duration);
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    this.routeNode(gain, 0.22);
    src.start(now);
  }

  playTilePickup() {
    if (!this.playBufferFromPool('pickup', { volume: 0.72, playbackRate: 1.04, wet: 0.25 })) {
      this.playCeramicSnap(1.28, 0.16);
    }
    this.playWoodKnock(210, 0.1, 0.045);
  }

  playTileClack(pitch = 1) {
    if (!this.playBufferFromPool('drop', { volume: 0.85, playbackRate: pitch, wet: 0.36 })) {
      this.playCeramicSnap(pitch, 0.22);
    }
    this.playWoodKnock(155 * pitch, 0.22, 0.075);
  }

  playTileFlip() {
    this.playFeltSlide(0.11, 0.11);
    if (!this.playBufferFromPool('flip', { volume: 0.74, playbackRate: 1, wet: 0.28 })) {
      this.playCeramicSnap(1.12, 0.17);
    }
  }

  playTileShuffle() {
    this.playBufferFromPool('shuffle', { volume: 0.72, playbackRate: 1, wet: 0.42 });
    this.playWoodKnock(135, 0.18, 0.09);
  }

  playOpenHand() {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    // Cascading wooden rack clatter of laying down multiple tiles
    [0, 65, 130, 195].forEach((delayMs, i) => {
      setTimeout(() => {
        if (this.muted) return;
        this.playBufferFromPool('drop', {
          volume: 0.52 - i * 0.06,
          playbackRate: 0.96 + i * 0.07,
          wet: 0.4
        });
        this.playWoodKnock(175 + i * 24, 0.14, 0.06);
      }, delayMs);
    });

    // Warm acoustic chord swell
    const now = ctx.currentTime;
    [392.0, 493.88, 587.33, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + 0.08 + i * 0.05);
      gain.gain.setValueAtTime(0.001, now + 0.08 + i * 0.05);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.11 + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55 + i * 0.05);
      osc.connect(gain);
      this.routeNode(gain, 0.45);
      osc.start(now + 0.08 + i * 0.05);
      osc.stop(now + 0.6 + i * 0.05);
    });
  }

  playMeldChime() {
    this.playOpenHand();
  }

  playRoundWin(multiplier = 1) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.playFeltSlide(0.14, 0.18);
    this.playWoodKnock(145, 0.24, 0.09);

    const now = ctx.currentTime;
    const notes = multiplier >= 2
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093.0]
      : [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i >= 5 ? 'sine' : 'triangle';
      const t = now + i * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(multiplier >= 4 ? 0.1 : 0.085, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.56);
      osc.connect(gain);
      this.routeNode(gain, 0.55);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  playPenalty() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.playWoodKnock(110, 0.28, 0.11);

    const now = ctx.currentTime;
    [220, 196].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 720;

      const t = now + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.075, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(lp);
      lp.connect(gain);
      this.routeNode(gain, 0.35);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  playTurnBell() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    this.routeNode(gain, 0.45);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  playChatBlip() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    this.routeNode(gain, 0.28);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playTableNudge() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.playWoodKnock(128, 0.32, 0.09);
    setTimeout(() => {
      if (this.muted) return;
      this.playWoodKnock(142, 0.26, 0.08);
      this.playCeramicSnap(0.95, 0.12);
    }, 115);
  }

  playOrderServed(category = 'drink') {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (category === 'drink') {
      // Crisp ince belli glass & porcelain saucer clink
      this.playCeramicSnap(1.48, 0.12);
      [2280, 3420].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + i * 0.045;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.96, t + 0.22);
        gain.gain.setValueAtTime(0.045 - i * 0.012, t);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.24);
        osc.connect(gain);
        this.routeNode(gain, 0.48);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } else {
      // Warm porcelain plate placement + wood table thud
      this.playWoodKnock(185, 0.15, 0.065);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1320, now + 0.02);
      osc.frequency.exponentialRampToValueAtTime(860, now + 0.14);
      gain.gain.setValueAtTime(0.04, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      this.routeNode(gain, 0.35);
      osc.start(now + 0.02);
      osc.stop(now + 0.16);
    }
  }

  stopAmbiance() {
    if (!this.ambianceNodes) return;
    const { nodes = [], intervals = [], masterGain } = this.ambianceNodes;
    for (const id of intervals) {
      clearInterval(id);
    }
    if (masterGain && this.ctx) {
      try {
        masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
      } catch {
        // ignore
      }
    }
    setTimeout(() => {
      for (const n of nodes) {
        try {
          if (typeof n.stop === 'function') n.stop();
        } catch {
          // ignore
        }
        try {
          if (typeof n.disconnect === 'function') n.disconnect();
        } catch {
          // ignore
        }
      }
    }, 120);
    this.ambianceNodes = null;
  }

  setAmbiance(mode = 'none', volume = null) {
    const valid = ['rain', 'ocakbasi', 'fireplace', 'none'].includes(mode) ? mode : 'none';
    const nextVol = volume !== null && Number.isFinite(Number(volume))
      ? Math.max(0, Math.min(1, Number(volume)))
      : this.ambianceVol;

    const modeChanged = valid !== this.ambianceMode;
    this.ambianceMode = valid;
    this.ambianceVol = nextVol;

    if (this.muted || valid === 'none' || nextVol <= 0.005) {
      this.stopAmbiance();
      return;
    }

    if (!modeChanged && this.ambianceNodes?.masterGain && this.ctx) {
      this.ambianceNodes.masterGain.gain.setTargetAtTime(
        this.ambianceVol * 0.28,
        this.ctx.currentTime,
        0.12
      );
      return;
    }

    const ctx = this.ensureCtx();
    if (!ctx) return;

    this.stopAmbiance();

    const nodes = [];
    const intervals = [];
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    masterGain.gain.setTargetAtTime(this.ambianceVol * 0.28, ctx.currentTime, 0.25);
    masterGain.connect(this.master || ctx.destination);
    nodes.push(masterGain);

    // 3-second seamless pink/brown noise loop buffer
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = buf.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < len; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.04) * 1.4;
      }
      // Smooth loop crossfade at edges
      const fadeLen = Math.floor(ctx.sampleRate * 0.08);
      for (let i = 0; i < fadeLen; i += 1) {
        const w = i / fadeLen;
        data[i] = data[i] * w + data[len - fadeLen + i] * (1 - w);
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    nodes.push(src);

    if (valid === 'rain') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1150;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 160;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(masterGain);
      nodes.push(lp, hp);
    } else if (valid === 'ocakbasi') {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1750;
      bp.Q.value = 0.9;
      const bpGain = ctx.createGain();
      bpGain.gain.value = 0.65;

      const hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 92;
      const humGain = ctx.createGain();
      humGain.gain.value = 0.09;

      src.connect(bp);
      bp.connect(bpGain);
      bpGain.connect(masterGain);
      hum.connect(humGain);
      humGain.connect(masterGain);
      hum.start();
      nodes.push(bp, bpGain, hum, humGain);
    } else if (valid === 'fireplace') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 1.25;
      src.connect(lp);
      lp.connect(rumbleGain);
      rumbleGain.connect(masterGain);
      nodes.push(lp, rumbleGain);

      const crackleTimer = setInterval(() => {
        if (!this.ctx || this.muted || this.ambianceMode !== 'fireplace' || !this.ambianceNodes) return;
        if (Math.random() > 0.62) return;
        const cLen = Math.floor(ctx.sampleRate * 0.025);
        const cBuf = ctx.createBuffer(1, cLen, ctx.sampleRate);
        const cData = cBuf.getChannelData(0);
        for (let i = 0; i < cLen; i += 1) {
          cData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (cLen * 0.16));
        }
        const cSrc = ctx.createBufferSource();
        cSrc.buffer = cBuf;
        const cBp = ctx.createBiquadFilter();
        cBp.type = 'bandpass';
        cBp.frequency.value = 2100 + Math.random() * 1900;
        cBp.Q.value = 2.4;
        const cGain = ctx.createGain();
        cGain.gain.value = 0.18 + Math.random() * 0.18;
        cSrc.connect(cBp);
        cBp.connect(cGain);
        cGain.connect(masterGain);
        cSrc.start();
      }, 420);
      intervals.push(crackleTimer);
    }

    src.start();
    this.ambianceNodes = { nodes, intervals, masterGain };
  }

  playDrinkSip() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const len = Math.floor(ctx.sampleRate * 0.19);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      const env = Math.sin((i / len) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(520, now);
    bp.frequency.exponentialRampToValueAtTime(1480, now + 0.16);
    bp.Q.value = 3.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    src.connect(bp);
    bp.connect(gain);
    this.routeNode(gain, 0.35);
    src.start(now);

    // Subtle glass clink
    const clink = ctx.createOscillator();
    const clinkGain = ctx.createGain();
    clink.type = 'sine';
    clink.frequency.setValueAtTime(2450, now + 0.15);
    clinkGain.gain.setValueAtTime(0.025, now + 0.15);
    clinkGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.28);
    clink.connect(clinkGain);
    this.routeNode(clinkGain, 0.45);
    clink.start(now + 0.15);
    clink.stop(now + 0.3);
  }

  playCatPurr(catIndex = 0) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Gentle friendly mrrp chirp first
    const chirp = ctx.createOscillator();
    const chirpGain = ctx.createGain();
    chirp.type = 'triangle';
    const baseChirp = catIndex === 1 ? 520 : catIndex === 2 ? 390 : 440;
    chirp.frequency.setValueAtTime(baseChirp, now);
    chirp.frequency.exponentialRampToValueAtTime(baseChirp * 1.38, now + 0.14);
    chirpGain.gain.setValueAtTime(0.055, now);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    chirp.connect(chirpGain);
    this.routeNode(chirpGain, 0.35);
    chirp.start(now);
    chirp.stop(now + 0.2);

    // Soft rhythmic purr rumble
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const purrGain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = catIndex === 1 ? 33 : 27;
    lfo.type = 'sine';
    lfo.frequency.value = 3.2;
    lfoGain.gain.value = 0.04;

    lp.type = 'lowpass';
    lp.frequency.value = 180;

    purrGain.gain.setValueAtTime(0.001, now + 0.08);
    purrGain.gain.linearRampToValueAtTime(0.09, now + 0.22);
    purrGain.gain.linearRampToValueAtTime(0.001, now + 1.05);

    lfo.connect(lfoGain);
    lfoGain.connect(purrGain.gain);

    osc.connect(lp);
    lp.connect(purrGain);
    this.routeNode(purrGain, 0.2);

    osc.start(now + 0.08);
    lfo.start(now + 0.08);
    osc.stop(now + 1.1);
    lfo.stop(now + 1.1);
  }

  playDiceRoll() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const offsets = [0, 0.09, 0.19, 0.31, 0.44];
    offsets.forEach((off, i) => {
      const t = now + off;
      const dur = 0.042;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let s = 0; s < len; s += 1) {
        const env = Math.exp((-s / len) * 4.5);
        data[s] = (Math.random() * 2 - 1) * env;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1150 + i * 190, t);
      bp.Q.value = 2.4;

      const gain = ctx.createGain();
      const vol = 0.14 * Math.pow(0.84, i);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      src.connect(bp);
      bp.connect(gain);
      this.routeNode(gain, 0.45);
      src.start(t);
    });
  }
}

export const soundFX = new SoundFX();
