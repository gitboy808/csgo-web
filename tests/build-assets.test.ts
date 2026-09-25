import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'vite';
import {source2Assets} from '../scripts/public-assets';

const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});

it('rejects missing CS2 resources before deleting the last usable build',async()=>{
  const root=mkdtempSync(join(tmpdir(),'dust-build-'));roots.push(root);
  mkdirSync(join(root,'public'));mkdirSync(join(root,'dist'));
  writeFileSync(join(root,'index.html'),'<!doctype html><main>fixture</main>');
  writeFileSync(join(root,'dist/previous.txt'),'last good build');
  await expect(build({configFile:false,root,logLevel:'silent',plugins:[source2Assets()]})).rejects.toThrow('Source 2 assets are required');
  expect(readFileSync(join(root,'dist/previous.txt'),'utf8')).toBe('last good build');
});
