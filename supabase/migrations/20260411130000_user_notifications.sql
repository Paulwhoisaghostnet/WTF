create table if not exists public.user_notifications (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  source_user_id integer references public.users(id) on delete set null,
  event_key varchar(80) not null,
  title varchar(220) not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamp not null default now()
);

create index if not exists user_notification_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notification_user_read_idx
  on public.user_notifications (user_id, read);

create index if not exists user_notification_event_idx
  on public.user_notifications (event_key);

create table if not exists public.user_notification_preferences (
  user_id integer primary key references public.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamp not null default now()
);
