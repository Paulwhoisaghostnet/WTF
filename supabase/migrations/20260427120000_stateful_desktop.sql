-- Stateful desktop appearance, icon layout, and hamster pet telemetry.
-- Safe to run repeatedly across local and Supabase environments.

CREATE TABLE IF NOT EXISTS public.user_desktop_settings (
  user_id integer PRIMARY KEY,
  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.desktop_pet_states (
  user_id integer PRIMARY KEY,
  name varchar(40) NOT NULL DEFAULT 'Niblet',
  alive boolean NOT NULL DEFAULT true,
  hunger integer NOT NULL DEFAULT 72,
  thirst integer NOT NULL DEFAULT 72,
  happiness integer NOT NULL DEFAULT 68,
  hygiene integer NOT NULL DEFAULT 70,
  energy integer NOT NULL DEFAULT 64,
  level integer NOT NULL DEFAULT 1,
  xp_earned integer NOT NULL DEFAULT 0,
  missed_care_days integer NOT NULL DEFAULT 0,
  care_streak integer NOT NULL DEFAULT 0,
  last_care_date date,
  last_interaction_at timestamp,
  interaction_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.desktop_pet_events (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  action varchar(40) NOT NULL,
  stat_before jsonb,
  stat_after jsonb,
  xp_amount integer NOT NULL DEFAULT 0,
  xp_event_id integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.user_desktop_settings
    ADD CONSTRAINT user_desktop_settings_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.desktop_pet_states
    ADD CONSTRAINT desktop_pet_states_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.desktop_pet_events
    ADD CONSTRAINT desktop_pet_events_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.desktop_pet_events
    ADD CONSTRAINT desktop_pet_events_xp_event_id_xp_events_id_fk
    FOREIGN KEY (xp_event_id) REFERENCES public.xp_events(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS desktop_pet_event_user_created_idx
  ON public.desktop_pet_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS desktop_pet_event_action_idx
  ON public.desktop_pet_events (action);
