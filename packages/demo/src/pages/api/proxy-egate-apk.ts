import type { NextApiRequest, NextApiResponse } from "next";

const EGATE_APK_URL =
  "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";

// Helper to get fetch in any Node version
async function getFetch() {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch;
  }
  // Dynamically import node-fetch only if needed
  const { default: fetch } = await import("node-fetch");
  return fetch as typeof globalThis.fetch;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const fetch = await getFetch();
    const response = await fetch(EGATE_APK_URL);
    if (!response.ok) {
      res.status(500).send("Failed to fetch APK");
      return;
    }

    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", "attachment; filename=egate.apk");

    // Handle Web and Node streams
    if (response.body && typeof (response.body as any).getReader === "function") {
      // Web ReadableStream (Node 18+/Edge)
      const reader = (response.body as any).getReader();
      res.status(200);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
      res.end();
    } else if (response.body && typeof (response.body as any).pipe === "function") {
      // Node.js stream (node-fetch, Node < 18)
      (response.body as any).pipe(res);
    } else {
      // Fallback: buffer the whole response
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    }
  } catch (e: any) {
    res.status(500).send("Error proxying APK: " + (e?.message || e));
  }
}
