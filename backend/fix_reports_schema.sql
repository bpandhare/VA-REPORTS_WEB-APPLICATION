-- Fix schema for hourly_reports and daily_target_reports to ensure all required columns exist and allow NULLs where appropriate
ALTER TABLE hourly_reports 
  ADD COLUMN IF NOT EXISTS project_no VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS user_id INT NULL;

ALTER TABLE daily_target_reports 
  ADD COLUMN IF NOT EXISTS project_no VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS user_id INT NULL;

-- Make sure columns allow NULLs (for legacy data)
ALTER TABLE hourly_reports 
  MODIFY COLUMN project_no VARCHAR(120) NULL,
  MODIFY COLUMN project_name VARCHAR(120) NULL,
  MODIFY COLUMN user_id INT NULL;

ALTER TABLE daily_target_reports 
  MODIFY COLUMN project_no VARCHAR(120) NULL,
  MODIFY COLUMN project_name VARCHAR(120) NULL,
  MODIFY COLUMN user_id INT NULL;
