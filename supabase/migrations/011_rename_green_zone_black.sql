-- Rename zone 'Green' to 'Black' in all tables that store zone values.
-- No CHECK constraints exist on these columns so a plain UPDATE is sufficient.
UPDATE users SET zone = 'Black' WHERE zone = 'Green';
UPDATE churches SET zone = 'Black' WHERE zone = 'Green';
