-- Add username to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- Unique constraint so two users can't have the same username
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (username) WHERE username IS NOT NULL;
