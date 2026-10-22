// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
const root=resolve(import.meta.dirname,'../../..');
const args=[join(root,'packages/jadx-aql/dist/server.js'),'--jadx-jar',process.env.JADX_CLI_JAR??join(root,'.tools/jadx-1.5.6/lib/jadx-1.5.6-all.jar'),'--java',process.env.JADX_JAVA??join(process.env.JAVA_HOME,'bin/java')];
test('real MCP SDK client initializes and uses the TypeScript stdio server',async()=>{
  const transport=new StdioClientTransport({command:process.execPath,args,stderr:'pipe'});let stderr='';transport.stderr?.on('data',chunk=>stderr+=chunk);
  const client=new Client({name:'contract-test',version:'1'});
  try{
    await client.connect(transport);assert.equal(client.getServerVersion().name,'jadx-aql');assert.equal((await client.listTools()).tools.length,5);
    const result=await client.callTool({name:'mcp_aql_read',arguments:{operation:'introspect',params:{query:'operations'}}});assert.equal(JSON.parse(result.content[0].text).success,true);
    const loaded=await client.callTool({name:'mcp_aql_create',arguments:{operation:'load_apk',params:{path:join(root,'build/fixture/small.apk')}}});assert.equal(JSON.parse(loaded.content[0].text).data.class_count,2);
    assert.equal(stderr,'');
  }finally{await client.close();}
});
test('stdin EOF produces a clean exit within five seconds',async()=>{
  const child=spawn(process.execPath,args,{stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();
  child.stdin.end();const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('EOF timeout'));},5000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});assert.equal(exit,0,stderr);
});
