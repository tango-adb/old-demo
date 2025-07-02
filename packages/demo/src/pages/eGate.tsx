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
            install: false,
            options: observable.deep,
        });
    }

    // Download the APK using our Next.js API proxy.
    downloadApk = async (apkUrl: string): Promise<File> => {
        const proxyBase = "https://jmtdi.github.io/WADB/api/proxy.js?url=";
        const targetUrl = proxyBase + encodeURIComponent(apkUrl);
        const response = await fetch(targetUrl, { method: "GET" });
        if (!response.ok) {
            throw new Error(`HTTP error while downloading APK! Status: ${response.status}`);
        }
        const blob = await response.blob();
        return new File([blob], "app-general-release.apk", { type: blob.type });
    };

    install = async () => {
        // Original APK URL from GitHub.
        const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";
        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                downloadedBytes: 0,
                totalBytes: 0,
                value: undefined,
            };
            this.log = "Starting APK download...\n";
        });

        let file: File;
        try {
            file = await this.downloadApk(apkUrl);
            runInAction(() => {
                this.log += `Download completed: ${file.name} (${file.size} bytes)\n`;
            });
        } catch (err: any) {
            runInAction(() => {
                this.log += "Download error: " + err.message + "\n";
                this.installing = false;
                this.progress = {
                    filename: "app-general-release.apk",
                    stage: Stage.Failed,
                    downloadedBytes: 0,
                    totalBytes: 0,
                    value: 0,
                };
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
        } catch (err: any) {
            runInAction(() => {
                this.log += "Installation failed to start: " + err.message + "\n";
                this.installing = false;
                this.progress = {
                    filename: file.name,
                    stage: Stage.Failed,
                    downloadedBytes: file.size,
                    totalBytes: file.size,
                    value: 0,
                };
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
                this.progress = {
                    filename: file.name,
                    stage: Stage.Failed,
                    downloadedBytes: file.size,
                    totalBytes: file.size,
                    value: 0,
                };
            });
            return;
        }

        const elapsed = Date.now() - start;
        const transferRate = (file.size / (elapsed / 1000) / 1024 / 1024).toFixed(2);
        runInAction(() => {
            this.log += `\nInstallation finished in ${elapsed}ms at ${transferRate}MB/s\n`;
            this.progress = {
                filename: file.name,
                stage: Stage.Completed,
                downloadedBytes: file.size,
                totalBytes: file.size,
                value: 1,
            };
            this.installing = false;
        });

        // Additional advice for troubleshooting.
        runInAction(() => {
            this.log += "\nIf the installation did not complete, please verify:\n" +
                "- Your device is properly connected via ADB\n" +
                "- The device screen is unlocked and on the installation prompt if required\n" +
                "- There are no permission issues blocking the installation\n";
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
