WITH normalized_desktop_appearance AS (
  SELECT
    "user_id",
    CASE
      WHEN jsonb_typeof("appearance") = 'object' THEN "appearance"
      ELSE '{}'::jsonb
    END AS "base_appearance"
  FROM "user_desktop_settings"
)
UPDATE "user_desktop_settings" AS "settings"
   SET "appearance" =
     "normalized"."base_appearance"
     || jsonb_build_object('fontPackKey', 'wtfos-soft-system')
     || jsonb_build_object(
       'wimChatStyle',
       CASE
         WHEN jsonb_typeof("normalized"."base_appearance"->'wimChatStyle') = 'object'
           THEN "normalized"."base_appearance"->'wimChatStyle'
         ELSE '{}'::jsonb
       END
       || jsonb_build_object('fontFamily', 'wtfOS Soft Sans')
     )
     || jsonb_build_object(
       'wtfLiveChatStyle',
       CASE
         WHEN jsonb_typeof("normalized"."base_appearance"->'wtfLiveChatStyle') = 'object'
           THEN "normalized"."base_appearance"->'wtfLiveChatStyle'
         ELSE '{}'::jsonb
       END
       || jsonb_build_object('font', 'wtfos-soft-system')
     ),
       "updated_at" = now()
  FROM "normalized_desktop_appearance" AS "normalized"
 WHERE "settings"."user_id" = "normalized"."user_id"
   AND (
     COALESCE("normalized"."base_appearance"->>'fontPackKey', '') <> 'wtfos-soft-system'
     OR COALESCE("normalized"."base_appearance"->'wimChatStyle'->>'fontFamily', '') <> 'wtfOS Soft Sans'
     OR COALESCE("normalized"."base_appearance"->'wtfLiveChatStyle'->>'font', '') <> 'wtfos-soft-system'
   );
