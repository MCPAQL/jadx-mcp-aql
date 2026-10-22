#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Assemble our own smali; encode our XML as Android binary XML; never execute APK."""
import os, pathlib, struct, subprocess, zipfile, xml.etree.ElementTree as ET
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'build/fixture'
OUT.mkdir(parents=True, exist_ok=True)
java = str(pathlib.Path(os.environ['JAVA_HOME']) / 'bin/java')
jar = os.environ['FIXTURE_CLASSPATH']
subprocess.run([java, '-cp', str(jar), str(ROOT/'rea-compat/tests/fixture/FixtureAssembler.java'), str(ROOT/'rea-compat/tests/fixture'), str(OUT/'classes.dex')], check=True)

def binary_xml(xml):
    root = ET.fromstring(xml)
    strings = ['android', 'http://schemas.android.com/apk/res/android']
    def intern(s):
        if s not in strings: strings.append(s)
        return strings.index(s)
    def parts(s):
        if s.startswith('{'):
            ns, name = s[1:].split('}'); return intern(ns), intern(name)
        return 0xffffffff, intern(s)
    def gather(e):
        parts(e.tag)
        for k,v in e.attrib.items(): parts(k); intern(v)
        for c in e: gather(c)
    gather(root)
    def length(n):
        return bytes([n]) if n < 128 else bytes([0x80 | (n>>8), n&255])
    data = bytearray(); offsets = []
    for s in strings:
        offsets.append(len(data)); b=s.encode('utf-8'); data.extend(length(len(s.encode('utf-16le'))//2)+length(len(b))+b+b'\0')
    while len(data)%4: data.append(0)
    pool = struct.pack('<HHI5I',1,28,28+4*len(strings)+len(data),len(strings),0,0x100,28+4*len(strings),0)+struct.pack('<'+'I'*len(offsets),*offsets)+data
    def chunk(typ, body):
        return struct.pack('<HHIII',typ,16,16+len(body),1,0xffffffff)+body
    ns = chunk(0x100,struct.pack('<II',0,1))
    def encode(e):
        namespace,name = parts(e.tag)
        attrs=b''
        for k,v in e.attrib.items():
            a_ns,a_name=parts(k); value=intern(v)
            attrs += struct.pack('<IIIHBBI',a_ns,a_name,value,8,0,3,value)
        result=chunk(0x102,struct.pack('<II6H',namespace,name,20,20,len(e.attrib),0,0,0)+attrs)
        result+=b''.join(encode(c) for c in e)
        return result+chunk(0x103,struct.pack('<II',namespace,name))
    body=pool+ns+encode(root)+chunk(0x101,struct.pack('<II',0,1))
    return struct.pack('<HHI',3,8,8+len(body))+body

manifest=(ROOT/'rea-compat/tests/fixture/AndroidManifest.xml').read_text()
def write_apk(name, xml):
    with zipfile.ZipFile(OUT/name,'w',compression=zipfile.ZIP_DEFLATED) as z:
        entries={'classes.dex':(OUT/'classes.dex').read_bytes(),'AndroidManifest.xml':binary_xml(xml),'res/values/strings.xml':(ROOT/'rea-compat/tests/fixture/res/values/strings.xml').read_bytes(),'assets/bytes.bin':bytes(range(256))}
        for path,data in sorted(entries.items()):
            info=zipfile.ZipInfo(path,(2020,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,data)
write_apk('small.apk',manifest)
write_apk('absent.apk','<manifest package="fixture.absent"><application/></manifest>')
# More than 1 MiB of decoded XML, to exercise REA's exact truncation regexp.
large=manifest.replace('<application ', '<application ' + ' '.join('fixturePadding%d="%s"' % (i, 'a'*30000) for i in range(40)) + ' ')
write_apk('large-manifest.apk',large)
with zipfile.ZipFile(OUT/'small.xapk','w') as z:
    z.writestr('manifest.json','{"package_name":"fixture.example","split_apks":[{"file":"base.apk","id":"base"}]}')
    z.write(OUT/'small.apk','base.apk')
print('Built small.apk, absent.apk, large-manifest.apk and small.xapk from repository fixture source.')
