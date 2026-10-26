import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebArgs } from './web.js';

test('web CLI parses workspace, port and no-open independently',()=> {
  assert.deepEqual(parseWebArgs(['repo','--port','5555','--no-open']),{workspacePath:'repo',port:5555,open:false,help:false});
  assert.equal(parseWebArgs([]).workspacePath,process.cwd());
  assert.equal(parseWebArgs(['--help']).help,true);
  for(const args of [['--port','0'],['--port','65536'],['--port','abc'],['--wat'],['a','b']]) assert.throws(()=>parseWebArgs(args));
});
