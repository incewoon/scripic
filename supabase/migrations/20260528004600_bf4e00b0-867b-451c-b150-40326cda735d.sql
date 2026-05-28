DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS public.purchases CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.consume_album_credit() CASCADE;
DROP FUNCTION IF EXISTS public.add_album_credits(integer) CASCADE;
DROP FUNCTION IF EXISTS public.activate_subscription(timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_profile_privilege_escalation() CASCADE;