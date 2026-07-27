-- SPYDER BJJ SUPERSERIES — roster realtime schema
-- Supabase 프로젝트 생성 후, 왼쪽 메뉴의 "SQL Editor" -> "New query" 에
-- 이 파일 내용을 전부 붙여넣고 Run 하세요.

-- 1. 명단 전체 상태(categories + athletes)를 JSONB 한 덩어리로 저장하는 단일 행 테이블
create table if not exists roster_state (
  id int primary key default 1,
  data jsonb not null default '{
    "categories": [
      {"key": "weight", "label": "체급"},
      {"key": "age", "label": "연령"},
      {"key": "gender", "label": "성별"}
    ],
    "athletes": []
  }'::jsonb,
  updated_at timestamptz not null default now(),
  constraint roster_state_single_row check (id = 1)
);

insert into roster_state (id, data)
values (1, '{
  "categories": [
    {"key": "weight", "label": "체급"},
    {"key": "age", "label": "연령"},
    {"key": "gender", "label": "성별"}
  ],
  "athletes": []
}'::jsonb)
on conflict (id) do nothing;

-- 2. updated_at 자동 갱신
create or replace function set_roster_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_roster_state_updated_at on roster_state;
create trigger trg_roster_state_updated_at
  before update on roster_state
  for each row execute function set_roster_updated_at();

-- 3. Row Level Security: 누구나 읽기 가능, 로그인한 관리자만 쓰기 가능
alter table roster_state enable row level security;

drop policy if exists "Public can read roster" on roster_state;
create policy "Public can read roster"
  on roster_state for select
  using (true);

drop policy if exists "Authenticated can update roster" on roster_state;
create policy "Authenticated can update roster"
  on roster_state for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 4. 실시간(realtime) 구독 활성화
alter publication supabase_realtime add table roster_state;
