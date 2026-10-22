#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Adapter, tools } from './adapter.js';
const args=process.argv.slice(2);let jar=process.env.JADX_CLI_JAR;let java=process.env.JADX_JAVA;
const allowedRoots:string[]=[];
for(let i=0;i<args.length;i++) {
  const flag=args[i],value=args[++i];
  if(!value||!['--jadx-jar','--java','--allow-root'].includes(flag!))throw new Error('Usage: jadx-aql --jadx-jar /path/to/jadx-1.5.6-all.jar [--java /path/to/java] [--allow-root /directory]');
  if(flag==='--jadx-jar')jar=value;else if(flag==='--java')java=value;else allowedRoots.push(value);
}
if(!jar)throw new Error('Set JADX_CLI_JAR or --jadx-jar to the checksum-pinned official release JAR');
const adapter=new Adapter({jar,java,...(allowedRoots.length?{allowedRoots}:{})});
const server=new Server({name:'jadx-aql',version:'0.1.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
  const args=request.params.arguments??{};
  const result=typeof args.operation==='string'&&(!args.params||(typeof args.params==='object'&&!Array.isArray(args.params)))?
    await adapter.call(request.params.name,args.operation,(args.params??{}) as Record<string,unknown>):{success:false,error:{code:'VALIDATION_INVALID_REQUEST',message:'Expected {operation:string,params?:object}'}};
  return {content:[{type:'text' as const,text:JSON.stringify(result)}],isError:!(result as {success:boolean}).success};
});
const transport=new StdioServerTransport();await server.connect(transport);
let closing:Promise<void>|undefined;
function close():Promise<void>{return closing??=(async()=>{await adapter.close();await server.close();})();}
process.stdin.on('end',()=>{void close();});
for(const signal of ['SIGINT','SIGTERM','SIGHUP'] as const)process.on(signal,()=>{void close().finally(()=>process.exit(0));});
