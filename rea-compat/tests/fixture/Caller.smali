# SPDX-License-Identifier: AGPL-3.0-only
.class public Lfixture/Caller;
.super Ljava/lang/Object;

.method public static run()I
    .registers 2
    const/4 v0, 0x2
    const/4 v1, 0x3
    invoke-static {v0, v1}, Lfixture/Fixture;->add(II)I
    move-result v0
    invoke-static {v0, v1}, Lfixture/Fixture;->add(II)I
    move-result v0
    return v0
.end method
