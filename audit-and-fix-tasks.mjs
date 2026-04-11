#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing Supabase credentials');
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Infer target_repo based on task description/title
function inferTargetRepo(task) {
  const text = `${task.title || ''} ${task.summary || ''} ${task.notes || ''}`.toLowerCase();
  
  if (text.includes('myxxit')) return 'myxxit-app';
  if (text.includes('devops') || text.includes('hq') || text.includes('dashboard')) return 'myxxit-devops-hq';
  if (text.includes('drinx') || text.includes('the drinx')) return 'the-drinx-app';
  if (text.includes('infra') || text.includes('infrastructure') || text.includes('deploy')) return 'infrastructure';
  
  // Default to 'infrastructure' or 'myxxit-app' based on heuristics
  return 'TBD';
}

async function auditAndFixTasks() {
  try {
    console.log('Fetching all tasks...');
    const { data: tasks, error } = await supabase.from('tasks').select('*');
    
    if (error) {
      throw new Error(`Failed to load tasks: ${error.message}`);
    }
    
    console.log(`Found ${tasks?.length || 0} tasks\n`);
    
    const tasksMissingRepo = (tasks || []).filter(t => !t.target_repo);
    console.log(`Tasks missing target_repo: ${tasksMissingRepo.length}\n`);
    
    const updates = [];
    for (const task of tasksMissingRepo) {
      const inferred = inferTargetRepo(task);
      console.log(`Task: ${task.id}`);
      console.log(`  Title: ${task.title}`);
      console.log(`  Current target_repo: "${task.target_repo || 'MISSING'}"`);
      console.log(`  Inferred: ${inferred}`);
      
      updates.push({ id: task.id, target_repo: inferred });
    }
    
    if (updates.length === 0) {
      console.log('\nAll tasks already have target_repo set!');
      return;
    }
    
    console.log(`\nUpdating ${updates.length} tasks...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ target_repo: update.target_repo })
        .eq('id', update.id);
      
      if (updateError) {
        console.log(`✗ Failed to update ${update.id}: ${updateError.message}`);
        errorCount++;
      } else {
        console.log(`✓ Updated ${update.id} with target_repo: ${update.target_repo}`);
        successCount++;
      }
    }
    
    console.log(`\nResults: ${successCount} updated, ${errorCount} failed`);
    
    // Verify
    console.log('\nVerifying...');
    const { data: tasksAfter, error: verifyError } = await supabase.from('tasks').select('*');
    if (verifyError) {
      throw verifyError;
    }
    
    const stillMissing = (tasksAfter || []).filter(t => !t.target_repo);
    console.log(`Tasks still missing target_repo: ${stillMissing.length}`);
    
    if (stillMissing.length === 0) {
      console.log('\n✓ All tasks now have target_repo populated!');
    }
    
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

auditAndFixTasks();
