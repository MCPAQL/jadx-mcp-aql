// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, readdir, readFile, realpath, stat, mkdir, copyFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, relative, isAbsolute, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { CLI_PIN } from './pin.js';
import { runCli, verifyCli, boundedFile, type CliOptions } from './cli.js';
import { operations, tools, introspect, type Category, type Params } from './catalogue.js';
import { parseManifest } from './manifest.js';
export { tools, operations };
interface MMethod { name:string;alias:string;signature:string;offset?:string }
interface MClass { name:string;alias:string;json:string;inner?:boolean;'top-class'?:string;methods?:MMethod[];fields?:{name:string;alias:string}[] }
interface JMethod { name:string;signature:string;declaration:string;lines?:{code:string}[];'access-flags':number }
interface JClass { name:string;methods?:JMethod[];'inner-classes'?:JClass[] }
interface Session { dir:string;path:string;classes:MClass[];resources:string[];partial:boolean }
class AqlError extends Error {constructor(public code:string,message:string,public details?:Record<string,unknown>){super(message);}}
function string(p:Params,key:string,fallback?:string):string {
  if(p[key]===undefined&&fallback!==undefined)return fallback;
  if(typeof p[key]!=='string'||!(p[key] as string).length)throw new AqlError('VALIDATION_INVALID_PARAM',`${key} must be a nonempty string`);
  return p[key] as string;
}
function integer(p:Params,key:string,value:number,max=4096):number {
  const n=p[key]??value;if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>max)throw new AqlError('VALIDATION_INVALID_PARAM',`${key} must be an integer in 0..${max}`);return n;
}
function safePath(root:string,name:string):string {
  const path=resolve(root,name),rel=relative(root,path);
  if(isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\'))throw new AqlError('VALIDATION_INVALID_PATH','Path escapes the session cache');
  return path;
}
async function files(root:string):Promise<string[]> {
  const output:string[]=[];
  const walk=async(dir:string)=>{for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Unexpected symlink in CLI output');if(e.isDirectory())await walk(join(dir,e.name));else if(e.isFile())output.push(relative(root,join(dir,e.name)).split('\\').join('/'));if(output.length>100000)throw new Error('CLI file count limit exceeded');}};
  await walk(root);return output.sort();
}
export function textWindow(value:string,max:number){
  const data=Buffer.from(value);let end=Math.min(max,data.length);
  while(end<data.length&&end>0&&(data[end]!&0xc0)===0x80)end--;
  const truncated=data.length>max;
  return {text:data.subarray(0,end).toString('utf8')+(truncated?`\n\n... [truncated: exceeds ${max} bytes, total ${data.length} bytes]`:''),truncated,total_bytes:data.length};
}
function page<T>(items:T[],p:Params){const offset=integer(p,'offset',0,Number.MAX_SAFE_INTEGER),limit=integer(p,'limit',200);return {total:items.length,offset,limit,items:items.slice(offset,offset+limit)};}
export class Adapter {
  private session?:Session;
  private queue:Promise<unknown>=Promise.resolve();
  private options:CliOptions;
  private allowedRoots:string[];
  private stopping=false;
  private cancellation=new AbortController();
  constructor(options:Partial<CliOptions>&Pick<CliOptions,'jar'>&{allowedRoots?:string[]}){
    this.options={timeoutMs:90000,threads:1,...options};
    this.allowedRoots=(options.allowedRoots??[process.cwd()]).map(root=>resolve(root));
    if(!this.allowedRoots.length)throw new Error('At least one allowed root is required');
  }
  async close():Promise<void>{this.stopping=true;this.cancellation.abort();await this.queue;await this.unload();}
  private async requireAllowed(path:string):Promise<void>{
    for(const configured of this.allowedRoots){
      const root=await realpath(configured),rel=relative(root,path);
      if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\'))return;
    }
    throw new AqlError('FORBIDDEN_PATH','Path is outside the operator-configured allowed roots');
  }
  call(endpoint:string,operation:string,params:Params={}):Promise<unknown>{
    const next=this.queue.then(()=>this.handle(endpoint,operation,params));this.queue=next.catch(()=>{});return next;
  }
  private async handle(endpoint:string,operation:string,p:Params):Promise<unknown>{
    try {
      if(this.stopping)throw new AqlError('SERVER_CLOSING','Server is closing');
      if(!tools.some(t=>t.name===endpoint))throw new AqlError('VALIDATION_ENDPOINT','Unknown endpoint');
      if(operation==='introspect')return {success:true,data:introspect(p)};
      const def=Object.hasOwn(operations,operation)?operations[operation]:undefined;if(!def)throw new AqlError('NOT_FOUND_OPERATION',`Unknown operation: ${operation}`);
      if(endpoint!==`mcp_aql_${def.category}`)throw new AqlError('VALIDATION_ENDPOINT_MISMATCH',`${operation} belongs to mcp_aql_${def.category}`,{expected_endpoint:`mcp_aql_${def.category}`,actual_endpoint:endpoint});
      for(const [key,spec] of Object.entries(def.parameters)){
        const value=p[key];if(value===undefined){if(spec.required)throw new AqlError('VALIDATION_MISSING_PARAM',`${key} is required`);continue;}
        if(spec.type==='integer')integer(p,key,0,key==='timeout_ms'?600000:key==='offset'?Number.MAX_SAFE_INTEGER:key==='max_bytes'?1048576:key==='threads'?16:4096);
        else if(spec.type==='string')string(p,key);
        if(spec.enum&&!spec.enum.includes(String(value)))throw new AqlError('VALIDATION_INVALID_PARAM',`${key} must be ${spec.enum.join(', ')}`);
      }
      let data=await this.execute(operation,p);
      if(p.fields!==undefined){if(def.category!=='read'||!Array.isArray(p.fields)||!p.fields.every(f=>typeof f==='string'))throw new AqlError('VALIDATION_INVALID_PARAM','fields must be an array of property names on read operations');if(typeof data!=='object'||data===null||Array.isArray(data))throw new AqlError('VALIDATION_INVALID_PARAM','fields requires an object result');data=Object.fromEntries(p.fields.filter(f=>Object.hasOwn(data as object,f)).map(f=>[f,(data as Params)[f]]));}
      const result={success:true,data};if(Buffer.byteLength(JSON.stringify(result))>1024*1024*2)throw new AqlError('OUTPUT_LIMIT','Response exceeds 2 MiB; use pagination, max_bytes or fields');
      return result;
    } catch(error){return {success:false,error:{code:error instanceof AqlError?error.code:'ENGINE_ERROR',message:(error instanceof Error?error.message:String(error)).slice(0,4096),...(error instanceof AqlError&&error.details?{details:error.details}:{})}};}
  }
  private status(){return {state:this.session?'LOADED':'UNLOADED',cli_version:CLI_PIN.version,...(this.session?{apk_path:this.session.path,class_count:this.session.classes.filter(c=>!c.inner).length,decompile_errors:this.session.partial}:{}),capabilities:{raw_smali:false,complete_use_inventory:false,xrefs:'method_call_graph',metadata:'cli_mapping'}};}
  private async unload(){const old=this.session;this.session=undefined;if(old)await rm(old.dir,{recursive:true,force:true});return {unloaded:!!old};}
  private async load(path:string){
    const input=await realpath(path);await this.requireAllowed(input);const file=await stat(input);
    if(!file.isFile()||file.size>512*1024*1024)throw new Error('Input must be a regular file no larger than 512 MiB');
    if(!['.apk','.dex','.jar','.class','.xapk'].includes(extname(input).toLowerCase()))throw new Error('Supported input extensions: apk, dex, jar, class, xapk');
    await verifyCli(this.options.jar);
    const dir=await mkdtemp(join(tmpdir(),'jadx-mcp-aql-'));
    try {
      // The CLI writes only to this owned cache; the immutable input remains in place.
      let partial=false;
      for(const format of ['json','java'] as const){
        const run=await runCli(this.options,dir,input,format,this.cancellation.signal);partial ||= run.code!==0;
        // JADX returns an error count for individual malformed methods while emitting useful output.
        if(run.code<0||run.code>=128)throw new Error(`jadx exited ${run.code}: ${run.diagnostics.slice(0,1024)}`);
        const names=await files(join(dir,format));let total=0;
        for(const name of names){total+=(await stat(safePath(join(dir,format),name))).size;if(total>256*1024*1024)throw new Error('CLI output cache exceeds 256 MiB');}
      }
      const mapping=JSON.parse((await boundedFile(join(dir,'json/sources/mapping.json'),32*1024*1024)).toString()) as {classes:MClass[]};
      if(!Array.isArray(mapping.classes)||mapping.classes.length>100000)throw new Error('Invalid CLI class mapping');
      const resources=await files(join(dir,'java/resources')).catch(()=>[] as string[]);
      const old=this.session;this.session={dir,path:input,classes:mapping.classes,resources,partial};if(old)await rm(old.dir,{recursive:true,force:true});return this.status();
    } catch(e){await rm(dir,{recursive:true,force:true});throw e;}
  }
  private selected(p:Params):MClass {
    const name=string(p,'class_name');const matches=this.session!.classes.filter(c=>c.name===name||c.alias===name||c.alias.split('.').at(-1)===name);
    if(matches.length!==1)throw new AqlError('NOT_FOUND_CLASS',matches.length?'Ambiguous class name':`Class not found: ${name}`);return matches[0]!;
  }
  private async jclass(c:MClass):Promise<JClass>{
    const root=join(this.session!.dir,'json/sources');const data=JSON.parse((await boundedFile(safePath(root,c.json),32*1024*1024)).toString()) as JClass;
    const find=(node:JClass):JClass|undefined=>node.name===c.alias?node:node['inner-classes']?.map(find).find(Boolean);
    const value=find(data);if(!value)throw new Error('Generated class JSON not found');return value;
  }
  private async source(c:MClass):Promise<string>{
    const top=c.inner?this.session!.classes.find(x=>x.name===c['top-class']||x.alias===c['top-class'])??c:c;
    return (await boundedFile(safePath(join(this.session!.dir,'java/sources'),top.json.replace(/\.json$/,'.java')),16*1024*1024)).toString('utf8');
  }
  private method(c:MClass,p:Params){const methods=(c.methods??[]).filter(m=>m.name===string(p,'method_name')||m.alias===p.method_name);const index=integer(p,'overload_index',0);if(!methods[index])throw new AqlError('NOT_FOUND_METHOD','Method or overload index not found');return {method:methods[index]!,index,count:methods.length};}
  private async execute(operation:string,p:Params):Promise<unknown>{
    if(operation==='status')return this.status();
    if(operation==='load_apk')return this.load(string(p,'path'));
    if(operation==='unload_apk')return this.unload();
    if(operation==='set_session_options'){const timeoutMs=integer(p,'timeout_ms',this.options.timeoutMs,600000),threads=integer(p,'threads',this.options.threads,16);if(timeoutMs<1||threads<1)throw new Error('timeout_ms and threads must be positive');this.options={...this.options,timeoutMs,threads};return {timeout_ms:timeoutMs,threads};}
    const s=this.session;if(!s)throw new AqlError('NO_SESSION','Load an APK first');
    const max=integer(p,'max_bytes',1048576,1048576);
    if(operation==='app_info'||operation==='manifest'||operation==='main_activity'){
      const xml=(await boundedFile(join(s.dir,'java/resources/AndroidManifest.xml'),16*1024*1024)).toString('utf8');
      if(operation==='manifest')return textWindow(xml,max);const parsed=parseManifest(xml);return operation==='app_info'?parsed.app:parsed.main;
    }
    if(operation==='list_classes')return page(s.classes.filter(c=>!c.inner&&c.alias.startsWith(string(p,'prefix',''))).map(c=>c.alias),p);
    if(operation==='resolve_class'){
      const name=string(p,'class_name'),matches=s.classes.filter(c=>c.alias===name||c.name===name||c.alias.split('.').at(-1)===name);
      return {resolved:matches.length===1,full_name:matches.length===1?matches[0]!.alias:'',raw_name:matches.length===1?matches[0]!.name:'',candidates:matches.map(c=>c.alias)};
    }
    if(operation==='search_classes'||operation==='search_methods'){
      const query=string(p,operation==='search_methods'?'method_name':'query').toLowerCase(),scope=operation==='search_methods'?'method':string(p,'scope','class');const hits:Params[]=[];
      for(const c of s.classes){
        if(scope==='class'&&c.alias.toLowerCase().includes(query))hits.push({class_name:c.alias});
        if(scope==='method')for(const m of c.methods??[])if(m.alias.toLowerCase().includes(query)||m.name.toLowerCase().includes(query))hits.push({class_name:c.alias,method_name:m.alias,signature:m.signature});
        if(scope==='field')for(const f of c.fields??[])if(f.alias.toLowerCase().includes(query))hits.push({class_name:c.alias,field_name:f.alias});
        if(scope==='code'&&(await this.source(c)).toLowerCase().includes(query))hits.push({class_name:c.alias});
      }
      return page(hits,p);
    }
    if(operation==='class_summary'){
      const c=this.selected(p),inner=s.classes.filter(x=>x['top-class']===c.name||x['top-class']===c.alias).map(x=>x.alias);
      const methods=(c.methods??[]).map(m=>({name:m.alias,signature:m.signature,dex_descriptor:m.signature.slice(m.name.length),is_constructor:m.name==='<init>'}));
      return {full_name:c.alias,raw_name:c.name,method_count:methods.length,field_count:c.fields?.length??0,inner_class_count:inner.length,methods,fields:c.fields??[],inner_classes:inner,metadata_scope:'cli_mapping'};
    }
    if(operation==='class_source')return textWindow(await this.source(this.selected(p)),max);
    if(operation==='method_body'){
      const c=this.selected(p),{method,index,count}=this.method(c,p);const generated=(await this.jclass(c)).methods?.find(m=>m.signature===method.signature);
      const body=generated?`${generated.declaration.trim()}${generated.lines?.length?' {\n'+generated.lines.map(l=>l.code).join('\n')+'\n}':''}`:'';
      const markers=['Code decompiled incorrectly','Method not decompiled','goto L'].filter(m=>body.includes(m));
      return {class_name:c.alias,method_name:method.alias,signature:method.signature,overload_index:index,overload_count:count,mode:'java',available:!!body&&markers.length===0,markers,body:textWindow(body,max).text};
    }
    if(operation==='xrefs'){
      const c=this.selected(p),target=string(p,'target'),id=target==='method'?`${c.name}.${this.method(c,p).method.signature}`:c.name;
      const graph=JSON.parse((await boundedFile(join(s.dir,'json/callgraph.json'),32*1024*1024)).toString()) as {nodes:{id:number;method:string}[];edges:{from:number;to:number;resolved:boolean}[]};
      const nodes=new Map(graph.nodes.map(n=>[n.id,n.method]));
      const items=graph.edges.filter(e=>target==='method'?nodes.get(e.to)===id:nodes.get(e.to)?.startsWith(id+'.')).map(e=>({source:nodes.get(e.from),target:nodes.get(e.to),resolved:e.resolved}));
      return {target:id,...page(items,p),coverage:'method_call_graph',complete_use_inventory:false};
    }
    if(operation==='list_resources'||operation==='strings'){
      let names=s.resources.filter(n=>n.toLowerCase().includes(string(p,'filter','').toLowerCase()));
      if(operation==='strings')names=names.filter(n=>/(^|\/)values[^/]*\/strings\.xml$/.test(n));
      const result=page(names,p);if(operation==='list_resources')return result;
      return {...result,items:await Promise.all(result.items.map(async name=>({name,...textWindow((await boundedFile(safePath(join(s.dir,'java/resources'),name),16*1024*1024)).toString('utf8'),max)})))};
    }
    if(operation==='resource'){
      const name=string(p,'name');if(!s.resources.includes(name))throw new AqlError('NOT_FOUND_RESOURCE','Resource not found');
      const data=await boundedFile(safePath(join(s.dir,'java/resources'),name),16*1024*1024);
      const text=data.toString('utf8');if(!text.includes('\uFFFD')&&!data.includes(0))return {name,encoding:'utf8',...textWindow(text,max)};
      return {name,encoding:'base64',data:data.subarray(0,max).toString('base64'),truncated:data.length>max,total_bytes:data.length};
    }
    if(operation==='export_sources'){
      const output=resolve(string(p,'output_dir')),dir=join(await realpath(dirname(output)),output.split(/[\\/]/).at(-1)!);
      await this.requireAllowed(dir);
      await mkdir(dir);const sources=await files(join(s.dir,'java/sources'));
      const exported:string[]=[];for(const [i,name] of sources.filter(n=>n.endsWith('.java')).entries()){const dest=`${String(i).padStart(6,'0')}.java`;await copyFile(safePath(join(s.dir,'java/sources'),name),join(dir,dest),constants.COPYFILE_EXCL);exported.push(dest);}
      return {output_dir:dir,files:exported,count:exported.length};
    }
    throw new AqlError('NOT_FOUND_OPERATION','Unimplemented operation');
  }
}
