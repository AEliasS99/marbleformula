import test from 'node:test';import assert from 'node:assert/strict';
import{marbleize}from'./circuit.mjs';
test('relaxed outline reuse returns identical geometry and isolates callers and input changes',()=>{
 const input=[[0,0],[24,0],[24,20],[0,20]],original=JSON.stringify(input),first=marbleize(input,.5),expected=structuredClone(first);
 first.pts[0][0]=999;first.crossings.push([.1,.9]);first.scaled[0][0]=999;
 assert.deepEqual(marbleize(input,.5),expected);assert.equal(JSON.stringify(input),original);
 assert.notEqual(marbleize(input,.6).length,expected.length);
 const changed=input.map(p=>[...p]);changed[1][0]+=8;assert.notEqual(marbleize(changed,.5).length,expected.length);
});
