'use strict';
// Turns a voice memo from the monitor into Hebrew text.
// Usage: node transcribe.js <audio file>
//
// The recorder in the page sends m4a on iPhone and webm elsewhere, so the file
// goes through ffmpeg to 16kHz mono wav first - faster-whisper reads that
// everywhere without guessing at the container.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error('usage: node transcribe.js <audio file>');
  process.exit(1);
}

const wav = path.join(os.tmpdir(), 'monitor-voice-' + Date.now() + '.wav');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-i', input, '-ac', '1', '-ar', '16000', wav]);

// Hebrew is set explicitly: on short clips the detector drifts to Arabic.
// vad_filter stays off - onnxruntime's DLL does not load on this machine, and
// a voice memo is short enough that trimming silence buys nothing.
const py = `
import sys, json
from faster_whisper import WhisperModel
m = WhisperModel("large-v3", device="cpu", compute_type="int8")
segs, info = m.transcribe(sys.argv[1], language="he", vad_filter=False,
                          beam_size=5, condition_on_previous_text=False)
text = " ".join(s.text.strip() for s in segs).strip()
print(json.dumps({"text": text, "seconds": round(info.duration, 1)}, ensure_ascii=False))
`;

try {
  // Without PYTHONIOENCODING the Windows console codec cannot print Hebrew.
  const out = execFileSync('python', ['-c', py, wav], {
    encoding: 'utf8', maxBuffer: 1 << 24,
    env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }),
  });
  const line = out.trim().split('\n').pop();
  const res = JSON.parse(line);
  console.log(res.text);
  console.error('(' + res.seconds + 's)');
} finally {
  fs.existsSync(wav) && fs.unlinkSync(wav);
}
