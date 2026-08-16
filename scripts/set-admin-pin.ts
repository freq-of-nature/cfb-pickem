// Run this locally to set your admin PIN:
//   npx tsx scripts/set-admin-pin.ts <username> <4-digit-pin>
//
// Example:
//   npx tsx scripts/set-admin-pin.ts admin 1234

import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npx tsx scripts/set-admin-pin.ts <username> <pin>');
  process.exit(1);
}

const [username, pin] = args;
const pinHash = createHash('sha256').update(pin).digest('hex');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { error } = await supabase
    .from('admin_credentials')
    .update({ username, pin_hash: pinHash })
    .eq('id', 1);

  if (error) {
    console.error('Failed to set admin credentials:', error.message);
    process.exit(1);
  }

  console.log(`Admin credentials set! Username: ${username}`);
}

main();
