import React from "react";
import { Checkbox, PrimaryButton, Stack, ProgressIndicator } from "@fluentui/react";
import { action, makeAutoObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import Head from "next/head";
import { GLOBAL_STATE } from "../state";
import { RouteStackProps } from "../utils";
// It is assumed that GLOBAL_STATE.adb is an instance from @yume-chan/adb that provides an install method.
// This install method should implement the equivalent of "adb install -g" when the { grant: true } option is passed.

enum Stage {
    Downloading,
    Installing,
    Completed,
}

interface Progress {
    filename: string;
    stage: Stage;
    value: number | undefined;
}

type Variant = "general" | "lg-classic" | "external";

const variantAssetMap: Record<Variant, string> = {
    general: "app-general-release.apk",
    "lg-classic": "app-lgclassic-release.apk",
    external: "app-external_accessibility-release.apk",
};

class InstallPageState {
    installing = false;
    progress: Progress | undefined = undefined;
    log: string = "";
    options: { bypassLowTargetSdkBlock: boolean } = {
        bypassLowTargetSdkBlock: false,
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
            runInAction(() => {
                this.progress = { filename: variantAssetMap[variant], stage: Stage.Downloading, value: 0 };
                this.log = `Downloading "${variant}" variant...\n`;
                this.installing = true;
            });
            const response = await fetch(apkUrl, { mode: "cors" });
            if (!response.ok) {
                throw new Error(`Failed to download APK: ${response.statusText}`);
            }
            blob = await response.blob();
        } catch (error: any) {
            runInAction(() => {
                this.log += `Download error for variant "${variant}": ${error.message}\n`;
                this.installing = false;
            });
            return;
        }

        // Create a File object for the APK.
        const fileName = variantAssetMap[variant];
        const file = new File([blob], fileName, {
            type: blob.type,
            lastModified: Date.now(),
        });

        runInAction(() => {
            this.progress = { filename: file.name, stage: Stage.Installing, value: 0.1 };
            this.log += `APK downloaded: ${file.name}\n`;
        });

        // Execute the "adb install -g" command.
        // This code assumes that GLOBAL_STATE.adb.install exists and accepts a File along with options.
        // The { grant: true } option should force the equivalent of "adb install -g <apk>".
        if (!GLOBAL_STATE.adb || typeof GLOBAL_STATE.adb.install !== "function") {
            runInAction(() => {
                this.log += `ADB connection or install method is not available.\n`;
                this.installing = false;
            });
            return;
        }

        try {
            runInAction(() => {
                this.log += `\nExecuting adb install -g command for ${fileName}\n`;
            });
            // The install method should return a Promise that resolves when installation completes.
            await GLOBAL_STATE.adb.install(file, { grant: true });
            runInAction(() => {
                this.log += `\nAPK installed successfully with -g flag.\n`;
                this.progress = { filename: file.name, stage: Stage.Completed, value: 1 };
                this.installing = false;
            });
        } catch (error: any) {
            runInAction(() => {
                this.log += `Error during adb install -g: ${error.message}\n`;
                this.installing = false;
            });
            return;
        }
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
                <PrimaryButton
                    disabled={state.installing}
                    text="General"
                    onClick={() => state.install("general")}
                />
                <PrimaryButton
                    disabled={state.installing}
                    text="LG Classic"
                    onClick={() => state.install("lg-classic")}
                />
                <PrimaryButton
                    disabled={state.installing}
                    text="External Accessibility"
                    onClick={() => state.install("external")}
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
