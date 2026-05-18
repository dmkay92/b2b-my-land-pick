# Supabase Setup

1. Create a project at https://supabase.com
2. Copy your Project URL and API keys to `.env.local`
3. Go to SQL Editor in Supabase Dashboard
4. Run the SQL in `migrations/20260326000000_initial.sql`
5. Verify tables are created in Table Editor

## Admin Account Setup
After running the migration, create an admin user:
1. Go to Authentication > Users > Add User
2. Enter admin email/password
3. Run in SQL Editor:
   ```sql
   update public.profiles set role = 'admin', status = 'approved'
   where email = 'your-admin@email.com';
   ```
