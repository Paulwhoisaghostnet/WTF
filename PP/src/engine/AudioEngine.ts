import * as Tone from "tone";

export type AudioAnalysisData = {
  amplitude: number;      // RMS 0-1
  bass: number;           // 20-250Hz energy (0-1)
  mid: number;            // 250-2000Hz energy (0-1)
  treble: number;         // 2000-20000Hz energy (0-1)
  beat: number;           // Binary 0 or 1 - on beat or not
  brightness: number;     // spectral centroid normalized (0-1)
  centroid: number;       // raw centroid Hz
};

const DEFAULT_ANALYSIS: AudioAnalysisData = {
  amplitude: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  beat: 0,
  brightness: 0,
  centroid: 0
};

export class AudioEngine {
  private player: Tone.Player | null = null;
  private fft: Tone.FFT | null = null;
  private meter: Tone.Meter | null = null;
  private gainNode: Tone.Gain | null = null;
  
  // Beat detection state - circular buffer to avoid allocations
  private static readonly BEAT_HISTORY_SIZE = 30;
  private beatHistory = new Float32Array(AudioEngine.BEAT_HISTORY_SIZE);
  private beatHistoryIndex = 0;
  private beatHistoryCount = 0;
  private lastBeatTime = 0;
  private beatOn = false;
  private beatOnFrames = 0;
  
  // Smoothed values for frequency bands
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedTreble = 0;
  
  // Analysis throttling - cache results to reduce FFT processing
  private static readonly ANALYSIS_INTERVAL_MS = 33; // ~30fps instead of 60fps
  private lastAnalysisTime = 0;
  private cachedAnalysis: AudioAnalysisData = { ...DEFAULT_ANALYSIS };
  
  private isInitialized = false;
  private currentUrl: string | null = null;
  
  constructor() {
    // Audio context will be created on first user interaction
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Tone.js requires user interaction to start
    await Tone.start();
    
    // Create analysis nodes with larger FFT for better frequency resolution
    this.fft = new Tone.FFT(1024);
    this.meter = new Tone.Meter({ smoothing: 0.5 });
    this.gainNode = new Tone.Gain(0.8).toDestination();
    
    this.isInitialized = true;
  }
  
  async loadAudio(url: string): Promise<void> {
    await this.initialize();
    
    if (this.currentUrl === url && this.player) {
      return; // Already loaded
    }
    
    // Clean up previous player
    if (this.player) {
      this.player.stop();
      this.player.dispose();
    }
    
    // Reset beat detection - circular buffer
    this.beatHistory.fill(0);
    this.beatHistoryIndex = 0;
    this.beatHistoryCount = 0;
    this.lastBeatTime = 0;
    this.beatOn = false;
    this.beatOnFrames = 0;
    this.smoothedBass = 0;
    this.smoothedMid = 0;
    this.smoothedTreble = 0;
    this.lastAnalysisTime = 0;
    this.cachedAnalysis = { ...DEFAULT_ANALYSIS };
    
    this.player = new Tone.Player({
      url,
      loop: true,
      autostart: false
    });
    
    // Connect to analysis chain
    if (this.fft && this.meter && this.gainNode) {
      this.player.connect(this.fft);
      this.player.connect(this.meter);
      this.player.connect(this.gainNode);
    }
    
    // Wait for audio to load
    await this.player.load(url);
    this.currentUrl = url;
  }
  
  play(): void {
    if (this.player && this.player.loaded) {
      this.player.start();
    }
  }
  
  pause(): void {
    if (this.player && this.player.state === "started") {
      this.player.stop();
    }
  }
  
  restart(): void {
    if (this.player && this.player.loaded) {
      this.player.stop();
      this.player.start();
    }
  }
  
  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
  
  isPlaying(): boolean {
    return this.player?.state === "started";
  }
  
  isLoaded(): boolean {
    return this.player?.loaded ?? false;
  }
  
  getDuration(): number {
    // Returns duration in seconds, or 0 if not loaded
    // Call isLoaded() first to check if audio is available
    return this.player?.buffer?.duration ?? 0;
  }
  
