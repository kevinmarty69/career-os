alter table app.search_profiles
  add column alert_threshold integer
  check (alert_threshold between 0 and 100);
