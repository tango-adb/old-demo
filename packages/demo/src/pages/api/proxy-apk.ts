import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline } from "stream";
import { promisify } from "util";

// Ensure Node.js runtime on Vercel/serverless
export const config = {
    runtime: "nodejs",
};

const streamPipeline = promisify(pipeline);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";
    const apkResponse = await fetch(apkUrl);

    if (!apkResponse.ok || !apkResponse.body) {
        res.status(502).end("Upstream download failed");
        return;
    }

    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", "inline; filename=app-general-release.apk");

    // Node.js response stream (works everywhere)
    try {
        // @ts-ignore: Node 18+ fetch() body is a Node.js stream
        await streamPipeline(apkResponse.body, res);
    } catch (err) {
        // fallback: buffer and send
        try {
            const buffer = Buffer.from(await apkResponse.arrayBuffer());
            res.write(buffer);
            res.end();
        } catch (err2) {
            res.status(500).end("Proxy stream error: " + String(err2));
        }
    }
}
