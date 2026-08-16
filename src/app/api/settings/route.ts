import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { userId, schoolSlug } = await request.json();

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error } = await supabase
      .from('users')
      .update({ school_slug: schoolSlug || null })
      .eq('id', userId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Return updated user
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, school_slug, created_at')
      .eq('id', userId)
      .single();

    return NextResponse.json({ success: true, user });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
