import {relative,resolve,sep,isAbsolute} from 'node:path';
import type {Plugin,ResolvedConfig} from 'vite';
import {auditAssets} from './asset-audit.ts';

const within=(parent:string,child:string)=>{const path=relative(parent,child);return path===''||path!=='..'&&!path.startsWith('..'+sep)&&!isAbsolute(path);};

/** Validate local inputs before Vite clears the previous build output. */
export function source2Assets():Plugin{
  let config:ResolvedConfig;
  return{
    name:'dust-source2-assets',apply:'build',enforce:'pre',
    configResolved(value){config=value;},
    buildStart(){
      if(!config.publicDir)this.error('The public asset directory is required.');
      const output=resolve(config.root,config.build.outDir);
      if(within(config.publicDir,output)||within(output,config.publicDir))this.error('Public assets and build output must be separate directories.');
      const report=auditAssets(config.publicDir,{reportExtras:false});
      if(report.missing.length)this.error(`Missing Source 2 resources: ${report.missing.slice(0,8).join(', ')}`);
    },
  };
}
