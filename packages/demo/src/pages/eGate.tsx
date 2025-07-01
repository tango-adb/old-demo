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
    Uploading,
    Installing,
    Completed,
    Error,
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

    // Change this to your actual APK URL if hosting elsewhere, or keep as below if in public/
    apkUrl = "/app-general-release.apk";

    constructor() {
        makeAutoObservable(this, {
            progress: observable.ref,
            install: false,
            options: observable.deep,
        });
    }

    install = async () => {
        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Downloading,
                uploadedSize: 0,
                totalSize: 0,
                value: 0,
            };
            this.log = "Downloading APK from server...\n";
        });

        let apkBlob: Blob;
        try {
            // Fetch the APK directly from the URL (must be same-origin or CORS-enabled)
            const response = await fetch(this.apkUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch APK: ${response.statusText}`);
            }
            apkBlob = await response.blob();
        } catch (e: any) {
            runInAction(() => {
                this.log += `Error downloading APK: ${e?.message || e}\n`;
                this.installing = false;
                this.progress = {
                    filename: "app-general-release.apk",
                    stage: Stage.Error,
                    uploadedSize: 0,
                    totalSize: 0,
                    value: undefined,
                };
            });
            return;
        }

        runInAction(() => {
            this.progress = {
                filename: "app-general-release.apk",
                stage: Stage.Uploading,
                uploadedSize: 0,
                totalSize: apkBlob.size,
                value: 0,
            };
            this.log += "Uploading APK to device...\n";
        });

        try {
            const pm = new PackageManager(GLOBAL_STATE.adb!);
            const start = Date.now();
            const log = await pm.installStream(
                apkBlob.size,
                createConsumableStream(apkBlob.stream())
                    .pipeThrough(
                        new ProgressStream(
                            action((uploaded) => {
                                if (uploaded !== apkBlob.size) {
                                    this.progress = {
                                        filename: "app-general-release.apk",
                                        stage: Stage.Uploading,
                                        uploadedSize: uploaded,
                                        totalSize: apkBlob.size,
                                        value: (uploaded / apkBlob.size) * 0.8,
                                    };
                                } else {
                                    this.progress = {
                                        filename: "app-general-release.apk",
                                        stage: Stage.Installing,
                                        uploadedSize: uploaded,
                                        totalSize: apkBlob.size,
                                        value: 0.8,
                                    };
                                }
                            })
                        )
                    ),
                { ...this.options }
            );

            const elapsed = Date.now() - start;
            await log.pipeTo(
                new WritableStream({
                    write: action((chunk) => {
                        this.log += chunk;
                    }),
                })
            );

            const transferRate = (
                apkBlob.size /
                (elapsed / 1000) /
                1024 /
                1024
            ).toFixed(2);
            this.log += `Install finished in ${elapsed}ms at ${transferRate}MB/s`;

            runInAction(() => {
                this.progress = {
                    filename: "app-general-release.apk",
                    stage: Stage.Completed,
                    uploadedSize: apkBlob.size,
                    totalSize: apkBlob.size,
                    value: 1,
                };
                this.installing = false;
            });
        } catch (e: any) {
            runInAction(() => {
                this.log += "\nError: " + (e?.message || e);
                if (this.progress) {
                    this.progress.stage = Stage.Error;
                    this.progress.value = undefined;
                }
                this.installing = false;
            });
        }
    };
}

const state = new InstallPageState();

const Install: NextPage = () => {
    return (
        <Stack {...RouteStackProps}>
            <Head>
                <title>Install APK - eGate</title>
            </Head>

            <Stack horizontal>
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

            <Stack horizontal>
                <PrimaryButton
                    disabled={!GLOBAL_STATE.adb || state.installing}
                    text="Download and Install APK"
                    onClick={state.install}
                />
            </Stack>

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
    );
};

export default observer(Install);
