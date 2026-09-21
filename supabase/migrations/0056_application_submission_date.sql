-- A user-confirmed calendar date, never inferred from creation or stage changes.
alter table app.applications add column submitted_on date;
