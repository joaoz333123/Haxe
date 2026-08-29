import Redis from 'ioredis';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const STORAGE_KEY = 'haxe_rateio_data';

const DEFAULT_DATA = {
  participants: [
    { id: '1', name: 'João Zanetti' },
    { id: '2', name: 'Willian' },
    { id: '3', name: 'Weslen' },
  ],
  transactions: [],
  settledCycles: [],
};

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (!url) {
    return null;
  }
  if (!redisClient) {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      lazyConnect: true,
    });
  }
  return redisClient;
}

export async function GET() {
  try {
    const redis = getRedisClient();
    if (!redis) {
      return NextResponse.json({ ...DEFAULT_DATA, _offlineFallback: true });
    }
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const rawData = await redis.get(STORAGE_KEY);
    if (!rawData) {
      return NextResponse.json(DEFAULT_DATA);
    }
    const data = JSON.parse(rawData);
    return NextResponse.json(data);
  } catch (error) {
    console.warn('Redis connection fallback:', error);
    return NextResponse.json({ ...DEFAULT_DATA, _offlineFallback: true });
  }
}

export async function POST(request: Request) {
  try {
    const redis = getRedisClient();
    if (!redis) {
      return NextResponse.json({ error: 'REDIS_URL not configured' }, { status: 500 });
    }
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const body = await request.json();
    await redis.set(STORAGE_KEY, JSON.stringify(body));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Redis Save Error:', error);
    return NextResponse.json({ error: 'Failed to save to Redis' }, { status: 500 });
  }
}
