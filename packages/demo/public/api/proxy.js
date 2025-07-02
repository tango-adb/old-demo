import fetch from 'node-fetch';

export default async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'Missing url query parameter.' });
    }
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return res.status(response.status).json({ error: `Error fetching the URL: ${response.statusText}` });
        }
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        // Pipe the fetched response body directly to the response.
        response.body.pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
