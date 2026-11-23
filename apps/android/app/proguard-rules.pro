# Keep Kotlin coroutines & OkHttp reflection safe
-keepattributes Signature, InnerClasses, EnclosingMethod
-keep class com.foolmoon.mobile.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
