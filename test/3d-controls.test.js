import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const table=readFileSync(new URL('../src/table3d.js',import.meta.url),'utf8');
test('game mounts a real WebGL perspective scene',()=>{
 assert.match(main,/import \{createTable3D\} from '\.\/table3d\.js'/);
 assert.match(table,/new THREE\.WebGLRenderer/);
 assert.match(table,/new THREE\.PerspectiveCamera/);
 assert.match(table,/new THREE\.BoxGeometry\(\.60,\.115,\.85\)/);
 assert.match(table,/function rackTiles/);
 assert.match(table,/if\(action==='tile'\)onSelect\(id\)/);
});
test('right-click and drag are disabled without breaking primary tile click',()=>{
 assert.doesNotMatch(main,/draggable="true"/);
 assert.doesNotMatch(main,/dataTransfer/);
 assert.match(table,/if\(e\.button!==0\)return/);
 assert.match(table,/addEventListener\('contextmenu',prevent\)/);
 assert.match(table,/addEventListener\('dragstart',prevent\)/);
 assert.match(main,/oncontextmenu=e=>e\.preventDefault/);
});
test('players retain non-drag ways to play and manage the 3D rack',()=>{
 for(const text of ['id="camera-view"','id="toggle-flat-rack"','id="move-left"','id="move-right"','id="sort-color"','id="sort-num"','id="new-room"']){
  assert.ok(main.includes(text),'Missing '+text);
 }
 assert.match(main,/function moveSelected\(delta\)/);
 assert.match(main,/scene3d\?\.setSelected\(selected\)/);
});
