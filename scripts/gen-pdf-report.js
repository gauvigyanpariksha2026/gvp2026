// One-off generator: rebuilds site/js/pdf-report.js, inlining the cow
// photo from site/index.html's data URI as a base64 constant. Re-run this
// whenever the cow photo in index.html changes.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
const m = html.match(/gau-photo[^>]*src="data:image\/jpeg;base64,([^"]+)"/);
if (!m) throw new Error('cow photo data URI not found in site/index.html');
const cowBase64 = m[1];

const buf = Buffer.from(cowBase64, 'base64');
let i = 2, w = 0, h = 0;
while (i < buf.length) {
  if (buf[i] !== 0xFF) { i++; continue; }
  const marker = buf[i + 1];
  if (marker === 0xD8 || marker === 0xD9) { i += 2; continue; }
  if (marker >= 0xD0 && marker <= 0xD7) { i += 2; continue; }
  const len = buf.readUInt16BE(i + 2);
  if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
    h = buf.readUInt16BE(i + 5);
    w = buf.readUInt16BE(i + 7);
    break;
  }
  i += 2 + len;
}
if (!w || !h) throw new Error('could not read cow photo dimensions');

const template = fs.readFileSync(path.join(__dirname, 'pdf-report.template.js'), 'utf8');
const out = template
  .replace('__COW_PHOTO_BASE64__', cowBase64)
  .replace('__COW_PHOTO_WIDTH__', String(w))
  .replace('__COW_PHOTO_HEIGHT__', String(h));

fs.writeFileSync(path.join(root, 'site/js/pdf-report.js'), out);
console.log('Wrote site/js/pdf-report.js (cow photo ' + w + 'x' + h + ', ' + buf.length + ' bytes)');
