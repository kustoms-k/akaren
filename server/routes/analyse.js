import { Router } from 'express';
import { generateMockQuote } from '../mockAnalysis.js';

const router = Router();

router.post('/', async (req, res) => {
  const { inquiry } = req.body;
  if (!inquiry) return res.status(400).json({ error: 'inquiry saknas' });

  try {
    const result = await generateMockQuote(inquiry);
    return res.json(result);
  } catch (err) {
    console.error('[analyse] mock error:', err.message);
    console.error(err.stack);
    return res.status(500).json({ error: err.message || 'API call failed' });
  }
});

export default router;
