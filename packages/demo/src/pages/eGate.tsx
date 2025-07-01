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
    uploadedSize: number;
    totalSize: number;
    // If progress is unknown (e.g., no Content-Length header), value can be undefined for an indeterminate UI.
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

    install = async () => {
        const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";

        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                uploadedSize: 0,
                totalSize: 0,
                value: 0,
            };
            this.log = "";
        });

        const response = await fetch(apkUrl);
        if (!response.ok || !response.body) {
            runInAction(() => {
                this.log = "Failed to download APK.";
                this.installing = false;
            });
            return;
        }

        // Check if the response provides a content-length header.
        const totalSizeHeader = response.headers.get("content-length");
        const hasContentLength = totalSizeHeader !== null;
        let totalSize = hasContentLength ? parseInt(totalSizeHeader!, 10) : 0;
        // For tracking purposes, if no content-length provided, we leave totalSize as 0 and use an indeterminate UI.
        runInAction(() => {
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                uploadedSize: 0,
                totalSize: totalSize,
                // If we don't know totalSize, leave value as undefined to show indeterminate state.
                value: hasContentLength ? 0 : undefined,
            };
        });

        const reader = response.body.getReader();
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                receivedLength += value.length;
                runInAction(() => {
                    if (hasContentLength && totalSize > 0) {
                        // Use the first half (0 to 0.5) of progress for downloading.
                        this.progress = {
                            filename: "app-general-release.apk",
                            stage: Stage.Downloading,
                            uploadedSize: receivedLength,
                            totalSize,
                            value: Math.min((receivedLength / totalSize) * 0.5, 0.5),
                        };
                    } else {
                        // Without content-length, we keep an indeterminate progress indicator.
                        this.progress = {
                            filename: "app-general-release.apk",
                            stage: Stage.Downloading,
                            uploadedSize: receivedLength,
                            totalSize: 0,
                            value: undefined,
                        };
                    }
                });
            }
        }

        // Download complete – create the APK file.
        const blob = new Blob(chunks);
        const file = new File([blob], "app-general-release.apk", { type: blob.type });

        // Set progress to 50% (i.e., download completed) and move to installing stage.
        runInAction(() => {
            this.progress = {
                filename: file.name,
                stage: Stage.Installing,
                uploadedSize: file.size,
                totalSize: file.size,
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
                                // Use the second half (0.5 to 1) of progress for installation.
                                this.progress = {
                                    filename: file.name,
                                    stage: Stage.Installing,
                                    uploadedSize: uploaded,
                                    totalSize: file.size,
                                    value: 0.5 + (uploaded / file.size) * 0.5,
                                };
                            } else {
                                this.progress = {
                                    filename: file.name,
                                    stage: Stage.Completed,
                                    uploadedSize: uploaded,
                                    totalSize: file.size,
                                    value: 1,
                                };
                            }
                        })
                    )
                )
        );

        const elapsed = Date.now() - start;
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
                uploadedSize: file.size,
                totalSize: file.size,
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
