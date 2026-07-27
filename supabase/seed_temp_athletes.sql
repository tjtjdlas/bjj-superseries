-- 임시 테스트용 선수 10명 등록 (디자인 검토용)
-- Supabase 대시보드 > SQL Editor > New query 에 붙여넣고 Run 하세요.
-- 나중에 실제 명단으로 교체하려면 admin.html에서 편집 후 "지금 사이트에 반영하기"를 누르면
-- 이 데이터는 덮어써집니다.

update roster_state
set data = jsonb_set(data, '{athletes}', '[
  {"name":"김도윤","team":"OPMT 인천","weight":"-70kg","age":"성인","gender":"남"},
  {"name":"이서준","team":"와이어 주짓수","weight":"-77kg","age":"성인","gender":"남"},
  {"name":"박하은","team":"프리스타일 주짓수","weight":"-55kg","age":"성인","gender":"여"},
  {"name":"최지안","team":"그레이스바르셀로나 강남","weight":"-88kg","age":"성인","gender":"남"},
  {"name":"정유나","team":"클럽비투비","weight":"-60kg","age":"성인","gender":"여"},
  {"name":"강태오","team":"트라이엄프짐","weight":"-94kg","age":"성인","gender":"남"},
  {"name":"윤서아","team":"메가바트","weight":"-64kg","age":"청소년","gender":"여"},
  {"name":"임준서","team":"팀매드","weight":"-82kg","age":"성인","gender":"남"},
  {"name":"한소율","team":"디딤주짓수","weight":"-70kg","age":"성인","gender":"여"},
  {"name":"오민재","team":"레인메이커","weight":"무제한","age":"마스터","gender":"남"}
]'::jsonb)
where id = 1;
