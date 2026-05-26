
-- Attach the existing privilege-escalation guard to the profiles table
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Explicitly deny client writes on purchases (service_role bypasses RLS).
DROP POLICY IF EXISTS "No client inserts on purchases" ON public.purchases;
CREATE POLICY "No client inserts on purchases"
  ON public.purchases
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client updates on purchases" ON public.purchases;
CREATE POLICY "No client updates on purchases"
  ON public.purchases
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client deletes on purchases" ON public.purchases;
CREATE POLICY "No client deletes on purchases"
  ON public.purchases
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);
