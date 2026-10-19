-- Private pages stay in the application database, never in public site/PDS snapshots.
ALTER TABLE wtf_user_site_pages ADD COLUMN IF NOT EXISTS visibility varchar(16) NOT NULL DEFAULT 'public';
ALTER TABLE wtf_user_site_pages ADD COLUMN IF NOT EXISTS private_published_html text;
ALTER TABLE wtf_user_site_pages ADD COLUMN IF NOT EXISTS private_published_title text;
ALTER TABLE wtf_user_site_pages ADD COLUMN IF NOT EXISTS private_published_at timestamp;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wtf_user_site_page_visibility_check') THEN
    ALTER TABLE wtf_user_site_pages ADD CONSTRAINT wtf_user_site_page_visibility_check CHECK (visibility IN ('public', 'private'));
  END IF;
END $$;

INSERT INTO roles (slug, label, category, purpose, description, default_wtf_os_access, is_system, is_assignable)
VALUES ('gameshow_creator', 'Gameshow Creator', 'gameshow', 'Scoped Macaroni access supplied with the host-prepared Pasta contestant toolkit.', 'Only managed Macaroni permission. No administrative or trusted-publishing bypass. Revoke through Roles.', false, true, true)
ON CONFLICT (slug) DO NOTHING;
