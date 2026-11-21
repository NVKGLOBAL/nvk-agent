/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/audio.ts
 * Recovered 2026-11-21 by the unification gap-fill pass; SHA not recorded in the report.
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */
class AudioEngine {
  private static instance: AudioEngine;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private humOscillator1: OscillatorNode | null = null;
  private humOscillator2: OscillatorNode | null = null;
  private humGainNode: GainNode | null = null;
  private readonly DURATION = 6.0;

  private paperAmbienceNodes: { gain: GainNode, osc1: OscillatorNode, noise: AudioBufferSourceNode } | null = null;
  private orbAmbienceNodes: { gain: GainNode, osc1: OscillatorNode, osc2: OscillatorNode, lfo: OscillatorNode } | null = null;
  private nexusAmbienceNodes: { gain: GainNode, osc1: OscillatorNode, osc2: OscillatorNode, shimmerGain: GainNode, shimmers: OscillatorNode[], lfos: OscillatorNode[] } | null = null;

  private constructor() {}

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private initAudioContext() {
    if (this.audioContext && this.audioContext.state !== 'closed') return;
    
    try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    } catch (e) {
        console.error("Web Audio API is not supported in this browser");
    }
  }

  public toggleMute(): boolean {
    this.ensureContextResumed();
    if (!this.masterGain || !this.audioContext) return this.isMuted;
    
    this.isMuted = !this.isMuted;
    const now = this.audioContext.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : 1, now + 0.05);

    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  private async ensureContextResumed() {
    if (!this.audioContext) this.initAudioContext();
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public startHum() {
    this.ensureContextResumed();
    if (this.humOscillator1 || !this.audioContext || !this.masterGain) return;
    
    const ac = this.audioContext;
    const now = ac.currentTime;

    this.humGainNode = ac.createGain();
    this.humGainNode.gain.setValueAtTime(0, now);
    this.humGainNode.gain.linearRampToValueAtTime(0.06, now + 5);
    this.humGainNode.connect(this.masterGain);

    this.humOscillator1 = ac.createOscillator();
    this.humOscillator1.type = 'sine';
    this.humOscillator1.frequency.value = 40;

    this.humOscillator2 = ac.createOscillator();
    this.humOscillator2.type = 'sine';
    this.humOscillator2.frequency.value = 80.2;

    this.humOscillator1.connect(this.humGainNode);
    this.humOscillator2.connect(this.humGainNode);
    this.humOscillator1.start();
    this.humOscillator2.start();
  }

  public stopHum() {
    if (!this.humGainNode || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.humGainNode.gain.cancelScheduledValues(now);
    this.humGainNode.gain.linearRampToValueAtTime(0, now + 2.0);
    
    const osc1 = this.humOscillator1;
    const osc2 = this.humOscillator2;
    setTimeout(() => {
      osc1?.stop();
      osc2?.stop();
      this.humOscillator1 = null;
      this.humOscillator2 = null;
      this.humGainNode = null;
    }, 2100);
  }

  public startPaperAmbience() {
    this.ensureContextResumed();
    this.stopOrbAmbience();
    this.stopNexusAmbience();
    if (this.paperAmbienceNodes || !this.audioContext || !this.masterGain) return;
    
    const ac = this.audioContext;
    const now = ac.currentTime;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 5);
    gain.connect(this.masterGain);

    const osc1 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 50;

    const noise = ac.createBufferSource();
    const bufferSize = ac.sampleRate * 2;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;

    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 200;

    osc1.connect(gain);
    noise.connect(noiseFilter).connect(gain);
    osc1.start();
    noise.start();
    
    this.paperAmbienceNodes = { gain, osc1, noise };
  }

  public stopPaperAmbience() {
    if (!this.paperAmbienceNodes || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.paperAmbienceNodes.gain.gain.cancelScheduledValues(now);
    this.paperAmbienceNodes.gain.gain.linearRampToValueAtTime(0, now + 2.0);
    
    const nodes = this.paperAmbienceNodes;
    setTimeout(() => {
      nodes.osc1.stop();
      nodes.noise.stop();
    }, 2100);
    this.paperAmbienceNodes = null;
  }

  public startOrbAmbience() {
    this.ensureContextResumed();
    this.stopPaperAmbience();
    this.stopNexusAmbience();
    if (this.orbAmbienceNodes || !this.audioContext || !this.masterGain) return;

    const ac = this.audioContext;
    const now = ac.currentTime;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 5);
    gain.connect(this.masterGain);

    const osc1 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 60;

    const osc2 = ac.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 180;

    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.1;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 5; // Detune amount in cents
    lfo.connect(lfoGain).connect(osc2.detune);

    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();
    lfo.start();
    
    this.orbAmbienceNodes = { gain, osc1, osc2, lfo };
  }
  
  public stopOrbAmbience() {
    if (!this.orbAmbienceNodes || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.orbAmbienceNodes.gain.gain.cancelScheduledValues(now);
    this.orbAmbienceNodes.gain.gain.linearRampToValueAtTime(0, now + 2.0);

    const nodes = this.orbAmbienceNodes;
    setTimeout(() => {
      nodes.osc1.stop();
      nodes.osc2.stop();
      nodes.lfo.stop();
    }, 2100);
    this.orbAmbienceNodes = null;
  }

  public startNexusAmbience() {
    this.ensureContextResumed();
    this.stopPaperAmbience();
    this.stopOrbAmbience();
    if (this.nexusAmbienceNodes || !this.audioContext || !this.masterGain) return;
    
    const ac = this.audioContext;
    const now = ac.currentTime;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 8);
    gain.connect(this.masterGain);

    const osc1 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 30; // Deep hum

    const osc2 = ac.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 60.1; // Slight detune for texture

    const shimmerGain = ac.createGain();
    shimmerGain.gain.value = 0.005;
    
    const shimmers: OscillatorNode[] = [];
    const lfos: OscillatorNode[] = [];
    for(let i=0; i<3; i++) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 4000 + Math.random() * 2000;
        const lfo = ac.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = Math.random() * 0.1 + 0.05;
        const lfoGain = ac.createGain();
        lfoGain.gain.value = 200; // Cents
        lfo.connect(lfoGain).connect(osc.detune);
        lfo.start(now);
        osc.connect(shimmerGain);
        osc.start(now);
        shimmers.push(osc);
        lfos.push(lfo);
    }
    shimmerGain.connect(gain);
    
    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();
    
    this.nexusAmbienceNodes = { gain, osc1, osc2, shimmerGain, shimmers, lfos };
  }

  public stopNexusAmbience() {
    if (!this.nexusAmbienceNodes || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.nexusAmbienceNodes.gain.gain.cancelScheduledValues(now);
    this.nexusAmbienceNodes.gain.gain.linearRampToValueAtTime(0, now + 3.0);
    
    const nodes = this.nexusAmbienceNodes;
    setTimeout(() => {
        nodes.osc1.stop();
        nodes.osc2.stop();
        nodes.shimmers.forEach(s => s.stop());
        nodes.lfos.forEach(l => l.stop());
    }, 3100);
    this.nexusAmbienceNodes = null;
  }


  private _playVortexSound(now: number, masterGain: GainNode) {
    if (!this.audioContext) return;
    const ac = this.audioContext;
    // ... [The existing epic sound code from the original enterNexus]
    // === 1. The Gathering (0s -> 1.8s) ===
    const rumbleGain = ac.createGain();
    rumbleGain.connect(masterGain);
    rumbleGain.gain.setValueAtTime(0, now);
    rumbleGain.gain.linearRampToValueAtTime(0.5, now + 1.8);
    const rumbleOsc = ac.createOscillator();
    rumbleOsc.type = 'sine';
    rumbleOsc.frequency.setValueAtTime(30, now);
    rumbleOsc.frequency.exponentialRampToValueAtTime(50, now + 1.8);
    rumbleOsc.connect(rumbleGain);
    rumbleOsc.start(now);
    rumbleOsc.stop(now + this.DURATION);

    // === 2. The Breach (at 1.8s) ===
    const breachTime = now + 1.8;
    const thumpGain = ac.createGain();
    thumpGain.connect(masterGain);
    thumpGain.gain.setValueAtTime(1.0, breachTime);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, breachTime + 0.5);
    const thumpOsc = ac.createOscillator();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(120, breachTime);
    thumpOsc.frequency.exponentialRampToValueAtTime(30, breachTime + 0.3);
    thumpOsc.connect(thumpGain);
    thumpOsc.start(breachTime);
    thumpOsc.stop(breachTime + 0.5);

    // === 3. Data Stream (1.8s -> 5.5s) ===
    const streamTime = now + 1.8;
    const streamDuration = 3.7;
    const whooshGain = ac.createGain();
    whooshGain.connect(masterGain);
    whooshGain.gain.setValueAtTime(0, streamTime);
    whooshGain.gain.linearRampToValueAtTime(0.4, streamTime + 0.1);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, streamTime + streamDuration);
    const whooshNoise = ac.createBufferSource();
    const bufferSize = ac.sampleRate * 2;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    whooshNoise.buffer = buffer;
    whooshNoise.loop = true;
    const whooshFilter = ac.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.Q.value = 2;
    whooshFilter.frequency.setValueAtTime(400, streamTime);
    whooshFilter.frequency.exponentialRampToValueAtTime(12000, streamTime + streamDuration);
    whooshNoise.connect(whooshFilter).connect(whooshGain);
    whooshNoise.start(streamTime);
    whooshNoise.stop(streamTime + streamDuration);

    // === 4. The Arrival (5.5s -> 6.0s) ===
    const arrivalTime = now + 5.5;
    const riserGain = ac.createGain();
    riserGain.connect(masterGain);
    riserGain.gain.setValueAtTime(0, arrivalTime);
    riserGain.gain.linearRampToValueAtTime(0.2, arrivalTime + 0.4);
    riserGain.gain.exponentialRampToValueAtTime(0.0001, arrivalTime + 0.5);
    const riserOsc = ac.createOscillator();
    riserOsc.type = 'sawtooth';
    riserOsc.frequency.setValueAtTime(500, arrivalTime);
    riserOsc.frequency.exponentialRampToValueAtTime(8000, arrivalTime + 0.5);
    riserOsc.connect(riserGain);
    riserOsc.start(arrivalTime);
    riserOsc.stop(now + this.DURATION);
  }

  private _playWormholeSound(now: number, masterGain: GainNode) {
    if (!this.audioContext) return;
    const ac = this.audioContext;
    const duration = this.DURATION;

    // Deep, continuous drone
    const droneGain = ac.createGain();
    droneGain.connect(masterGain);
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(0.5, now + duration * 0.5);
    droneGain.gain.linearRampToValueAtTime(0, now + duration);
    
    const droneOsc1 = ac.createOscillator();
    droneOsc1.type = 'sawtooth';
    droneOsc1.frequency.setValueAtTime(40, now);
    droneOsc1.frequency.linearRampToValueAtTime(35, now + duration);
    const droneOsc2 = ac.createOscillator();
    droneOsc2.type = 'sawtooth';
    droneOsc2.frequency.setValueAtTime(40.5, now);
    droneOsc2.frequency.linearRampToValueAtTime(35.5, now + duration);
    
    const droneFilter = ac.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 200;
    droneOsc1.connect(droneFilter);
    droneOsc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneOsc1.start(now);
    droneOsc2.start(now);
    droneOsc1.stop(now + duration);
    droneOsc2.stop(now + duration);

    // Phasing/Flanging whoosh
    const whooshNoise = ac.createBufferSource();
    const bufferSize = ac.sampleRate * duration;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    whooshNoise.buffer = buffer;
    
    const whooshGain = ac.createGain();
    whooshGain.gain.setValueAtTime(0, now);
    whooshGain.gain.linearRampToValueAtTime(0.2, now + 1);
    whooshGain.gain.linearRampToValueAtTime(0, now + duration);
    
    const phaser = new BiquadFilterNode(ac, { type: 'bandpass', Q: 5 });
    phaser.frequency.setValueAtTime(300, now);
    phaser.frequency.exponentialRampToValueAtTime(5000, now + duration);
    
    whooshNoise.connect(phaser).connect(whooshGain).connect(masterGain);
    whooshNoise.start(now);
  }

  private _playStarlightSound(now: number, masterGain: GainNode) {
    if (!this.audioContext) return;
    const ac = this.audioContext;
    const duration = this.DURATION;

    // Charge up
    const chargeGain = ac.createGain();
    chargeGain.connect(masterGain);
    chargeGain.gain.setValueAtTime(0, now);
    chargeGain.gain.linearRampToValueAtTime(0.3, now + 1.0);
    const chargeOsc = ac.createOscillator();
    chargeOsc.type = 'sawtooth';
    chargeOsc.frequency.setValueAtTime(200, now);
    chargeOsc.frequency.exponentialRampToValueAtTime(4000, now + 1.5);
    chargeOsc.connect(chargeGain);
    chargeOsc.start(now);
    chargeOsc.stop(now + 1.5);

    // Crack/Zap at 1.5s
    const zapTime = now + 1.5;
    const zapGain = ac.createGain();
    zapGain.connect(masterGain);
    zapGain.gain.setValueAtTime(0.5, zapTime);
    zapGain.gain.exponentialRampToValueAtTime(0.001, zapTime + 0.1);
    const zapNoise = ac.createBufferSource();
    const zapBufferSize = ac.sampleRate * 0.1;
    const zapBuffer = ac.createBuffer(1, zapBufferSize, ac.sampleRate);
    const zapOutput = zapBuffer.getChannelData(0);
    for (let i = 0; i < zapBufferSize; i++) zapOutput[i] = Math.random() * 2 - 1;
    zapNoise.buffer = zapBuffer;
    const zapFilter = ac.createBiquadFilter();
    zapFilter.type = 'highpass';
    zapFilter.frequency.value = 2000;
    zapNoise.connect(zapFilter).connect(zapGain);
    zapNoise.start(zapTime);

    // High-pitched rush
    const rushGain = ac.createGain();
    rushGain.connect(masterGain);
    rushGain.gain.setValueAtTime(0, zapTime);
    rushGain.gain.linearRampToValueAtTime(0.3, zapTime + 0.1);
    rushGain.gain.linearRampToValueAtTime(0, now + duration);
    
    const rushNoise = ac.createBufferSource();
    rushNoise.buffer = zapNoise.buffer; // reuse a noise buffer
    rushNoise.loop = true;
    const rushFilter = ac.createBiquadFilter();
    rushFilter.type = 'highpass';
    rushFilter.frequency.setValueAtTime(5000, zapTime);
    rushFilter.frequency.exponentialRampToValueAtTime(15000, now + duration);
    rushNoise.connect(rushFilter).connect(rushGain);
    rushNoise.start(zapTime);
    rushNoise.stop(now + duration);
  }

  private _playBloomSound(now: number, masterGain: GainNode) {
    if (!this.audioContext) return;
    const ac = this.audioContext;
    const duration = this.DURATION;
    
    const collapseTime = 2.5;
    const explosionTime = now + collapseTime + 0.2;

    // "Inhale" / Collapse
    const inhaleGain = ac.createGain();
    inhaleGain.connect(masterGain);
    inhaleGain.gain.setValueAtTime(0, now);
    inhaleGain.gain.linearRampToValueAtTime(0.4, now + 0.5);
    inhaleGain.gain.linearRampToValueAtTime(0, now + collapseTime);
    
    const inhaleNoise = ac.createBufferSource();
    const bufferSize = ac.sampleRate * collapseTime;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    inhaleNoise.buffer = buffer;
    
    const inhaleFilter = ac.createBiquadFilter();
    inhaleFilter.type = 'lowpass';
    inhaleFilter.frequency.setValueAtTime(8000, now);
    inhaleFilter.frequency.exponentialRampToValueAtTime(100, now + collapseTime);
    inhaleNoise.connect(inhaleFilter).connect(inhaleGain);
    inhaleNoise.start(now);
    
    // Explosion
    const explosionGain = ac.createGain();
    explosionGain.connect(masterGain);
    explosionGain.gain.setValueAtTime(1.2, explosionTime);
    explosionGain.gain.exponentialRampToValueAtTime(0.001, explosionTime + (duration - collapseTime));
    
    const explosionOsc = ac.createOscillator();
    explosionOsc.type = 'sine';
    explosionOsc.frequency.setValueAtTime(100, explosionTime);
    explosionOsc.frequency.exponentialRampToValueAtTime(20, explosionTime + 2.0);
    explosionOsc.connect(explosionGain);
    explosionOsc.start(explosionTime);
    explosionOsc.stop(now + duration);

    // Shimmering tail
    const shimmerGain = ac.createGain();
    shimmerGain.connect(masterGain);
    shimmerGain.gain.setValueAtTime(0, explosionTime);
    shimmerGain.gain.linearRampToValueAtTime(0.15, explosionTime + 0.1);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    
    for(let i=0; i<5; i++) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1000 + i * 500 + Math.random() * 100;
        osc.connect(shimmerGain);
        osc.start(explosionTime);
        osc.stop(now + duration);
    }
  }
  
  public enterNexus(type: number = 0) {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;
    
    const masterGain = ac.createGain();
    masterGain.gain.value = 0.4;
    masterGain.connect(this.masterGain);
    
    switch (type) {
        case 0: this._playVortexSound(now, masterGain); break;
        case 1: this._playWormholeSound(now, masterGain); break;
        case 2: this._playStarlightSound(now, masterGain); break;
        case 3: this._playBloomSound(now, masterGain); break;
        default: this._playVortexSound(now, masterGain); break;
    }

    // Final impact sound for all animations
    const finalImpactTime = now + this.DURATION - 0.05;
    const finalGain = ac.createGain();
    finalGain.connect(masterGain);
    finalGain.gain.setValueAtTime(0.8, finalImpactTime);
    finalGain.gain.exponentialRampToValueAtTime(0.001, finalImpactTime + 1.0);
    const finalOsc = ac.createOscillator();
    finalOsc.type = 'sine';
    finalOsc.frequency.value = 60;
    finalOsc.connect(finalGain);
    finalOsc.start(finalImpactTime);
    finalOsc.stop(finalImpactTime + 1.0);
  }

  public textReveal() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;

    const noise = ac.createBufferSource();
    const bufferSize = ac.sampleRate * 0.05;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 8000;
    filter.Q.value = 5;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.05);
  }
  
  public loreHover() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(4000, now + 0.05);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    osc.connect(gain).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public cardHover() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;

    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.1, now + 0.01);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    masterGain.connect(this.masterGain);

    [880, 1046.5].forEach(freq => {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.3);
        osc.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.3);
    });
  }

  public magicalReveal() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;

    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.15, now + 0.1);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    masterGain.connect(this.masterGain);

    for (let i=0; i<5; i++) {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600 + i * 150, now);
        osc.frequency.exponentialRampToValueAtTime(900 + i * 200, now + 1.2);
        
        const lfo = ac.createOscillator();
        const lfoGain = ac.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 5 + Math.random() * 3;
        lfoGain.gain.value = 2 + Math.random() * 3;
        lfo.connect(lfoGain).connect(osc.detune);
        
        osc.connect(masterGain);
        osc.start(now + i * 0.02);
        lfo.start(now);
        osc.stop(now + 1.2);
        lfo.stop(now + 1.2);
    }
  }

  public nexusTitleClick() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;

    // Impact
    const impactOsc = ac.createOscillator();
    const impactGain = ac.createGain();
    impactOsc.type = 'sine';
    impactOsc.frequency.setValueAtTime(150, now);
    impactOsc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    impactGain.gain.setValueAtTime(0.4, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    impactOsc.connect(impactGain).connect(this.masterGain);
    impactOsc.start(now);
    impactOsc.stop(now + 0.15);

    // Shimmer
    const shimmerGain = ac.createGain();
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.linearRampToValueAtTime(0.1, now + 0.05);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    shimmerGain.connect(this.masterGain);

    [1000, 1500, 2000].forEach((freq, i) => {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 20;
        osc.connect(shimmerGain);
        osc.start(now);
        osc.stop(now + 1.0);
    });
  }

  public coreIgnite() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;
    const duration = 2.5;

    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.2, now + duration * 0.5);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    masterGain.connect(this.masterGain);

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1;
    filter.frequency.setValueAtTime(100, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + duration);
    filter.connect(masterGain);

    [-2, 0, 2].forEach(detune => {
        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, now);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(now);
        osc.stop(now + duration);
    });
  }

  public rebirth() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;
    const duration = 4.0;
    
    // Low drone
    const droneGain = ac.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(0.1, now + 1.0);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    droneGain.connect(this.masterGain);

    const droneOsc = ac.createOscillator();
    droneOsc.type = 'sine';
    droneOsc.frequency.setValueAtTime(100, now);
    droneOsc.frequency.exponentialRampToValueAtTime(80, now + duration);
    droneOsc.connect(droneGain);
    droneOsc.start(now);
    droneOsc.stop(now + duration);
    
    // A rising, shimmering sound
    const shimmerGain = ac.createGain();
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.linearRampToValueAtTime(0.08, now + 0.5);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    shimmerGain.connect(this.masterGain);
    
    for (let i=0; i<6; i++) {
        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440 + i * 5, now);
        osc.frequency.exponentialRampToValueAtTime(1200 + i * 10, now + duration);
        const filter = ac.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 400;
        osc.connect(filter).connect(shimmerGain);
        osc.start(now);
        osc.stop(now + duration);
    }
  }

  public nexusOrbHover() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;
    const duration = 0.2;

    const masterGain = ac.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    masterGain.connect(this.masterGain);

    // Low freq power up
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + duration);
    
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(100, now);
    filter.frequency.exponentialRampToValueAtTime(1000, now + duration * 0.8);
    
    osc.connect(filter).connect(masterGain);
    osc.start(now);
    osc.stop(now + duration);

    // High freq crackle
    const noise = ac.createBufferSource();
    const bufferSize = ac.sampleRate * 0.05;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 4000;
    
    noise.connect(noiseFilter).connect(masterGain);
    noise.start(now);
  }

  public nexusOrbClick() {
    this.ensureContextResumed();
    if (!this.audioContext || !this.masterGain) return;
    const ac = this.audioContext;
    const now = ac.currentTime;
    const duration = 1.5;

    // Deep impact
    const impactGain = ac.createGain();
    impactGain.gain.setValueAtTime(0.6, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    impactGain.connect(this.masterGain);
    
    const impactOsc = ac.createOscillator();
    impactOsc.type = 'sine';
    impactOsc.frequency.setValueAtTime(120, now);
    impactOsc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    impactOsc.connect(impactGain);
    impactOsc.start(now);
    impactOsc.stop(now + 0.5);
    
    // Whoosh
    const whooshGain = ac.createGain();
    whooshGain.gain.setValueAtTime(0, now);
    whooshGain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    whooshGain.connect(this.masterGain);

    const noise = ac.createBufferSource();
    const bufferSize = ac.sampleRate * 1.0;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i=0; i<bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.Q.value = 2;
    noiseFilter.frequency.setValueAtTime(200, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(4000, now + duration * 0.8);

    noise.connect(noiseFilter).connect(whooshGain);
    noise.start(now);

    // Shimmering activation chord
    const chordGain = ac.createGain();
    chordGain.gain.setValueAtTime(0, now + 0.1);
    chordGain.gain.linearRampToValueAtTime(0.1, now + 0.2);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    chordGain.connect(this.masterGain);
    
    [440, 440 * 1.5, 440 * 2].forEach((freq, i) => {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = (i - 1) * 5; // slight detune for richness
        osc.connect(chordGain);
        osc.start(now + 0.1);
        osc.stop(now + duration);
    });
  }
}

export const audio = AudioEngine.getInstance();
