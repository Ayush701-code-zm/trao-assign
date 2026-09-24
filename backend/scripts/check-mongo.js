import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const uri = process.env.MONGODB_URI;
const masked = uri ? uri.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@') : '(missing)';
console.log('Mongo URI:', masked);

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.db.admin().command({ ping: 1 });
  console.log('MongoDB: OK');
  await mongoose.disconnect();
} catch (e) {
  console.log('MongoDB: FAIL —', e.message);
  process.exit(1);
}
