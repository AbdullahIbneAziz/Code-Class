-- Task 10: display names are 1-60 characters.
alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) between 1 and 60);
