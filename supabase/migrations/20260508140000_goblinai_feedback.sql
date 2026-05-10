create table if not exists public.goblinai_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.goblinai_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  correction text not null,
  original_answer text not null,
  conversation_context text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists goblinai_feedback_message_idx
  on public.goblinai_feedback (message_id);

alter table public.goblinai_feedback enable row level security;

drop policy if exists goblinai_feedback_owner_all on public.goblinai_feedback;
create policy goblinai_feedback_owner_all on public.goblinai_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
