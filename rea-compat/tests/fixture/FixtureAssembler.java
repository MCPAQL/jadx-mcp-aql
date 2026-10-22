// SPDX-License-Identifier: AGPL-3.0-only
import com.android.tools.smali.smali.Smali;
import com.android.tools.smali.smali.SmaliOptions;
class FixtureAssembler {
    public static void main(String[] args) throws Exception {
        SmaliOptions options = new SmaliOptions();
        options.outputDexFile = args[1];
        options.apiLevel = 28;
        options.jobs = 1;
        if (!Smali.assemble(options, args[0])) throw new IllegalStateException("fixture assembly failed");
    }
}
