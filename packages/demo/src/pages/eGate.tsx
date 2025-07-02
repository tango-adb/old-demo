import React, { useEffect } from "react";
import { Checkbox, PrimaryButton, Stack, ProgressIndicator } from "@fluentui/react";
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

type Variant = "general" | "lg-classic" | "external";

const variantAssetMap: Record<Variant, string> = {
    "general": "app-general-release.apk",
    "lg-classic": "app-lgclassic-release.apk",
    "external": "app-external_accessibility-release.apk",
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
        // Use the GitHub API to get the latest release information.
        const releaseUrl = "https://api.github.com/repos/offlinesoftwaresolutions/eGate/releases/latest";
        let assetUrl: string;
        try {
            const releaseResponse = await fetch(releaseUrl);
            if (!releaseResponse.ok) {
                throw new Error(`Failed to fetch release info: ${releaseResponse.statusText}`);
            }
            const releaseData = await releaseResponse.json();
            // Determine the asset name based on the selected variant.
            const assetName = variantAssetMap[variant];
            // Identify the asset based on the asset name.
            const asset = releaseData.assets.find((a: any) => a.name === assetName);
            if (!asset) {
                throw new Error(`APK asset "${assetName}" not found in release.`);
            }
            assetUrl = asset.browser_download_url;
        } catch (error: any) {
            runInAction(() => {
                this.log += `Release API error: ${error.message}\n`;
            });
            return;
        }

        // Use your Cloudflare Worker to bypass CORS.
        // Your worker URL is: https://muddy-bush-572d.carsforall1.workers.dev/
        // For this example, we assume the worker simply proxies the request.
        const workerUrl = "https://muddy-bush-572d.carsforall1.workers.dev/";
        // Here we assume that the worker has the APK URL hard-coded based on what asset you want to serve.
        // If your worker supports dynamic URLs through a query parameter, you might do:
        // const proxiedUrl = workerUrl + "?url=" + encodeURIComponent(assetUrl);
        // For simplicity, we'll assume the worker proxies the request for the chosen asset.
        const proxiedUrl = workerUrl;

        let blob: Blob;
        try {
            const response = await fetch(proxiedUrl, { mode: "cors" });
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
        const file = new File([blob], variantAssetMap[variant], {
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

        // Start the installation process using our file stream while tracking progress.
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
                                    value: 0.8, // installation phase starts
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

            {/* Checkbox to toggle additional options */}
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
                    text="External accessibility"
                    onClick={() => state.install("external")}
                />
            </Stack>

            {/* Installation progress indicator */}
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
