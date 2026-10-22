# SPDX-License-Identifier: AGPL-3.0-only
.class public Lfixture/Fixture$Inner;
.super Ljava/lang/Object;
.annotation system Ldalvik/annotation/EnclosingClass;
    value = Lfixture/Fixture;
.end annotation
.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x9
    name = "Inner"
.end annotation
.method public static ping()I
    .registers 1
    const/4 v0, 0x1
    return v0
.end method

.method static constructor <clinit>()V
    .registers 0
    return-void
.end method
