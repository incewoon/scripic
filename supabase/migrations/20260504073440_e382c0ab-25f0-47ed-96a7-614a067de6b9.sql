-- Lock down credit-granting functions: only service role can call them.
-- Client-side code MUST NOT be able to grant credits or activate subscriptions.
REVOKE EXECUTE ON FUNCTION public.add_album_credits(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_subscription(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- consume_album_credit: only signed-in users
REVOKE EXECUTE ON FUNCTION public.consume_album_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_album_credit() TO authenticated;