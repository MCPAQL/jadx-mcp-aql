// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CLI_PIN } from './pin.js';

export interface CliOptions { jar: string; java?: string; timeoutMs: number; threads: number }
export async function verifyCli(jar: string): Promise<void> {
  const hash = createHash('sha256').update(await readFile(jar)).digest('hex');
  if (hash !== CLI_PIN.jar_sha256) throw new Error('Official jadx CLI JAR checksum mismatch');
}
/** Fixed command/flags; inputs never enter a shell or supply executable CLI flags. */
export async function runCli(options: CliOptions, root: string, input: string, format: 'java'|'json'): Promise<{ code: number; diagnostics: string }> {
  const out = join(root, format);
  await mkdir(out, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, JAVA_HOME: process.env.JAVA_HOME, LANG: 'C.UTF-8',
    HOME: root, TMPDIR: root, TMP: root, TEMP: root,
    JADX_CONFIG_DIR: join(root, 'config'), JADX_CACHE_DIR: join(root, 'cache'), JADX_TMP_DIR: join(root, 'tmp'),
  };
  const args = ['-Xmx1024m','-XX:ActiveProcessorCount=2',`-Duser.home=${root}`, '-cp', options.jar, 'jadx.cli.JadxCLI',
    '--config','none','--disable-plugins','jadx-script','--deobf-cfg-file-mode','ignore','--mappings-mode','ignore',
    '--log-level','quiet','--threads-count',String(options.threads),'--output-format',format,
    '--no-inline-methods','--no-inline-anonymous','--output-dir',out];
  if (format === 'json') args.push('--call-graph','json');
  args.push(input);
  return new Promise((resolve, reject) => {
    const child=spawn(options.java ?? 'java',args,{cwd:root,env,stdio:['ignore','pipe','pipe'],shell:false});
    const buffers: Buffer[]=[]; let bytes=0; let timedOut=false;
    const capture=(b: Buffer) => { const remaining=65536-bytes; if(remaining>0) { buffers.push(b.subarray(0,remaining)); bytes+=Math.min(b.length,remaining); } };
    child.stdout.on('data',capture);child.stderr.on('data',capture);
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},options.timeoutMs);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',code=>{clearTimeout(timer);if(timedOut) reject(new Error('jadx CLI timed out'));else resolve({code:code ?? -1,diagnostics:Buffer.concat(buffers).toString('utf8')});});
  });
}
export async function boundedFile(path: string, limit: number): Promise<Buffer> {
  const size=(await stat(path)).size;
  if(size>limit) throw new Error(`Cached file exceeds ${limit} bytes`);
  return readFile(path);
}
