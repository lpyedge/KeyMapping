#!/bin/bash
# PowerKeyRules Build Script for Linux/Mac
# Usage: ./build.sh [debug|release|clean]

BUILD_TYPE="${1:-debug}"

GRADLE_CMD=""
if [ -x "./gradlew" ]; then
    GRADLE_CMD="./gradlew"
elif command -v gradle >/dev/null 2>&1; then
    GRADLE_CMD="gradle"
else
    echo "Error: 找不到 ./gradlew 或 gradle。請先安裝 Gradle 或補齊 Gradle Wrapper。" >&2
    exit 1
fi

case "$BUILD_TYPE" in
    clean)
        echo "Cleaning build..."
        "$GRADLE_CMD" clean
        ;;
    debug)
        echo "Building Debug APK..."
        "$GRADLE_CMD" assembleDebug
        echo ""
        echo "Debug APK output: app/build/outputs/apk/debug/app-debug.apk"
        ;;
    release)
        echo "Building Release APK..."
        "$GRADLE_CMD" assembleRelease
        echo ""
        echo "Release APK output: app/build/outputs/apk/release/app-release.apk"
        ;;
    *)
        echo "Invalid build type: $BUILD_TYPE"
        echo "Usage: ./build.sh [debug|release|clean]"
        exit 1
        ;;
esac
