import { kv } from '@vercel/kv';
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
    const data = await kv.get(STORAGE_KEY);
    if (!data) {
      return NextResponse.json(DEFAULT_DATA);
    }
    return NextResponse.json(data);
  } catch (error) {
    console.warn('Vercel KV offline fallback:', error);
    return NextResponse.json({ ...DEFAULT_DATA, _offlineFallback: true });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await kv.set(STORAGE_KEY, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Vercel KV Save Error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
