-- Phase 1: Audit and Populate target_repo Field
-- Run this on Supabase PostgREST or via SQL Editor
-- This script:
-- 1. Identifies all tasks missing target_repo
-- 2. Infers appropriate repo based on task metadata
-- 3. Updates all tasks with inferred target_repo

-- Step 1: Audit - Show all tasks missing target_repo
SELECT 
  id,
  title,
  summary,
  notes,
  CASE
    WHEN title ILIKE '%myxxit%' OR summary ILIKE '%myxxit%' OR notes ILIKE '%myxxit%' THEN 'myxxit-app'
    WHEN title ILIKE '%devops%' OR title ILIKE '%hq%' OR title ILIKE '%dashboard%' 
         OR summary ILIKE '%devops%' OR summary ILIKE '%hq%' 
         OR notes ILIKE '%devops%' OR notes ILIKE '%hq%' THEN 'myxxit-devops-hq'
    WHEN title ILIKE '%drinx%' OR summary ILIKE '%drinx%' OR notes ILIKE '%drinx%' THEN 'the-drinx-app'
    WHEN title ILIKE '%infra%' OR title ILIKE '%infrastructure%' OR title ILIKE '%deploy%'
         OR summary ILIKE '%infra%' OR summary ILIKE '%deploy%'
         OR notes ILIKE '%infra%' OR notes ILIKE '%deploy%' THEN 'infrastructure'
    ELSE 'TBD'
  END AS inferred_repo
FROM tasks
WHERE target_repo IS NULL OR target_repo = ''
ORDER BY created_at DESC;

-- Step 2: Count of tasks needing update
SELECT COUNT(*) as tasks_missing_target_repo
FROM tasks
WHERE target_repo IS NULL OR target_repo = '';

-- Step 3: Update all tasks with inferred target_repo
UPDATE tasks
SET target_repo = CASE
  WHEN title ILIKE '%myxxit%' OR summary ILIKE '%myxxit%' OR notes ILIKE '%myxxit%' THEN 'myxxit-app'
  WHEN title ILIKE '%devops%' OR title ILIKE '%hq%' OR title ILIKE '%dashboard%' 
       OR summary ILIKE '%devops%' OR summary ILIKE '%hq%' 
       OR notes ILIKE '%devops%' OR notes ILIKE '%hq%' THEN 'myxxit-devops-hq'
  WHEN title ILIKE '%drinx%' OR summary ILIKE '%drinx%' OR notes ILIKE '%drinx%' THEN 'the-drinx-app'
  WHEN title ILIKE '%infra%' OR title ILIKE '%infrastructure%' OR title ILIKE '%deploy%'
       OR summary ILIKE '%infra%' OR summary ILIKE '%deploy%'
       OR notes ILIKE '%infra%' OR notes ILIKE '%deploy%' THEN 'infrastructure'
  ELSE 'TBD'
END
WHERE target_repo IS NULL OR target_repo = ''
RETURNING id, title, target_repo;

-- Step 4: Verify - Show all tasks now have target_repo
SELECT COUNT(*) as total_tasks, COUNT(CASE WHEN target_repo IS NOT NULL AND target_repo != '' THEN 1 END) as with_target_repo
FROM tasks;

-- Step 5: Distribution of repos after update
SELECT target_repo, COUNT(*) as count
FROM tasks
GROUP BY target_repo
ORDER BY count DESC;
