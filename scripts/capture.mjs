// SPDX-License-Identifier: AGPL-3.0-only
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve,join } from 'node:path';
import { mkdir,writeFile } from 'node:fs/promises';
const root=resolve(import.meta.dirname,'..'),out=join(root,'build/measurements');await mkdir(out,{recursive:true});
const java=process.env.JADX_JAVA??join(process.env.JAVA_HOME,'bin/java');
const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'packages/jadx-aql/dist/server.js'),'--java',java,'--jadx-jar',process.env.JADX_CLI_JAR??join(root,'.tools/jadx-1.5.6/lib/jadx-1.5.6-all.jar')],stderr:'pipe'});
const client=new Client({name:'footprint-measurement',version:'1'});
const save=async(name,data)=>writeFile(join(out,name+'.json'),JSON.stringify(data)+'\n');
const call=async(name,operation,params={})=>client.callTool({name,arguments:{operation,params}});
try{
  await client.connect(transport);await save('ts-tools-list',await client.listTools());
  const list=JSON.parse((await call('mcp_aql_read','introspect')).content[0].text).data;
  await save('ts-introspect',list);
  const details=[];for(const op of list.operations)details.push(JSON.parse((await call('mcp_aql_read','introspect',{name:op.name})).content[0].text).data.operation);
  await save('ts-operation-details',details);
  await call('mcp_aql_create','load_apk',{path:join(root,'build/fixture/small.apk')});
  await save('ts-summary-full',await call('mcp_aql_read','class_summary',{class_name:'fixture.Fixture'}));
  await save('ts-summary-projected',await call('mcp_aql_read','class_summary',{class_name:'fixture.Fixture',fields:['full_name','method_count']}));
}finally{await client.close();}
console.log('Captured real TypeScript MCP tool list, introspection and projected response.');
