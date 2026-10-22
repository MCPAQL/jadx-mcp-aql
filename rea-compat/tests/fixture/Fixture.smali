# SPDX-License-Identifier: AGPL-3.0-only
.class public Lfixture/Fixture;
.super Ljava/lang/Object;

.field public static value:I
.field public name:Ljava/lang/String;

.method static constructor <clinit>()V
    .registers 1
    const/4 v0, 0x7
    sput v0, Lfixture/Fixture;->value:I
    return-void
.end method

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    return-void
.end method

.method public static add(II)I
    .registers 3
    add-int v0, p0, p1
    return v0
.end method

.method public static greet()Ljava/lang/String;
    .registers 1
    const-string v0, "hello example π"
    return-object v0
.end method

.method public static overloaded()I
    .registers 1
    const/4 v0, 0x1
    return v0
.end method

.method public static overloaded(I)I
    .registers 1
    return p0
.end method

.method public static native nativeCall()I
.end method

# Deliberately malformed DEX: reads a register outside the declared register set.
# This is an analysis fixture, never executed on Android.
.method public static broken()I
    .registers 0
    return v0
.end method
