-- Contract activity ledger for admin observability.
-- Records attempted/success/failed contract UX interactions in UTC.

DO $$
BEGIN
  CREATE TYPE public.contract_activity_status AS ENUM ('attempt', 'success', 'failure');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.contract_activity_logs (
  id serial PRIMARY KEY,
  interaction_id varchar(80) NOT NULL,
  user_id integer,
  wallet_address varchar(36),
  module varchar(60) NOT NULL,
  action varchar(120) NOT NULL,
  status public.contract_activity_status NOT NULL DEFAULT 'attempt',
  contract_address varchar(36),
  entrypoint varchar(120),
  op_hash varchar(51),
  network varchar(24),
  rpc_url text,
  params jsonb,
  error text,
  client_timestamp timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.contract_activity_logs
    ADD CONSTRAINT contract_activity_logs_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS contract_activity_created_at_idx
  ON public.contract_activity_logs(created_at);

CREATE INDEX IF NOT EXISTS contract_activity_status_idx
  ON public.contract_activity_logs(status);

CREATE INDEX IF NOT EXISTS contract_activity_wallet_idx
  ON public.contract_activity_logs(wallet_address);

CREATE INDEX IF NOT EXISTS contract_activity_interaction_idx
  ON public.contract_activity_logs(interaction_id);
