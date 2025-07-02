import fetch from 'node-fetch';

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

    // Use content-type from the fetched response or default to octet-stream.
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Set headers to enable streaming and to prevent caching.
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Transfer-Encoding': 'chunked'
    });

    // Create a reader from the fetch response stream.
    const reader = response.body.getReader();

    const readChunk = () => {
      reader.read().then(({ done, value }) => {
        if (done) {
          res.end();
          return;
        }
        // Write the chunk to the response as soon as it's available.
        res.write(value);
        // Continue reading the next chunk.
        readChunk();
      }).catch((err) => {
        console.error("Error reading stream:", err);
        res.end();
      });
    };

    readChunk();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
