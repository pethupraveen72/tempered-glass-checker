-- Glass stock: the protectors actually held, as their own records.
--
-- Until this runs, measurements live only in one browser's local storage, so a
-- second device or a cleared cache loses them. Run it in the Supabase SQL
-- editor. The app detects whether the table exists and keeps working either
-- way, so this migration is safe to apply at any time.

create table if not exists glass_stock (
    id          uuid primary key default gen_random_uuid(),
    sku         text not null unique,
    label       text,
    -- The phone model the protector is sold for. Its catalogue entry supplies
    -- the screen shape and notch type a compatibility check compares against.
    source_model text,
    source_brand text,
    glass_type  text not null check (glass_type in ('Type A', 'Type B', 'Type C')),
    height_mm   numeric not null check (height_mm > 0),
    width_mm    numeric not null check (width_mm > 0),
    thickness_mm numeric check (thickness_mm > 0),
    quantity    integer not null default 0 check (quantity >= 0),
    supplier    text,
    shelf       text,
    notes       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists glass_stock_source_model_idx on glass_stock (source_model);

create or replace function set_updated_at() returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists glass_stock_updated_at on glass_stock;
create trigger glass_stock_updated_at before update on glass_stock
    for each row execute function set_updated_at();

-- Stock is read by the browser with the public anon key but written only by the
-- API, which requires MANUAL_ENTRY_TOKEN. Granting anon any write here would
-- let anyone edit your inventory, because the anon key ships in the frontend
-- bundle.
alter table glass_stock enable row level security;

drop policy if exists "glass_stock public read" on glass_stock;
create policy "glass_stock public read" on glass_stock for select to anon using (true);

-- Deliberately no anon insert/update/delete policy. The API must therefore use
-- a service-role key (SUPABASE_SERVICE_KEY, never a VITE_ name) to write.
