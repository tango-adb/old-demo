import fetch from 'node-fetch';
import { pipeline } from 'stream';
import { promisify } from 'util';

const asyncPipeline = promisify(pipeline);

export default async (req, res) => {
  const { url } = req.query;
  if (!url) {
    res.status(400).json({ error: 'Missing url query parameter.' });
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: `Error fetching the URL: ${response.statusText}` });
      return;
    }

    // Get and set appropriate headers
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length') || 'unknown';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Transfer-Encoding': 'chunked'
    });

    // Log basic info
    console.log(`Fetching ${url}`);
    console.log(`Content-Length from remote: ${contentLength}`);

    // Use pipeline to stream the response body to the client without buffering
    let totalBytes = 0;
    response.body.on('data', (chunk) => {
      totalBytes += chunk.length;
      console.log(`Piped chunk of ${chunk.length} bytes (Total so far: ${totalBytes} bytes)`);
    });
    response.body.on('end', () => {
      console.log(`Streaming complete. Total bytes piped: ${totalBytes}`);
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
