# Demo (deprecated)

This is the now deprecated demo project for `@yume-chan/adb` package. It won't be updated, but it still mostly reflects the current API.

## Build

```sh
pnpm install
pnpm recursive run build
```

## Generate static build that can be hosted on GitHub Pages

The demo is built with [Next.js](https://nextjs.org/), a full-stack React framework, which usually requires a Node.js environment to run.

However, since the demo doesn't have any server-side code, the most simple deployment method is to use the [Static HTML Export](https://nextjs.org/docs/advanced-features/static-html-export) feature of Next.js. It generates pre-rendered, fully static HTML files, that can be deployed to any static website hosting services (e.g. GitHub Pages).

To export static deployable HTML files, after running `rush build` command, run:

```sh
cd packages/demo
npx next export
```

This will create an `out` folder containing exported HTML files and all required resource files.

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
