#!/usr/bin/env python3
"""Drive the unmodified REA 6.5.0 Java source launcher and the standalone MCP face."""
import hashlib, json, os, pathlib, queue, subprocess, tempfile, threading, time, unittest, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
JAVA=str(pathlib.Path(os.environ['JAVA_HOME'])/'bin/java')
JAR=ROOT/'rea-compat/build/libs/rea-compat.jar'
APK=str(ROOT/'build/fixture/small.apk')
CAPTURE=ROOT/'build/measurements'
CAPTURE.mkdir(parents=True,exist_ok=True)

def compact(x): return json.dumps(x,separators=(',',':'),ensure_ascii=False)
class Client:
    def __init__(self,bridge=False,extra=()):
        self.tmp=tempfile.TemporaryDirectory(prefix='jadx-compat-test-')
        cmd=[JAVA,'-Xmx1g','-XX:ActiveProcessorCount=2']
        cmd+=['--class-path',str(JAR),str(ROOT/'rea-compat/tests/vendor/ReaJadxBridge.java')]
        self.p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=self.tmp.name)
        self.q=queue.Queue();self.stderr=bytearray();self.ident=0;self.max_frame=0
        def stdout():
            for line in self.p.stdout:
                self.max_frame=max(self.max_frame,len(line));self.q.put(line)
            self.q.put(None)
        def stderr():
            for chunk in iter(lambda:self.p.stderr.read(4096),b''): self.stderr.extend(chunk)
        self.reader=threading.Thread(target=stdout,daemon=True);self.err_reader=threading.Thread(target=stderr,daemon=True)
        self.reader.start();self.err_reader.start()
        start=time.monotonic()
        self.identity=self.request('initialize',{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'compatibility-tests','version':'1'}})
        self.initialize_seconds=time.monotonic()-start
        self.notify('notifications/initialized',{})
    def notify(self,method,params):
        self.p.stdin.write((compact({'jsonrpc':'2.0','method':method,'params':params})+'\n').encode());self.p.stdin.flush()
    def request(self,method,params):
        self.ident+=1;ident=self.ident
        self.p.stdin.write((compact({'jsonrpc':'2.0','id':ident,'method':method,'params':params})+'\n').encode());self.p.stdin.flush()
        while True:
            line=self.q.get(timeout=30)
            if line is None: raise AssertionError('server exited: '+self.stderr.decode(errors='replace'))
            response=json.loads(line)
            if response.get('id')==ident:
                if 'error' in response: raise AssertionError(response['error'])
                return response['result']
    def tool(self,name,args):
        result=self.request('tools/call',{'name':name,'arguments':args})
        assert len(result['content'])==1 and result['content'][0]['type']=='text',result
        return result
    def close(self):
        self.p.stdin.close();self.p.wait(timeout=5);self.reader.join(timeout=1);self.err_reader.join(timeout=1)
        assert self.p.returncode==0,(self.p.returncode,self.stderr.decode(errors='replace'))
        assert len(self.stderr)<65536,len(self.stderr)
        assert self.max_frame<8*1024*1024,self.max_frame
        self.p.stdout.close();self.p.stderr.close();self.tmp.cleanup()

def payload(r):
    assert not r.get('isError'),r
    text=r['content'][0]['text']
    try:return json.loads(text)
    except json.JSONDecodeError:return text

class ContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        javac=str(pathlib.Path(os.environ['JAVA_HOME'])/'bin/javac')
        out=ROOT/'rea-compat/build/bridge';out.mkdir(parents=True,exist_ok=True)
        subprocess.run([javac,'-cp',str(JAR),'-d',str(out),str(ROOT/'rea-compat/tests/vendor/ReaJadxBridge.java')],check=True,capture_output=True)
        cls.client=Client(True)
    @classmethod
    def tearDownClass(cls):
        c=cls.client;c.close()
        (CAPTURE/'rea-runtime.json').write_text(compact({'initialize_seconds':c.initialize_seconds,'stderr_bytes':len(c.stderr),'max_frame_bytes':c.max_frame})+'\n')
    def setUp(self):
        self.loaded=payload(self.client.tool('load_apk',{'path':APK,'threads':1,'resources':'full'}))
    def test_identity_inventory_schema(self):
        c=self.client;self.assertEqual(c.identity['serverInfo'],{'name':'rea-jadx-bridge','version':'1'});self.assertLess(c.initialize_seconds,30)
        status=payload(c.tool('rea_jvm_status',{}));self.assertEqual(status['engine_reported_version'],'0.7.1')
        tools=c.request('tools/list',{});self.assertEqual(len(tools['tools']),9)
        for t in tools['tools']:self.assertTrue(all(v is not None for v in t['inputSchema']['properties'].values()))
        by_name={t['name']:t for t in tools['tools']};self.assertEqual(by_name['get_xrefs_to_method']['inputSchema']['required'],['class_name','method_name'])
        provenance=json.loads((ROOT/'rea-compat/tests/vendor/provenance.json').read_text());self.assertEqual(hashlib.sha256((ROOT/'rea-compat/tests/vendor/ReaJadxBridge.java').read_bytes()).hexdigest(),provenance['bridge_sha256'])
        (CAPTURE/'rea-tools-list.json').write_text(compact(tools)+'\n')
        with zipfile.ZipFile(JAR) as z:
            for name in ['com/atxx/jhmcp/JadxSession.class','com/atxx/jhmcp/SessionHolder.class','jadx/api/JadxDecompiler.class','com/google/gson/Gson.class','io/modelcontextprotocol/kotlin/sdk/server/Server.class']:self.assertFalse(z.getinfo(name).flag_bits&1)
            self.assertLess(sum(46+len(i.filename.encode())+len(i.extra)+len(i.comment) for i in z.infolist()),8*1024*1024)
            self.assertFalse(any('/MainKt.class' in n or '/Operations.class' in n for n in z.namelist()))
            self.assertNotIn('Main-Class:',z.read('META-INF/MANIFEST.MF').decode())
    def test_load_replace_and_unknown_args(self):
        self.assertEqual(self.loaded['apk_path'],APK);self.assertEqual(self.loaded['threads'],1);self.assertEqual(self.loaded['resources'],'full')
        listed=payload(self.client.tool('list_classes',{'offset':0,'limit':4096,'unknown':True}));self.assertEqual(listed['total'],self.loaded['class_count'])
        error=self.client.tool('load_apk',{'path':'/missing.apk'});self.assertTrue(error['isError']);self.assertTrue(error['content'][0]['text'].startswith('load failed:'))
        payload(self.client.tool('load_apk',{'path':APK}));self.assertEqual(listed,payload(self.client.tool('list_classes',{'offset':0,'limit':4096})))
    def test_manifest_and_absent_fields(self):
        app=payload(self.client.tool('get_app_info',{}));self.assertEqual(len(app),6);self.assertEqual(app['package'],'fixture.example');self.assertEqual(len(app['permissions']),3)
        self.assertIn('<manifest',payload(self.client.tool('get_android_manifest',{})))
        payload(self.client.tool('load_apk',{'path':str(ROOT/'build/fixture/absent.apk')}));app=payload(self.client.tool('get_app_info',{}))
        for k in ['version_name','version_code','min_sdk','target_sdk']:self.assertEqual(app[k],'')
    def test_large_manifest_marker(self):
        payload(self.client.tool('load_apk',{'path':str(ROOT/'build/fixture/large-manifest.apk')}))
        self.assertRegex(payload(self.client.tool('get_android_manifest',{})),r'\n\n\.\.\. \[truncated: exceeds 1048576 bytes, total \d+ bytes\]$')
    def test_metadata_and_pages(self):
        s=payload(self.client.tool('get_class_summary',{'class_name':'fixture.Fixture'}))
        for count,items in [('method_count','methods'),('field_count','fields'),('inner_class_count','inner_classes')]:self.assertEqual(s[count],len(s[items]))
        first=payload(self.client.tool('list_classes',{'offset':0,'limit':1}));second=payload(self.client.tool('list_classes',{'offset':1,'limit':1}))
        self.assertEqual(first['items']+second['items'],['fixture.Caller','fixture.Fixture'])
    def test_bodies_and_overloads(self):
        for name,mode in [('add','java'),('nativeCall','java'),('broken','smali'),('<clinit>','smali'),('overloaded','java')]:
            result=payload(self.client.tool('get_method_body',{'class_name':'fixture.Fixture','method_name':name,'overload_index':0,'smali_fallback':True}));self.assertEqual(result['mode'],mode)
        error=self.client.tool('get_method_body',{'class_name':'fixture.Fixture','method_name':'overloaded','overload_index':9});self.assertEqual(json.loads(error['content'][0]['text'])['field'],'overload_index')
    def test_xrefs_and_direct_invokes(self):
        for tool in ['get_xrefs_to_class','get_xrefs_to_method']:
            result=payload(self.client.tool(tool,{'class_name':'fixture.Fixture','method_name':'add','overload_index':0,'limit':2147483647,'resolve_line':False}))
            self.assertEqual(result['count'],result['total']);self.assertEqual(result['count'],len(result['items']))
            for item in result['items']:
                self.assertNotIn('line',item);self.assertTrue(set(['kind','name','full_name','containing_class','top_class','def_pos']).issubset(item))
                if tool.endswith('method'):self.assertEqual(len(item['direct_invokes']),2)

if __name__=='__main__':unittest.main(verbosity=2)
