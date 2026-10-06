import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import visuals from './visuals.json' with {type:'json'};
import {catalog} from '../server/core.js';
test('Every available gift, model and symbol has a packaged image, and backdrops use observed gradients',()=>{
  const paths=new Set([...Object.values(visuals.collections), ...Object.values(visuals.models).flatMap(Object.values), ...Object.values(visuals.symbols)]);
  for(const path of paths){
    const bytes=readFileSync(fileURLToPath(new URL('../public'+path,import.meta.url)));
    assert.ok((bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') || bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),path+' must contain an actual image');
  }
  for(const c of catalog){
    assert.ok(visuals.collections[c.name],c.name);
    for(const model of c.models) assert.ok(visuals.models[c.name][typeof model==='string'?model:model.name],`${c.name} model`);
    for(const symbol of c.symbols) assert.ok(visuals.symbols[symbol],symbol);
    for(const backdrop of c.backdrops) assert.match(visuals.backdrops[backdrop],/^radial-gradient\(/);
  }
});
