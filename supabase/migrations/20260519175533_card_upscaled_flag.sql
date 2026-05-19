-- Denormalized card image upscale availability for public card browsing.

alter table public.cards
  add column if not exists has_upscaled_2x boolean not null default false;

create index if not exists idx_cards_has_upscaled_2x
  on public.cards (has_upscaled_2x)
  where has_upscaled_2x = true;

create or replace function public.refresh_card_has_upscaled_2x(target_card_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.cards
  set has_upscaled_2x = exists (
    select 1
    from public.card_image_assets assets
    where assets.card_id = target_card_id
      and assets.target_profile = 'hd-2x'
      and assets.status = 'ready'
      and assets.storage_path is not null
  )
  where id = target_card_id;
$$;

create or replace function public.handle_card_image_asset_upscaled_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_card_has_upscaled_2x(new.card_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform public.refresh_card_has_upscaled_2x(new.card_id);
    if old.card_id is distinct from new.card_id then
      perform public.refresh_card_has_upscaled_2x(old.card_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.refresh_card_has_upscaled_2x(old.card_id);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_card_image_assets_upscaled_flag on public.card_image_assets;

create trigger trg_card_image_assets_upscaled_flag
  after insert or update or delete on public.card_image_assets
  for each row execute function public.handle_card_image_asset_upscaled_flag();

update public.cards
set has_upscaled_2x = true
where id in (
  select distinct card_id
  from public.card_image_assets assets
  where assets.target_profile = 'hd-2x'
    and assets.status = 'ready'
    and assets.storage_path is not null
);
