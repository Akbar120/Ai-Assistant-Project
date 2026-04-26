/**
 * REFINED PERMISSION SYSTEM TEST
 * 
 * Tests the balanced security approach:
 * - Safe tools are always accessible
 * - Major tools require user approval
 * - Dangerous tools are blocked
 * - Skills have appropriate tool access
 */

import { classifyTool, enforceRefinedPermission } from './refinedPermissionGuard';
import { canSkillUseTool, getSkillToolsStatus } from '../skills/skillManagement';

// Mock agent data
const mockAgent = {
  id: 'test_agent_123',
  name: 'Test Agent',
  role: 'Test Assistant',
  goal: 'Test goal'
};

// Test cases for tool classification
const toolClassificationTests = [
  {
    tool: 'get_tasks',
    expected: 'safe',
    reason: 'Should be classified as safe'
  },
  {
    tool: 'instagram_dm_sender',
    expected: 'major',
    reason: 'Should be classified as major (requires approval)'
  },
  {
    tool: 'manage_agent',
    expected: 'blocked',
    reason: 'Should be classified as blocked (admin only)'
  },
  {
    tool: 'search_web',
    expected: 'safe',
    reason: 'Should be classified as safe'
  }
];

// Test cases for permission enforcement
const permissionTests = [
  {
    tool: 'get_tasks',
    args: {},
    expectedAllowed: true,
    expectedApproval: false,
    reason: 'Safe tool should be immediately allowed'
  },
  {
    tool: 'instagram_dm_sender',
    args: { username: 'test', message: 'hello' },
    expectedAllowed: false,
    expectedApproval: true,
    reason: 'Major tool should require approval'
  },
  {
    tool: 'manage_agent',
    args: { operation: 'delete' },
    expectedAllowed: false,
    expectedApproval: false,
    reason: 'Blocked tool should be completely denied'
  }
];

// Test cases for skill tool access
const skillTests = [
  {
    skill: 'instagram_dm_handler',
    tool: 'instagram_dm_reader',
    expectedCanUse: true,
    expectedApproval: false,
    reason: 'Skill should be able to use DM reader'
  },
  {
    skill: 'instagram_dm_handler',
    tool: 'instagram_dm_sender',
    expectedCanUse: true,
    expectedApproval: true,
    reason: 'Skill should need approval for DM sender'
  },
  {
    skill: 'instagram_dm_handler',
    tool: 'manage_agent',
    expectedCanUse: false,
    expectedApproval: false,
    reason: 'Skill should not be able to use blocked tools'
  }
];

async function runRefinedPermissionTests() {
  console.log('🔒 REFINED PERMISSION SYSTEM TESTS');
  console.log('='.repeat(60));
  
  let totalTests = 0;
  let passedTests = 0;
  
  // Test 1: Tool Classification
  console.log('\n📋 Test 1: Tool Classification');
  console.log('-'.repeat(40));
  
  for (const testCase of toolClassificationTests) {
    totalTests++;
    const result = classifyTool(testCase.tool);
    
    if (result === testCase.expected) {
      console.log(`✅ PASSED: ${testCase.reason}`);
      passedTests++;
    } else {
      console.log(`❌ FAILED: ${testCase.reason}`);
      console.log(`   Expected: ${testCase.expected}, Got: ${result}`);
    }
  }
  
  // Test 2: Permission Enforcement
  console.log('\n📋 Test 2: Permission Enforcement');
  console.log('-'.repeat(40));
  
  for (const testCase of permissionTests) {
    totalTests++;
    const result = enforceRefinedPermission(
      testCase.tool,
      testCase.args,
      mockAgent.id
    );
    
    const correctAllowed = result.allowed === testCase.expectedAllowed;
    const correctApproval = result.requiresApproval === testCase.expectedApproval;
    
    if (correctAllowed && correctApproval) {
      console.log(`✅ PASSED: ${testCase.reason}`);
      passedTests++;
    } else {
      console.log(`❌ FAILED: ${testCase.reason}`);
      console.log(`   Expected: allowed=${testCase.expectedAllowed}, approval=${testCase.expectedApproval}`);
      console.log(`   Got: allowed=${result.allowed}, approval=${result.requiresApproval}`);
    }
  }
  
  // Test 3: Skill Tool Access
  console.log('\n📋 Test 3: Skill Tool Access');
  console.log('-'.repeat(40));
  
  for (const testCase of skillTests) {
    totalTests++;
    const result = canSkillUseTool(testCase.skill, testCase.tool);
    
    const correctCanUse = result.canUse === testCase.expectedCanUse;
    const correctApproval = result.approvalRequired === testCase.expectedApproval;
    
    if (correctCanUse && correctApproval) {
      console.log(`✅ PASSED: ${testCase.reason}`);
      passedTests++;
    } else {
      console.log(`❌ FAILED: ${testCase.reason}`);
      console.log(`   Expected: canUse=${testCase.expectedCanUse}, approval=${testCase.expectedApproval}`);
      console.log(`   Got: canUse=${result.canUse}, approval=${result.approvalRequired}`);
    }
  }
  
  // Test 4: Skill Tools Status
  console.log('\n📋 Test 4: Skill Tools Status');
  console.log('-'.repeat(40));
  
  const instagramSkillStatus = getSkillToolsStatus('instagram_dm_handler');
  const hasReaderStatus = instagramSkillStatus['instagram_dm_reader']?.status === 'allowed';
  const hasSenderStatus = instagramSkillStatus['instagram_dm_sender']?.status === 'approval_required';
  const hasBlockedStatus = instagramSkillStatus['manage_agent']?.status === 'blocked';
  
  if (hasReaderStatus && hasSenderStatus && hasBlockedStatus) {
    console.log('✅ PASSED: Instagram DM handler skill status correct');
    passedTests++;
    totalTests++;
  } else {
    console.log('❌ FAILED: Instagram DM handler skill status incorrect');
    totalTests++;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 ALL REFINED PERMISSION TESTS PASSED!');
    console.log('✅ Safe tools are always accessible');
    console.log('✅ Major tools require user approval');
    console.log('✅ Dangerous tools are completely blocked');
    console.log('✅ Skills have appropriate tool access');
  } else {
    console.log('⚠️  SOME TESTS FAILED - REFINED PERMISSION SYSTEM NEEDS REVIEW');
  }
  
  return { passed: passedTests, total: totalTests };
}

