DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role'
      AND e.enumlabel = 'time_out'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'time_out' AFTER 'witness';
  END IF;
END $$;
