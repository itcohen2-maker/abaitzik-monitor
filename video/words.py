#!/usr/bin/env python3
"""Word level Hebrew timestamps for an audio file, in whisper CLI JSON shape.

Usage: python words.py AUDIO OUT.json

faster-whisper is what this box has (the transcribe.js path uses it too), so the
output is reshaped into the {"segments":[{"words":[...]}]} form that the reel
build_subs.py expects.
"""
import json
import subprocess
import sys
import tempfile
import os

audio, out = sys.argv[1], sys.argv[2]

wav = os.path.join(tempfile.gettempdir(), 'words-%d.wav' % os.getpid())
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                '-i', audio, '-ac', '1', '-ar', '16000', wav], check=True)

from faster_whisper import WhisperModel

model = WhisperModel('large-v3', device='cpu', compute_type='int8')
segs, _ = model.transcribe(wav, language='he', vad_filter=False,
                           word_timestamps=True, beam_size=5)

segments = []
for s in segs:
    words = [{'word': w.word, 'start': w.start, 'end': w.end} for w in (s.words or [])]
    segments.append({'start': s.start, 'end': s.end, 'text': s.text, 'words': words})

with open(out, 'w', encoding='utf-8') as f:
    json.dump({'segments': segments}, f, ensure_ascii=False, indent=1)

os.remove(wav)
print('\n'.join(s['text'].strip() for s in segments))
