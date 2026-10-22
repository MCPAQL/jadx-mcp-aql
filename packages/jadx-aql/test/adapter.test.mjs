// SPDX-License-Identifier: AGPL-3.0-only
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdtemp, readdir, readFile, rm, symlink, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Adapter, tools, operations, textWindow } from '../dist/adapter.js';
import { parseManifest } from '../dist/manifest.js';
import { verifyCli, runCli } from '../dist/cli.js';
const root=resolve(import.meta.dirname,'../../..');
const jar=process.env.JADX_CLI_JAR??join(root,'.tools/jadx-1.5.6/lib/jadx-1.5.6-all.jar');
const java=process.env.JADX_JAVA??join(process.env.JAVA_HOME,'bin/java');
const apk=join(root,'build/fixture/small.apk');
let adapter,temporary;
async function call(operation,params={},category='read'){
  const result=await adapter.call('mcp_aql_'+category,operation,params);
  assert.equal(result.success,true,JSON.stringify(result));return result.data;
}
before(async()=>{temporary=await mkdtemp(join(tmpdir(),'jadx-aql-test-'));adapter=new Adapter({jar,java,allowedRoots:[root,temporary]});await call('load_apk',{path:apk},'create');});
after(async()=>{await adapter.close();await rm(temporary,{recursive:true,force:true});});
test('five CRUDE tools with runtime introspection and type schemas',async()=>{
  assert.equal(tools.length,5);
  for(const category of ['create','read','update','delete','execute']){
    const result=await call('introspect',{},category);assert.equal(result.operations.length,Object.keys(operations).length);
  }
  const detail=await call('introspect',{query:'operations',name:'load_apk'});assert.equal(detail.operation.semantic_category,'CREATE');assert.equal(detail.operation.parameters[0].name,'path');
  assert.ok((await call('introspect',{query:'types'})).types.length>0);
});
test('wrong endpoint cannot mutate or load',async()=>{
  for(const operation of ['load_apk','unload_apk','export_sources','set_session_options']){
    const result=await adapter.call('mcp_aql_read',operation,{path:apk,output_dir:join(temporary,'must-not-exist')});assert.equal(result.error.code,'VALIDATION_ENDPOINT_MISMATCH');
  }
  assert.equal((await call('status')).state,'LOADED');assert.deepEqual(await readdir(temporary),[]);
});
test('official CLI checksum verification rejects modified inputs',async()=>{
  await assert.rejects(verifyCli(apk),/checksum mismatch/);
  const other=new Adapter({jar:apk,java});try{assert.equal((await other.call('mcp_aql_create','load_apk',{path:apk})).success,false);}finally{await other.close();}
});
test('pagination indexes top-level classes and preserves inner metadata',async()=>{
  const first=await call('list_classes',{limit:1});const second=await call('list_classes',{offset:1,limit:1});assert.equal(first.total,2);assert.deepEqual([...first.items,...second.items],['fixture.Caller','fixture.Fixture']);
  const summary=await call('class_summary',{class_name:'fixture.Fixture'});assert.equal(summary.method_count,summary.methods.length);assert.equal(summary.method_count,8);assert.equal(summary.inner_class_count,1);
  assert.equal((await call('resolve_class',{class_name:'Fixture'})).full_name,'fixture.Fixture');
});
test('decoded manifest info retains duplicate permissions and launcher activity',async()=>{
  const info=await call('app_info');assert.equal(info.package,'fixture.example');assert.equal(info.version_name,'1.0');assert.equal(info.min_sdk,'23');assert.equal(info.permissions.length,3);assert.equal(info.permissions[0],info.permissions[2]);
  assert.equal((await call('main_activity')).class,'fixture.example.MainActivity');
  const xml=await call('manifest',{max_bytes:100});assert.equal(xml.truncated,true);assert.match(xml.text,/\[truncated: exceeds 100 bytes, total \d+ bytes\]$/);
});
test('search class, method, field and generated code',async()=>{
  for(const scope of ['class','method','field','code']){
    const query={class:'Fixture',method:'add',field:'value',code:'return'}[scope];assert.ok((await call('search_classes',{scope,query})).items.length);
  }
  assert.equal((await call('search_methods',{method_name:'overloaded'})).items.length,2);
});
test('exact CLI Java source and JSON bodies, including omitted and failed methods',async()=>{
  assert.match((await call('class_source',{class_name:'fixture.Caller'})).text,/class Caller/);
  const add=await call('method_body',{class_name:'fixture.Fixture',method_name:'add'});assert.equal(add.mode,'java');assert.equal(add.available,true);assert.match(add.body,/return/);
  const native=await call('method_body',{class_name:'fixture.Fixture',method_name:'nativeCall'});assert.match(native.body,/native/);
  const broken=await call('method_body',{class_name:'fixture.Fixture',method_name:'broken'});assert.equal(broken.available,false);assert.ok(broken.markers.length);
  const clinit=await call('method_body',{class_name:'fixture.Fixture',method_name:'<clinit>'});assert.equal(clinit.available,false);assert.equal(clinit.body,'');
  assert.equal((await call('method_body',{class_name:'fixture.Fixture',method_name:'overloaded',overload_index:1})).overload_count,2);
  assert.equal((await adapter.call('mcp_aql_read','method_body',{class_name:'fixture.Fixture',method_name:'overloaded',overload_index:9})).success,false);
});
test('call graph is explicitly narrower than a complete use inventory',async()=>{
  const result=await call('xrefs',{target:'method',class_name:'fixture.Fixture',method_name:'add'});assert.equal(result.total,1);assert.equal(result.items[0].source,'fixture.Caller.run()I');assert.equal(result.coverage,'method_call_graph');assert.equal(result.complete_use_inventory,false);
  assert.equal((await call('xrefs',{target:'class',class_name:'fixture.Fixture'})).total,1);
  assert.equal((await call('status')).capabilities.raw_smali,false);
});
test('resource listing, XML strings and bounded base64',async()=>{
  assert.ok((await call('list_resources')).items.includes('assets/bytes.bin'));assert.ok((await call('strings')).items.length);
  const data=await call('resource',{name:'assets/bytes.bin',max_bytes:16});assert.equal(data.encoding,'base64');assert.equal(Buffer.from(data.data,'base64').length,16);assert.equal(data.truncated,true);
  assert.equal((await adapter.call('mcp_aql_read','resource',{name:'../escape'})).success,false);
});
test('field projection and input validation',async()=>{
  const result=await call('class_summary',{class_name:'fixture.Fixture',fields:['full_name','method_count']});assert.deepEqual(Object.keys(result),['full_name','method_count']);
  for(const params of [{offset:-1},{limit:0.5},{limit:5000}])assert.equal((await adapter.call('mcp_aql_read','list_classes',params)).success,false);
  assert.equal((await adapter.call('mcp_aql_read','status',{fields:'bad'})).success,false);
});
test('UTF-8 text bounds and XML entity safety',()=>{
  assert.equal(textWindow('aπ🙂',2).text,'a\n\n... [truncated: exceeds 2 bytes, total 7 bytes]');
  assert.throws(()=>parseManifest('<!DOCTYPE manifest SYSTEM "http://example.invalid/a"><manifest/>'),/DOCTYPE/);
  assert.equal(parseManifest('<manifest package="missing"><application/></manifest>').app.version_name,'');
});
test('subprocess timeout terminates the real CLI',async()=>{
  const dir=await mkdtemp(join(temporary,'timeout-'));await assert.rejects(runCli({jar,java,timeoutMs:1,threads:1},dir,apk,'json'),/timed out/);
});
test('failed replacement preserves session; concurrent calls are serialized',async()=>{
  const results=await Promise.all([adapter.call('mcp_aql_create','load_apk',{path:'/missing.apk'}),adapter.call('mcp_aql_read','list_classes',{})]);
  assert.equal(results[0].success,false);assert.equal(results[1].data.total,2);
});
test('operator roots confine input and exports, including symlinked paths',async()=>{
  const confined=new Adapter({jar,java,allowedRoots:[temporary]});
  const outside=await mkdtemp(join(tmpdir(),'jadx-outside-'));
  try{
    await copyFile(apk,join(outside,'outside.apk'));
    assert.equal((await confined.call('mcp_aql_create','load_apk',{path:apk})).error.code,'FORBIDDEN_PATH');
    await symlink(join(outside,'outside.apk'),join(temporary,'escape.apk'));
    assert.equal((await confined.call('mcp_aql_create','load_apk',{path:join(temporary,'escape.apk')})).error.code,'FORBIDDEN_PATH');
    await symlink(outside,join(temporary,'outside-link'));
    assert.equal((await adapter.call('mcp_aql_execute','export_sources',{output_dir:join(temporary,'outside-link','new')})).error.code,'FORBIDDEN_PATH');
    assert.equal((await adapter.call('mcp_aql_execute','export_sources',{output_dir:join(outside,'new')})).error.code,'FORBIDDEN_PATH');
    assert.deepEqual(await readdir(outside),['outside.apk']);
  }finally{await confined.close();await rm(outside,{recursive:true,force:true});}
});
test('export creates only a new chosen directory; reload and unload work',async()=>{
  const output=join(temporary,'sources');const exported=await call('export_sources',{output_dir:output},'execute');assert.equal((await readdir(output)).length,exported.count);
  assert.equal((await adapter.call('mcp_aql_execute','export_sources',{output_dir:output})).success,false);
  assert.equal((await call('set_session_options',{threads:2,timeout_ms:90000},'update')).threads,2);
  await call('load_apk',{path:apk},'create');assert.equal((await call('list_classes')).total,2);
  assert.equal((await call('unload_apk',{},'delete')).unloaded,true);assert.equal((await adapter.call('mcp_aql_read','app_info',{})).success,false);
});
