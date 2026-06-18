# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified in the
# Android SDK tools/proguard/proguard-android.txt file.

# Keep Retrofit interfaces
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation

# Keep Gson model classes
-keepclassmembers,allowobfuscation class * {
  @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.callops.app.data.model.** { *; }

# OkHttp / Okio
-dontwarn okhttp3.**
-dontwarn okio.**

# Credential Manager
-keep class androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
