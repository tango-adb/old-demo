import React, { useState, useEffect } from "react";
import { PackageManager, PackageManagerInstallOptions } from "@yume-chan/android-bin";
import { Consumable, WrapConsumableStream, WritableStream } from "@yume-chan/stream-extra";
import { action, runInAction } from "mobx";
import { observer } from "mobx-react-lite";

declare global {
    interface Window {
        GLOBAL_ADB: any;
    }
}

enum Stage {
    Downloading,
    Uploading,
    Installing,
    Completed,
    Error,
}

interface Progress {
    stage: Stage;
    uploadedSize: number;
    totalSize: number;
    percent: number | undefined;
}

const EGateInstaller: React.FC = () => {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [log, setLog] = useState<string>("");

    // Define the eGate MDM APK download URL
    const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";

    // Options for installation, adjust as needed
    const installOptions: Partial<PackageManagerInstallOptions> = {
        bypassLowTargetSdkBlock: false,
    };

    const installAPK = async () => {
        runInAction(() => {
            setProgress({
                stage: Stage.Downloading,
                uploadedSize: 0,
                totalSize: 0,
                percent: 0,
            });
            setLog("Starting APK download...\n");
        });

        let apkBlob: Blob;
        try {
            const response = await fetch(apkUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch APK: ${response.statusText}`);
            }
            apkBlob = await response.blob();
        } catch (error: any) {
            runInAction(() => {
                setLog((prev) => prev + `Download error: ${error.message}\n`);
                setProgress({
                    stage: Stage.Error,
                    uploadedSize: 0,
                    totalSize: 0,
                    percent: undefined,
                });
            });
            return;
        }

        runInAction(() => {
            setProgress({
                stage: Stage.Uploading,
                uploadedSize: 0,
                totalSize: apkBlob.size,
                percent: 0,
            });
            setLog((prev) => prev + "APK downloaded. Starting upload...\n");
        });

        try {
            const adb = window.GLOBAL_ADB; // Ensure you have an ADB connection
            const pm = new PackageManager(adb);
            const startTime = Date.now();

            // Pipe the blob's stream into a WrapConsumableStream to convert it into a stream of Consumable<Uint8Array>
            const blobStream = apkBlob.stream() as ReadableStream<Uint8Array>;
            const wrapStream = new WrapConsumableStream();
            await blobStream.pipeTo(wrapStream.writable);

            // Now intercept the stream to track progress. The input is Consumable<Uint8Array>,
            // and we output the same type without modification.
            const progressStream = wrapStream.readable.pipeThrough(
                new TransformStream<Consumable<Uint8Array>, Consumable<Uint8Array>>({
                    transform(chunk, controller) {
                        runInAction(() => {
                            setProgress((prev) => {
                                if (prev) {
                                    // Since each chunk is already a consumable wrapping a Uint8Array, we can access its raw value via chunk.value.
                                    // Note: This assumes that the Consumable type has a "value" property.
                                    const chunkValue = chunk.value;
                                    const newUploaded = prev.uploadedSize + chunkValue.length;
                                    const percent = newUploaded / apkBlob.size;
                                    return {
                                        ...prev,
                                        uploadedSize: newUploaded,
                                        percent: percent < 0.8 ? percent * 0.8 : 0.8, // reserve 80% for upload progress
                                        stage: newUploaded < apkBlob.size ? Stage.Uploading : Stage.Installing,
                                        totalSize: apkBlob.size,
                                    };
                                }
                                return prev;
                            });
                        });
                        controller.enqueue(chunk);
                    },
                    flush(controller) {
                        controller.terminate();
                    }
                })
            );

            const installLog = await pm.installStream(apkBlob.size, progressStream, installOptions);

            await installLog.pipeTo(
                new WritableStream({
                    write: action((chunk: string) => {
                        setLog((prev) => prev + chunk);
                    }),
                })
            );

            const elapsedTime = Date.now() - startTime;
            runInAction(() => {
                setLog((prev) => prev + `Installation completed in ${elapsedTime} ms.\n`);
                setProgress({
                    stage: Stage.Completed,
                    uploadedSize: apkBlob.size,
                    totalSize: apkBlob.size,
                    percent: 1,
                });
            });
        } catch (error: any) {
            runInAction(() => {
                setLog((prev) => prev + `Installation error: ${error.message}\n`);
                setProgress({
                    stage: Stage.Error,
                    uploadedSize: 0,
                    totalSize: apkBlob.size,
                    percent: undefined,
                });
            });
        }
    };

    useEffect(() => {
        installAPK();
    }, []);

    return (
        <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
            <h1>eGate MDM Auto Installer</h1>
            {progress ? (
                <div>
                    <p>
                        Stage: {Stage[progress.stage]}<br />
                        {progress.totalSize > 0 && (
                            <>
                                {progress.uploadedSize} / {progress.totalSize} bytes (
                                {progress.percent ? (progress.percent * 100).toFixed(0) : 0}%)
                            </>
                        )}
                    </p>
                </div>
            ) : (
                <p>No progress information available.</p>
            )}
            <pre style={{ background: "#f0f0f0", padding: "10px", borderRadius: "4px" }}>{log}</pre>
        </div>
    );
};

export default observer(EGateInstaller);
