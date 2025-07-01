import type { NextApiRequest, NextApiResponse } from "next";

const EGATE_APK_URL =
    "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const response = await fetch(EGATE_APK_URL);
        if (!response.ok) {
            res.status(500).send("Failed to fetch APK");
            return;
        }

        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        res.setHeader("Content-Disposition", "attachment; filename=egate.apk");
        // Allow any origin for CORS (optional, since Next.js API is same-origin by default)
        res.setHeader("Access-Control-Allow-Origin", "*");

        // Stream the response to the client
        if (response.body) {
            response.body.pipe(res);
        } else {
            const buffer = await response.arrayBuffer();
            res.send(Buffer.from(buffer));
        }
    } catch (e) {
        res.status(500).send("Error proxying APK");
    }
}
