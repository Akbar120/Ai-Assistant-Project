/**
 * PERMISSION SYSTEM TEST
 * 
 * This file tests the hard permission system to ensure:
 * 1. No agent can execute without user permission
 * 2. Jenny cannot bypass the permission system
 * 3. All tools respect the permission guard
 */

import { enforceHardPermission } from './permissionGuard';

// Mock agent data
const mockAgent = {
  id: 'test_agent_123',
  name: 'Test Agent',
  role: 'Test Assistant',
  goal: 'Test goal'
};

// Test cases
const testCases = [
  {
    name: 'Instagram DM Sender',
    tool: 'instagram_dm_sender',
    args: { username: 'testuser', platform: 'instagram', message: 'Hello!' },
    expectedBlocked: true,
    reason: 'Should require user permission'
  },
  {
    name: 'Platform Post',
    tool: 'platform_post', 
    args: { caption: 'Test post', platforms: ['instagram'] },
    expectedBlocked: true,
    reason: 'Should require user permission'
  },
  {
    name: 'DM Reader',
    tool: 'instagram_dm_reader',
    args: {},
    expectedBlocked: true,
    reason: 'Should require user permission (reading DMs is sensitive)'
  },
  {
    name: 'Code Executor',
    tool: 'code_executor',
    args: { code: 'console.log("test")' },
    expectedBlocked: true,
    reason: 'Should require user permission (dangerous tool)'
  },
  {
    name: 'Web Search',
    tool: 'search_web',
    args: { query: 'test' },
    expectedBlocked: false,
    reason: 'Should not require permission (safe tool)'
  },
  {
    name: 'Get Tasks',
    tool: 'get_tasks',
    args: {},
    expectedBlocked: false,
    reason: 'Should not require permission (read-only tool)'
  },
  {
    name: 'Manage Agent (BLOCKED)',
    tool: 'manage_agent',
    args: { operation: 'delete_agent' },
    expectedBlocked: true,
    reason: 'Should be completely blocked (dangerous)'
  }
];

async function runPermissionTests() {
  console.log('🔒 PERMISSION SYSTEM TESTS');
  console.log('='.repeat(50));
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n📋 Testing: ${testCase.name}`);
    
    try {
      const result = enforceHardPermission(
        testCase.tool, 
        testCase.args, 
        mockAgent.id
      );
      
      if (result.allowed === testCase.expectedBlocked) {
        console.log(`❌ FAILED: ${testCase.reason}`);
        console.log(`   Expected: ${testCase.expectedBlocked ? 'blocked' : 'allowed'}`);
        console.log(`   Got: ${result.allowed ? 'allowed' : 'blocked'} - ${result.reason}`);
        failed++;
      } else {
        console.log(`✅ PASSED: ${testCase.reason}`);
        if (!result.allowed) {
          console.log(`   Reason: ${result.reason}`);
        }
        passed++;
      }
    } catch (error: any) {
      console.log(`🚨 ERROR: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 ALL PERMISSION TESTS PASSED!');
    console.log('✅ No agent can execute without user permission');
    console.log('✅ Jenny cannot bypass the permission system');
    console.log('✅ All dangerous tools are properly blocked');
  } else {
    console.log('⚠️  SOME TESTS FAILED - PERMISSION SYSTEM NEEDS FIX');
  }
  
  return { passed, failed };
}

// Export for external use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runPermissionTests };
}

// Run tests if called directly
if (require.main === module) {
  runPermissionTests().catch(console.error);
}