#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/source-manifest.json'), 'utf8'));
function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (['.git','node_modules','coverage'].includes(entry.name) || rel === 'docs/source-manifest.json' || rel.endsWith('.tgz')) continue;
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) out.push(...walk(full,rel));
    else if (entry.isFile()) out.push(rel);
    else throw new Error('unsupported source type: '+rel);
  }
  return out;
}
const expected=walk(root).sort();
const actual=manifest.files.map(x=>x.path).sort();
if(JSON.stringify(expected)!==JSON.stringify(actual)) throw new Error('source manifest inventory mismatch');
for(const item of manifest.files){
  const bytes=fs.readFileSync(path.join(root,item.path));
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==item.sizeBytes || sha!==item.sha256) throw new Error('source manifest mismatch: '+item.path);
}
if(manifest.schemaVersion!==1) throw new Error('invalid source manifest schema');
console.log('AGG Runtime source manifest PASS: '+manifest.files.length+' files');
