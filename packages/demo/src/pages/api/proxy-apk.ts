import type { NextApiRequest, NextApiResponse } from 'next';
import { pipeline } from 'stream';
import { promisify } from 'util';

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

    // Use Node.js pipeline for compatibility
    try {
        // @ts-ignore
        await streamPipeline(apkResponse.body, res);
    } catch (err) {
        res.status(500).end("Proxy stream error: " + String(err));
    }
}
