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
import { ProgressStream, RouteStackProps } from "../utils";

enum Stage {
    Downloading,
    Uploading,
    Installing,
    Completed,
}

interface Progress {
    filename: string;
    stage: Stage;
    downloadedSize?: number;
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
        const filename = "app-general-release.apk";

        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename,
                stage: Stage.Downloading,
                downloadedSize: 0,
                uploadedSize: 0,
                totalSize: 0,
                value: 0,
            };
            this.log = "";
        });

        try {
            // Fetch the APK
            const response = await fetch(apkUrl);
            if (!response.ok) {
                throw new Error(`Failed to download APK: ${response.statusText}`);
            }

            const contentLength = response.headers.get("content-length");
            const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("Failed to get response body reader");
            }

            const chunks: Uint8Array[] = [];
            let downloadedSize = 0;

            // Read the response stream
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                downloadedSize += value.length;
                runInAction(() => {
                    this.progress = {
                        filename,
                        stage: Stage.Downloading,
                        downloadedSize,
                        uploadedSize: 0,
                        totalSize,
                        value: totalSize ? (downloadedSize / totalSize) * 0.4 : undefined,
                    };
                });
            }

            // Create a Blob from the chunks
            const blob = new Blob(chunks, { type: "application/vnd.android.package-archive" });
            const file = new File([blob], filename, { type: blob.type });

            // Proceed with installation
            runInAction(() => {
                this.progress = {
                    filename,
                    stage: Stage.Uploading,
                    downloadedSize,
                    uploadedSize: 0,
                    totalSize: file.size,
                    value: 0.4,
                };
            });

            const pm = new PackageManager(GLOBAL_STATE.adb!);
            const start = Date.now();

            // Create a ReadableStream that produces Uint8Array
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array(blob));
                    controller.close();
                },
            }).pipeThrough(new WrapConsumableStream<Uint8Array>());

            const log = await pm.installStream(
                file.size,
                stream.pipeThrough(
                    new ProgressStream(
                        action((uploaded) => {
                            if (uploaded !== file.size) {
                                this.progress = {
                                    filename,
                                    stage: Stage.Uploading,
                                    uploadedSize: uploaded,
                                    totalSize: file.size,
                                    value: 0.4 + (uploaded / file.size) * 0.4,
                                };
                            } else {
                                this.progress = {
                                    filename,
                                    stage: Stage.Installing,
                                    uploadedSize: uploaded,
                                    totalSize: file.size,
                                    value: 0.8,
                                };
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
                this.progress = {
                    filename,
                    stage: Stage.Completed,
                    uploadedSize: file.size,
                    totalSize: file.size,
                    value: 1,
                };
                this.installing = false;
            });
        } catch (error) {
            runInAction(() => {
                this.log = `Error: ${(error as Error).message}`;
                this.installing = false;
                this.progress = undefined;
            });
        }
    };
}

const state = new InstallPageState();

const Install: NextPage = () => {
    return (
        <Stack {...RouteStackProps}>
            <Head>
                <title>Install eGate - Tango</title>
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
                    text="Install eGate"
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
