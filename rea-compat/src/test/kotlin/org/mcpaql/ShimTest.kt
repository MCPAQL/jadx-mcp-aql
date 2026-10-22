// SPDX-License-Identifier: AGPL-3.0-only
package org.mcpaql
import com.atxx.jhmcp.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import kotlinx.coroutines.runBlocking
import java.io.File
class ShimTest {
    private val apk=File("../build/fixture/small.apk").absolutePath
    private fun session(config: SessionConfig=SessionConfig())=JadxSession(apk,config)
    @Test fun utf8BoundaryAndMarker() {
        assertEquals("",truncateToBytes(null,1));assertEquals("",truncateToBytes("abc",0));assertEquals("abc",truncateToBytes("abc",3))
        assertEquals("a\n\n... [truncated: exceeds 2 bytes, total 7 bytes]",truncateToBytes("aπ🙂",2))
        for(n in 1..6)assertFalse(truncateToBytes("aπ🙂",n).contains('\uFFFD'))
    }
    @Test fun versionsAndConfiguration(){assertEquals("0.7.1",BuildInfo.VERSION);assertEquals("0.1.0",AdapterBuildInfo.VERSION);for(alias in listOf("none","skip","no"))assertEquals(ResourceMode.NONE,ResourceMode.parse(alias));assertThrows(IllegalArgumentException::class.java){SessionConfig(threads=-1)}}
    @Test fun indexingAndManifest()=session().use { s ->
        assertEquals(listOf("fixture.Caller","fixture.Fixture"),s.classFqns);assertEquals(0,s.decompileCount.get())
        val info=s.appInfo();assertEquals("fixture.example",info["package"]);assertEquals("1.0",info["version_name"])
        assertEquals(listOf("android.permission.INTERNET","android.permission.CAMERA","android.permission.INTERNET"),info["permissions"])
        assertTrue(s.manifestSection("permissions").contains("uses-permission"))
    }
    @Test fun smartCodeAndSmali()=session().use { s ->
        val cls=s.classes[1]
        val body=s.getMethodBodySmart(cls.searchMethodByShortId("add(II)I")!!,1048576,true);assertEquals("java",body.kind);assertTrue(body.text.contains("return"))
        val broken=s.getMethodBodySmart(cls.searchMethodByShortId("broken()I")!!,1048576,true);assertEquals("smali",broken.kind);assertTrue(broken.fellBack)
        assertEquals("// method exists but has no decompiled body (native/abstract)",s.getMethodBodySmart(cls.searchMethodByShortId("nativeCall()I")!!,1048576,true).text)
        assertEquals(1,s.getMethodSmali(cls,"<clinit>").blocks.size);assertEquals(2,s.getMethodSmali(cls,"overloaded").blocks.size)
    }
    @Test fun timeoutIsErrorBody()=session(SessionConfig(decompileTimeoutMs=1)).use { s ->
        val m=s.classes[1].searchMethodByShortId("add(II)I")!!;assertTrue(s.getMethodBodySmart(m,1048576,true).text.startsWith("// ERROR:"))
    }
    @Test fun replaceAndUnload(): Unit=runBlocking {
        val h=SessionHolder(SessionConfig());try {h.load(apk,h.defaults);val old=h.current();h.load(apk,h.defaults);assertNotSame(old,h.current());assertTrue(h.unload());assertFalse(h.unload())}finally{h.unload()}
    }
    @Test fun filteredAndXapk(){session(SessionConfig(includePackages=listOf("fixture.Caller"),resourceMode=ResourceMode.NONE)).use{assertEquals(1,it.classes.size);assertEquals(0,it.resourceCount)};JadxSession(File("../build/fixture/small.xapk").absolutePath,SessionConfig()).use{assertEquals(2,it.classes.size)}}
}
