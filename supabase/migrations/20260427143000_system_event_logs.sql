-- Master structured system log for the WTF app environment.
-- Safe to run repeatedly across local and Supabase environments.

CREATE TABLE IF NOT EXISTS public.system_event_logs (
  id serial PRIMARY KEY,
  event_id varchar(64) NOT NULL,
  request_id varchar(64),
  source varchar(80) NOT NULL,
  event_type varchar(120) NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'info',
  message text,
  user_id integer,
  method varchar(16),
  path text,
  status_code integer,
  duration_ms integer,
  ip varchar(120),
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_name varchar(255),
  error_message text,
  error_stack text,
  created_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.system_event_logs
    ADD CONSTRAINT system_event_logs_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS system_event_logs_event_id_idx
  ON public.system_event_logs (event_id);

CREATE INDEX IF NOT EXISTS system_event_logs_created_idx
  ON public.system_event_logs (created_at);

CREATE INDEX IF NOT EXISTS system_event_logs_request_idx
  ON public.system_event_logs (request_id);

CREATE INDEX IF NOT EXISTS system_event_logs_source_created_idx
  ON public.system_event_logs (source, created_at);

CREATE INDEX IF NOT EXISTS system_event_logs_type_created_idx
  ON public.system_event_logs (event_type, created_at);

CREATE INDEX IF NOT EXISTS system_event_logs_severity_created_idx
  ON public.system_event_logs (severity, created_at);

CREATE INDEX IF NOT EXISTS system_event_logs_user_created_idx
  ON public.system_event_logs (user_id, created_at);

CREATE INDEX IF NOT EXISTS system_event_logs_status_created_idx
  ON public.system_event_logs (status_code, created_at);
