import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const apkUrl = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";
    const response = await fetch(apkUrl);
    if (!response.ok) {
        res.status(response.status).end();
        return;
    }
    // Set CORS header for your frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    response.body.pipeTo(res as any); // In real app, use stream pipeline for Node.js
}
