import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import kitRoutes from './routes/kits.js';

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

app.use(
  session({
    name: 'prep.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: config.mongoUri,
      ttl: 60 * 60 * 24 * 7,
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'interview-prep-api' });
});

app.use('/api/auth', authRoutes);
app.use('/api/kits', kitRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER', message: err.message || 'Unexpected error' } });
});

async function start() {
  await mongoose.connect(config.mongoUri);
  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  start().catch((err) => {
    console.error('Failed to start', err);
    process.exit(1);
  });
}

export default app;
