#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Explicit build-time downloads only. Runtime servers never invoke this script."""
import argparse, hashlib, json, pathlib, platform, tarfile, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
TOOLS=ROOT/'.tools';TOOLS.mkdir(exist_ok=True)
PIN=json.loads((ROOT/'toolchain.lock.json').read_text())
p=argparse.ArgumentParser();p.add_argument('--jdk',action='store_true');p.add_argument('--jadx',action='store_true');p.add_argument('--gradle',action='store_true');args=p.parse_args()
if not any(vars(args).values()): args.jdk=args.jadx=args.gradle=True

def download(url,sha,name):
    file=TOOLS/name
    if not file.exists():
        print('Downloading',url)
        with urllib.request.urlopen(url,timeout=60) as source,file.open('wb') as target:
            while True:
                chunk=source.read(1024*1024)
                if not chunk:break
                target.write(chunk)
    actual=hashlib.sha256(file.read_bytes()).hexdigest()
    if actual!=sha:raise SystemExit('Checksum mismatch: '+name)
    return file

def extract_tar(archive,target):
    target.mkdir(exist_ok=True)
    with tarfile.open(archive) as tar:
        # Downloads are pinned, and extraction still rejects escaping entries.
        for member in tar.getmembers():
            if not (target/member.name).resolve().is_relative_to(target.resolve()):raise ValueError('Unsafe archive path')
        tar.extractall(target)

if args.jdk:
    system='macos-aarch64' if platform.system()=='Darwin' and platform.machine()=='arm64' else 'linux-x64' if platform.system()=='Linux' and platform.machine()=='x86_64' else None
    if system is None:raise SystemExit('Pinned toolchain supports Linux x64 and macOS arm64')
    pin=PIN['jdk'][system];archive=download(pin['url'],pin['sha256'],'jdk-'+system+'.tar.gz')
    target=TOOLS/'jdk-pinned';extract_tar(archive,target)
    jdk=next(target.iterdir());home=jdk/'Contents/Home' if platform.system()=='Darwin' else jdk
    # The shell file is private build output; never distributed.
    (TOOLS/'env.sh').write_text("export JAVA_HOME='"+str(home)+"'\nexport PATH=\"$JAVA_HOME/bin:$PATH\"\n")
    print('JDK:',home)
if args.gradle:
    pin=PIN['gradle'];archive=download(pin['url'],pin['sha256'],'gradle.zip')
    with zipfile.ZipFile(archive) as z:z.extractall(TOOLS)
    (TOOLS/('gradle-'+pin['version'])/'bin/gradle').chmod(0o755)
if args.jadx:
    pin=PIN['jadx'];archive=download(pin['url'],pin['sha256'],'jadx-'+pin['version']+'.zip')
    with zipfile.ZipFile(archive) as z:z.extractall(TOOLS/('jadx-'+pin['version']))
    print('CLI JAR:',TOOLS/('jadx-'+pin['version'])/'lib'/('jadx-'+pin['version']+'-all.jar'))
