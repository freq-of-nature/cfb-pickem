import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { hashPin } from '@/lib/hash';

export async function POST(request: Request) {
  try {
    const { firstName, lastName, pin } = await request.json();

    if (!firstName || !lastName || !pin) {
      return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const pinHash = hashPin(pin);

    // Find user by name and pin
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, school_slug, created_at')
      .ilike('first_name', firstName.trim())
      .ilike('last_name', lastName.trim())
      .eq('pin_hash', pinHash)
      .single();

    if (error || !user) {
      return NextResponse.json({ success: false, error: 'Invalid name or PIN' }, { status: 401 });
    }

    return NextResponse.json({ success: true, user });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
