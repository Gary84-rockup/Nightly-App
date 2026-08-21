-- add-plans.sql only granted SELECT/INSERT/DELETE on `plans` — without an
-- UPDATE policy, editing a plan succeeds at the network layer but RLS
-- silently matches zero rows, so the edit looks like it saved but never
-- actually changes anything. Added 2026-08-21 alongside the "edit your plan"
-- UI. Run via `supabase db query --linked -f add-plans-update-policy.sql`.

drop policy if exists "Users update their own plans" on plans;
create policy "Users update their own plans"
  on plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
