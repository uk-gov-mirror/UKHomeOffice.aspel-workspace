import assert from 'assert';
import { canRestoreDeletedStep, isStepEmpty, removeNewDeleted } from '../../../../client/helpers/steps';

describe('canRestoreDeletedStep', () => {
  it('allows restore for standard steps', () => {
    assert.equal(canRestoreDeletedStep({ isStandard: true }), true);
    assert.equal(canRestoreDeletedStep({ isStandardProtocol: true, standardProtocolType: 'standard' }), true);
  });

  it('does not allow restore for non-standard steps', () => {
    assert.equal(canRestoreDeletedStep({ isStandardProtocol: false, standardProtocolType: 'editable' }), false);
    assert.equal(canRestoreDeletedStep({ isStandardProtocol: true, standardProtocolType: 'standard' }, false), false);
  });
});

describe('removeNewDeleted', () => {
  const steps = [
    { id: 'existing-step', deleted: true },
    { id: 'new-step', deleted: true },
    { id: 'active-step', deleted: false }
  ];

  const previousSteps = [
    [{ id: 'existing-step' }]
  ];

  describe('when restore support is disabled', () => {
    it('removes newly deleted steps that do not exist in previous steps', () => {
      const result = removeNewDeleted(steps, previousSteps);

      assert.deepEqual(result, [
        { id: 'existing-step', deleted: true },
        { id: 'active-step', deleted: false }
      ]);
    });
  });

  describe('isStepEmpty', () => {
    it('returns true for a step with only metadata fields', () => {
      assert.equal(isStepEmpty({
        id: 'step-1',
        completed: true,
        deleted: false
      }), true);
    });

    it('returns true for a step with blank content fields', () => {
      assert.equal(isStepEmpty({
        id: 'step-1',
        title: '   ',
        reference: '',
        adverse: false,
        endpoints: null
      }), true);
    });

    it('returns false when a step has user content', () => {
      assert.equal(isStepEmpty({
        id: 'step-1',
        reference: 'Step 6'
      }), false);
    });
  });

  describe('when restore support is enabled', () => {
    it('keeps newly deleted steps so they can be restored', () => {
      const result = removeNewDeleted(steps, previousSteps, true);

      assert.deepEqual(result, steps);
    });

    it('only keeps deleted steps that can be restored', () => {
      const result = removeNewDeleted(
        [
          { id: 'standard-step', deleted: true, isStandardProtocol: true, standardProtocolType: 'standard' },
          { id: 'editable-step', deleted: true, isStandardProtocol: false, standardProtocolType: 'editable' },
          { id: 'active-step', deleted: false }
        ],
        [[{ id: 'editable-step' }]],
        false,
        canRestoreDeletedStep
      );

      assert.deepEqual(result, [
        { id: 'standard-step', deleted: true, isStandardProtocol: true, standardProtocolType: 'standard' },
        { id: 'active-step', deleted: false }
      ]);
    });
  });
});
