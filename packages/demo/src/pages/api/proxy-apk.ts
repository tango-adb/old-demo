import type { NextApiRequest, NextApiResponse } from "next";

// Server-side proxy to fetch the APK binary from GitHub Releases (avoids CORS)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";
    const apkResponse = await fetch(apkUrl);

    if (!apkResponse.ok || !apkResponse.body) {
        res.status(502).end("Upstream download failed");
        return;
    }
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", "inline; filename=app-general-release.apk");

    // Use Web Streams API in Node.js 20+ for direct piping
    if (typeof (apkResponse.body as any).pipeTo === "function") {
        await (apkResponse.body as any).pipeTo(
            new WritableStream({
                write(chunk) {
                    res.write(chunk);
                },
                close() {
                    res.end();
                },
                abort(err) {
                    res.status(500).end("Stream aborted: " + String(err));
                },
            })
        );
    } else {
        // Fallback for older Node.js: buffer and send
        const buffer = Buffer.from(await apkResponse.arrayBuffer());
        res.write(buffer);
        res.end();
    }
}
