#!/usr/bin/env python3
"""Recreate 'Sunny Skies' — original four-minute, bright travel-day music.

No samples, soundfonts or third-party musical works are included.
Audio is offered under CC0 1.0; this generator is MIT licensed.
Requires numpy, soundfile, and ffmpeg for encoding.
"""
from pathlib import Path
import subprocess
import numpy as np
import soundfile as sf

RATE = 32000
DURATION = 240.0
BPM = 96
BEAT = 60.0 / BPM
N = int(RATE * DURATION)
rng = np.random.default_rng(20261123)
track = np.zeros((N, 2), dtype=np.float32)

# Tuned in C major, sunny major seventh/ninth voicings, no dark sustained pads.
# 96 bars (12 passages of 8 bars), 2.5 s per bar; ends on tonic for looping.
# (bass root MIDI, 4-note voicing MIDI, melody allowed notes MIDI)
PROGRESSION = [
    (48, (60, 64, 67, 71), (72, 74, 76, 79, 83)),  # Cmaj7
    (53, (60, 65, 69, 72), (72, 76, 77, 81, 84)),  # Fmaj9
    (55, (62, 67, 71, 76), (74, 76, 79, 83, 86)),  # G6
    (48, (60, 64, 67, 74), (72, 74, 76, 79, 86)),  # Cadd9
    (57, (60, 64, 69, 72), (72, 76, 81, 84, 88)),  # Am7 (upbeat relative minor)
    (53, (60, 65, 69, 76), (72, 76, 77, 81, 88)),  # Fmaj7
    (55, (62, 67, 71, 74), (74, 79, 83, 86, 91)),  # Gadd9
    (48, (60, 64, 67, 74), (72, 76, 79, 84, 86)),  # Cadd9
]

def hz(midi):
    return 440.0 * (2.0 ** ((midi - 69) / 12))

def add(start, mono, pan=0.5):
    """Mix a short one-shot with a slight stereo pan (0=left, 1=right)."""
    if start < 0 or start >= DURATION:
        return
    pos = int(round(start * RATE))
    count = min(len(mono), N-pos)
    if count < 1:
        return
    # Pan is gentle; neither ear is ever isolated.
    track[pos:pos+count, 0] += mono[:count] * (0.7 + 0.3 * (1-pan))
    track[pos:pos+count, 1] += mono[:count] * (0.7 + 0.3 * pan)

def tone(freq, length, voice='keys'):
    t = np.arange(int(length * RATE), dtype=np.float32) / RATE
    w = 2 * np.pi * freq * t
    if voice == 'keys':
        sound = (np.sin(w) + .24*np.sin(2*w+.15) + .10*np.sin(3*w+.4) + .055*np.sin(4*w+.7))
        env = np.minimum(t/.012,1.0) * np.exp(-t*2.1)
        sound *= env * (1+.025*np.sin(2*np.pi*4.5*t))
    elif voice == 'mallet':
        sound = (np.sin(w) + .22*np.sin(2*w+.1) + .075*np.sin(3*w+.1))
        env = np.minimum(t/.006,1.0) * np.exp(-t*3.9)
        sound *= env
    elif voice == 'bass':
        sound = np.sin(w) + .19*np.sin(2*w) + .06*np.sin(3*w)
        sound *= np.minimum(t/.015,1.0) * np.exp(-t*2.65)
    return sound.astype(np.float32)

# Light bossa-inspired accompaniment: warm piano/ukulele-style keys, bouncy bass.
for bar in range(96):
    begin = bar * 4 * BEAT
    root, chord, melody = PROGRESSION[bar % 8]
    for beat in (0,2):
        add(begin+beat*BEAT, .030*tone(hz(root-12), .85, 'bass'), .49)
    for beat, gain in [(0,.018),(1.5,.014),(2.5,.016),(3.5,.014)]:
        for i, note in enumerate(chord):
            # Stagger chord notes a few milliseconds to create a gentle strum.
            add(begin+beat*BEAT+i*.012, gain*tone(hz(note), .72, 'keys'), .35 if i%2 else .65)
    # Two complementary original melodies, varied every 8 bars.
    motif = (0, 2, 1, 3, 2, 4) if (bar//8)%2==0 else (2, 1, 3, 4, 2, 0)
    placements = [(0.5, .024), (1.0, .017), (1.75, .023), (2.75, .027), (3.25, .014)]
    for j,(pos,volume) in enumerate(placements):
        if (bar + j) % 7 == 2 and j==1: # breathing room
            continue
        m = melody[motif[(j+bar//4)%len(motif)] % len(melody)]
        add(begin+pos*BEAT, volume*tone(hz(m), .8, 'mallet'), .3 if j%2 else .7)

# Whispery shaker pulse, rounded brushed snare and barely audible kick.
# Filters prevent noisy, harsh transients: cheerful light rhythm, not thunder.
for beat in range(384):
    at = beat * BEAT
    duration = .20
    t = np.arange(int(RATE*duration),dtype=np.float32)/RATE
    n = rng.standard_normal(len(t)).astype(np.float32)
    # Highpass-like difference, softened with low amplitude and decay.
    bright = n - np.convolve(n, np.ones(30,dtype=np.float32)/30, mode='same')
    shaker = .0035 * np.exp(-t*26) * bright
    add(at + .5*BEAT, shaker, .4 if beat%2 else .6)
    if beat%4 in (1,3):
        brush = .0045 * np.exp(-t*35) * (0.6*n + 0.4*np.sin(2*np.pi*850*t))
        add(at, brush.astype(np.float32), .55)
    if beat%4 in (0,2):
        # Small soft kick; high frequency decays rapidly.
        t = np.arange(int(RATE*.22),dtype=np.float32)/RATE
        kick = .008*np.sin(2*np.pi*(80*t+35*t*t)) * np.exp(-t*23)
        add(at, kick.astype(np.float32), .5)

# Create smooth start/finish without an abrupt click at the loop boundary.
fade_len = int(RATE*.12)
for channel in range(2):
    # Last segment heads toward the first sample; short correction, transparent.
    d = track[-1,channel] - track[0,channel]
    track[-fade_len:,channel] -= d * np.linspace(0,1,fade_len,dtype=np.float32)
# Keep headroom; normalization gives comfortable volume at browser defaults.
peak = float(np.max(np.abs(track)))
if peak > 0:
    track *= np.float32(.67 / peak)

out = Path(__file__).resolve().parents[1] / 'assets' / 'audio'
out.mkdir(parents=True, exist_ok=True)
wav = out/'sunny-skies-source.wav'
mp3 = out/'sunny-skies.mp3'
sf.write(wav, track, RATE, subtype='PCM_16')
subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(wav),'-c:a','libmp3lame','-q:a','5','-ar','32000',str(mp3)],check=True)
wav.unlink()
print(f'Wrote {mp3.name}: {mp3.stat().st_size / 1024 / 1024:.2f} MiB, 240 s, {BPM} BPM')
