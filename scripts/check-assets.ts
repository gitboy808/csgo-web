import {auditAssets} from './asset-audit.ts';
const report=auditAssets('public');
console.log(JSON.stringify(report,null,2));
if(report.missing.length)process.exitCode=1;
