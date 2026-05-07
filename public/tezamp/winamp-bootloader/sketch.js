// Winamp — generative NFT by Roccano
// Copyright 2026 Roccano. All rights reserved.
// https://roccano.it — bootloader.art

(async function () {
  // ── RNG helpers ──────────────────────────────────────────────────────────
  const rnd = () => $bootloader.rnd();
  const rndInt = (a, b) => Math.floor(rnd() * (b - a + 1)) + a;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // ── WAV encoder ──────────────────────────────────────────────────────────
  function audioBufferToWavBlob(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate  = audioBuffer.sampleRate;
    const numSamples  = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign  = numChannels * bytesPerSample;
    const byteRate    = sampleRate * blockAlign;
    const dataSize    = numSamples * blockAlign;
    const buffer      = new ArrayBuffer(44 + dataSize);
    const view        = new DataView(buffer);
    const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4,  36 + dataSize,  true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16,            true);
    view.setUint16(20, 1,             true);
    view.setUint16(22, numChannels,   true);
    view.setUint32(24, sampleRate,    true);
    view.setUint32(28, byteRate,      true);
    view.setUint16(32, blockAlign,    true);
    view.setUint16(34, 16,            true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    const ch = [];
    for (let c = 0; c < numChannels; c++) ch.push(audioBuffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, ch[c][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // ── Audio synth helpers ──────────────────────────────────────────────────
  function makeNoise(ctx) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    return src;
  }
  function makeGain(ctx, v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function makeBPF(ctx, freq, Q) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = Q; return f; }
  function makeLPF(ctx, freq, Q) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = Q ?? 1; return f; }
  function scheduleBeats(ctx, gainNode, bpm, pattern, duration, attack, decay, peak) {
    const beatLen = 60 / bpm;
    for (let t = 0; t < duration; t += beatLen) {
      const step = Math.round(t / beatLen) % pattern.length;
      if (!pattern[step]) continue;
      gainNode.gain.setValueAtTime(0, t);
      gainNode.gain.linearRampToValueAtTime(peak, t + attack);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
    }
  }

  // ── Synth functions (one per mood bucket) ────────────────────────────────
  function synthGlitch(ctx, s, dur) {
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = 55 * (1 + s.pitch * 0.3);
    const subGain = makeGain(ctx, 0), subLpf = makeLPF(ctx, 180, 0.8);
    sub.connect(subLpf); subLpf.connect(subGain); subGain.connect(ctx.destination);
    sub.start(0); sub.stop(dur);
    scheduleBeats(ctx, subGain, s.bpm, [1,0,0,0,0,0,1,0,1,0,0,1,0,0,0,0], dur, 0.003, 0.12, 0.7);
    const noise = makeNoise(ctx), nBpf = makeBPF(ctx, 800 + s.cutoff * 4000, 8), nGain = makeGain(ctx, 0);
    noise.connect(nBpf); nBpf.connect(nGain); nGain.connect(ctx.destination); noise.start(0);
    const gi = 0.5 / s.glitchRate;
    for (let t = 0.1; t < dur; t += gi * (0.5 + Math.random() * 0.8)) { nGain.gain.setValueAtTime(0, t); nGain.gain.linearRampToValueAtTime(0.3, t + 0.005); nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.08); }
    const mod = ctx.createOscillator(), modG = makeGain(ctx, 300 + s.pitch * 400), car = ctx.createOscillator(), carG = makeGain(ctx, 0);
    mod.type = 'sine'; mod.frequency.value = 280 * (1 + s.pitch * 0.5);
    car.type = 'square'; car.frequency.value = 140 * (1 + s.pitch * 0.5);
    mod.connect(modG); modG.connect(car.frequency); car.connect(carG); carG.connect(ctx.destination);
    mod.start(0); car.start(0); mod.stop(dur); car.stop(dur);
    scheduleBeats(ctx, carG, s.bpm * 2, [1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0], dur, 0.002, 0.06, 0.15);
  }

  function synthTripHop(ctx, s, dur) {
    [110, 130.8, 164.8].map(f => f * (1 + s.pitch * 0.15)).forEach(freq => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
      const lpf = makeLPF(ctx, 400 + s.cutoff * 600, 2), g = makeGain(ctx, 0.08);
      o.connect(lpf); lpf.connect(g); g.connect(ctx.destination); o.start(0); o.stop(dur);
    });
    const kn = makeNoise(ctx), kl = makeLPF(ctx, 120, 0.5), kg = makeGain(ctx, 0);
    kn.connect(kl); kl.connect(kg); kg.connect(ctx.destination); kn.start(0);
    scheduleBeats(ctx, kg, s.bpm, [1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0], dur, 0.004, 0.18, 0.9);
    const sn = makeNoise(ctx), sb = makeBPF(ctx, 900, 1.5), sg = makeGain(ctx, 0);
    sn.connect(sb); sb.connect(sg); sg.connect(ctx.destination); sn.start(0);
    scheduleBeats(ctx, sg, s.bpm, [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], dur, 0.003, 0.09, 0.4);
    const bass = ctx.createOscillator(); bass.type = 'triangle'; bass.frequency.value = 55 * (1 + s.pitch * 0.2);
    const bl = makeLPF(ctx, 250, 1.2), bg = makeGain(ctx, 0);
    bass.connect(bl); bl.connect(bg); bg.connect(ctx.destination); bass.start(0); bass.stop(dur);
    scheduleBeats(ctx, bg, s.bpm, [1,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0], dur, 0.01, 0.22, 0.6);
  }

  function synthBigBeat(ctx, s, dur) {
    const ko = ctx.createOscillator(); ko.type = 'sine';
    const kg = makeGain(ctx, 0); ko.connect(kg); kg.connect(ctx.destination); ko.start(0); ko.stop(dur);
    const bl = 60 / s.bpm;
    for (let t = 0; t < dur; t += bl) { ko.frequency.setValueAtTime(180, t); ko.frequency.exponentialRampToValueAtTime(40, t + 0.08); kg.gain.setValueAtTime(0, t); kg.gain.linearRampToValueAtTime(0.9, t + 0.004); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.18); }
    const sn = makeNoise(ctx), sb = makeBPF(ctx, 1200, 1.2), sg = makeGain(ctx, 0);
    sn.connect(sb); sb.connect(sg); sg.connect(ctx.destination); sn.start(0);
    scheduleBeats(ctx, sg, s.bpm, [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], dur, 0.003, 0.11, 0.55);
    const st = ctx.createOscillator(); st.type = 'sawtooth'; st.frequency.value = 220 * (1 + s.pitch * 0.25);
    const sl = makeLPF(ctx, 600 + s.cutoff * 1800, 6), stg = makeGain(ctx, 0);
    st.connect(sl); sl.connect(stg); stg.connect(ctx.destination); st.start(0); st.stop(dur);
    scheduleBeats(ctx, stg, s.bpm * 2, [0,0,1,0,0,0,0,0,0,0,1,0,0,1,0,0], dur, 0.003, 0.07, 0.35);
    const hn = makeNoise(ctx), hh = ctx.createBiquadFilter(); hh.type = 'highpass'; hh.frequency.value = 8000;
    const hg = makeGain(ctx, 0); hn.connect(hh); hh.connect(hg); hg.connect(ctx.destination); hn.start(0);
    scheduleBeats(ctx, hg, s.bpm * 2, [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], dur, 0.001, 0.03, 0.12);
  }

  function synthAmbient(ctx, s, dur) {
    const bf = 55 * (1 + s.pitch * 0.2);
    [0, 4, 7].forEach((semi, i) => {
      const freq = bf * Math.pow(2, semi / 12), o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const lpf = makeLPF(ctx, 300 + s.cutoff * 400, 1.5), g = makeGain(ctx, 0.001);
      g.gain.linearRampToValueAtTime(0.12 - i * 0.03, 4);
      o.connect(lpf); lpf.connect(g); g.connect(ctx.destination); o.start(0); o.stop(dur);
    });
    const noise = makeNoise(ctx), nl = makeLPF(ctx, 600 + s.cutoff * 300, 2), ng = makeGain(ctx, 0);
    noise.connect(nl); nl.connect(ng); ng.connect(ctx.destination); noise.start(0);
    ng.gain.linearRampToValueAtTime(0.04, dur * 0.3); ng.gain.linearRampToValueAtTime(0.02, dur * 0.7); ng.gain.linearRampToValueAtTime(0, dur);
    const sh = ctx.createOscillator(); sh.type = 'sine'; sh.frequency.value = bf * 4 * (1 + s.pitch * 0.1);
    const shg = makeGain(ctx, 0); sh.connect(shg); shg.connect(ctx.destination); sh.start(0); sh.stop(dur);
    shg.gain.linearRampToValueAtTime(0.05, dur * 0.5); shg.gain.linearRampToValueAtTime(0, dur);
  }

  function synthDnB(ctx, s, dur) {
    const bpm = 160 + (s.bpm - 60) / 80 * 20;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 50 * (1 + s.pitch * 0.3);
    const sg = makeGain(ctx, 0); sub.connect(sg); sg.connect(ctx.destination); sub.start(0); sub.stop(dur);
    scheduleBeats(ctx, sg, bpm, [1,0,0,1,0,0,1,0,1,0,0,0,1,0,0,1], dur, 0.005, 0.15, 0.75);
    const ko = ctx.createOscillator(); ko.type = 'sine';
    const kg = makeGain(ctx, 0); ko.connect(kg); kg.connect(ctx.destination); ko.start(0); ko.stop(dur);
    const stepLen = 60 / (bpm * 2);
    for (let t = 0; t < dur; t += stepLen * 16) { [0, 8].forEach(step => { const st = t + step * stepLen; ko.frequency.setValueAtTime(160, st); ko.frequency.exponentialRampToValueAtTime(40, st + 0.07); kg.gain.setValueAtTime(0, st); kg.gain.linearRampToValueAtTime(0.8, st + 0.004); kg.gain.exponentialRampToValueAtTime(0.001, st + 0.14); }); }
    const sn = makeNoise(ctx), sb = makeBPF(ctx, 1800, 1.5), snG = makeGain(ctx, 0);
    sn.connect(sb); sb.connect(snG); snG.connect(ctx.destination); sn.start(0);
    scheduleBeats(ctx, snG, bpm * 2, [0,0,0,0,1,0,0,0,0,0,1,1,0,0,1,0], dur, 0.002, 0.06, 0.5);
    const pad = ctx.createOscillator(); pad.type = 'sawtooth'; pad.frequency.value = 110 * (1 + s.pitch * 0.15);
    const pl = makeLPF(ctx, 300 + s.cutoff * 200, 2), pg = makeGain(ctx, 0.06);
    pad.connect(pl); pl.connect(pg); pg.connect(ctx.destination); pad.start(0); pad.stop(dur);
  }

  function synthAbstract(ctx, s, dur) {
    const cr = makeNoise(ctx), ch = ctx.createBiquadFilter(); ch.type = 'highpass'; ch.frequency.value = 6000;
    const cg = makeGain(ctx, 0.025 + s.pitch * 0.02); cr.connect(ch); ch.connect(cg); cg.connect(ctx.destination); cr.start(0);
    [1, 1.189, 1.782].forEach(ratio => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 82.4 * ratio * (1 + s.pitch * 0.1);
      const lpf = makeLPF(ctx, 500 + s.cutoff * 500, 3), g = makeGain(ctx, 0.07);
      o.connect(lpf); lpf.connect(g); g.connect(ctx.destination); o.start(0); o.stop(dur);
    });
    const ko = ctx.createOscillator(); ko.type = 'sine';
    const kg = makeGain(ctx, 0); ko.connect(kg); kg.connect(ctx.destination); ko.start(0); ko.stop(dur);
    const beatLen = 60 / s.bpm;
    for (let t = 0; t < dur; t += beatLen * 2) { ko.frequency.setValueAtTime(140, t); ko.frequency.exponentialRampToValueAtTime(45, t + 0.1); kg.gain.setValueAtTime(0, t); kg.gain.linearRampToValueAtTime(0.85, t + 0.005); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.22); }
    const sn = makeNoise(ctx), sb = makeBPF(ctx, 1000, 1.2), snG = makeGain(ctx, 0);
    sn.connect(sb); sb.connect(snG); snG.connect(ctx.destination); sn.start(0);
    for (let t = beatLen * 2; t < dur; t += beatLen * 4) { snG.gain.setValueAtTime(0, t); snG.gain.linearRampToValueAtTime(0.45, t + 0.004); snG.gain.exponentialRampToValueAtTime(0.001, t + 0.14); }
  }

  async function generateAudioBlobUrl(mood, seed) {
    const dur = 20;
    const sr  = 44100;
    const ctx = new OfflineAudioContext(1, sr * dur, sr);
    [synthGlitch, synthTripHop, synthBigBeat, synthAmbient, synthDnB, synthAbstract][mood](ctx, seed, dur);
    const audioBuffer = await ctx.startRendering();
    const blob = audioBufferToWavBlob(audioBuffer);
    return URL.createObjectURL(blob);
  }

  // ── Skin list (deterministic order, index used for selection) ─────────────
  const SKINS = [
    'acAmp_XP_v21',
    'base-2.91',
    'Blue_Metrix',
    'Chrome_iTune',
    'cloverclassic1-0',
    'CT_81st_Air_Force_JROTC',
    'green_great_skin',
    'iMAC_OS_X_Aqua_Theme_by_Webfeind2000',
    'iMAC_OS_X_Green_Theme',
    'iMAC_OS_X_Orange_Theme',
    'iMAC_OS_X_Purple_Theme',
    'iMac2_12Teal',
    'iMac2Blueberry2-1',
    'ipod__authentic_skin__by_five_g',
    'metrix_xbox_by_bledg-d2yxnfo',
    'MountainDew',
    'nodata',
    'orange-amp',
    'primech_bluewash_by_garet_jax',
    'QuickTime_X',
    'trekamp_the_follow-up',
    'Winamp3_Classified_v5.5',
    'Winamp5_Classified_v5.5',
    'netscape_winamp',
    'Aqua',
    'smixv2',
    'digital_gEN-X_z3_Edition',
    'acoustic_blue_v2_01_by_gowtah',
    'AMPBOY',
    'butterflyv3',
    'deviantamp',
    'dosamp',
    'gameboy',
    'Major_Tom Remix',
    'Photoshop_60',
    'Sony CDX-MP3',
    'tricorder',
    'XBOX_MasterAmp',
    'SpiderMan',
    'Nullsoft_DOSAmp',
    'NapsterAmp',
    'PAD_v1_by_Kuki',
    'Foli-dash',
    'Digi_Generation_2001',
    'Contra',
    'OutRun_skin_by_Monkie',
    'farhatdudes',
    'Alpine_CDA_DC-550B',
    'Sony_wx-5500mdx',
    'SONIC',
    'chemie',
    'AmpTech4',
    'AppleiTunes',
    'GRAVY_AMP_v1',
    'Music_World_2001',
    'Nokia_3210amp_v2',
    'Orb',
    'PIONEER2001',
    'ionut',
    'phusion_grey',
    'resubmitted.Spilt_Milk',
    'my_JVC_amp',
    'nokia3210',
    'nokia8850',
    'nokia_titanium_skin_by_five_g',
    'Nokiamp_VII',
    'OS8 AMP - Aquamarine',
    'OS8 AMP - Copper',
    'OS8 AMP - Crimson',
    'OS8 AMP - Gold',
    'OS8 AMP - Golden',
    'OS8 AMP - Lime',
    'OS8 AMP - Magenta',
    'OS8 AMP - Nutmeg',
    'OS8 AMP - Plum',
    'OS8 AMP - Rose',
    'OS8 AMP - Saphire',
    'OS8 AMP - Teal',
    'OS8 AMP - Turquoise',
    'os8amp',
    'os8amp255',
    'os8_amp_v1_5',
    'The_Sims',
    'nintendogamecubeamp',
    'playstation2',
    'Winamp_For_Windows_XP',
    'WindowsMediaPlayer1-0',
    'neonSharp',
    'Sony_2000_SE',
    'spyamp40',
    'TrixX',
    'JVC_KD-LH_ARSENAL_2002_1.20',
    'JVC_KD-LH_ARSENAL_RED_2002',
    'JVC_KD-S580',
    'Philips_Electronics',
    'Philips_Micro_Hi-Fi',
    'SONY',
    'Sony Amp',
    'Sony_Deck',
    'Sony_G88_goth',
    'sony_mp2000_analog',
    'sony_pmc-301re_v3_1_1',
    'SONY_RX77S_V3',
    'winman_SONY_V40',
  ];

  // ── Generatori di nomi procedurali ──────────────────────────────────────
  const ARTIST_PREFIXES = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  const TRACK_WORDS_A   = ['Deep','Dark','Fast','Slow','Lost','Cold','Hard','Soft','Raw','Pure','Dead','Live','Free','High','Low','Void','Neon','Acid','Grey','Blue'];
  const TRACK_WORDS_B   = ['Signal','Circuit','Pulse','Static','Noise','Phase','Drift','Loop','Gate','Wave','Core','Zone','Flux','Grid','Trace','Shard','Node','Layer','Echo','Burn'];

  function genArtist() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const prefix = ARTIST_PREFIXES[Math.floor(rnd() * ARTIST_PREFIXES.length)];
    let code = '';
    for (let i = 0; i < 3; i++) code += letters[Math.floor(rnd() * letters.length)];
    return prefix + '-' + code;
  }

  function genTrack() {
    const a = TRACK_WORDS_A[Math.floor(rnd() * TRACK_WORDS_A.length)];
    const b = TRACK_WORDS_B[Math.floor(rnd() * TRACK_WORDS_B.length)];
    return a + ' ' + b;
  }

  // ── Skin backgrounds ─────────────────────────────────────────────────────
  const SKIN_BG = {
    // Chrome iTunes: argento metallico lucido con highlight bianco
    'Chrome_iTune':
      'linear-gradient(160deg, #e8e8e8 0%, #c0c0c0 30%, #909090 60%, #b8b8b8 80%, #d8d8d8 100%)',

    // Clover Classic: verde prato con texture erba stilizzata
    'cloverclassic1-0':
      'radial-gradient(ellipse at 50% 100%, #2a5a10 0%, #1a3a08 40%, #0d2004 70%, #050f02 100%)',

    // iMac OS X Aqua: azzurro-ciano lucido stile acqua
    'iMAC_OS_X_Aqua_Theme_by_Webfeind2000':
      'radial-gradient(ellipse at 35% 25%, #ccf7ff 0%, #40d0f0 25%, #0098c8 55%, #004a7a 85%, #001428 100%)',

    // iMac OS X Green: verde acqua traslucido con riflesso plastica
    'iMAC_OS_X_Green_Theme':
      'radial-gradient(ellipse at 35% 25%, #a0ffcc 0%, #30c870 25%, #0a7a3a 55%, #023a1a 85%, #001008 100%)',

    // iMac OS X Orange: arancione caldo traslucido
    'iMAC_OS_X_Orange_Theme':
      'radial-gradient(ellipse at 35% 25%, #ffe0a0 0%, #ff9020 25%, #c85000 55%, #6a2000 85%, #200800 100%)',

    // iMac OS X Purple: viola traslucido stile iMac G3
    'iMAC_OS_X_Purple_Theme':
      'radial-gradient(ellipse at 35% 25%, #e8ccff 0%, #a050e0 25%, #6010b0 55%, #300860 85%, #100020 100%)',

    // iMac2 Teal: verde-acqua profondo stile iMac G3
    'iMac2_12Teal':
      'linear-gradient(160deg, #ccfff5 0%, #40e0c0 25%, #008a78 55%, #004840 80%, #001a18 100%)',

    // Orange Amp: grigio piatto come il pannello della skin
    'orange-amp':
      '#808080',

    // Primech Bluewash: cerchi concentrici bianchi opachi su viola-blu
    'primech_bluewash_by_garet_jax':
      'repeating-radial-gradient(circle at 50% 50%, #3322cc 0px, #3322cc 18px, rgba(255,255,255,0.15) 18px, rgba(255,255,255,0.15) 19px)',

    // Windows XP Luna: blu cielo con nuvole sfumate
    'acAmp_XP_v21':
      'radial-gradient(ellipse at 30% 20%, #ffffff 0%, #b8d4f0 25%, #4a90d9 55%, #1a5fa8 80%, #0d3d7a 100%)',

    // base-2.91: blu medio come la skin
    'base-2.91':
      'linear-gradient(180deg, #1a2a4a 0%, #0e1e3a 50%, #081428 100%)',

    // Blue Metrix: griglia cyberpunk blu neon su sfondo quasi nero
    'Blue_Metrix':
      'linear-gradient(180deg, #0020a0 0%, #0040e0 40%, #0030c0 70%, #001880 100%)',

    // Air Force JROTC: mimetico digitale pixel art blu-grigio
    'CT_81st_Air_Force_JROTC':
      'repeating-conic-gradient(#1a2a40 0% 25%, #2e4060 25% 50%, #0e1828 50% 75%, #3a4f70 75% 100%) 0 0 / 8px 8px',

    // Green Great: sfumatura verde scuro / grigio metallico
    'green_great_skin':
      'linear-gradient(160deg, #1a2a1a 0%, #2a3a2a 25%, #3a4a38 50%, #2a3428 75%, #1a221a 100%)',

    // iMac Blueberry: sfumatura acqua iMac
    'iMac2Blueberry2-1':
      'linear-gradient(160deg, #e8f8ff 0%, #a8dff5 25%, #4ab8e8 55%, #1a8cc8 80%, #0a5a99 100%)',

    // iPod bianco: superficie lucida bianco-grigio con riflesso
    'ipod__authentic_skin__by_five_g':
      'linear-gradient(160deg, #ffffff 0%, #e8e8e8 40%, #c8c8c8 70%, #b0b0b0 100%)',

    // Xbox: verde scuro con bagliore neon al centro
    'metrix_xbox_by_bledg-d2yxnfo':
      'radial-gradient(ellipse at 50% 50%, #1a4a00 0%, #0a2a00 40%, #040f00 75%, #000000 100%)',

    // Mountain Dew: verde acido neon, energia
    'MountainDew':
      'radial-gradient(ellipse at 50% 30%, #aaff00 0%, #5a9900 25%, #1f4400 55%, #0a1a00 85%, #000000 100%)',

    // Nodata: carta millimetrata grigio chiaro
    'nodata':
      'repeating-linear-gradient(0deg, transparent, transparent 19px, #b0b8c0 19px, #b0b8c0 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, #b0b8c0 19px, #b0b8c0 20px), #dde2e8',

    // QuickTime X: verde pallido tinta piatta
    'QuickTime_X':
      '#eefde8',

    // Star Trek: punti gialli su viola scuro
    'trekamp_the_follow-up':
      'radial-gradient(circle, #ffcc00 1.5px, transparent 1.5px) 0 0 / 12px 12px #1a0040',

    // Winamp 3 Classified: blu scuro con righe sottili come la skin
    'Winamp3_Classified_v5.5':
      'repeating-linear-gradient(180deg, #0a1828 0px, #0a1828 1px, #0e2030 1px, #0e2030 3px)',

    // Winamp 5 Classified: blu-grigio metallico come la skin
    'Winamp5_Classified_v5.5':
      'linear-gradient(160deg, #7a8eaa 0%, #4a6080 25%, #2e4460 55%, #1a2e48 80%, #0a1a2e 100%)',

    // Netscape: grigio perla con accento viola-blu anni 90
    'netscape_winamp':
      'linear-gradient(180deg, #c0c8d8 0%, #8898b8 35%, #4a5a80 65%, #1e2a48 100%)',


    // Aqua: sfumatura acqua macOS azzurro-bianco traslucido
    'Aqua':
      'radial-gradient(ellipse at 50% 0%, #d0f0ff 0%, #70c8f0 30%, #1a88cc 65%, #084888 100%)',

    // Smix v2: grigio freddo piatto con leggera sfumatura verticale
    'smixv2':
      'linear-gradient(180deg, #5a6070 0%, #3e4450 40%, #2e3440 70%, #1e2430 100%)',

    // Digital Gen-X Z3: blu azzurro gradiente
    'digital_gEN-X_z3_Edition':
      'linear-gradient(180deg, #0055cc 0%, #0088ff 30%, #00aaff 55%, #0066dd 80%, #003399 100%)',

    // Acoustic Blue v2: blu profondo morbido, stile hi-fi analogico
    'acoustic_blue_v2_01_by_gowtah':
      'linear-gradient(160deg, #001a3a 0%, #003066 35%, #001a44 65%, #000a1e 100%)',

    // AMPBOY: grigio caldo plastica Nintendo stile Game Boy
    'AMPBOY':
      'linear-gradient(180deg, #d0cfc8 0%, #b8b7b0 40%, #a8a7a0 70%, #989790 100%)',

    // Butterfly v3: puntini grigio scuro su verde Xbox acceso
    'butterflyv3':
      'radial-gradient(circle, #1a1a1a 1.5px, transparent 1.5px) 0 0 / 12px 12px #52cc00',

    // DeviantAmp: verde-lime acido su sfondo quasi nero, stile DeviantArt
    'deviantamp':
      '#94a594',

    // DOSamp: griglia terminale ASCII su nero
    'dosamp':
      'repeating-linear-gradient(0deg, transparent, transparent 15px, #3a3a3a 15px, #3a3a3a 16px), repeating-linear-gradient(90deg, transparent, transparent 15px, #3a3a3a 15px, #3a3a3a 16px), radial-gradient(ellipse at 50% 50%, #2a2a2a 0%, #141414 100%)',

    // Game Boy: puntini grigio su grigio chiaro stile plastica Nintendo
    'gameboy':
      'radial-gradient(circle, rgb(150, 150, 150) 1.5px, transparent 1.5px) 0 0 / 12px 12px rgb(210, 210, 210)',

    // Major Tom Remix: blu notte spazio con stelle puntiformi
    'Major_Tom Remix':
      '#2c5548',

    // Photoshop 6.0: grigio medio neutro da interfaccia Adobe
    'Photoshop_60':
      'linear-gradient(180deg, #6e6e6e 0%, #585858 40%, #4a4a4a 70%, #3c3c3c 100%)',

    // Sony CDX-MP3: grigio antracite car stereo con riflesso metallico
    'Sony CDX-MP3':
      'linear-gradient(160deg, #5a5a5a 0%, #3c3c3c 30%, #2a2a2a 55%, #1c1c1c 80%, #0f0f0f 100%)',

    // Tricorder: pattern griglia grigio medio stile pannello tecnico
    'tricorder':
      'repeating-linear-gradient(0deg, transparent, transparent 19px, rgb(176, 176, 184) 19px, rgb(176, 176, 184) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgb(176, 176, 184) 19px, rgb(176, 176, 184) 20px), rgb(122, 122, 122)',

    // XBOX MasterAmp: verde Xbox brillante su nero, stile dashboard originale
    'XBOX_MasterAmp':
      'radial-gradient(ellipse at 50% 40%, #107a10 0%, #0a5a0a 30%, #043004 60%, #010f01 85%, #000000 100%)',

    // SpiderMan: ragnatela su rosso scuro con bagliore circolare centrale
    'SpiderMan':
      'radial-gradient(circle at 50% 50%, #c04040 0%, #992020 25%, transparent 55%), repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent 28px, rgba(255,255,255,0.3) 28px, rgba(255,255,255,0.3) 30px), repeating-conic-gradient(transparent 0deg, transparent 11deg, rgba(255,255,255,0.15) 11deg, rgba(255,255,255,0.15) 12deg), #880000',

    // Nullsoft DOSamp: nero
    'Nullsoft_DOSAmp':
      '#000000',

    // NapsterAmp: blu elettrico con bagliore bianco stile Napster
    'NapsterAmp':
      'radial-gradient(ellipse at 50% 30%, #ffffff 0%, #4488ff 25%, #0044cc 60%, #001a88 100%)',

    // PAD v1 by Kuki: verdino piatto come la skin
    'PAD_v1_by_Kuki':
      '#6b7a1a',

    // Foli-dash: beige sabbia caldo stile pannello Atari
    'Foli-dash':
      '#9cb099',

    // Digi Generation 2001: grigio-verdino freddo come il pannello della skin
    'Digi_Generation_2001':
      'linear-gradient(180deg, #3a3f38 0%, #272c25 40%, #181c16 70%, #0a0c09 100%)',

    // Contra: grigio piatto
    'Contra':
      '#888888',

    // OutRun: sfumatura arcade azzurro-bianco-magenta stile tramonto Sega
    'OutRun_skin_by_Monkie':
      'linear-gradient(180deg, #00ccaa 0%, #00eebb 40%, #ffffff 50%, #ff88cc 60%, #ff33bb 100%)',

    // Farhat Dudes: cerchi concentrici neon verde-blu su nero
    'farhatdudes':
      'repeating-radial-gradient(circle at 50% 50%, #000000 0px, #000000 10px, #003322 10px, #003322 11px, #000000 11px, #000000 20px, #000a22 20px, #000a22 21px)',

    // Alpine CDA: puntini arancione e blu elettrico su grigio stile Alpine
    'Alpine_CDA_DC-550B':
      'radial-gradient(circle, #ff6600 1.5px, transparent 1.5px) 0 0 / 14px 14px, radial-gradient(circle, #0088ff 1.5px, transparent 1.5px) 7px 7px / 14px 14px #707070',

    // Sony WX-5500MDX: grigio cromato sfumato stile car stereo
    'Sony_wx-5500mdx':
      'linear-gradient(180deg, #e0e0e0 0%, #a0a0a0 20%, #d8d8d8 35%, #707070 50%, #c0c0c0 65%, #888888 80%, #b0b0b0 100%)',

    // SONIC: base grigia con strisce blu, rosse e bianche stile Sonic
    'SONIC':
      'repeating-linear-gradient(180deg, #c0c0c0 0px, #c0c0c0 16px, #1a6fff 16px, #1a6fff 18px, #ff1a1a 18px, #ff1a1a 20px, #ffffff 20px, #ffffff 21px, #c0c0c0 21px)',

    // Chemie: pattern a quadratini nero e grigio
    'chemie':
      'repeating-conic-gradient(#111111 0% 25%, #444444 25% 50%) 0 0 / 10px 10px',

    // AmpTech4: pattern a quadratini grigio scuro e arancione bruciato stile tech
    'AmpTech4':
      'repeating-conic-gradient(#3a3a3a 0% 25%, #c05a00 25% 50%) 0 0 / 10px 10px',

    // Apple iTunes: verde salvia chiaro stile macOS
    'AppleiTunes':
      'linear-gradient(180deg, #d8dbc0 0%, #c8cbb0 40%, #b8bba0 70%, #a8ab90 100%)',

    // Gravy Amp v1: beige-verde caldo desaturato stile retro
    'GRAVY_AMP_v1':
      'linear-gradient(180deg, #d2d2aa 0%, #c0c090 35%, #a8a878 65%, #909060 100%)',

    // Music World 2001: verde acqua con griglia punteggiata nera
    'Music_World_2001':
      'radial-gradient(circle, #000000 0.5px, transparent 0.5px) 0 0 / 5px 5px hsl(168deg 68.28% 55.49%)',

    // Nokia 3210 Amp: verde LCD stile display Nokia
    'Nokia_3210amp_v2':
      'hsl(143.53deg 21.52% 46.47%)',

    // Orb: nero con verde neon stile VU-meter
    'Orb':
      'radial-gradient(ellipse at 50% 40%, #2a9d0c 0%, #0a4004 40%, #020f01 75%, #000000 100%)',

    // Pioneer 2001: nero con bagliore verde neon stile car audio
    'PIONEER2001':
      'radial-gradient(ellipse at 50% 60%, #1a3a00 0%, #0a1800 35%, #040a00 65%, #000000 100%)',

    // Ionut: tinta piatta verde oliva
    'ionut':
      '#7a9e5a',

    // Phusion Grey: grigio neutro monocromatico
    'phusion_grey':
      '#8f8f8f',

    // Resubmitted Spilt Milk: bianco latte con accenti grigio-verde
    'resubmitted.Spilt_Milk':
      'linear-gradient(160deg, #f1f7e9 0%, #dde8cc 35%, #c8d8b0 65%, #b8c8a0 100%)',

    // My JVC Amp: grigio metallico car stereo con bagliore azzurro JVC
    'my_JVC_amp':
      'radial-gradient(ellipse at 50% 40%, #1a2a30 0%, #0d181e 35%, #060e12 65%, #000000 100%)',

    // Nokia 3210: grigio plastica Nokia con sfumatura fredda stile anni 2000
    'nokia3210':
      'linear-gradient(160deg, #c8ccd0 0%, #a0a8b0 30%, #787e88 60%, #505660 85%, #383e48 100%)',

    // Nokia 8850: antracite metallico lucido stile Nokia premium
    'nokia8850':
      'radial-gradient(ellipse at 50% 50%, #4a4a4a 0%, #1a1a1a 50%, #000000 100%)',

    // Nokia Titanium: sfumatura azzurro-grigio Nokia come i toni dominanti della skin
    'nokia_titanium_skin_by_five_g':
      'linear-gradient(rgb(160, 184, 204) 0%, rgb(112, 152, 184) 30%, rgb(72, 120, 160) 100%)',

    // Nokiamp VII: azzurro Nokia classico stile menu telefono
    'Nokiamp_VII':
      'rgb(175, 199, 139)',

    // OS8 AMP - serie Mac OS 8: bg ispirato al colore del titlebar di ogni variante
    'OS8 AMP - Aquamarine':
      'linear-gradient(180deg, #00cf90 0%, #006060 50%, #002e2e 100%)',
    'OS8 AMP - Copper':
      'linear-gradient(180deg, #ff9060 0%, #683018 50%, #2e1008 100%)',
    'OS8 AMP - Crimson':
      'linear-gradient(180deg, #ff6060 0%, #900000 50%, #3a0000 100%)',
    'OS8 AMP - Gold':
      'linear-gradient(180deg, #cfcf00 0%, #606000 50%, #282800 100%)',
    'OS8 AMP - Golden':
      'linear-gradient(180deg, #edba1e 0%, #6f570f 50%, #2c2208 100%)',
    'OS8 AMP - Lime':
      'linear-gradient(180deg, #90cf60 0%, #2f6000 50%, #122800 100%)',
    'OS8 AMP - Magenta':
      'linear-gradient(180deg, #cf60cf 0%, #600060 50%, #280028 100%)',
    'OS8 AMP - Nutmeg':
      'linear-gradient(180deg, #cf9060 0%, #602f00 50%, #281200 100%)',
    'OS8 AMP - Plum':
      'linear-gradient(180deg, #906090 0%, #40003f 50%, #1a0019 100%)',
    'OS8 AMP - Rose':
      'linear-gradient(180deg, #cf9090 0%, #602f2f 50%, #281212 100%)',
    'OS8 AMP - Saphire':
      'linear-gradient(180deg, #6090ff 0%, #002fcf 50%, #001258 100%)',
    'OS8 AMP - Teal':
      'linear-gradient(180deg, #609090 0%, #003f40 50%, #001819 100%)',
    'OS8 AMP - Turquoise':
      'linear-gradient(180deg, #00cfff 0%, #006090 50%, #002838 100%)',

    // os8amp / os8amp255 / os8_amp_v1_5: grigio classico Mac OS 8 con accento blu
    'os8amp':
      'linear-gradient(180deg, #aaff00 0%, #4d9900 50%, #1a3300 100%)',
    'os8amp255':
      'linear-gradient(180deg, #888888 0%, #444444 50%, #111111 100%)',
    'os8_amp_v1_5':
      'linear-gradient(180deg, #888888 0%, #444444 50%, #111111 100%)',

    // The Sims: blu notte con accento teal
    'The_Sims':
      'radial-gradient(ellipse at 50% 40%, #20a0a0 0%, #003060 35%, #000030 70%, #000010 100%)',


    // Nintendo GameCube Amp: viola-indigo GameCube con bagliore lilla
    'nintendogamecubeamp':
      'radial-gradient(ellipse at 50% 40%, #6040a0 0%, #202060 40%, #0a0a28 80%, #000000 100%)',

    // PlayStation 2: grigio scuro con accento blu PS2
    'playstation2':
      'linear-gradient(180deg, #303030 0%, #102040 50%, #040c1a 100%)',

    // Winamp for Windows XP: blu elettrico Luna XP
    'Winamp_For_Windows_XP':
      'linear-gradient(180deg, #4060e0 0%, #0030c0 40%, #001060 80%, #000428 100%)',

    // Windows Media Player 1.0: petrolio WMP con bagliore azzurro
    'WindowsMediaPlayer1-0':
      'radial-gradient(ellipse at 50% 40%, #00a0e0 0%, #004060 40%, #001828 80%, #000000 100%)',

    // neonSharp: verde neon synthwave su nero
    'neonSharp':
      'radial-gradient(ellipse at 40% 30%, #f0f0f0 0%, #b8b8b8 25%, #707070 55%, #a0a0a0 75%, #d8d8d8 100%)',

    // Sony 2000 SE: argento metallico Sony
    'Sony_2000_SE':
      'linear-gradient(160deg, #d8d8d8 0%, #b0b0b0 30%, #787878 60%, #a8a8a8 85%, #d0d0d0 100%)',

    // spyamp40: stealth verde scuro
    'spyamp40':
      'radial-gradient(ellipse at 40% 30%, #204820 0%, #0a200a 45%, #030d03 80%, #000000 100%)',

    // TrixX: grigio metallico
    'TrixX':
      'radial-gradient(ellipse at 50% 40%, #d0d0d0 0%, #888888 40%, #444444 75%, #1a1a1a 100%)',

    // JVC KD-LH Arsenal 2002: nero con accento blu Arsenal
    'JVC_KD-LH_ARSENAL_2002_1.20':
      'linear-gradient(180deg, #1a2a4a 0%, #0a1428 50%, #000000 100%)',

    // JVC KD-LH Arsenal RED 2002: nero con accento rosso
    'JVC_KD-LH_ARSENAL_RED_2002':
      'linear-gradient(180deg, #4a1a1a 0%, #280a0a 50%, #000000 100%)',

    // JVC KD-S580: grigio scuro auto stereo
    'JVC_KD-S580':
      'linear-gradient(180deg, #2a2a2a 0%, #141414 50%, #000000 100%)',

    // Philips Electronics: grigio neutro corporate
    'Philips_Electronics':
      'radial-gradient(ellipse at 50% 35%, #c8d0d8 0%, #8090a0 40%, #405060 75%, #101820 100%)',

    // Philips Micro Hi-Fi: grigio argento hi-fi
    'Philips_Micro_Hi-Fi':
      'linear-gradient(160deg, #d0d8e0 0%, #90a0b0 35%, #506070 65%, #8898a8 85%, #c0ccd8 100%)',

    // SONY: nero lucido con accento argento Sony
    'SONY':
      'radial-gradient(ellipse at 50% 30%, #606060 0%, #303030 35%, #101010 70%, #000000 100%)',

    // Sony Amp: argento metallico Sony classico
    'Sony Amp':
      'linear-gradient(160deg, #e0e0e0 0%, #b0b0b0 30%, #686868 60%, #a0a0a0 80%, #d8d8d8 100%)',

    // Sony Deck: grigio scuro deck
    'Sony_Deck':
      'linear-gradient(180deg, #383838 0%, #1c1c1c 50%, #000000 100%)',

    // Sony G88 Goth: nero totale con riflesso viola scuro
    'Sony_G88_goth':
      'radial-gradient(ellipse at 40% 25%, #2a1a30 0%, #100818 50%, #000000 100%)',

    // Sony MP2000 Analog: beige/crema vintage
    'sony_mp2000_analog':
      'radial-gradient(ellipse at 45% 35%, #60d0c0 0%, #208878 35%, #0a4840 70%, #001a18 100%)',

    // Sony PMC-301RE: grigio chiaro hi-fi anni 90
    'sony_pmc-301re_v3_1_1':
      'linear-gradient(160deg, #cccccc 0%, #a0a0a0 35%, #686868 65%, #909090 85%, #c4c4c4 100%)',

    // SONY RX77S V3: nero con accento rosso Sony
    'SONY_RX77S_V3':
      'radial-gradient(ellipse at 50% 30%, #c8c8c8 0%, #888888 40%, #404040 75%, #181818 100%)',

    // Winman Sony V40: grigio argento moderno
    'winman_SONY_V40':
      'radial-gradient(ellipse at 45% 30%, #d8d8d8 0%, #a0a0a0 30%, #585858 60%, #888888 80%, #c8c8c8 100%)',
  };

  // ── Trait generation (all seeded, deterministic) ─────────────────────────
  const _skinParam = new URLSearchParams(window.location.search).get('skin');
  const skinName = (_skinParam && SKINS.includes(_skinParam)) ? _skinParam : SKINS[Math.floor(rnd() * SKINS.length)];
  const artist   = genArtist();
  const track    = genTrack();

  const elapsed    = rndInt(1, 15);
  const _combo     = Math.floor(rnd() * 4); // 0=no/no  1=si/no  2=no/si  3=si/si
  const showEq     = _combo === 1 || _combo === 3;
  const showPl     = _combo === 2 || _combo === 3;

  // Playlist tracks (tutti generati proceduralmente)
  const playlist = [{ artist, track }];
  const plCount = rndInt(3, 8);
  for (let i = 0; i < plCount; i++) {
    playlist.push({ artist: genArtist(), track: genTrack() });
  }

  // ── Audio generation per ogni traccia (rnd() DOPO tutti i trait) ────────────
  const audioUrls = await Promise.all(playlist.map(async (entry, idx) => {
    if ($bootloader.isCapture) return 'silence.mp3';
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
    const seed = { bpm: 60 + Math.round(r1 * 80), cutoff: r2, pitch: r3, glitchRate: 0.5 + r4 * 1.5 };
    return generateAudioBlobUrl(idx % 6, seed);
  }));

  // ── Layout ────────────────────────────────────────────────────────────────
  // Canvas: 800×600
  // Player stack centered horizontally. Milkdrop to the right of the stack.
  //
  // Webamp auto-centers the window group, so we bypass it by dispatching
  // UPDATE_WINDOW_POSITIONS with absolute:true after renderWhenReady().
  //
  // Milkdrop default size: 275×116. Extra sprite unit = 14px.
  // Target ~402px tall (full stack) and ~457px wide.
  const PW = 275, PH = 116, EH = 116, PLH = 170;
  const GAP = 4;

  // Total stack height
  let stackH = PH;
  if (showEq) stackH += EH;
  if (showPl) stackH += PLH;

  // Absolute positions: player centered at x=400 (800/2 - 275/2 = 262)
  const playerLeft = Math.round((800 - PW) / 2);
  const playerTop  = Math.round((600 - stackH) / 2);
  const eqTop      = playerTop + PH;
  const plTop      = playerTop + PH + (showEq ? EH : 0);

  // ── Webamp initialisation ─────────────────────────────────────────────────
  const initialTracks = playlist.map(({ artist, track }, idx) => ({
    metaData: { artist, title: track },
    url: audioUrls[idx],
    duration: 20,
  }));

  const webamp = new Webamp({
    initialSkin: { url: `skins/${skinName}.wsz` },
    initialTracks,
    windowLayout: {
      main: {
        position: { left: playerLeft, top: playerTop },
      },
      equalizer: {
        position: { left: playerLeft, top: eqTop },
        closed: !showEq,
      },
      playlist: {
        position: { left: playerLeft, top: plTop },
        closed: !showPl,
      },
    },
    enableHotkeys: false,
    zIndex: 10,
  });

  // ── Apply skin background ─────────────────────────────────────────────────
  document.body.style.background = SKIN_BG[skinName] || '#000000';

  // ── Render and seek ───────────────────────────────────────────────────────
  await webamp.renderWhenReady(document.getElementById('app'));

  // Webamp windows use position:fixed relative to the viewport.
  // Center the stack in the actual viewport, not in #app.
  function centerPlayer() {
    const absLeft = Math.round((window.innerWidth  - PW) / 2);
    const absTop  = Math.round((window.innerHeight - stackH) / 2);
    webamp.store.dispatch({
      type: 'UPDATE_WINDOW_POSITIONS',
      absolute: true,
      positions: {
        main:      { x: absLeft, y: absTop },
        equalizer: { x: absLeft, y: absTop + PH },
        playlist:  { x: absLeft, y: absTop + PH + (showEq ? EH : 0) },
      },
    });
  }

  centerPlayer();
  window.addEventListener('resize', centerPlayer);

  try { webamp.seekToTime(elapsed); } catch (_) {}

  // ── Report traits and signal capture ─────────────────────────────────────
  $bootloader.setFeatures({
    'Skin':      skinName,
    'Equalizer': showEq ? 'Visible' : 'Hidden',
    'Playlist':  showPl ? 'Visible' : 'Hidden',
  });

  setTimeout(() => $bootloader.capture(), 800);
})();
