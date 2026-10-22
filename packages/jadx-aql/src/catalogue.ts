// SPDX-License-Identifier: AGPL-3.0-only
export type Category='create'|'read'|'update'|'delete'|'execute';
export type Params=Record<string,unknown>;
export interface Param { type: string; required?: boolean; default?: unknown; enum?: string[]; description?: string }
export interface Operation { category: Category; description: string; parameters: Record<string,Param>; returns: string }
const string=(required=false): Param=>({type:'string',required});
const integer=(value: number): Param=>({type:'integer',default:value});
const cls={class_name:string(true)};
const method={...cls,method_name:string(true),overload_index:integer(0)};
const page={offset:integer(0),limit:integer(200)};
const bytes={max_bytes:integer(1048576)};
const op=(category: Category,description: string,parameters: Record<string,Param>,returns: string): Operation=>({category,description,parameters,returns});
export const operations: Record<string,Operation>={
  introspect:op('read','Discover operation and type schemas.',{query:{type:'string',enum:['operations','types'],default:'operations'},name:string()},'Introspection'),
  status:op('read','Get session status and CLI capabilities.',{},'SessionStatus'),
  load_apk:op('create','Decode an APK, DEX, JAR or class into a private session cache.',{path:string(true)},'SessionStatus'),
  unload_apk:op('delete','Release the private session cache.',{},'UnloadResult'),
  set_session_options:op('update','Change options for the next load.',{timeout_ms:integer(90000),threads:integer(1)},'SessionOptions'),
  export_sources:op('execute','Copy cached Java sources into a new output directory.',{output_dir:string(true)},'ExportResult'),
  app_info:op('read','Read decoded Android manifest facts.',{},'AppInfo'),
  manifest:op('read','Read the decoded Android manifest.',bytes,'TextResult'),
  main_activity:op('read','Find the MAIN/LAUNCHER activity.',{},'MainActivity'),
  list_classes:op('read','Page top-level classes in CLI mapping order.',{...page,prefix:string()},'ClassPage'),
  resolve_class:op('read','Resolve an exact raw name, alias or simple name.',cls,'ClassResolution'),
  search_classes:op('read','Search names, members or generated source text.',{query:string(true),scope:{type:'string',enum:['class','method','field','code'],default:'class'},...page},'SearchPage'),
  search_methods:op('read','Search mapped method names.',{method_name:string(true),...page},'SearchPage'),
  class_summary:op('read','Read CLI mapping metadata; omitted generated members have no source body.',cls,'ClassSummary'),
  class_source:op('read','Read the exact Java text emitted by the official CLI.',{...cls,...bytes},'TextResult'),
  method_body:op('read','Read a CLI JSON method body; raw smali is not exposed by the CLI.',{...method,...bytes},'MethodBody'),
  xrefs:op('read','Find incoming method-call graph edges; not a complete use-in inventory.',{...cls,method_name:string(),overload_index:integer(0),target:{type:'string',enum:['class','method'],required:true},...page},'CallGraphPage'),
  strings:op('read','Read decoded string-resource XML containers.',{filter:string(),...page,...bytes},'ResourcePage'),
  list_resources:op('read','Page decoded resource paths.',{filter:string(),...page},'ResourcePage'),
  resource:op('read','Read decoded text or base64 resource data.',{name:string(true),...bytes},'ResourceResult'),
};
export const tools=(['create','read','update','delete','execute'] as Category[]).map(category=>({
  name:`mcp_aql_${category}`,
  description:category==='read'?'Inspect, search, list and decompile local APK data. Call introspect to discover operations and schemas.':'Manage local jadx sessions. Call introspect to discover operations and schemas.',
  inputSchema:{type:'object' as const,properties:{operation:{type:'string'},params:{type:'object'}},required:['operation']},
  annotations:{readOnlyHint:category==='read',destructiveHint:category==='delete',openWorldHint:false},
}));
const types=[...new Set(Object.values(operations).map(o=>o.returns))].map(name=>({name,kind:'object',description:`${name} response; operation schemas describe the data.`}));
export function introspect(params: Params): unknown {
  const query=params.query ?? 'operations';
  if(query==='types') {
    if(params.name!==undefined) { const type=types.find(t=>t.name===params.name);if(!type)throw new Error('Unknown type');return {type}; }
    return {types};
  }
  if(query!=='operations') throw new Error('query must be operations or types');
  if(params.name!==undefined) {
    const operation=operations[String(params.name)];if(!operation)throw new Error('Unknown operation');
    const name=String(params.name);
    return {operation:{name,semantic_category:operation.category.toUpperCase(),endpoint:operation.category.toUpperCase(),mcpTool:`mcp_aql_${operation.category}`,
      description:operation.description,permissions:{readOnly:operation.category==='read',destructive:operation.category==='delete'},
      parameters:Object.entries({...operation.parameters,...(operation.category==='read'?{fields:{type:'array',description:'Select top-level object fields.'}}:{})}).map(([name,p])=>({name,required:false,...p})),
      returns:{name:operation.returns,kind:'object',description:returnShapes[operation.returns] ?? operation.returns}}};
  }
  return {_protocol:{version:'0.1.0',mode:'crude'},operations:Object.entries(operations).map(([name,o])=>({name,semantic_category:o.category.toUpperCase(),endpoint:o.category.toUpperCase(),description:o.description}))};
}
export const returnShapes: Record<string,string>={
  SessionStatus:'{state,cli_version,class_count?,apk_path?,capabilities}',ClassPage:'{total,offset,limit,items:string[]}',
  AppInfo:'{package,version_name,version_code,min_sdk,target_sdk,permissions:string[]}',ClassResolution:'{resolved,full_name,raw_name,candidates}',
  TextResult:'{text,truncated,total_bytes}',MethodBody:'{class_name,method_name,signature,overload_index,overload_count,mode:java,available,markers,body}',
  CallGraphPage:'{target,total,offset,limit,items:[{source,target,resolved}],coverage:method_call_graph,complete_use_inventory:false}',
  ClassSummary:'{full_name,raw_name,method_count,field_count,inner_class_count,methods,fields,inner_classes,metadata_scope:cli_mapping}',
  ResourceResult:'{name,encoding,text?|data?,truncated,total_bytes}',SearchPage:'{total,offset,limit,items}',ResourcePage:'{total,offset,limit,items}',
  SessionOptions:'{timeout_ms,threads}',ExportResult:'{output_dir,files,count}',UnloadResult:'{unloaded:boolean}',MainActivity:'{class,raw,package}',Introspection:'{operations}|{operation}|{types}|{type}',
};
