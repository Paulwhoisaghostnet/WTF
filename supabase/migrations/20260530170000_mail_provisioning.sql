-- wtfOS mail provisioning: bot mailboxes + nullable user ownership
DO $$ BEGIN
  CREATE TYPE mail_owner_kind AS ENUM ('user', 'bot');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE mail_mailboxes
  ADD COLUMN IF NOT EXISTS owner_kind mail_owner_kind NOT NULL DEFAULT 'user';

ALTER TABLE mail_mailboxes
  ADD COLUMN IF NOT EXISTS app_id varchar(160);

ALTER TABLE mail_mailboxes
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE mail_messages
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS mail_mailboxes_app_idx ON mail_mailboxes (app_id);
