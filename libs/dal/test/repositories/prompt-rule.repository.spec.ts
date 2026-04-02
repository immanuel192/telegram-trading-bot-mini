/**
 * Purpose: Integration tests for PromptRuleRepository operations.
 * Prerequisites: MongoDB running (via 'npm run stack:up').
 * Core Flow: Test prompt rule CRUD operations → Test findByPromptId → Test findAll ordering → Cleanup.
 */

import { promptRuleRepository } from '../../src/repositories/prompt-rule.repository';
import { PromptRule } from '../../src/models/prompt-rule.model';
import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await teardownDb();
  });

  afterEach(async () => {
    await cleanupDb(null, [COLLECTIONS.PROMPT_RULE]);
  });

  describe('findByPromptId', () => {
    it('should find a prompt rule by promptId', async () => {
      const promptRule: PromptRule = {
        promptId: 'test-prompt-001',
        name: 'Test Prompt',
        description: 'A test prompt rule',
        systemPrompt: 'Classify this message\n\nExtract trading data',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await promptRuleRepository.create(promptRule);
      const found =
        await promptRuleRepository.findByPromptId('test-prompt-001');

      expect(found).toBeDefined();
      expect(found?.promptId).toBe('test-prompt-001');
      expect(found?.name).toBe('Test Prompt');
      expect(found?.systemPrompt).toContain('Classify this message');
      expect(found?.systemPrompt).toContain('Extract trading data');
    });

    it('should return null if promptId not found', async () => {
      const found = await promptRuleRepository.findByPromptId('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all prompt rules ordered by createdAt descending', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const promptRule1: PromptRule = {
        promptId: 'prompt-001',
        name: 'Oldest Prompt',
        systemPrompt: 'Classify 1\n\nExtract 1',
        createdAt: twoHoursAgo,
        updatedAt: twoHoursAgo,
      };

      const promptRule2: PromptRule = {
        promptId: 'prompt-002',
        name: 'Middle Prompt',
        systemPrompt: 'Classify 2\n\nExtract 2',
        createdAt: oneHourAgo,
        updatedAt: oneHourAgo,
      };

      const promptRule3: PromptRule = {
        promptId: 'prompt-003',
        name: 'Newest Prompt',
        systemPrompt: 'Classify 3\n\nExtract 3',
        createdAt: now,
        updatedAt: now,
      };

      await promptRuleRepository.create(promptRule1);
      await promptRuleRepository.create(promptRule2);
      await promptRuleRepository.create(promptRule3);

      const all = await promptRuleRepository.findAll();

      expect(all.length).toBeGreaterThanOrEqual(3);

      // Find our test prompts in the results
      const testPrompts = all.filter((p) =>
        ['prompt-001', 'prompt-002', 'prompt-003'].includes(p.promptId),
      );

      expect(testPrompts).toHaveLength(3);
      // Verify newest first
      expect(testPrompts[0].promptId).toBe('prompt-003');
      expect(testPrompts[1].promptId).toBe('prompt-002');
      expect(testPrompts[2].promptId).toBe('prompt-001');
    });

    it('should return empty array when no prompt rules exist', async () => {
      const all = await promptRuleRepository.findAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('should create a new prompt rule with timestamps', async () => {
      const promptRule: PromptRule = {
        promptId: 'create-test-001',
        name: 'Create Test',
        description: 'Testing creation',
        systemPrompt: 'Is this a command?\n\nExtract the data',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await promptRuleRepository.create(promptRule);

      expect(created).toBeDefined();
      expect(created._id).toBeDefined();
      expect(created.promptId).toBe('create-test-001');
      expect(created.name).toBe('Create Test');
      expect(created.description).toBe('Testing creation');
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('should reject duplicate promptId', async () => {
      const promptRule1: PromptRule = {
        promptId: 'duplicate-prompt',
        name: 'First Prompt',
        systemPrompt: 'Classify\n\nExtract',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const promptRule2: PromptRule = {
        promptId: 'duplicate-prompt',
        name: 'Second Prompt',
        systemPrompt: 'Classify\n\nExtract',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await promptRuleRepository.create(promptRule1);

      await expect(promptRuleRepository.create(promptRule2)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update an existing prompt rule', async () => {
      const promptRule: PromptRule = {
        promptId: 'update-test-001',
        name: 'Original Name',
        systemPrompt: 'Original classification\n\nOriginal extraction',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await promptRuleRepository.create(promptRule);
      const updated = await promptRuleRepository.update(
        created._id!.toString(),
        {
          name: 'Updated Name',
          systemPrompt: 'Updated classification\n\nOriginal extraction',
          updatedAt: new Date(),
        },
      );

      expect(updated).toBe(true);

      const found =
        await promptRuleRepository.findByPromptId('update-test-001');
      expect(found?.name).toBe('Updated Name');
      expect(found?.systemPrompt).toContain('Updated classification');
      expect(found?.systemPrompt).toContain('Original extraction');
    });
  });

  describe('BaseRepository methods', () => {
    it('should support findById', async () => {
      const promptRule: PromptRule = {
        promptId: 'find-by-id-001',
        name: 'Find By ID Test',
        systemPrompt: 'Classify\n\nExtract',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await promptRuleRepository.create(promptRule);
      const found = await promptRuleRepository.findById(
        created._id!.toString(),
      );

      expect(found).toBeDefined();
      expect(found?.promptId).toBe('find-by-id-001');
    });

    it('should support delete', async () => {
      const promptRule: PromptRule = {
        promptId: 'delete-test-001',
        name: 'Delete Test',
        systemPrompt: 'Classify\n\nExtract',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await promptRuleRepository.create(promptRule);
      const deleted = await promptRuleRepository.delete(
        created._id!.toString(),
      );

      expect(deleted).toBe(true);

      const found =
        await promptRuleRepository.findByPromptId('delete-test-001');
      expect(found).toBeNull();
    });
  });

  describe('Validation scenarios', () => {
    it('should handle prompt rules without description', async () => {
      const promptRule: PromptRule = {
        promptId: 'no-desc-001',
        name: 'No Description',
        systemPrompt: 'Classify\n\nExtract',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await promptRuleRepository.create(promptRule);

      expect(created).toBeDefined();
      expect(created.description).toBeUndefined();
    });

    it('should handle long prompts', async () => {
      const longPrompt =
        'Classify this message. '.repeat(100) +
        '\n\n' +
        'Extract trading data. '.repeat(100);
      const promptRule: PromptRule = {
        promptId: 'long-prompt-001',
        name: 'Long Prompt Test',
        systemPrompt: longPrompt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await promptRuleRepository.create(promptRule);

      expect(created).toBeDefined();
      expect(created.systemPrompt).toBe(longPrompt);
      expect(created.systemPrompt.length).toBeGreaterThan(2000);
    });
  });
});
