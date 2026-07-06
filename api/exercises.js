export default async function handler(req, res) {
    const key = process.env.MUSCLEWIKI_KEY;
    if (!key) {
        return res.status(500).json({ error: 'MUSCLEWIKI_KEY env var not set' });
    }

    // Forward any query params from the browser (e.g. ?muscle=chest&limit=20)
    const params = new URLSearchParams(req.query).toString();
    const url = 'https://api.musclewiki.com/exercises/' + (params ? '?' + params : '');

    try {
        const upstream = await fetch(url, {
            headers: {
                'X-API-Key': key,
                'Accept': 'application/json'
            }
        });

        const data = await upstream.json();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=3600'); // cache 1 hour on Vercel edge
        res.status(upstream.status).json(data);
    } catch (err) {
        res.status(502).json({ error: 'Upstream fetch failed', detail: err.message });
    }
}
