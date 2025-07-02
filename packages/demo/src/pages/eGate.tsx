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
} from "../utils";

enum Stage {
    Downloading,
    Installing,
    Completed,
}

interface Progress {
    filename: string;
    stage: Stage;
    downloadedSize: number;
    totalSize: number;
    value: number | undefined;
}

class InstallPageState {
    installing = false;
    progress: Progress | undefined = undefined;
    log: string = "";
    options: Partial<PackageManagerInstallOptions> = {
        bypassLowTargetSdkBlock: false,
    };

    // URL to automatically download the APK
    apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";

    constructor() {
        makeAutoObservable(this, {
            progress: observable.ref,
            options: observable.deep,
        });
    }

    autoInstall = async () => {
        runInAction(() => {
            this.installing = true;
            this.log = "";
            // Initial progress with unknown total size (will update later)
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                downloadedSize: 0,
                totalSize: 0,
                value: 0,
            };
        });

        try {
            // Start downloading the APK
            const response = await fetch(this.apkUrl);
            if (!response.ok || !response.body) {
                throw new Error("Failed to download the APK.");
            }

            // Get total size from headers, fallback to 0 if unavailable
            const contentLength = response.headers.get("content-length");
            const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
            runInAction(() => {
                if (this.progress) {
                    this.progress.totalSize = totalSize;
                }
            });

            // File information object
            const fileInfo = {
                name: "app-general-release.apk",
                size: totalSize,
            };

            const pm = new PackageManager(GLOBAL_STATE.adb!);
            const start = Date.now();

            // Cast WrapConsumableStream to expected type to resolve type mismatch
            const consumableStream = new WrapConsumableStream() as unknown as ReadableWritablePair<
                ArrayBufferView<ArrayBufferLike> | undefined,
                Uint8Array<ArrayBufferLike>
            >;

            // Use the response body as the file stream with proper stream typing
            const installStream = response.body
                .pipeThrough(consumableStream)
                .pipeThrough(new ProgressStream(
                    action((downloaded: number) => {
                        if (downloaded < fileInfo.size) {
                            this.progress = {
                                filename: fileInfo.name,
                                stage: Stage.Downloading,
                                downloadedSize: downloaded,
                                totalSize: fileInfo.size,
                                value: fileInfo.size > 0 ? (downloaded / fileInfo.size) * 0.8 : undefined,
                            };
                        } else {
                            this.progress = {
                                filename: fileInfo.name,
                                stage: Stage.Installing,
                                downloadedSize: downloaded,
                                totalSize: fileInfo.size,
                                value: 0.8,
                            };
                        }
                    })
                );

            // Install the APK using the stream from the download
            const logStream = await pm.installStream(fileInfo.size, installStream, this.options);

            const elapsed = Date.now() - start;
            await logStream.pipeTo(new WritableStream({
                write: action((chunk: string) => {
                    this.log += chunk;
                }),
            }));

            const transferRate = fileInfo.size > 0
                ? (fileInfo.size / (elapsed / 1000) / 1024 / 1024).toFixed(2)
                : "unknown";
            runInAction(() => {
                this.log += `\nInstall finished in ${elapsed}ms at ${transferRate}MB/s.`;
                this.progress = {
                    filename: fileInfo.name,
                    stage: Stage.Completed,
                    downloadedSize: fileInfo.size,
                    totalSize: fileInfo.size,
                    value: 1,
                };
                this.installing = false;
            });
        } catch (error: any) {
            runInAction(() => {
                this.log += `\nError: ${error.message}`;
                this.installing = false;
            });
        }
    };
}

const state = new InstallPageState();

const Install: NextPage = () => {
    return (
        <Stack {...RouteStackProps} tokens={{ childrenGap: 16 }}>
            <Head>
                <title>Install APK - eGate</title>
            </Head>

            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 16 }}>
                <Checkbox
                    label="--bypass-low-target-sdk-block (Android 14)"
                    checked={state.options.bypassLowTargetSdkBlock}
                    onChange={(_, checked) => {
                        if (typeof checked === "boolean") {
                            runInAction(() => {
                                state.options.bypassLowTargetSdkBlock = checked;
                            });
                        }
                    }}
                />

                <PrimaryButton
                    disabled={!GLOBAL_STATE.adb || state.installing}
                    text="Download & Install APK"
                    onClick={state.autoInstall}
                />
            </Stack>

            {state.progress && (
                <ProgressIndicator
                    styles={{ root: { width: 300, marginTop: 16 } }}
                    label={state.progress.filename}
                    percentComplete={state.progress.value}
                    description={Stage[state.progress.stage]}
                />
            )}

            {state.log && (
                <pre style={{ marginTop: 16, backgroundColor: "#f4f4f4", padding: "8px" }}>
                    {state.log}
                </pre>
            )}
        </Stack>
    );
};

export default observer(Install);
