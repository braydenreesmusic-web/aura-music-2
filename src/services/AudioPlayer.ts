export class AudioPlayerService {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  public analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  public eqBands: BiquadFilterNode[] = [];
  public element: HTMLVideoElement;
  private currentUrl: string | null = null;

  constructor() {
    this.element = document.createElement('video');
    this.element.crossOrigin = 'anonymous';
    this.element.preload = 'metadata';
    this.element.playsInline = true;
    this.element.setAttribute('playsinline', 'true');
    this.element.controls = false;
    this.element.style.width = '100%';
    this.element.style.height = '100%';
    this.element.style.objectFit = 'contain';
    this.element.style.backgroundColor = 'black';
  }

  public initAudioContext() {
    if (this.audioCtx) return;
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    this.sourceNode = this.audioCtx.createMediaElementSource(this.element);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.gainNode = this.audioCtx.createGain();

    // 10-band EQ frequencies
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    
    let prevNode: AudioNode = this.sourceNode;

    frequencies.forEach((freq, index) => {
      const filter = this.audioCtx!.createBiquadFilter();
      if (index === 0) {
        filter.type = 'lowshelf';
      } else if (index === frequencies.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1;
      }
      filter.frequency.value = freq;
      filter.gain.value = 0;
      this.eqBands.push(filter);
      
      prevNode.connect(filter);
      prevNode = filter;
    });

    prevNode.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    // Restore saved EQ gains from localStorage
    try {
      const saved = localStorage.getItem('aura-eq-gains');
      if (saved) {
        const gains = JSON.parse(saved) as number[];
        if (Array.isArray(gains)) {
          gains.forEach((g, i) => {
            if (this.eqBands[i]) this.eqBands[i].gain.value = g;
          });
        }
      }
    } catch {}
  }

  public async play(url: string) {
    this.initAudioContext();
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (this.element.src !== url) {
      if (this.currentUrl && this.currentUrl.startsWith('blob:') && this.currentUrl !== url) {
        URL.revokeObjectURL(this.currentUrl);
      }
      this.currentUrl = url;
      this.element.src = url;
      this.element.load();
    }
    await this.element.play();
  }

  public async resume() {
    this.initAudioContext();
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume();
    }
    await this.element.play();
  }

  public pause() {
    this.element.pause();
  }

  public setVolume(value: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    } else {
      // Fallback only when Web Audio API isn't initialized
      this.element.volume = value;
    }
  }

  public setEqBand(index: number, value: number) {
    if (this.eqBands[index]) {
      this.eqBands[index].gain.value = value;
    }
  }

  public getEqBand(index: number) {
    return this.eqBands[index]?.gain.value || 0;
  }
}

export const audioPlayer = new AudioPlayerService();
