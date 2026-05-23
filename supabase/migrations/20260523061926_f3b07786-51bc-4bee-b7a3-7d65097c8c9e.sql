
-- 1) Prevent users from updating privileged profile columns
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role to change anything
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.album_credits IS DISTINCT FROM OLD.album_credits
     OR NEW.albums_created IS DISTINCT FROM OLD.albums_created
     OR NEW.is_subscribed IS DISTINCT FROM OLD.is_subscribed
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date THEN
    RAISE EXCEPTION 'Not allowed to modify subscription or credit fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Remove user INSERT policy on purchases
DROP POLICY IF EXISTS "Users can insert own purchases" ON public.purchases;

-- 3) Lock down SECURITY DEFINER functions to service_role only
REVOKE EXECUTE ON FUNCTION public.add_album_credits(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_subscription(timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_album_credit() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.add_album_credits(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_subscription(timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_album_credit() TO service_role;