  getAnalysis(): AudioAnalysisData {
    if (!this.isInitialized || !this.fft || !this.meter || !this.isPlaying()) {
      return DEFAULT_ANALYSIS;
    }
    
    // Throttle analysis to ~30fps to reduce FFT processing overhead
    const now = performance.now();
    if (now - this.lastAnalysisTime < AudioEngine.ANALYSIS_INTERVAL_MS) {
      return this.cachedAnalysis;
    }
    this.lastAnalysisTime = now;
    
    // Get FFT data (values are in dB, typically -100 to 0)
    const fftValues = this.fft.getValue() as Float32Array;
    const fftSize = fftValues.length;
    
    // Sample rate and frequency resolution
    const sampleRate = Tone.context.sampleRate;
    const binHz = sampleRate / (fftSize * 2);
    
    // Calculate frequency band energies
    let bassSum = 0;
    let bassCount = 0;
    let midSum = 0;
    let midCount = 0;
    let trebleSum = 0;
    let trebleCount = 0;
    let totalEnergy = 0;
    let weightedSum = 0;
    
    for (let i = 1; i < fftSize; i++) { // Skip DC (i=0)
      const freq = i * binHz;
      const db = fftValues[i];
      
      // Convert dB to linear amplitude (0-1 range)
      // dB typically ranges from -100 (silence) to 0 (max)
      // Normalize to 0-1 by treating -60dB as floor
      const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
      const energy = normalized * normalized;
      
      totalEnergy += energy;
      weightedSum += freq * energy;
      
      // Bass: 20-250 Hz
      if (freq >= 20 && freq < 250) {
        bassSum += normalized;
        bassCount++;
      }
      // Mid: 250-2000 Hz
      else if (freq >= 250 && freq < 2000) {
        midSum += normalized;
        midCount++;
      }
      // Treble: 2000-16000 Hz
      else if (freq >= 2000 && freq < 16000) {
        trebleSum += normalized;
        trebleCount++;
      }
    }
    
    // Calculate average energy for each band
    const rawBass = bassCount > 0 ? bassSum / bassCount : 0;
    const rawMid = midCount > 0 ? midSum / midCount : 0;
    const rawTreble = trebleCount > 0 ? trebleSum / trebleCount : 0;
    
    // Smooth the values slightly for stability but keep them responsive
    const smoothing = 0.3;
    this.smoothedBass = this.smoothedBass * smoothing + rawBass * (1 - smoothing);
    this.smoothedMid = this.smoothedMid * smoothing + rawMid * (1 - smoothing);
    this.smoothedTreble = this.smoothedTreble * smoothing + rawTreble * (1 - smoothing);
    
    // Scale to usable range (multiply by sensitivity factor)
    const bassSensitivity = 3.0;
    const midSensitivity = 2.5;
    const trebleSensitivity = 2.0;
    
    const bass = Math.min(1, this.smoothedBass * bassSensitivity);
    const mid = Math.min(1, this.smoothedMid * midSensitivity);
    const treble = Math.min(1, this.smoothedTreble * trebleSensitivity);
    
    // Beat detection - binary on/off based on bass transients (reuse throttle timestamp)
    const beatValue = this.detectBeat(rawBass, now);
    
    // Spectral centroid (brightness)
    const centroid = totalEnergy > 0.0001 ? weightedSum / totalEnergy : 0;
    const brightness = Math.min(1, centroid / 6000);
    
    // Get overall amplitude from meter
    const meterValue = this.meter.getValue();
    const amplitude = typeof meterValue === "number" 
      ? Math.min(1, Math.max(0, (meterValue + 40) / 40))
      : 0;
    
    this.cachedAnalysis = {
      amplitude,
      bass,
      mid,
      treble,
      beat: beatValue,
      brightness,
      centroid
    };
    return this.cachedAnalysis;
  }
  
  private detectBeat(currentBass: number, now: number): number {
    // Add to circular buffer (O(1) instead of push/shift O(n))
    this.beatHistory[this.beatHistoryIndex] = currentBass;
    this.beatHistoryIndex = (this.beatHistoryIndex + 1) % AudioEngine.BEAT_HISTORY_SIZE;
    if (this.beatHistoryCount < AudioEngine.BEAT_HISTORY_SIZE) {
      this.beatHistoryCount++;
    }
    
    // Calculate average from circular buffer
    let sum = 0;
    for (let i = 0; i < this.beatHistoryCount; i++) {
      sum += this.beatHistory[i];
    }
    const avg = this.beatHistoryCount > 0 ? sum / this.beatHistoryCount : 0;
    const threshold = avg * 1.4; // Beat threshold - 40% above average
    
    // Minimum time between beats (prevents double-triggers)
    // For 180 BPM, minimum gap would be 333ms
    const minBeatGap = 200; // ms
    
    // Check for beat
    const timeSinceLastBeat = now - this.lastBeatTime;
    const isBeatNow = currentBass > threshold && 
                      currentBass > 0.05 && // Minimum energy threshold
                      timeSinceLastBeat > minBeatGap;
    
    if (isBeatNow) {
      this.lastBeatTime = now;
      this.beatOn = true;
      this.beatOnFrames = 4; // Stay "on" for 4 frames (~66ms at 60fps)
    }
    
    // Beat stays on for a few frames then turns off
    if (this.beatOnFrames > 0) {
      this.beatOnFrames--;
      return 1; // Beat ON
    }
    
    this.beatOn = false;
    return 0; // Beat OFF
  }
  
  dispose(): void {
    if (this.player) {
      this.player.stop();
      this.player.dispose();
      this.player = null;
    }
    if (this.fft) {
      this.fft.dispose();
      this.fft = null;
    }
    if (this.meter) {
      this.meter.dispose();
      this.meter = null;
    }
    if (this.gainNode) {
      this.gainNode.dispose();
      this.gainNode = null;
    }
    this.isInitialized = false;
    this.currentUrl = null;
    this.beatHistory.fill(0);
    this.beatHistoryIndex = 0;
    this.beatHistoryCount = 0;
  }
}
