-- Required for the "update your vibe" feature — checkins previously only had
-- select/insert/delete policies, no update policy, so any attempt to update
-- a check-in's vibe from the app would be silently rejected by Row Level
-- Security (rows just wouldn't change, no error surfaced to the user).
--
-- Run in the Supabase dashboard > SQL Editor > New query. Safe to re-run
-- (drops and recreates the policy rather than erroring if it already exists).

drop policy if exists "Users update their own checkins" on checkins;

create policy "Users update their own checkins"
  on checkins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
