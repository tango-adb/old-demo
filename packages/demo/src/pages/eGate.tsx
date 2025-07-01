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

const APK_FILENAME = "app-general-release.apk";
// Use your proxy API route for CORS-safe download
const APK_PROXY_URL = "/api/proxy-apk";

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
        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: APK_FILENAME,
                stage: Stage.Downloading,
                uploadedSize: 0,
                totalSize: 0,
                value: 0,
            };
            this.log = "";
        });

        try {
            // Download the APK from the local proxy endpoint
            const response = await fetch(APK_PROXY_URL);
            if (!response.ok || !response.body) {
                throw new Error(`Failed to fetch APK: ${response.statusText}`);
            }
            const contentLength = Number(response.headers.get("content-length") ?? "0");
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let received = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) {
                    chunks.push(value);
                    received += value.length;
                    runInAction(() => {
                        if (this.progress) {
                            this.progress.stage = Stage.Downloading;
                            this.progress.uploadedSize = received;
                            this.progress.totalSize = contentLength;
                            this.progress.value =
                                contentLength > 0 ? (received / contentLength) * 0.3 : undefined;
                        }
                    });
                }
            }

            const blob = new Blob(chunks, { type: "application/vnd.android.package-archive" });
            const file = new File([blob], APK_FILENAME, {
                type: "application/vnd.android.package-archive",
            });

            runInAction(() => {
                if (this.progress) {
                    this.progress.stage = Stage.Uploading;
                    this.progress.uploadedSize = 0;
                    this.progress.totalSize = file.size;
                    this.progress.value = 0.3;
                }
            });

            // Install the APK using the ADB stream pipeline
            const pm = new PackageManager(GLOBAL_STATE.adb!);
            const start = Date.now();
            const log = await pm.installStream(
                file.size,
                createFileStream(file)
                    .pipeThrough(new WrapConsumableStream())
                    .pipeThrough(
                        new ProgressStream(
                            action((uploaded) => {
                                if (uploaded !== file.size) {
                                    if (this.progress) {
                                        this.progress.stage = Stage.Uploading;
                                        this.progress.uploadedSize = uploaded;
                                        this.progress.totalSize = file.size;
                                        this.progress.value =
                                            0.3 + (uploaded / file.size) * 0.5;
                                    }
                                } else {
                                    if (this.progress) {
                                        this.progress.stage = Stage.Installing;
                                        this.progress.uploadedSize = uploaded;
                                        this.progress.totalSize = file.size;
                                        this.progress.value = 0.8;
                                    }
                                }
                            })
                        )
                    )
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
                file.size /
                (elapsed / 1000) /
                1024 /
                1024
            ).toFixed(2);
            this.log += `Install finished in ${elapsed}ms at ${transferRate}MB/s`;

            runInAction(() => {
                if (this.progress) {
                    this.progress.stage = Stage.Completed;
                    this.progress.uploadedSize = file.size;
                    this.progress.totalSize = file.size;
                    this.progress.value = 1;
                }
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
                    text="Install Latest APK"
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
