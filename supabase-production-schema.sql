create table if not exists email_records (
    id uuid primary key,
    provider_email_id text,
    email text not null,
    subject text not null default '',
    recipient_name text not null default '',
    recipient_type text not null default '',
    category text not null default '',
    group_name text not null default '',
    markdown text not null default '',
    button_text text not null default '',
    button_link text not null default '',
    html text not null default '',
    status text not null default 'sent',
    sent_at timestamptz,
    delivered_at timestamptz,
    opened_at timestamptz,
    bounced_at timestamptz,
    failed_at timestamptz,
    bounce jsonb,
    error jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists email_records_email_idx on email_records(email);
create index if not exists email_records_status_idx on email_records(status);
create index if not exists email_records_created_at_idx on email_records(created_at desc);
create index if not exists email_records_provider_email_id_idx on email_records(provider_email_id);

create table if not exists processed_webhook_ids (
    id text primary key,
    created_at timestamptz not null default now()
);

create table if not exists webhook_events (
    id uuid primary key default gen_random_uuid(),
    svix_id text unique,
    type text not null default '',
    provider_email_id text,
    recipients jsonb not null default '[]'::jsonb,
    subject text not null default '',
    received_at timestamptz not null default now()
);

create index if not exists webhook_events_received_at_idx on webhook_events(received_at desc);

create table if not exists campaign_drafts (
    id uuid primary key,
    campaign jsonb not null default '{}'::jsonb,
    summary jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists campaign_drafts_updated_at_idx on campaign_drafts(updated_at desc);

create table if not exists scheduled_campaigns (
    id uuid primary key,
    status text not null default 'scheduled',
    campaign jsonb not null default '{}'::jsonb,
    summary jsonb not null default '{}'::jsonb,
    scheduled_at timestamptz not null,
    sent_at timestamptz,
    results jsonb,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists scheduled_campaigns_status_idx on scheduled_campaigns(status);
create index if not exists scheduled_campaigns_scheduled_at_idx on scheduled_campaigns(scheduled_at);

alter table email_records enable row level security;
alter table processed_webhook_ids enable row level security;
alter table webhook_events enable row level security;
alter table campaign_drafts enable row level security;
alter table scheduled_campaigns enable row level security;

-- These tables are written through the Express backend with SUPABASE_SERVICE_ROLE_KEY.
-- Do not add public anon policies for these tables unless you also add real admin auth.
