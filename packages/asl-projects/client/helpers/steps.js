import {Value} from 'slate';
import React from 'react';
import {uniq, flatMap} from 'lodash';

export const hydrateSteps = (protocols, steps, reusableSteps) => {

  const reusableStepsInAllProtocols =
    flatMap((protocols || [])
      .filter(protocol => !protocol?.deleted), (protocol, index) => (protocol.steps || [])
      .filter(step => !!step?.reusableStepId)
      .map(step => {
        return { reusableStepId: step.reusableStepId, protocolIndex: index + 1, protocolId: protocol.id };
      })
    )
      .reduce((map, reusableStep) => {
        if (!map[reusableStep.reusableStepId]) {
          map[reusableStep.reusableStepId] = [];
        }
        map[reusableStep.reusableStepId].push({ protocolNumber: reusableStep.protocolIndex, protocolId: reusableStep.protocolId });
        return map;
      }, {});

  const hydratedSteps = (steps || []).filter(Boolean)
    .map(step => {
      if (step.reusableStepId) {
        const reusableStep = {
          ...reusableSteps[step.reusableStepId],
          usedInProtocols: uniq(reusableStepsInAllProtocols[step.reusableStepId]),
          reusedStep: true
        };
        return { ...reusableStep, ...step };
      }
      return step;
    });

  return [hydratedSteps, Object.values(reusableSteps)];
};

export const canRestoreDeletedStep = (step = {}, standardProtocolsEnabled) => {
  if (step?.isStandard === true) {
    return true;
  }

  const flagEnabled = standardProtocolsEnabled ?? step?.standardProtocolsEnabled ?? true;

  return flagEnabled
    && step?.isStandardProtocol === true
    && step?.standardProtocolType === 'standard';
};

export const removeNewDeleted = (steps, previousSteps = [], keepNewDeleted = false, shouldKeepDeletedStep) => {
  if (keepNewDeleted && !shouldKeepDeletedStep) {
    return steps || [];
  }

  const oldSteps = [];
  (previousSteps || []).forEach(protocol => {
    (protocol || []).forEach(step => oldSteps.push(step.id));
  });

  return (steps || []).filter(step => {
    if (step.deleted === true) {
      if (typeof shouldKeepDeletedStep === 'function') {
        return shouldKeepDeletedStep(step);
      }

      return oldSteps.includes(step.id);
    }
    return true;
  });
};

export const addDeletedReusableSteps = (steps, previousSteps, reusableSteps) => {
  let stepIds = [];
  steps.forEach(step => {
    stepIds.push(step.id);
  });
  let oldIndex = 0;
  for (let i = 0; i < previousSteps.length; i++) {
    if (stepIds.includes(previousSteps[i].id)) {
      oldIndex = stepIds.indexOf(previousSteps[i].id);
    } else {
      oldIndex = oldIndex + 1;
      const found = reusableSteps.find((reusableStep) => reusableStep.id === previousSteps[i].reusableStepId);
      let step = {...found};
      step.deleted = true;
      steps.splice(oldIndex, 0, step);
    }
  }
  return steps;
};

export const getTruncatedStepTitle = (step, numCharacters) => {
  const title = getStepTitle(step.title, null);
  if (!title || title.trim() === '') return null;
  return title.substring(0, Math.min(title.length, numCharacters));
};

export const getStepTitle = (title, untitled = <em>Untitled step</em>) => {
  if (!title) {
    return untitled;
  }

  if (typeof title === 'string') {
    try {
      title = JSON.parse(title);
    } catch (e) {
      return untitled;
    }
  }

  const value = Value.fromJSON(title);
  return value.document.text && value.document.text !== ''
    ? value.document.text
    : untitled;
};

export const reusableStepFieldKeys = (protocol) => {
  if (!Array.isArray(protocol.steps)) {
    return [];
  }
  return (protocol.steps || [])
    .filter(step => step?.reusableStepId)
    .map(reusableStep => `reusableSteps.${reusableStep.reusableStepId}`);
};

export const getRepeatedFromProtocolIndex = (step, currentProtocolId) => {
  return (step.usedInProtocols || []).length > 0 && step.usedInProtocols[0].protocolId !== currentProtocolId ? step.usedInProtocols[0].protocolNumber : undefined;
};

export const isStepEmpty = (step = {}) => {
  const ignoredKeys = [
    'id',
    'deleted',
    'completed',
    'existingValues',
    'addExisting',
    'reusable',
    'reusableStepId',
    'usedInProtocols',
    'reusedStep',
    'saved',
    'protocolName',
    'isStandardProtocol',
    'standardProtocolType',
    'isStandard',
    'standardProtocolsEnabled'
  ];

  return Object.entries(step)
    .filter(([key]) => !ignoredKeys.includes(key))
    .every(([, value]) => {
      if (value === null || typeof value === 'undefined') {
        return true;
      }

      if (typeof value === 'boolean') {
        return value === false;
      }

      if (typeof value === 'string') {
        return value.trim() === '';
      }

      if (Array.isArray(value)) {
        return value.length === 0;
      }

      if (typeof value === 'object') {
        return Object.keys(value).length === 0;
      }

      return false;
    });
};
