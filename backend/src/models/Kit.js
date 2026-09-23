import mongoose from 'mongoose';

const practiceSchema = new mongoose.Schema(
  {
    confidence: { type: Number, min: 1, max: 5, default: null },
    covered: { type: Boolean, default: false },
    last_seen_at: { type: Date, default: null },
  },
  { _id: false }
);

const kitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'ready', 'failed'],
      default: 'queued',
      index: true,
    },
    progress: {
      step: { type: String, default: 'queued' },
      message: { type: String, default: '' },
      percent: { type: Number, default: 0 },
    },
    error: {
      code: String,
      message: String,
    },
    input: {
      jd: { type: String, required: true },
      company_url: { type: String, required: true },
      days: { type: Number, required: true },
      fingerprint: { type: String, index: true },
    },
    title: { type: String, default: 'Untitled kit' },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

kitSchema.index({ userId: 1, createdAt: -1 });

export const Kit = mongoose.models.Kit || mongoose.model('Kit', kitSchema);

export function fingerprint(jd, companyUrl) {
  const norm = `${(companyUrl || '').trim().toLowerCase()}::${(jd || '').trim().toLowerCase().slice(0, 2000)}`;
  let hash = 0;
  for (let i = 0; i < norm.length; i++) hash = (hash * 31 + norm.charCodeAt(i)) >>> 0;
  return `fp_${hash.toString(16)}`;
}
