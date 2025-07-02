import fetch from 'node-fetch';
import { pipeline } from 'stream';
import { promisify } from 'util';

const asyncPipeline = promisify(pipeline);

// Default APK download URL.
const DEFAULT_APK_URL = "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk";

export default async (req, res) => {
  // Use provided URL or fallback to the default APK URL.
  const requestedUrl = req.query.url || DEFAULT_APK_URL;

  try {
    const response = await fetch(requestedUrl);
    if (!response.ok) {
      res.status(response.status).json({ error: `Error fetching the URL: ${response.statusText}` });
      return;
    }

    // Get headers from the remote response.
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    // Set appropriate headers on our response.
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Transfer-Encoding': 'chunked',
      ...(contentLength && { 'Content-Length': contentLength })
    });

    console.log(`Fetching ${requestedUrl}`);
    console.log(`Expected content length: ${contentLength || 'unknown'}`);

    let totalBytes = 0;
    response.body.on('data', (chunk) => {
      totalBytes += chunk.length;
      console.log(`Received chunk of ${chunk.length} bytes (Total: ${totalBytes} bytes)`);
    });
    response.body.on('end', () => { 
      console.log(`Finished streaming. Total bytes: ${totalBytes}`);
    });

    await asyncPipeline(response.body, res);
  } catch (error) {
    console.error("Error in proxy:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', details: error.message });
    } else {
      res.end();
    }
  }
};
