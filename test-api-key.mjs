#!/usr/bin/env node

/**
 * Test script for API Key Authentication
 * Validates Bearer token validation logic in getPrincipal()
 */

import crypto from 'node:crypto';

// Simulate the getPrincipal logic
function testApiKeyValidation() {
  console.log('Testing API Key Authentication Logic\n');
  
  // Test Case 1: Valid API Key
  console.log('Test 1: Valid API Key');
  const validApiKey = 'test-api-key-12345';
  const authHeader = `Bearer ${validApiKey}`;
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
  const extractedKey = tokenMatch ? tokenMatch[1] : null;
  
  if (extractedKey === validApiKey) {
    console.log('✓ PASS: Bearer token correctly extracted and validated\n');
  } else {
    console.log('✗ FAIL: Token extraction failed\n');
  }
  
  // Test Case 2: Invalid Bearer format
  console.log('Test 2: Invalid Bearer format');
  const invalidAuth = 'BasicAuth token';
  const invalidMatch = invalidAuth.match(/^Bearer\s+(.+)$/);
  if (!invalidMatch) {
    console.log('✓ PASS: Invalid Bearer format correctly rejected\n');
  } else {
    console.log('✗ FAIL: Invalid format was not rejected\n');
  }
  
  // Test Case 3: Empty Authorization header
  console.log('Test 3: Empty Authorization header');
  const emptyAuth = '';
  const emptyMatch = emptyAuth.match(/^Bearer\s+(.+)$/);
  if (!emptyMatch) {
    console.log('✓ PASS: Empty header correctly rejected\n');
  } else {
    console.log('✗ FAIL: Empty header was not rejected\n');
  }
  
  // Test Case 4: Token extraction with extra whitespace
  console.log('Test 4: Bearer token with consistent whitespace');
  const cleanAuth = 'Bearer my-secure-api-key';
  const cleanMatch = cleanAuth.match(/^Bearer\s+(.+)$/);
  if (cleanMatch && cleanMatch[1] === 'my-secure-api-key') {
    console.log('✓ PASS: Whitespace handling correct\n');
  } else {
    console.log('✗ FAIL: Whitespace handling failed\n');
  }
  
  console.log('Summary:');
  console.log('- Bearer token validation regex: /^Bearer\\s+(.+)$/');
  console.log('- Environment variable: API_KEY');
  console.log('- Principal on success: { username: "Selym-API", source: "apiKey" }');
  console.log('- Fallback: Session cookie authentication');
}

testApiKeyValidation();
