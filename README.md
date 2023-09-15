# Demo (deprecated)

This is the now deprecated demo project for `@yume-chan/adb` package. It won't be updated, but it still mostly reflects the current API.

## Build

```bash
pnpm install
pnpm recursive run build
```

## Generate static build that can be hosted on GitHub Pages

```bash
cd packages/demo
npx next export
```

## Features

-   File Management
    -   List
    -   Upload
    -   Download
    -   Delete
    -   Preview image files
-   Screen Capture
-   Terminal Emulator powered by [Tabby](https://github.com/Eugeny/tabby)
    -   Tabs and split panes
    -   Color themes
    -   Rich configuration
-   Toggle ADB over WiFi
-   Install APK
-   [Scrcpy](https://github.com/Genymobile/scrcpy) compatible client
    -   Screen mirroring
    -   Audio forwarding (Android >= 11)
    -   Recording
    -   Control device with mouse, touch and keyboard
-   Chrome Remote Debugging that supporting
    -   Google Chrome (stable, beta, dev, canary)
    -   Microsoft Edge (stable, beta, dev, canary)
    -   Opera (stable, beta)
    -   Vivaldi
-   Monitor and dump logcat messages
-   Power off and reboot to different modes

## Used open-source projects

-   [ADB](https://android.googlesource.com/platform/packages/modules/adb) from Google ([Apache License 2.0](./adb.NOTICE))
-   [Scrcpy](https://github.com/Genymobile/scrcpy) from Romain Vimont ([Apache License 2.0](https://github.com/Genymobile/scrcpy/blob/master/LICENSE))
-   [Tabby](https://github.com/Eugeny/tabby) from Eugeny ([MIT License](https://github.com/Eugeny/tabby/blob/master/LICENSE))
-   [webm-muxer](https://github.com/Vanilagy/webm-muxer) from Vanilagy ([MIT License](https://github.com/Vanilagy/webm-muxer/blob/main/LICENSE))
-   [web-streams-polyfill](https://github.com/MattiasBuelens/web-streams-polyfill) from Mattias Buelens ([MIT License](https://github.com/MattiasBuelens/web-streams-polyfill/blob/master/LICENSE))
