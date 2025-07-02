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
    Failed,
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
            options: observable.deep,
        });
    }

    // Download the APK using our updated proxy API.
    downloadApk = async (): Promise<File> => {
        // Use our proxy endpoint. Since our proxy has a default URL if none is provided, no query parameter is needed.
        const proxyUrl = "/api/proxy";
        const response = await fetch(proxyUrl, { method: "GET" });
        if (!response.ok) {
            throw new Error(`HTTP error while downloading APK! Status: ${response.status}`);
        }
        // Get the total bytes from the header if provided
        const contentLengthStr = response.headers.get("content-length");
        const totalBytes = contentLengthStr ? parseInt(contentLengthStr) : 0;
        runInAction(() => {
            if (this.progress) {
                this.progress.totalBytes = totalBytes;
            }
        });
        console.log("Total expected bytes:", totalBytes);
        this.log += `Total expected bytes: ${totalBytes}\n`;

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error("ReadableStream not supported in this browser.");
        }
        const chunks: Uint8Array[] = [];
        let received = 0;
        let chunkCount = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                received += value.length;
                chunkCount++;
                console.log(`Chunk ${chunkCount} received: ${value.length} bytes (Total: ${received} bytes)`);
                runInAction(() => {
                    if (this.progress) {
                        this.progress.downloadedBytes = received;
                        this.progress.value = totalBytes ? (received / totalBytes) * 0.5 : undefined;
                    }
                    this.log += `Chunk ${chunkCount} received: ${value.length} bytes, total: ${received} bytes\n`;
                });
            }
        }
        console.log("Download complete, total bytes received:", received);
        runInAction(() => {
            this.log += `Download complete, total bytes received: ${received}\n`;
        });
        const blob = new Blob(chunks);
        return new File([blob], "app-general-release.apk", { type: blob.type });
    };

    install = async () => {
        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                downloadedBytes: 0,
                totalBytes: 0,
                value: 0,
            };
            this.log = "Starting APK download via proxy...\n";
        });

        let file: File;
        try {
            file = await this.downloadApk();
            runInAction(() => {
                this.log += `Download completed: ${file.name} (${file.size} bytes)\n`;
            });
        } catch (err: any) {
            runInAction(() => {
                this.log += "Download error: " + err.message + "\n";
                this.installing = false;
                if (this.progress) this.progress.stage = Stage.Failed;
            });
            return;
        }

        runInAction(() => {
            if (this.progress) {
                this.progress.stage = Stage.Installing;
                this.progress.downloadedBytes = file.size;
                this.progress.totalBytes = file.size;
                // Mark halfway point as download is complete.
                this.progress.value = 0.5;
            }
            this.log += "Starting installation on device...\n";
        });

        const pm = new PackageManager(GLOBAL_STATE.adb!);
        const start = Date.now();
        let logStream;
        try {
            logStream = await pm.installStream(
                file.size,
                createFileStream(file)
                    .pipeThrough(new WrapConsumableStream())
                    .pipeThrough(
                        new ProgressStream(
                            action((uploaded) => {
                                if (uploaded !== file.size) {
                                    runInAction(() => {
                                        if (this.progress) {
                                            this.progress.stage = Stage.Installing;
                                            this.progress.downloadedBytes = uploaded;
                                            // Second half of the progress indicator.
                                            this.progress.value = 0.5 + (uploaded / file.size) * 0.5;
                                        }
                                    });
                                } else {
                                    runInAction(() => {
                                        if (this.progress) {
                                            this.progress.stage = Stage.Completed;
                                            this.progress.downloadedBytes = uploaded;
                                            this.progress.value = 1;
                                        }
                                    });
                                }
                            })
                        )
                    )
            );
        } catch (err: any) {
            runInAction(() => {
                this.log += "Installation failed to start: " + err.message + "\n";
                this.installing = false;
                if (this.progress) this.progress.stage = Stage.Failed;
            });
            return;
        }

        try {
            await logStream.pipeTo(
                new WritableStream({
                    write: action((chunk) => {
                        this.log += chunk;
                    }),
                })
            );
        } catch (err: any) {
            runInAction(() => {
                this.log += "Error during installation streaming: " + err.message + "\n";
                if (this.progress) this.progress.stage = Stage.Failed;
            });
            return;
        }

        const elapsed = Date.now() - start;
        const transferRate = (file.size / (elapsed / 1000) / 1024 / 1024).toFixed(2);
        runInAction(() => {
            this.log += `\nInstallation finished in ${elapsed}ms at ${transferRate}MB/s\n`;
            if (this.progress) {
                this.progress.stage = Stage.Completed;
                this.progress.downloadedBytes = file.size;
                this.progress.value = 1;
            }
            this.installing = false;
        });

        runInAction(() => {
            this.log += "\nIf the installation did not complete, please verify:\n" +
                "- Your device is properly connected via WebUSB and USB debugging is enabled.\n" +
                "- The device screen is unlocked, and you have granted any necessary permissions.\n" +
                "- There are no permission issues blocking the installation.\n";
        });
    };
}

const state = new InstallPageState();

const Install: NextPage = () => {
    return (
        <Stack {...RouteStackProps}>
            <Head>
                <title>Install eGate APK - WADB</title>
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
