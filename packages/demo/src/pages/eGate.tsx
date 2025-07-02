import React, { useState, useEffect } from "react";
import { PackageManager, PackageManagerInstallOptions } from "@yume-chan/android-bin";
import { WrapConsumableStream, WritableStream } from "@yume-chan/stream-extra";
import { action, runInAction } from "mobx";
import { observer } from "mobx-react-lite";

// NOTE: This component assumes that you have an ADB connection established.
// Replace "window.GLOBAL_ADB" with your actual ADB instance or use a context/hook that provides it.
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

const InstallEgateMDM: React.FC = () => {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [log, setLog] = useState<string>("");

    // Define the eGate MDM APK download URL
    const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";

    // Options for installation, adjust as needed
    const installOptions: Partial<PackageManagerInstallOptions> = {
        bypassLowTargetSdkBlock: false,
    };

    // Function to auto download and install the APK
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

            // Wrap CompletableStream to monitor progress
            const wrapStream = new WrapConsumableStream();
            await apkBlob.stream().pipeTo(wrapStream.writable);

            const progressStream = wrapStream.readable.pipeThrough({
                transform: (chunk, controller) => {
                    // A simple progress counter: update progress by chunk length
                    runInAction(() => {
                        setProgress((prev) => {
                            if (prev) {
                                const newUploaded = prev.uploadedSize + chunk.length;
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
            });

            const installLog = await pm.installStream(apkBlob.size, progressStream, installOptions);

            await installLog.pipeTo(new WritableStream({
                write: action((chunk: string) => {
                    setLog((prev) => prev + chunk);
                }),
            }));

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

    // Auto-trigger the installation when component mounts
    useEffect(() => {
        installAPK();
    }, []);

    // Render UI with progress and logging output
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

export default observer(InstallEgateMDM);
