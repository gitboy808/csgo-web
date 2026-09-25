/** Reader for the text KV3 exported by Valve Resource Format (no binary KV3 input). */
export function parseKV3(source:string):Record<string,any>{
  const text=source.replace(/<!--[^]*?-->/g,'').replace(/\/\/[^\n]*/g,'');
  const tokens=text.match(/"(?:\\.|[^"\\])*"|[{}\[\]=,:]|[^\s{}\[\]=,:]+/g)||[];let cursor=0;
  function value():any{
    const token=tokens[cursor++];
    if(token==='{'){const object:Record<string,any>={};while(tokens[cursor]!=='}'){if(tokens[cursor]===','){cursor++;continue;}const key=tokens[cursor++];if(tokens[cursor++]!=='=')throw new Error(`KV3: missing assignment after ${key}`);object[key.startsWith('"')?JSON.parse(key):key]=value();}cursor++;return object;}
    if(token==='['){const array=[];while(tokens[cursor]!==']'){if(tokens[cursor]===','){cursor++;continue;}array.push(value());}cursor++;return array;}
    if(token===undefined)throw new Error('Unexpected end of KV3');
    if(tokens[cursor]===':'){cursor++;return value();}
    if(token.startsWith('"'))return JSON.parse(token);
    if(token==='true'||token==='false')return token==='true';
    if(token==='null')return null;
    return Number.isFinite(Number(token))?Number(token):token;
  }
  return value();
}