// Test specific scenarios
async function testSpecificScenarios() {
  console.log('\n🧪 Specific Scenario Tests');
  console.log('='.repeat(60));
  
  // Scenario 1: Instagram DM Agent workflow
  console.log('\n📋 Scenario 1: Instagram DM Agent Workflow');
  console.log('-'.repeat(50));
  
  // Agent wants to read DMs (safe - should work)
  const readResult = enforceRefinedPermission('instagram_dm_reader', {}, mockAgent.id);
  console.log(`Reading DMs: ${readResult.allowed ? 'Allowed' : 'Blocked'} (${readResult.reason})`);
  
  // Agent wants to send DM (major - should require approval)
  const sendResult = enforceRefinedPermission('instagram_dm_sender', { username: 'test', message: 'hello' }, mockAgent.id);
  console.log(`Sending DM: ${sendResult.allowed ? 'Allowed' : 'Blocked'} (${sendResult.reason})`);
  
  // Scenario 2: Social Media Poster workflow
  console.log('\n📋 Scenario 2: Social Media Poster Workflow');
  console.log('-'.repeat(50));
  
  // Agent wants to get channels (safe - should work)
  const channelsResult = enforceRefinedPermission('get_channels', {}, mockAgent.id);
  console.log(`Getting channels: ${channelsResult.allowed ? 'Allowed' : 'Blocked'} (${channelsResult.reason})`);
  
  // Agent wants to post content (major - should require approval)
  const postResult = enforceRefinedPermission('platform_post', { caption: 'test', platforms: ['instagram'] }, mockAgent.id);
  console.log(`Posting content: ${postResult.allowed ? 'Allowed' : 'Blocked'} (${postResult.reason})`);
  
  // Scenario 3: Research Assistant workflow
  console.log('\n📋 Scenario 3: Research Assistant Workflow');
  console.log('-'.repeat(50));
  
  // Agent wants to search web (safe - should work)
  const searchResult = enforceRefinedPermission('search_web', { query: 'test' }, mockAgent.id);
  console.log(`Searching web: ${searchResult.allowed ? 'Allowed' : 'Blocked'} (${searchResult.reason})`);
  
  // Agent wants to write file (major - should require approval)
  const writeResult = enforceRefinedPermission('write', { path: 'test.txt', content: 'test' }, mockAgent.id);
  console.log(`Writing file: ${writeResult.allowed ? 'Allowed' : 'Blocked'} (${writeResult.reason})`);
}

// Export for external use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runRefinedPermissionTests, testSpecificScenarios };
}

// Run tests if called directly
if (require.main === module) {
  runRefinedPermissionTests().then(() => {
    return testSpecificScenarios();
  }).catch(console.error);
}