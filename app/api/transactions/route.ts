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

export async function GET() {
  try {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      return NextResponse.json({ ...DEFAULT_DATA, _offlineFallback: true });
    }

    const res = await fetch(`${url}/get/${STORAGE_KEY}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ ...DEFAULT_DATA, _offlineFallback: true });
    }

    const data = await res.json();
    if (!data || data.result === null || data.result === undefined) {
      return NextResponse.json(DEFAULT_DATA);
    }

    const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    return NextResponse.json(parsed);
  } catch (error) {
    console.warn('KV GET offline fallback:', error);
    return NextResponse.json({ ...DEFAULT_DATA, _offlineFallback: true });
  }
}

export async function POST(request: Request) {
  try {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      return NextResponse.json({ error: 'KV variables not configured' }, { status: 500 });
    }

    const body = await request.json();

    const res = await fetch(`${url}/set/${STORAGE_KEY}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(JSON.stringify(body)),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to save to KV' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('KV POST Save Error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
