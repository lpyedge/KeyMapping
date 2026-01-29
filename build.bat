@echo off
REM PowerKeyRules Build Script for Windows
REM Usage: build.bat [debug|release|clean]

setlocal

set BUILD_TYPE=%1

if "%BUILD_TYPE%"=="" (
    set BUILD_TYPE=debug
)

REM Download Xposed API if not exists
if not exist app\libs\api-82.jar (
    echo Downloading Xposed API...
    if not exist app\libs mkdir app\libs
    powershell -Command "Invoke-WebRequest -Uri 'https://api.xposed.info/downloads/XposedBridgeApi-82.jar' -OutFile 'app\libs\api-82.jar'"
    if errorlevel 1 (
        echo Failed to download Xposed API
        exit /b 1
    )
    echo Xposed API downloaded successfully
)

if /i "%BUILD_TYPE%"=="clean" (
    echo Cleaning build...
    if exist gradlew.bat (
        call gradlew.bat clean
    ) else (
        call gradle clean
    )
    goto :end
)

if /i "%BUILD_TYPE%"=="debug" (
    echo Building Debug APK...
    if exist gradlew.bat (
        call gradlew.bat assembleDebug
    ) else (
        call gradle assembleDebug
    )
    echo.
    echo Debug APK output: app\build\outputs\apk\debug\app-debug.apk
    goto :end
)

if /i "%BUILD_TYPE%"=="release" (
    echo Building Release APK...
    if exist gradlew.bat (
        call gradlew.bat assembleRelease
    ) else (
        call gradle assembleRelease
    )
    echo.
    echo Release APK output: app\build\outputs\apk\release\app-release.apk
    goto :end
)

echo Invalid build type: %BUILD_TYPE%
echo Usage: build.bat [debug^|release^|clean]
exit /b 1

:end
endlocal
