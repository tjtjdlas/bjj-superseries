-- SPYDER BJJ SUPERSERIES — 대진표(bracket) realtime schema
-- Supabase 프로젝트의 "SQL Editor" -> "New query" 에 이 파일 내용을 전부 붙여넣고 Run 하세요.
-- roster_state 와 동일한 구조/권한 정책을 따릅니다. (공개 읽기 / 로그인 관리자 쓰기 / 실시간)

-- 1. 대진표 상태를 JSONB 한 덩어리로 저장하는 단일 행 테이블
--    draft     : 관리자가 편집 중인 초안 (공개 화면에는 노출되지 않음)
--    published : 실제 공개 화면에 노출되는 게시본
--    history   : 직전 게시본 스냅샷 목록(롤백용, 최근 10개까지)
create table if not exists bracket_state (
  id int primary key default 1,
  draft jsonb not null default '{"settings":{},"divisions":[]}'::jsonb,
  published jsonb not null default '{"settings":{},"divisions":[]}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  version int not null default 0,
  published_at timestamptz,
  published_by text,
  updated_at timestamptz not null default now(),
  constraint bracket_state_single_row check (id = 1)
);

insert into bracket_state (id) values (1) on conflict (id) do nothing;

-- 2. updated_at 자동 갱신
create or replace function set_bracket_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bracket_state_updated_at on bracket_state;
create trigger trg_bracket_state_updated_at
  before update on bracket_state
  for each row execute function set_bracket_updated_at();

-- 3. Row Level Security: 누구나 읽기 가능, 로그인한 관리자만 쓰기 가능
alter table bracket_state enable row level security;

drop policy if exists "Public can read bracket" on bracket_state;
create policy "Public can read bracket"
  on bracket_state for select
  using (true);

drop policy if exists "Authenticated can update bracket" on bracket_state;
create policy "Authenticated can update bracket"
  on bracket_state for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 4. 실시간(realtime) 구독 활성화 — 게시 즉시 공개 화면에 반영
alter publication supabase_realtime add table bracket_state;
