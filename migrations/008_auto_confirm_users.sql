-- ============================================================================
-- Migration 008: Auto-Confirm Users in Supabase Auth
-- Purpose: Remove email confirmation requirement so users can sign up and
--          log in directly without confirming their email address.
-- ============================================================================

-- 1. Auto-confirm any existing unconfirmed users in auth.users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE email_confirmed_at IS NULL;
  END IF;
END $$;

-- 2. Trigger function to auto-confirm new users upon creation
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS trigger AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger to auth.users before insert
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
    CREATE TRIGGER on_auth_user_auto_confirm
      BEFORE INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.auto_confirm_new_user();
  END IF;
END $$;
