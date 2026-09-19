// Builds ./deploy with only the files the website needs, ready to drag onto
// Netlify. Run: node make-deploy.mjs
import fs from 'node:fs';
import path from 'node:path';

const FILES = ['index.html', 'manifest.json', 'css', 'js', 'icons'];

function copy(from, to) {
  if (fs.statSync(from).isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach((name) => copy(path.join(from, name), path.join(to, name)));
  } else {
    fs.copyFileSync(from, to);
  }
}

fs.rmSync('deploy', { recursive: true, force: true });
fs.mkdirSync('deploy');
FILES.forEach((name) => copy(name, path.join('deploy', name)));
console.log(`deploy/ ready: ${FILES.join(', ')}`);
