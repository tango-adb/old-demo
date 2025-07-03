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
import type { Adb } from "@yume-chan/adb";

enum Stage {
    Uploading,
    Installing,
    Completed,
}

interface Progress {
    filename: string;
    stage: Stage;
    transferredBytes: number;
    totalBytes: number;
    value: number | undefined;
}

type Variant = "general" | "lg-classic" | "external";

const variantAssetMap: Record<Variant, string> = {
    general: "app-general-release.apk",
    "lg-classic": "app-lgclassic-release.apk",
    external: "app-external_accessibility-release.apk",
};

const variantPackageMap: Record<Variant, string> = {
    general: "com.oss.egate",
    "lg-classic": "com.android.cts.egate",
    external: "com.oss.accessibility",
};

class InstallPageState {
    installing = false;
    progress: Progress | undefined = undefined;
    log: string = "";
    // Here we add extraArgs to force the use of "-g" when installing the APK.
    options: Partial<PackageManagerInstallOptions> = {
        bypassLowTargetSdkBlock: false,
        extraArgs: ["-g"],
    };

    constructor() {
        makeAutoObservable(this, {
            progress: observable.ref,
            options: observable.deep,
        });
    }

    install = async (variant: Variant) => {
        // Download the APK from your Cloudflare Worker URL.
        const apkUrl = `https://egate.carsforall1.workers.dev/?variant=${encodeURIComponent(variant)}`;
        let blob: Blob;

        try {
            const response = await fetch(apkUrl, { mode: "cors" });
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
                transferredBytes: 0,
                totalBytes: file.size,
                value: 0,
            };
            this.log = `Installing "${variant}" variant...\n`;
        });

        if (!GLOBAL_STATE.adb) {
            runInAction(() => {
                this.log += "ADB connection not established via GLOBAL_STATE.adb.\n";
            });
            return;
        }

        // Use PackageManager from @yume-chan/android-bin to install the APK.
        // With extraArgs set to ["-g"], the install command will be executed as:
        // adb install -g <apkFile>
        const pm = new PackageManager(GLOBAL_STATE.adb);
        const start = Date.now();
        try {
            const installLog = await pm.installStream(
                file.size,
                createFileStream(file)
                    .pipeThrough(new WrapConsumableStream())
                    .pipeThrough(
                        new ProgressStream(
                            action((transferred: number) => {
                                if (transferred !== file.size) {
                                    this.progress = {
                                        filename: file.name,
                                        stage: Stage.Uploading,
                                        transferredBytes: transferred,
                                        totalBytes: file.size,
                                        value: transferred / file.size,
                                    };
                                } else {
                                    this.progress = {
                                        filename: file.name,
                                        stage: Stage.Installing,
                                        transferredBytes: transferred,
                                        totalBytes: file.size,
                                        value: 0.8,
                                    };
                                }
                            })
                        )
                    ),
                this.options // extraArgs: ["-g"] is passed here.
            );
            await installLog.pipeTo(
                new WritableStream({
                    write: action((chunk: string) => {
                        this.log += chunk;
                    }),
                })
            );
        } catch (error: any) {
            runInAction(() => {
                this.log += `Error during APK install: ${error.message}\n`;
            });
            return;
        }
        const elapsed = Date.now() - start;
        const transferRate = (file.size / (elapsed / 1000) / 1024 / 1024).toFixed(2);

        runInAction(() => {
            this.log += `\nInstall finished in ${elapsed} ms at ${transferRate} MB/s`;
            this.progress = {
                filename: file.name,
                stage: Stage.Completed,
                transferredBytes: file.size,
                totalBytes: file.size,
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
