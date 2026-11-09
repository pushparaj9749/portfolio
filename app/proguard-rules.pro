# Models are persisted as JSON via org.json (no reflection), so default rules are enough.
# Keep enum valueOf/values used by the engine safe if R8 ever inlines them.
-keepclassmembers enum * { *; }
-dontwarn org.jetbrains.annotations.**
