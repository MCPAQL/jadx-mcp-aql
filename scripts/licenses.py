#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Build-time licence inventory from resolved Maven POMs and installed npm metadata."""
import csv,hashlib,json,pathlib,re,urllib.request,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'docs';OUT.mkdir(exist_ok=True)
CACHE=ROOT/'build/license-metadata';CACHE.mkdir(parents=True,exist_ok=True)
NS={'m':'http://maven.apache.org/POM/4.0.0'}
rows=[]

def pom(group,name,version):
    paths=list((pathlib.Path.home()/'.gradle/caches/modules-2/files-2.1'/group/name/version).glob('*/*.pom'))
    if paths:return paths[0]
    path=CACHE/(group+'-'+name+'-'+version+'.pom')
    if not path.exists():
        base='https://dl.google.com/dl/android/maven2/' if group.startswith('com.android.tools') else 'https://repo.maven.apache.org/maven2/'
        urllib.request.urlretrieve(base+group.replace('.','/')+'/'+name+'/'+version+'/'+name+'-'+version+'.pom',path)
    return path

def licenses(coordinate,seen=None):
    seen=set() if seen is None else seen
    if coordinate in seen:raise ValueError('POM parent cycle')
    seen.add(coordinate);g,n,v=coordinate.split(':');p=pom(g,n,v);root=ET.parse(p).getroot()
    found=[{'name':x.findtext('m:name','',NS),'url':x.findtext('m:url','',NS)} for x in root.findall('m:licenses/m:license',NS)]
    if found:return found
    parent=root.find('m:parent',NS)
    if parent is not None:
        props={x.tag.split('}')[-1]:x.text for x in root.findall('m:properties/*',NS)}
        values=[parent.findtext('m:'+key,'',NS) for key in ['groupId','artifactId','version']]
        values=[re.sub(r'\$\{([^}]+)\}',lambda m:props.get(m[1],m[0]),x) for x in values]
        return licenses(':'.join(values),seen)
    overrides={
        'antlr:antlr:2.7.7':[{'name':'ANTLR-PD AND BSD-3-Clause (Python code generator included in the JAR)','url':'https://www.antlr2.org/license.html'}],
        'javax.inject:javax.inject:1':[{'name':'Apache-2.0','url':'https://github.com/javax-inject/javax-inject/blob/master/LICENSE'}],
    }
    if coordinate in overrides:return overrides[coordinate]
    raise ValueError('No licence metadata for '+coordinate)

for inventory in ['jvm-dependencies.tsv','cli-dependencies.tsv']:
    with (ROOT/'build'/inventory).open() as stream:
        for row in csv.DictReader(stream,delimiter='\t'):
            found=licenses(row['coordinate'])
            rows.append({'ecosystem':'maven','coordinate':row['coordinate'],'scope':row['scope'],'sha256':row['sha256'],'licenses':found})
lock=json.loads((ROOT/'package-lock.json').read_text())
for name,entry in lock['packages'].items():
    if 'node_modules/' not in name or entry.get('link'):continue
    path=ROOT/name/'package.json';package=json.loads(path.read_text())
    license=package.get('license')
    if not license:raise ValueError('No npm licence: '+name)
    rows.append({'ecosystem':'npm','coordinate':package['name']+'@'+package['version'],'scope':'development' if entry.get('dev') else 'runtime','integrity':entry.get('integrity'),'licenses':[{'name':license,'url':package.get('homepage','')} ]})
rows.append({'ecosystem':'tool','coordinate':'tiktoken@0.12.0','scope':'optional measurement','licenses':[{'name':'MIT','url':'https://github.com/openai/tiktoken/blob/main/LICENSE'}]})
rows.sort(key=lambda r:(r['ecosystem'],r['coordinate'],r['scope']))
(OUT/'dependencies.json').write_text(json.dumps(rows,indent=2)+'\n')
text='''JADX AQL
SPDX-License-Identifier: AGPL-3.0-only
Copyright 2026 MCPAQL contributors

Original adapter and compatibility-shim code is licensed AGPL-3.0-only.
Third-party components retain their own licences. This file is an attribution
inventory; it does not relicense third-party code.

JADX: https://github.com/skylot/jadx — Apache License 2.0.
The TypeScript adapter runs the unmodified official JADX 1.5.6 CLI release.
The REA shim bundles jadx-core 1.5.6 and the listed runtime dependencies.
The official cross-platform CLI distribution also contains GUI libraries;
those components are listed as official-cli-bundle below and are not copied
into the shim or npm package.

The unmodified REA test bridge is from rea-agents 6.5.0, MIT; its licence and
source provenance are retained in rea-compat/tests/vendor. Gradle wrapper files
are Apache-2.0. Node.js is MIT. Gradle is Apache-2.0. The pinned Eclipse Temurin
JDK is GPL-2.0-only WITH Classpath-exception-2.0 (not bundled in releases).

Every resolved application, development/test and upstream-bundle dependency:

Component | Scope | Licence(s) declared by its publisher
'''
for row in rows:
    text+=row['coordinate']+' | '+row['scope']+' | '+'; '.join(x['name']+((' ('+x['url']+')') if x['url'] else '') for x in row['licenses'])+'\n'
text+='\nHashes and source licence metadata are recorded in docs/dependencies.json,\npackage-lock.json, and gradle/verification-metadata.xml. Dependency JAR legal\nnotices are retained under META-INF/dependency-notices in the shim JAR.\n'
text+='''
Interoperability attribution
===========================
jadx-headless-mcp v0.7.1 (https://github.com/1013503897/jadx-headless-mcp)
Copyright the jadx-headless-mcp authors. Licensed under Apache-2.0; the
unmodified licence is retained in third-party/jadx-headless-mcp-0.7.1/LICENSE.

The com.atxx.jhmcp package, compatibility version 0.7.1, file names and API
identifiers reimplement the public jadx-headless-mcp interface so REA 6.5.0
can interoperate. The truncation message is byte-identical because REA parses
that output format. This is an independent interface implementation; no
upstream implementation code is included. Attribution does not change the
AGPL-3.0-only licence of this project's original code.

JADX 1.5.6 upstream NOTICE (reproduced verbatim)
=============================================
'''
text+=(ROOT/'third-party/jadx-1.5.6/NOTICE').read_text()
(ROOT/'NOTICE').write_text(text)
for name in ['LICENSE','NOTICE']:(ROOT/'packages/jadx-aql'/name).write_bytes((ROOT/name).read_bytes())
print('Recorded',len(rows),'dependency components with publisher-declared licences.')
