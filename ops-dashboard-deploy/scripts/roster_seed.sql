-- Myxxit Ops Dashboard roster data model + seed
-- Run inside the Supabase SQL editor (or psql) pointed at the ops dashboard database.
-- This brings the org chart / roster data into first-class tables used by the UI.

create extension if not exists "pgcrypto";

create table if not exists public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  lane text not null,
  lane_order int not null default 0,
  display_name text not null,
  role_label text not null,
  primary_responsibility text not null,
  default_model text,
  fallback_model text,
  approval_required text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists roster_entries_display_name_idx on public.roster_entries(display_name);

create or replace function public.set_roster_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists roster_entries_set_updated_at on public.roster_entries;
create trigger roster_entries_set_updated_at
before update on public.roster_entries
for each row execute function public.set_roster_updated_at();

insert into public.roster_entries (
  lane, lane_order, display_name, role_label,
  primary_responsibility, default_model, fallback_model,
  approval_required, notes, active
) values
  ('leadership', 1, 'Travis', 'Founder / Owner',
    'Final approvals, product vision, business direction', null, null,
    'Final approver on meaningful risk / cost decisions', 'Keep out of routine decomposition or implementation wrangling.', true),
  ('leadership', 2, 'Selym', 'CTO / GM',
    'Orchestrates work, routes bots, reviews output, escalates real decisions', 'openai/gpt-5.4', null,
    'Acts as orchestrator; no additional approval needed', 'Sits between Travis and worker lanes.', true),
  ('core', 3, 'Product Analyst Bot', 'Analyst / BA',
    'Turn features into tasks, map dependencies, set acceptance criteria', 'openai/gpt-5.4', 'google/gemini-2.5-flash',
    'Only when materially changing product scope', 'Keeps vague requests from reaching dev lanes.', true),
  ('core', 4, 'Research Bot', 'Research / Comparison',
    'Competitor scans, precedent finding, external validation', 'google/gemini-2.5-flash', 'google/gemini-2.5-pro',
    'No for routine research', 'Cheap broad scan lane; escalate only for deep dives.', true),
  ('core', 5, 'Core App Developer Bot', 'Fullstack Implementation',
    'Feature implementation, fixes, refactors, product code execution', 'openai/gpt-5.1-codex', null,
    'Reviewed by Selym; Travis approves meaningful product changes', 'Main coding lane.', true),
  ('core', 6, 'QA / Validation Bot', 'Tester / Verifier',
    'Validate behavior, test scenarios, catch regressions', 'openai/gpt-5.4', 'google/gemini-2.5-flash',
    'No for validation work', 'Keeps the system honest.', true),
  ('core', 7, 'DevOps / Platform Bot', 'Infra / Deployment',
    'Deploy path, scripts, environment setup, platform stability', 'openai/gpt-5.1-codex', 'openai/gpt-5.4',
    'Yes for meaningful infra/security changes', 'Major initiative lane, not side cleanup.', true),
  ('core', 8, 'Dashboard / Internal Tools Bot', 'Internal Product Maintainer',
    'Dev Ops HQ UX, approval controls, progress UI, workflow tooling', 'openai/gpt-5.1-codex', 'openai/gpt-5.4',
    'UI polish no; security/access changes yes', 'Treat the dashboard as a real internal product.', false),
  ('specialist', 9, 'Auth / Security Bot', 'Security Specialist',
    'Auth flows, permissions, RLS, admin access, impersonation boundaries', 'openai/gpt-5.4', 'google/gemini-2.5-pro',
    'Yes for production-impacting auth/security changes', 'High-risk lane; bring online when pressure increases.', false),
  ('specialist', 10, 'Payments / Tickets Bot', 'Commerce Specialist',
    'Ticket tiers, payment/webhook flows, event entitlements', 'openai/gpt-5.1-codex', 'openai/gpt-5.4',
    'Yes for business-critical payment changes', 'Ensures commercial correctness.', false)

on conflict (display_name) do update set
  lane = excluded.lane,
  lane_order = excluded.lane_order,
  role_label = excluded.role_label,
  primary_responsibility = excluded.primary_responsibility,
  default_model = excluded.default_model,
  fallback_model = excluded.fallback_model,
  approval_required = excluded.approval_required,
  notes = excluded.notes,
  active = excluded.active;
