-- Add notification preferences and tracking to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notifications_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_album_created_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamp with time zone;