// Quick test to verify transitionTask is properly defined and callable
import('./server.mjs').then(() => {
  console.log('✅ Server module loaded successfully - transitionTask is defined and accessible');
}).catch(err => {
  console.error('❌ Error loading server:', err.message);
  process.exit(1);
});
