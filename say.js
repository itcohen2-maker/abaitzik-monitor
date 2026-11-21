// Hebrew text to speech on the server (Phonikud, voice "shaul"), for Itzik's own use.
// node say.js "<text>" [name]   ->  data/files-private/<name>.mp3, prints the chat link files/<name>.mp3
// Non commercial license: never inside a paid client deliverable.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const TTS = '/home/monitor/tts';
const text = process.argv[2];
if (!text) { console.error('usage: node say.js "<text>" [name]'); process.exit(1); }
const name = (process.argv[3] || 'hakraa-' + new Date().toISOString().slice(0, 16).replace(/\D/g, '')).replace(/\.mp3$/, '') + '.mp3';
const dir = path.join(__dirname, 'data', 'files-private');
fs.mkdirSync(dir, { recursive: true });
execFileSync(path.join(TTS, 'venv/bin/python'), [path.join(TTS, 'say.py'), path.join(dir, name)], { input: text, stdio: ['pipe', 'ignore', 'inherit'] });
console.log('files/' + name);
