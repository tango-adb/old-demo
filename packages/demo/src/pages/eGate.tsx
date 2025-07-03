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

// Stages for the installation process.
enum Stage {
    Uploading,
    Installing,
    Completed,
}

// Interface to represent progress.
interface Progress {
    filename: string;
    stage: Stage;
    uploadedSize: number;
    totalSize: number;
    value: number | undefined;
}

// Variants for installation.
type Variant = "general" | "lg-classic" | "external";

// Mapping from variant to the expected APK file name.
const variantAssetMap: Record<Variant, string> = {
    "general": "app-general-release.apk",
    "lg-classic": "app-lgclassic-release.apk",
    "external": "app-external_accessibility-release.apk",
};

// Mapping from variant to its package name.
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
        // Use the Cloudflare Worker URL with the variant query parameter.
        const workerUrl = "https://egate.carsforall1.workers.dev/";
        const proxiedUrl = `${workerUrl}?variant=${encodeURIComponent(variant)}`;

        // Download the APK file via the worker.
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

        // Create a File object using the expected file name for this variant.
        const fileName = variantAssetMap[variant];
        const file = new File([blob], fileName, {
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
            this.log = `Installing "${variant}" variant...\n`;
        });

        // Ensure that a valid ADB connection exists.
        if (!GLOBAL_STATE.adb) {
            runInAction(() => {
                this.log += "ADB connection not established.\n";
                this.installing = false;
            });
            return;
        }

        const pm = new PackageManager(GLOBAL_STATE.adb);
        const start = Date.now();

        // Start the installation process using our file stream and track progress.
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
                                    value: (uploaded / file.size) * 0.8, // Uploading accounts for 80%.
                                };
                            } else {
                                this.progress = {
                                    filename: file.name,
                                    stage: Stage.Installing,
                                    uploadedSize: uploaded,
                                    totalSize: file.size,
                                    value: 0.8, // Start installation phase at 80%.
                                };
                            }
                        })
                    )
                ),
            this.options
        );

        // Process the installation log.
        const elapsed = Date.now() - start;
        await installLog.pipeTo(
            new WritableStream({
                write: action((chunk: string) => {
                    this.log += chunk;
                }),
            })
        );

        // After installation, grant permissions and set device owner.
        const pkg = variantPackageMap[variant];     
        try {
            runInAction(() => {
                this.log += `\nGranting WRITE_SECURE_SETTINGS permission to ${pkg}\n`;
            });
            await (GLOBAL_STATE.adb as any).shell(`pm grant ${pkg} android.permission.WRITE_SECURE_SETTINGS`);
            runInAction(() => {
                this.log += `Setting device owner to ${pkg}/.a\n`;
            });
            await (GLOBAL_STATE.adb as any).shell(`dpm set-device-owner ${pkg}/.a`);
        } catch (error: any) {
            runInAction(() => {
                this.log += `Error setting permissions for ${pkg}: ${error.message}\n`;
            });
            // Optionally, you could choose to continue even if permissions fail.
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

            {/* Checkbox for additional install options */}
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

            {/* Three buttons for different variants */}
            <Stack horizontal tokens={{ childrenGap: 15 }}>
                <PrimaryButton
                    disabled={state.installing || !GLOBAL_STATE.adb}
                    text="General"
                    onClick={() => state.install("general")}
                />
                <PrimaryButton
                    disabled={state.installing || !GLOBAL_STATE.adb}
                    text="LG Classic"
                    onClick={() => state.install("lg-classic")}
                />
                <PrimaryButton
                    disabled={state.installing || !GLOBAL_STATE.adb}
                    text="External Accessibility"
                    onClick={() => state.install("external")}
                />
            </Stack>

            {/* Progress indicator */}
            {state.progress && (
                <ProgressIndicator
                    styles={{ root: { width: 300, marginTop: 20 } }}
                    label={state.progress.filename}
                    percentComplete={state.progress.value}
                    description={Stage[state.progress.stage]}
                />
            )}

            {/* Installation log */}
            {state.log && <pre style={{ marginTop: 20 }}>{state.log}</pre>}
        </Stack>
    );
};

export default observer(InstallEgate);
