import {it,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

it.skipIf(!existsSync('public/assets/source2/map.json'))('keeps skybox sand behind all five CT spawn floors',()=>{
  const result=execFileSync(process.execPath,['--import','tsx','scripts/check-source2-ground.ts'],{encoding:'utf8'});
  expect(result.match(/PASS CT/g)).toHaveLength(5);
},15000);
