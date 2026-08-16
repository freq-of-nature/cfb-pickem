import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { hashPin } from '@/lib/hash';

export async function POST(request: Request) {
  try {
    const { username, pin } = await request.json();

    if (!username || !pin) {
      return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const pinHash = hashPin(pin);

    const { data: admin, error } = await supabase
      .from('admin_credentials')
      .select('id')
      .eq('username', username.trim())
      .eq('pin_hash', pinHash)
      .single();

    if (error || !admin) {
      return NextResponse.json({ success: false, error: 'Invalid admin credentials' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
