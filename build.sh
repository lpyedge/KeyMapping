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

# Download Xposed API if not exists
if [ ! -f "app/libs/api-82.jar" ]; then
    echo "Downloading Xposed API..."
    mkdir -p app/libs
    curl -L -o app/libs/api-82.jar "https://jcenter.bintray.com/de/robv/android/xposed/api/82/api-82.jar" || \
    curl -L -o app/libs/api-82.jar "https://repo1.maven.org/maven2/de/robv/android/xposed/api/82/api-82.jar"
    if [ ! -f "app/libs/api-82.jar" ] || [ ! -s "app/libs/api-82.jar" ]; then
        echo "Error: Failed to download Xposed API" >&2
        exit 1
    fi
    echo "Xposed API downloaded successfully"
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
