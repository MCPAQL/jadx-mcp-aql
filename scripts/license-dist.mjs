// SPDX-License-Identifier: AGPL-3.0-only
import { readdir,readFile,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const dir=resolve(import.meta.dirname,'../packages/jadx-aql/dist');
for(const name of await readdir(dir)){
  if(!name.endsWith('.js')&&!name.endsWith('.d.ts'))continue;
  const path=join(dir,name),source=await readFile(path,'utf8');
  if(!source.includes('SPDX-License-Identifier:'))await writeFile(path,'// SPDX-License-Identifier: AGPL-3.0-only\n'+source);
}
