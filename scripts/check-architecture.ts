/** Read-only structural inventory; an unreferenced type or file is not an automatic deletion candidate. */
import ts from'typescript';import{resolve,relative}from'node:path';
const root=process.cwd(),configFile=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile);
if(configFile.error)throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText,'\n'));
const config=ts.parseJsonConfigFileContent(configFile.config,ts.sys,root),program=ts.createProgram(config.fileNames,config.options),checker=program.getTypeChecker();
const project=program.getSourceFiles().filter(f=>f.fileName.startsWith(root+'/')&&!f.fileName.includes('/node_modules/')),source=project.filter(f=>f.fileName.startsWith(root+'/src/'));
const short=(file:string)=>relative(root,file),runtime=new Map<string,Set<string>>(),all=new Map<string,Set<string>>();
let unresolvedDynamicImports=0;
for(const file of source){
 const live=new Set<string>(),typed=new Set<string>();
 const add=(specifier:string,typeOnly=false)=>{const resolved=ts.resolveModuleName(specifier,file.fileName,config.options,ts.sys).resolvedModule?.resolvedFileName;if(!resolved?.startsWith(root+'/src/'))return;typed.add(short(resolved));if(!typeOnly)live.add(short(resolved));};
 const visit=(node:ts.Node)=>{
  if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
   const clause=node.importClause,names=clause?.namedBindings,typeOnly=!!clause?.isTypeOnly||!!(names&&ts.isNamedImports(names)&&names.elements.length&&!clause?.name&&names.elements.every(e=>e.isTypeOnly));add(node.moduleSpecifier.text,typeOnly);
  }else if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))add(node.moduleSpecifier.text,node.isTypeOnly);
  else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){const spec=node.arguments[0];if(spec&&ts.isStringLiteral(spec))add(spec.text);else unresolvedDynamicImports++;}
  ts.forEachChild(node,visit);
 };visit(file);runtime.set(short(file.fileName),live);all.set(short(file.fileName),typed);
}
function cycles(graph:Map<string,Set<string>>){const visiting=new Set<string>(),visited=new Set<string>(),found:string[][]=[];const walk=(name:string,chain:string[])=>{if(visiting.has(name)){found.push([...chain.slice(chain.indexOf(name)),name]);return;}if(visited.has(name))return;visiting.add(name);for(const next of graph.get(name)??[])walk(next,[...chain,name]);visiting.delete(name);visited.add(name);};for(const file of graph.keys())walk(file,[]);return found;}
const reachable=new Set<string>();function walk(file:string){if(reachable.has(file))return;reachable.add(file);for(const next of all.get(file)??[])walk(next);}walk('src/main.ts');
const exports=new Map<ts.Symbol,{name:string;file:string;external:Set<string>}>();
for(const file of source){const module=checker.getSymbolAtLocation(file);if(!module)continue;for(let symbol of checker.getExportsOfModule(module)){if(symbol.flags&ts.SymbolFlags.Alias)symbol=checker.getAliasedSymbol(symbol);if(symbol.flags&ts.SymbolFlags.Value)exports.set(symbol,{name:symbol.name,file:short(file.fileName),external:new Set()});}}
for(const file of project){const visit=(node:ts.Node)=>{if(ts.isIdentifier(node)){let symbol=checker.getSymbolAtLocation(node);if(symbol&&(symbol.flags&ts.SymbolFlags.Alias))symbol=checker.getAliasedSymbol(symbol);const entry=symbol&&exports.get(symbol);if(entry&&entry.file!==short(file.fileName))entry.external.add(short(file.fileName));}ts.forEachChild(node,visit);};visit(file);}
const game=source.find(f=>f.fileName.endsWith('/game/game.ts'))!,declaration=game.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Game')as ts.ClassDeclaration,methods=declaration.members.filter(ts.isMethodDeclaration),debug=methods.find(m=>m.name.getText(game)==='installDebug');
console.log(JSON.stringify({modules:source.length,runtimeCycles:cycles(runtime),cyclesIncludingTypes:cycles(all),unreachableFromMain:[...all.keys()].filter(file=>!reachable.has(file)),unresolvedDynamicImports,runtimeExportsWithoutExternalReference:[...exports.values()].filter(e=>!e.external.size).map(({name,file})=>({name,file})),coordinator:{methods:methods.length,directImports:runtime.get(short(game.fileName))!.size,bytes:Buffer.byteLength(game.text),developmentHarnessBytes:debug?Buffer.byteLength(debug.getText(game)):0}},null,2));
