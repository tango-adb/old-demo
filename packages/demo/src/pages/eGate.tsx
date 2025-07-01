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

        // Initialize download progress with unknown total size (will be updated after download)
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

        // Download the APK automatically
        const response = await fetch(apkUrl);
        if (!response.ok || !response.body) {
            runInAction(() => {
                this.log = "Failed to download APK.";
                this.installing = false;
            });
            return;
        }

        // If available, get the total size from headers
        const totalSizeHeader = response.headers.get("content-length");
        const totalSize = totalSizeHeader ? parseInt(totalSizeHeader, 10) : 0;
        runInAction(() => {
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                uploadedSize: 0,
                totalSize,
                value: 0,
            };
        });

        // Read the response stream into a Blob while updating download progress
        const reader = response.body.getReader();
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            chunks.push(value);
            receivedLength += value.length;
            runInAction(() => {
                // Update download progress; use 50% of the progress bar for download
                this.progress = {
                    filename: "app-general-release.apk",
                    stage: Stage.Downloading,
                    uploadedSize: receivedLength,
                    totalSize,
                    value: totalSize ? (receivedLength / totalSize) * 0.5 : 0.25,
                };
            });
        }
        const blob = new Blob(chunks);
        // Create a File object from the Blob
        const file = new File([blob], "app-general-release.apk", { type: blob.type });

        // Begin installation; update stage to Installing
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
                            // Use second half of progress bar for installation (0.5 to 1.0)
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
            file.size /
            (elapsed / 1000) /
            1024 /
            1024
        ).toFixed(2);
        this.log += `\nInstall finished in ${elapsed}ms at ${transferRate}MB/s`;

        runInAction(() => {
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
                        if (checked === undefined) {
                            return;
                        }
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
