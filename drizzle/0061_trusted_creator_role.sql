DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role'
      AND e.enumlabel = 'trusted_creator'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'trusted_creator' AFTER 'resident_wizard';
  END IF;
END $$;
