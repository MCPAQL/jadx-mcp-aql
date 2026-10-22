#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Compare npm tarballs from two clean offline TypeScript builds."""
import hashlib,json,pathlib,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
hashes=[]
with tempfile.TemporaryDirectory(prefix='jadx-npm-repro-') as temporary:
    for name in ['first','second']:
        target=pathlib.Path(temporary)/name
        shutil.copytree(ROOT,target,ignore=shutil.ignore_patterns('.git','.tools','.gradle','.kotlin','build','dist','node_modules'))
        for command in [['npm','ci','--offline','--ignore-scripts'],['npm','run','build']]:
            subprocess.run(command,cwd=target,check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
        out=target/'build/artifacts';out.mkdir(parents=True)
        metadata=json.loads(subprocess.check_output(['npm','pack','--workspace','@mcpaql/jadx-aql','--pack-destination',str(out),'--json'],cwd=target,text=True))
        archive=out/metadata[0]['filename']
        hashes.append(hashlib.sha256(archive.read_bytes()).hexdigest())
        if name=='first':
            (ROOT/'build').mkdir(exist_ok=True)
            shutil.copyfile(archive,ROOT/'build/npm-repro-reference.tgz')
if hashes[0]!=hashes[1]:raise SystemExit('npm reproducibility check failed: '+repr(hashes))
output=ROOT/'build/npm-reproducibility.json';output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({'sha256':hashes[0],'identical':True,'independent_source_paths':True,'clean_compilations':2,'offline_dependency_install':True},indent=2)+'\n')
print('Two clean npm builds match:',hashes[0])
