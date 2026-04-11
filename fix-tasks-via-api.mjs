#!/usr/bin/env node

const API_KEY = process.env.DEVOPS_HQ_API_KEY || 'a641a95447783637172085372314544c414e5082155f9859f518e3885566f7f2';
const API_BASE = process.env.DEVOPS_HQ_API_BASE || 'http://localhost:4311';

// Infer target_repo based on task description/title
function inferTargetRepo(task) {
  const text = `${task.title || ''} ${task.summary || ''} ${task.notes || ''}`.toLowerCase();
  
  if (text.includes('myxxit')) return 'myxxit-app';
  if (text.includes('devops') || text.includes('hq') || text.includes('dashboard')) return 'myxxit-devops-hq';
  if (text.includes('drinx') || text.includes('the drinx')) return 'the-drinx-app';
  if (text.includes('infra') || text.includes('infrastructure') || text.includes('deploy')) return 'infrastructure';
  
  return 'TBD';
}

async function fetchApi(path, options = {}) {
  const url = new URL(path, API_BASE).toString();
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  
  return response.json();
}

async function fixTasksViaAPI() {
  try {
    console.log('Fetching all tasks...');
    const { tasks } = await fetchApi('/api/tasks');
    
    console.log(`Found ${tasks?.length || 0} tasks\n`);
    
    const tasksMissingRepo = (tasks || []).filter(t => !t.targetRepo);
    console.log(`Tasks missing target_repo: ${tasksMissingRepo.length}\n`);
    
    if (tasksMissingRepo.length === 0) {
      console.log('✓ All tasks already have target_repo set!');
      return;
    }
    
    const updates = [];
    for (const task of tasksMissingRepo) {
      const inferred = inferTargetRepo(task);
      console.log(`Task: ${task.id}`);
      console.log(`  Title: ${task.title}`);
      console.log(`  Current target_repo: "${task.targetRepo || 'MISSING'}"`);
      console.log(`  Inferred: ${inferred}`);
      
      updates.push({ 
        id: task.id, 
        targetRepo: inferred,
        allowedPaths: task.allowedPaths || ['./']
      });
    }
    
    console.log(`\nUpdating ${updates.length} tasks...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const update of updates) {
      try {
        const updated = await fetchApi(`/api/tasks/${update.id}`, {
          method: 'PUT',
          body: {
            title: tasksMissingRepo.find(t => t.id === update.id).title,
            target_repo: update.targetRepo,
            allowed_paths: update.allowedPaths,
          },
        });
        console.log(`✓ Updated ${update.id} with target_repo: ${update.targetRepo}`);
        successCount++;
      } catch (err) {
        console.log(`✗ Failed to update ${update.id}: ${err.message}`);
        errorCount++;
      }
    }
    
    console.log(`\nResults: ${successCount} updated, ${errorCount} failed`);
    
    // Verify
    console.log('\nVerifying...');
    const { tasks: tasksAfter } = await fetchApi('/api/tasks');
    const stillMissing = (tasksAfter || []).filter(t => !t.targetRepo);
    console.log(`Tasks still missing target_repo: ${stillMissing.length}`);
    
    if (stillMissing.length === 0) {
      console.log('\n✓ All tasks now have target_repo populated!');
    }
    
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

fixTasksViaAPI();
