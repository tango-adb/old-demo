import React from "react";

const Install: React.FC = () => {
    // URL for the APK download. This is a public URL from GitHub Releases.
    const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";

    const handleDownload = () => {
        // Create an anchor element and trigger a download.
        // Note: This method bypasses fetch due to CORS restrictions.
        const anchor = document.createElement("a");
        anchor.href = apkUrl;
        // The filename here is a suggestion for download; browsers may ignore it on cross-origin downloads.
        anchor.download = "app-general-release.apk"; 
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    };

    return (
        <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
            <h1>Download and Install eGate MDM APK</h1>
            <p>
                Because GitHub Pages cannot use a server-side proxy and the GitHub Releases asset lacks the required CORS headers, an automatic download via fetch will fail.
                Instead, please click the button below to download the APK directly.
            </p>
            <button onClick={handleDownload} style={{ padding: "10px 20px", fontSize: "16px" }}>
                Download APK
            </button>
            <p>
                Once downloaded, use your preferred method to install the APK.
            </p>
        </div>
    );
};

export default Install;
