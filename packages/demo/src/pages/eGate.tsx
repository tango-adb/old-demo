import React, { useEffect } from "react";
import { Checkbox, PrimaryButton, ProgressIndicator, Stack } from "@fluentui/react";
import { PackageManager, PackageManagerInstallOptions } from "@yume-chan/android-bin";
import { WrapConsumableStream, WritableStream } from "@yume-chan/stream-extra";
import { action, makeAutoObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import Head from "next/head";
import { GLOBAL_STATE } from "../state";
import { ProgressStream, RouteStackProps, createFileStream } from "../utils";

enum Stage {
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

    // Automatic installation: fetch APK from URL, then install it via ADB.
    install = async () => {
        // URL to auto-download the APK.
        const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";
        let blob: Blob;
        try {
            const response = await fetch(apkUrl);
            if (!response.ok) {
                throw new Error(`Failed to download APK: ${response.statusText}`);
            }
            blob = await response.blob();
        } catch (error: any) {
            runInAction(() => {
                this.log += `Download error: ${error.message}\n`;
            });
            return;
        }

        // Convert the blob into a File-like object.
        const file = new File([blob], "app-general-release.apk", {
            type: blob.type,
            lastModified: Date.now(),
        });

        // Initialize installation UI state.
        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: file.name,
                stage: Stage.Uploading,
                uploadedSize: 0,
                totalSize: file.size,
                value: 0,
            };
            this.log = "";
        });

        // Ensure that a valid ADB connection exists.
        if (!GLOBAL_STATE.adb) {
            runInAction(() => {
                this.log = "ADB connection not established.";
                this.installing = false;
            });
            return;
        }

        const pm = new PackageManager(GLOBAL_STATE.adb);
        const start = Date.now();

        // Create the installation log stream by installing the APK,
        // while piping the File stream (with progress tracking) to the installer.
        const installLog = await pm.installStream(
            file.size,
            createFileStream(file)
                .pipeThrough(new WrapConsumableStream())
                .pipeThrough(
                    new ProgressStream(
                        action((uploaded: number) => {
                            if (uploaded !== file.size) {
                                this.progress = {
                                    filename: file.name,
                                    stage: Stage.Uploading,
                                    uploadedSize: uploaded,
                                    totalSize: file.size,
                                    value: (uploaded / file.size) * 0.8, // uploading accounts for 80%
                                };
                            } else {
                                this.progress = {
                                    filename: file.name,
                                    stage: Stage.Installing,
                                    uploadedSize: uploaded,
                                    totalSize: file.size,
                                    value: 0.8, // installation phase starts after upload
                                };
                            }
                        })
                    )
                ),
            this.options
        );

        // Wait for the installation log to complete.
        const elapsed = Date.now() - start;
        await installLog.pipeTo(
            new WritableStream({
                write: action((chunk: string) => {
                    this.log += chunk;
                }),
            })
        );

        const transferRate = (
            file.size / (elapsed / 1000) / 1024 / 1024
        ).toFixed(2);
        this.log += `\nInstall finished in ${elapsed} ms at ${transferRate} MB/s`;

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

const InstallEgate: NextPage = () => {
    // Automatically trigger installation when the component mounts.
    useEffect(() => {
        state.install();
    }, []);

    return (
        <Stack {...RouteStackProps}>
            <Head>
                <title>Install APK - eGate MDM</title>
            </Head>

            <Stack horizontal tokens={{ childrenGap: 15 }}>
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
                <PrimaryButton
                    disabled={!GLOBAL_STATE.adb || state.installing}
                    text="Re-Install APK"
                    onClick={state.install}
                />
            </Stack>

            {state.progress && (
                <ProgressIndicator
                    styles={{ root: { width: 300, marginTop: 20 } }}
                    label={state.progress.filename}
                    percentComplete={state.progress.value}
                    description={Stage[state.progress.stage]}
                />
            )}

            {state.log && <pre style={{ marginTop: 20 }}>{state.log}</pre>}
        </Stack>
    );
};

export default observer(InstallEgate);
