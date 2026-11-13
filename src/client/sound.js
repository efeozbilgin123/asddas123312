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
    this.muted = false;
    this.buffers = new Map();
    this.loading = false;
  }

  ensureCtx() {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
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
  }

  playBufferFromPool(poolName, { volume = 0.72, playbackRate = 1 } = {}) {
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
    src.playbackRate.value = playbackRate * (0.96 + Math.random() * 0.08);

    const gain = ctx.createGain();
    gain.gain.value = volume;

    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    return true;
  }

  playSynthesizedClack(pitch = 1, volume = 0.22) {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Short filtered wood/ceramic impulse
    const bufferSize = Math.floor(ctx.sampleRate * 0.035);
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.18));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1650 * pitch, now);
    filter.Q.setValueAtTime(2.6, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * 1.4, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);

    // Resonant ceramic body tap
    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(190 * pitch, now + 0.045);

    oGain.gain.setValueAtTime(volume * 0.7, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(oGain);
    oGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  playTilePickup() {
    if (!this.playBufferFromPool('pickup', { volume: 0.65, playbackRate: 1.02 })) {
      this.playSynthesizedClack(1.25, 0.14);
    }
  }

  playTileClack(pitch = 1) {
    if (!this.playBufferFromPool('drop', { volume: 0.78, playbackRate: pitch })) {
      this.playSynthesizedClack(pitch, 0.2);
    }
  }

  playTileFlip() {
    if (!this.playBufferFromPool('flip', { volume: 0.68, playbackRate: 1 })) {
      this.playSynthesizedClack(1.12, 0.16);
    }
  }

  playTileShuffle() {
    if (!this.playBufferFromPool('shuffle', { volume: 0.55, playbackRate: 1 })) {
      this.playSynthesizedClack(0.95, 0.18);
    }
  }

  playMeldChime() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.playBufferFromPool('drop', { volume: 0.55, playbackRate: 1.05 });

    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(0.065, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.3);
    });
  }
}

export const soundFX = new SoundFX();
