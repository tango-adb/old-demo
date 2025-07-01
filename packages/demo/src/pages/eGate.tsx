import {
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
}

interface Progress {
    filename: string;
    stage: Stage;
    uploadedSize: number;
    totalSize: number;
    value: number | undefined;
}

class InstallEGateState {
    installing = false;
    progress: Progress | undefined = undefined;
    log: string = "";
    
    // eGate MDM APK URL - replace with actual URL
    private readonly EGATE_APK_URL = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";
    private readonly INSTALL_DATE = "2025-07-01 00:41:06"; // Updated timestamp
    private readonly USERNAME = "JMTDI"; // Current user

    constructor() {
        makeAutoObservable(this, {
            progress: observable.ref,
            install: false,
        });
    }

    install = async () => {
        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: "eGate MDM",
                stage: Stage.Downloading,
                uploadedSize: 0,
                totalSize: 0,
                value: 0,
            };
            this.log = `Starting eGate MDM installation at ${this.INSTALL_DATE}\n`;
            this.log += `Installation initiated by user: ${this.USERNAME}\n`;
        });

        try {
            // Download the APK
            const response = await fetch(this.EGATE_APK_URL);
            if (!response.ok) {
                throw new Error(`Failed to download APK: ${response.statusText}`);
            }

            const fileSize = Number(response.headers.get("content-length"));
            const fileBlob = await response.blob();
            const file = new File([fileBlob], "egate.apk", { type: "application/vnd.android.package-archive" });

            runInAction(() => {
                this.progress = {
                    filename: file.name,
                    stage: Stage.Uploading,
                    uploadedSize: 0,
                    totalSize: file.size,
                    value: 0,
                };
            });

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
                                    this.progress = {
                                        filename: file.name,
                                        stage: Stage.Uploading,
                                        uploadedSize: uploaded,
                                        totalSize: file.size,
                                        value: (uploaded / file.size) * 0.8,
                                    };
                                } else {
                                    this.progress = {
                                        filename: file.name,
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
        } catch (error: unknown) {
            runInAction(() => {
                let errorMessage: string;
                if (error instanceof Error) {
                    errorMessage = error.message;
                } else if (error && typeof error === 'object' && 'message' in error) {
                    errorMessage = String(error.message);
                } else if (typeof error === 'string') {
                    errorMessage = error;
                } else {
                    errorMessage = 'An unknown error occurred';
                }
                this.log += `\nError: ${errorMessage}`;
                this.installing = false;
            });
        }
    };
}

const state = new InstallEGateState();

const InstallEGate: NextPage = () => {
    return (
        <Stack {...RouteStackProps}>
            <Head>
                <title>Install eGate MDM - Ya-WebADB</title>
            </Head>

            <Stack horizontal>
                <PrimaryButton
                    disabled={!GLOBAL_STATE.adb || state.installing}
                    text="Install eGate MDM"
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

export default observer(InstallEGate);
