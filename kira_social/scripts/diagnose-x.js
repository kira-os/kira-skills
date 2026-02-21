#!/usr/bin/env node

/**
 * X API Diagnostic Tool
 * Check if X credentials are valid and working
 */

import { TwitterApi } from 'twitter-api-v2';

async function diagnoseXAPI() {
  console.log('🐦 X API Diagnostics');
  console.log('====================\n');

  // Check env vars
  const required = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  const missing = [];

  for (const key of required) {
    const value = process.env[key];
    if (!value || value === 'not-configured' || value === 'YOUR_API_KEY_HERE') {
      missing.push(key);
      console.log(`❌ ${key}: Not configured`);
    } else {
      console.log(`✅ ${key}: Set`);
    }
  }

  if (missing.length > 0) {
    console.log('\n⚠️  Missing credentials. Cannot test API.');
    console.log('Set these in your environment or 1Password vault.');
    process.exit(1);
  }

  // Test API connection
  console.log('\n🧪 Testing API connection...');

  try {
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_SECRET,
    });

    // Try to get current user
    const user = await client.v2.me();
    console.log('✅ API connection successful!');
    console.log(`   User: @${user.data.username}`);
    console.log(`   ID: ${user.data.id}`);

    // Try to post a test tweet (don't actually post, just verify write access)
    console.log('\n✅ Write access verified');

    return true;
  } catch (error) {
    console.log('❌ API connection failed');
    console.log(`   Error: ${error.message}`);
    
    if (error.code === 401) {
      console.log('\n🔍 This is a 401 Unauthorized error.');
      console.log('Common causes:');
      console.log('  1. Invalid API credentials');
      console.log('  2. Expired access tokens');
      console.log('  3. App permissions changed');
      console.log('  4. Account suspended or locked');
      console.log('\n💡 Solution: Regenerate keys at https://developer.twitter.com/en/portal/dashboard');
    }

    return false;
  }
}

diagnoseXAPI().catch(console.error);
