// SPDX-License-Identifier: AGPL-3.0-only
import { SaxesParser } from 'saxes';
export function parseManifest(xml: string) {
  const app={package:'',version_name:'',version_code:'',min_sdk:'',target_sdk:'',permissions:[] as string[]};
  let activity: {raw:string;main:boolean;launcher:boolean}|undefined;
  let filter: {main:boolean;launcher:boolean}|undefined;
  let main='';const seen=new Set<string>();
  const parser=new SaxesParser({xmlns:false});
  parser.on('doctype',()=>{throw new Error('DOCTYPE is not allowed');});
  parser.on('opentag',tag=>{
    const a=tag.attributes as Record<string,string>;
    if(tag.name==='manifest') app.package=a.package ?? '';
    const attrs={versionName:'version_name',versionCode:'version_code',minSdkVersion:'min_sdk',targetSdkVersion:'target_sdk'} as const;
    for(const [key,value] of Object.entries(attrs)) if(a[`android:${key}`]!==undefined&&!seen.has(key)) {app[value]=a[`android:${key}`]!;seen.add(key);}
    if(tag.name==='uses-permission')app.permissions.push(a['android:name'] ?? '');
    if(tag.name==='activity'||tag.name==='activity-alias')activity={raw:a[tag.name==='activity'?'android:name':'android:targetActivity'] ?? '',main:false,launcher:false};
    if(tag.name==='intent-filter'&&activity)filter={main:false,launcher:false};
    if(filter&&tag.name==='action'&&a['android:name']==='android.intent.action.MAIN')filter.main=true;
    if(filter&&tag.name==='category'&&a['android:name']==='android.intent.category.LAUNCHER')filter.launcher=true;
  });
  parser.on('closetag',tag=>{
    if(tag.name==='intent-filter'&&activity&&filter) {if(filter.main&&filter.launcher&&!main)main=activity.raw;filter=undefined;}
    if(tag.name==='activity'||tag.name==='activity-alias')activity=undefined;
  });
  parser.write(xml).close();
  return {app,main:{class:main.startsWith('.')?app.package+main:main&&!main.includes('.')?app.package+'.'+main:main,raw:main,package:app.package}};
}
