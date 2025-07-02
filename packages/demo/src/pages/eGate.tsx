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

    // Download the APK using our Next.js API proxy.
    // This proxy is hosted as part of the WADB project.
    downloadApk = async (apkUrl: string): Promise<File> => {
        // The proxy endpoint is under /api/proxy on our deployment.
        // Update the base URL accordingly using your deployed URL.
        const proxyBase = "https://jmtdi.github.io/WADB/api/proxy?url=";
        const targetUrl = proxyBase + encodeURIComponent(apkUrl);
        const response = await fetch(targetUrl, { method: "GET" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
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
                value: undefined, // indeterminate during download
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
                value: 0.5, // midway when download completes
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
