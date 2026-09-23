import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();

    if (!email || !password || password.length < 6) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Email and password (min 6 chars) required' },
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: { code: 'EXISTS', message: 'Account already exists' } });
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ email, passwordHash, name });
    req.session.userId = String(user._id);
    req.session.email = user.email;

    res.status(201).json({ user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER', message: err.message } });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
    req.session.userId = String(user._id);
    req.session.email = user.email;
    res.json({ user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER', message: err.message } });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select('email name createdAt');
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } });
  }
  res.json({ user: { id: user._id, email: user.email, name: user.name } });
});

export default router;
