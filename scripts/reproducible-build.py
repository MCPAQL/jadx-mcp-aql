#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Clean builds in two distinct paths; compare the resulting release JAR bytes."""
import hashlib,json,os,pathlib,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
gradle=ROOT/'.tools/gradle-8.14.3/bin/gradle'
env=dict(os.environ,SOURCE_DATE_EPOCH=(ROOT/'.source-date-epoch').read_text().strip())
paths=[]
with tempfile.TemporaryDirectory(prefix='jadx-repro-') as temporary:
    for name in ['first','second']:
        target=pathlib.Path(temporary)/name
        # Only source and pinned build metadata; no caches or prior compiled output.
        shutil.copytree(ROOT,target,ignore=shutil.ignore_patterns('.git','.tools','.gradle','.kotlin','build','dist','node_modules'))
        subprocess.run([str(gradle),'--no-daemon','--offline',':rea-compat:fatJar'],cwd=target,env=env,check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        data=(target/'rea-compat/build/libs/rea-compat.jar').read_bytes();paths.append(hashlib.sha256(data).hexdigest())
if paths[0]!=paths[1]:raise SystemExit('JAR reproducibility check failed: '+repr(paths))
output=ROOT/'build/reproducibility.json';output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({'sha256':paths[0],'identical':True,'independent_source_paths':True,'clean_compilations':2,'source_date_epoch':env['SOURCE_DATE_EPOCH']},indent=2)+'\n')
print('Two clean builds match:',paths[0])
