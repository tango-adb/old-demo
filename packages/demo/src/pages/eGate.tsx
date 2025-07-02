import {
    Checkbox,
    PrimaryButton,
    ProgressIndicator,
    Stack,
} from "@fluentui/react";
import {
    PackageManager,
    PackageManagerInstallOptions,
} from "@yume-chan/android-bin";
import { WrapConsumableStream, WritableStream } from "@yume-chan/stream-extra";
import { action, makeAutoObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import Head from "next/head";
import { GLOBAL_STATE } from "../state";
import {
    ProgressStream,
    RouteStackProps,
    createFileStream,
} from "../utils";

enum Stage {
    Downloading,
    Installing,
    Completed,
}

interface Progress {
    filename: string;
    stage: Stage;
    downloadedBytes: number;
    totalBytes: number;
    value: number | undefined;
}

class InstallPageState {
    installing = false;
    progress: Progress | undefined = undefined;
    log: string = "";
    options: Partial<PackageManagerInstallOptions> = {
        bypassLowTargetSdkBlock: false,
    };

    constructor() {
        makeAutoObservable(this, {
            progress: observable.ref,
            install: false,
            options: observable.deep,
        });
    }

    // Try multiple free CORS proxies.
    downloadApk = async (apkUrl: string): Promise<File> => {
        const proxies = [
            "https://thingproxy.freeboard.io/fetch/",
            "https://api.allorigins.hexocode.repl.co/get?disableCache=true&url="
        ];
        let lastError: any;
        for (const proxy of proxies) {
            try {
                // If using AllOrigins, we need to encode the target URL.
                const targetUrl = proxy.includes("allorigins")
                    ? proxy + encodeURIComponent(apkUrl)
                    : proxy + apkUrl;
                const response = await fetch(targetUrl, { method: "GET" });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                let blob: Blob;
                // For AllOrigins, the response comes as JSON with a "contents" property.
                if (proxy.includes("allorigins")) {
                    const data = await response.json();
                    // Convert the "contents" string to a Blob.
                    // Note: This may not work correctly for binary data. If possible, try to use a proxy that supports binary passthrough.
                    blob = new Blob([data.contents]);
                } else {
                    blob = await response.blob();
                }
                return new File([blob], "app-general-release.apk", { type: blob.type });
            } catch (err: any) {
                lastError = err;
                console.error(`Proxy ${proxy} failed with error:`, err);
            }
        }
        throw lastError;
    };

    install = async () => {
        const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";
        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                downloadedBytes: 0,
                totalBytes: 0,
                value: undefined, // indeterminate
            };
            this.log = "";
        });

        let file: File;
        try {
            file = await this.downloadApk(apkUrl);
        } catch (err: any) {
            runInAction(() => {
                this.log = "Download error: " + err.message;
                this.installing = false;
            });
            return;
        }

        runInAction(() => {
            this.progress = {
                filename: file.name,
                stage: Stage.Installing,
                downloadedBytes: file.size,
                totalBytes: file.size,
                value: 0.5,
            };
        });

        const pm = new PackageManager(GLOBAL_STATE.adb!);
        const start = Date.now();
        const logStream = await pm.installStream(
            file.size,
            createFileStream(file)
                .pipeThrough(new WrapConsumableStream())
                .pipeThrough(
                    new ProgressStream(
                        action((uploaded) => {
                            if (uploaded !== file.size) {
                                this.progress = {
                                    filename: file.name,
                                    stage: Stage.Installing,
                                    downloadedBytes: uploaded,
                                    totalBytes: file.size,
                                    value: 0.5 + (uploaded / file.size) * 0.5,
                                };
                            } else {
                                this.progress = {
                                    filename: file.name,
                                    stage: Stage.Completed,
                                    downloadedBytes: uploaded,
                                    totalBytes: file.size,
                                    value: 1,
                                };
                            }
                        })
                    )
                )
        );

        const elapsed = Date.now() - start;
        console.log("File size (bytes):", file.size);
        console.log("Elapsed time (ms):", elapsed);

        await logStream.pipeTo(
            new WritableStream({
                write: action((chunk) => {
                    this.log += chunk;
                }),
            })
        );

        const transferRate = (
            file.size / (elapsed / 1000) / 1024 / 1024
        ).toFixed(2);
        runInAction(() => {
            this.log += `\nInstall finished in ${elapsed}ms at ${transferRate}MB/s`;
            this.progress = {
                filename: file.name,
                stage: Stage.Completed,
                downloadedBytes: file.size,
                totalBytes: file.size,
                value: 1,
            };
            this.installing = false;
        });
    };
}

const state = new InstallPageState();

const Install: NextPage = () => {
    return (
        <Stack {...RouteStackProps}>
            <Head>
                <title>Install eGate APK - Tango</title>
            </Head>

            <Stack horizontal tokens={{ childrenGap: 10 }}>
                <Checkbox
                    label="--bypass-low-target-sdk-block (Android 14)"
                    checked={state.options.bypassLowTargetSdkBlock}
                    onChange={(_, checked) => {
                        if (checked === undefined) return;
                        runInAction(() => {
                            state.options.bypassLowTargetSdkBlock = checked;
                        });
                    }}
                />
            </Stack>

            <Stack horizontal tokens={{ childrenGap: 10, padding: 10 }}>
                <PrimaryButton
                    disabled={!GLOBAL_STATE.adb || state.installing}
                    text="Download & Install eGate"
                    onClick={state.install}
                />
            </Stack>

            <Stack tokens={{ childrenGap: 10, padding: 10 }}>
                {state.progress && (
                    <ProgressIndicator
                        styles={{ root: { width: 300 } }}
                        label={state.progress.filename}
                        percentComplete={state.progress.value}
                        description={Stage[state.progress.stage]}
                    />
                )}

                {state.log && <pre>{state.log}</pre>}
            </Stack>
        </Stack>
    );
};

export default observer(Install);
