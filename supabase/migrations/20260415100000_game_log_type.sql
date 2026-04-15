alter table public.game_log add column if not exists type text not null default 'action';
