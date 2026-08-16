import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { hashPin } from '@/lib/hash';

export async function POST(request: Request) {
  try {
    const { firstName, lastName, pin } = await request.json();

    if (!firstName || !lastName || !pin) {
      return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 });
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ success: false, error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const pinHash = hashPin(pin);

    // Check if user already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .ilike('first_name', firstName.trim())
      .ilike('last_name', lastName.trim())
      .single();

    if (existing) {
      return NextResponse.json({ success: false, error: 'A user with that name already exists. Try logging in instead.' }, { status: 409 });
    }

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        pin_hash: pinHash,
      })
      .select('id, first_name, last_name, school_slug, created_at')
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to create account' }, { status: 500 });
    }

    return NextResponse.json({ success: true, user });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
