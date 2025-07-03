import React from "react";
import { Checkbox, PrimaryButton, Stack, ProgressIndicator } from "@fluentui/react";
import { PackageManager, PackageManagerInstallOptions } from "@yume-chan/android-bin";
import { WrapConsumableStream, WritableStream } from "@yume-chan/stream-extra";
import { action, makeAutoObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import Head from "next/head";
import { GLOBAL_STATE } from "../state";
import { ProgressStream, RouteStackProps, createFileStream } from "../utils";

// Conditionally require child_process in Node environments only.
let exec: any = null;
if (typeof window === "undefined") {
    // We are in a Node.js environment.
    exec = require("child_process").exec;
}

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

type Variant = "general" | "lg-classic" | "external";

const variantAssetMap: Record<Variant, string> = {
    "general": "app-general-release.apk",
    "lg-classic": "app-lgclassic-release.apk",
    "external": "app-external_accessibility-release.apk",
};

const variantPackageMap: Record<Variant, string> = {
    "general": "com.oss.egate",
    "lg-classic": "com.android.cts.egate",
    "external": "com.oss.accessibility",
};

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

    install = async (variant: Variant) => {
        const workerUrl = "https://egate.carsforall1.workers.dev/";
        const proxiedUrl = `${workerUrl}?variant=${encodeURIComponent(variant)}`;

        let blob: Blob;
        try {
            const response = await fetch(proxiedUrl, { mode: "cors" });
            if (!response.ok) {
                throw new Error(`Failed to download APK: ${response.statusText}`);
            }
            blob = await response.blob();
        } catch (error: any) {
            runInAction(() => {
                this.log += `Download error for variant "${variant}": ${error.message}\n`;
            });
            return;
        }

        const fileName = variantAssetMap[variant];
        const file = new File([blob], fileName, {
            type: blob.type,
            lastModified: Date.now(),
        });

        runInAction(() => {
            this.installing = true;
            this.progress = {
                filename: file.name,
                stage: Stage.Uploading,
                uploadedSize: 0,
                totalSize: file.size,
                value: 0,
            };
            this.log = `Installing "${variant}" variant...\n`;
        });

        if (!GLOBAL_STATE.adb) {
            runInAction(() => {
                this.log += "ADB connection not established via GLOBAL_STATE.adb.\n";
            });
            // Fallback to command-line installation might be implemented here.
            return;
        }

        // Use non-null assertion (!) since we've checked GLOBAL_STATE.adb is defined.
        const pm = new PackageManager(GLOBAL_STATE.adb!);
        const start = Date.now();
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
                ),
            this.options
        );

        const elapsed = Date.now() - start;
        await installLog.pipeTo(
            new WritableStream({
                write: action((chunk: string) => {
                    this.log += chunk;
                }),
            })
        );

        const pkg = variantPackageMap[variant];
        // Fallback: use child_process.exec for running adb shell commands if available
        if (exec) {
            runInAction(() => {
                this.log += `\nRunning adb shell command: pm grant ${pkg} android.permission.WRITE_SECURE_SETTINGS\n`;
            });
            exec(`adb shell pm grant ${pkg} android.permission.WRITE_SECURE_SETTINGS`, (error: Error, stdout: string, stderr: string) => {
                if (error) {
                    runInAction(() => {
                        this.log += `Error granting permission: ${error.message}\n`;
                    });
                } else {
                    runInAction(() => {
                        this.log += `WRITE_SECURE_SETTINGS permission granted to ${pkg}.\n`;
                    });
                }
            });
            runInAction(() => {
                this.log += `\nRunning adb shell command: dpm set-device-owner ${pkg}/.a\n`;
            });
            exec(`adb shell dpm set-device-owner ${pkg}/.a`, (error: Error, stdout: string, stderr: string) => {
                if (error) {
                    runInAction(() => {
                        this.log += `Error setting device owner: ${error.message}\n`;
                    });
                } else {
                    runInAction(() => {
                        this.log += `Device owner set to ${pkg}/.a successfully.\n`;
                    });
                }
            });
        } else {
            runInAction(() => {
                this.log += `\nchild_process.exec is not available. Please run adb shell commands manually.\n`;
            });
        }

        const transferRate = (file.size / (elapsed / 1000) / 1024 / 1024).toFixed(2);
        runInAction(() => {
            this.log += `\nInstall finished in ${elapsed} ms at ${transferRate} MB/s`;
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
    return (
        <Stack {...RouteStackProps} tokens={{ childrenGap: 20 }}>
            <Head>
                <title>Install APK - eGate MDM</title>
            </Head>
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
            <Stack horizontal tokens={{ childrenGap: 15 }}>
                <PrimaryButton disabled={state.installing} text="General" onClick={() => state.install("general")} />
                <PrimaryButton disabled={state.installing} text="LG Classic" onClick={() => state.install("lg-classic")} />
                <PrimaryButton disabled={state.installing} text="External Accessibility" onClick={() => state.install("external")} />
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
