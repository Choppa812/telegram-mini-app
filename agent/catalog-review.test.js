import test from 'node:test';
import assert from 'node:assert/strict';
import {rankCatalog} from './catalog-review.js';
test('ranking covers other backgrounds, excludes stale runs and unaffordable observations',()=>{
 const combo={model:'Model',backdrop:'White',day:{count:4,q1:20},week:{count:12}};
 const ranked=rankCatalog([{runId:'run',collection:'One',complete:false,combinations:[combo,{...combo,model:'Too dear',day:{count:8,q1:200}}]},{runId:'old',collection:'Stale',combinations:[combo]}],100,'run');
 assert.equal(ranked.length,1);assert.equal(ranked[0].backdrop,'White');assert.equal(ranked[0].complete,false);
});
