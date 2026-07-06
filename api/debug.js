// Temporary endpoint — lets us see the raw MuscleWiki response shape.
// Delete this file once the app is working correctly.
export default async function handler(req, res) {
    const key = process.env.MUSCLEWIKI_KEY;
    if (!key) return res.status(500).json({ error: 'MUSCLEWIKI_KEY not set' });

    const upstream = await fetch('https://api.musclewiki.com/exercises/?limit=1', {
        headers: { 'X-API-Key': key, 'Accept': 'application/json' }
    });

    const data = await upstream.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(upstream.status).json(data);
}
