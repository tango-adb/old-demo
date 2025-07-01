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

        // Try to obtain the total size from headers
        const totalSizeHeader = response.headers.get("content-length");
        let totalSize = totalSizeHeader ? parseInt(totalSizeHeader, 10) : 0;
        if (!totalSize) {
            // Fallback to a dummy totalSize if header is missing
            totalSize = 1;
        }
        runInAction(() => {
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                uploadedSize: 0,
                totalSize,
                value: 0,
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
                    // When using content-length header, use actual ratio,
                    // otherwise, simulate progress increment.
                    if (totalSizeHeader) {
                        this.progress = {
                            filename: "app-general-release.apk",
                            stage: Stage.Downloading,
                            uploadedSize: receivedLength,
                            totalSize,
                            value: (receivedLength / totalSize) * 0.5,
                        };
                    } else {
                        // Fallback: increment progress gradually up to 0.5
                        this.progress = {
                            filename: "app-general-release.apk",
                            stage: Stage.Downloading,
                            uploadedSize: receivedLength,
                            totalSize,
                            value: Math.min(0.5, (this.progress?.value || 0) + 0.05),
                        };
                    }
                });
            }
        }
        const blob = new Blob(chunks);
        const file = new File([blob], "app-general-release.apk", { type: blob.type });

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

            {state.progress && (
                <ProgressIndicator
                    styles={{ root: { width: 300, marginTop: 10 } }}
                    label={state.progress.filename}
                    percentComplete={state.progress.value}
                    description={Stage[state.progress.stage]}
                />
            )}

            {state.log && <pre>{state.log}</pre>}
        </Stack>
    );
};

export default observer(Install);
