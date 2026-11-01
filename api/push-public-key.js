module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(500).json({ error: 'Push is not configured.' });
  return res.status(200).json({ publicKey: key });
};
