import React, { Component, createRef, Fragment, useState } from 'react';
import { useParams } from 'react-router';

import classnames from 'classnames';
import { Button, Warning } from '@ukhomeoffice/react-components';

import isUndefined from 'lodash/isUndefined';
import { flatMap, isEqual, pickBy, uniqBy } from 'lodash';

import ReviewFields from '../../../components/review-fields';
import Repeater from '../../../components/repeater';
import Fieldset from '../../../components/fieldset';
import NewComments from '../../../components/new-comments';
import StepBadge from '../../../components/step-badge';
import { v4 as uuid } from 'uuid';
import Review from '../../../components/review';
import {
  getRepeatedFromProtocolIndex,
  getStepTitle,
  getTruncatedStepTitle,
  hydrateSteps,
  removeNewDeleted,
  addDeletedReusableSteps,
  canRestoreDeletedStep,
  isStepEmpty
} from '../../../helpers/steps';
import {
  getProtocolMode,
  isStandardProtocolMode
} from '../../../helpers';
import { saveReusableSteps } from '../../../actions/projects';
import Expandable from '../../../components/expandable';
import cloneDeep from 'lodash/cloneDeep';

function isNewStep(step) {
  const nonNewStepKeys = ['addExisting', 'isStandardProtocol', 'standardProtocolType', 'protocolName'];
  const filteredKeys = Object.keys(step || {}).filter(key => !nonNewStepKeys.includes(key));
  return step && (isEqual(filteredKeys, ['id']) || !isUndefined(step.addExisting));
}

function renderUsedInProtocols(protocolIndexes) {
  if (protocolIndexes.length < 2) {
    return protocolIndexes;
  }
  return `${protocolIndexes.slice(0, protocolIndexes.length - 1).join(',')} and ${protocolIndexes[protocolIndexes.length - 1]}`;
}

class Step extends Component {
  constructor(options) {
    super(options);
    this.step = createRef();
  }

  removeItem = async (e) => {
    e.preventDefault();
    if (window.confirm('Are you sure you want to remove this step?')) {
      if (!this.props.values.completed) {
        await this.setCompleted(true);
      }
      this.props.updateReusable(false);
      this.props.removeItem();
    }
  }

  scrollToPrevious = () => {
    const index = this.props.index ? this.props.index - 1 : 0;
    const step = document.querySelectorAll('.steps .step')[index];
    window.scrollTo({
      top: step.offsetTop,
      left: 0
    });
  }

  scrollToStep = () => {
    window.scrollTo({
      top: this.step.current.offsetTop,
      left: 0
    });
  }

  saveStep = e => {
    e.preventDefault();
    this.props.updateItem({ completed: true, existingValues: undefined, addExisting: undefined });
    this.scrollToStep();
  }

  editStep = e => {
    e.preventDefault();
    this.setCompleted(false);
    this.scrollToStep();
  }

  editThisStep = e => {
    const editFlagApplied = this.props.values.reference && this.props.values.reference.slice(-8) === '(edited)';
    const newReference = editFlagApplied ? this.props.values.reference : `${this.props.values.reference} (edited)`;
    e.preventDefault();
    this.props.updateItem({ completed: false, reference: this.props.values.reference ? newReference : null, reusableStepId: uuid(), saved: false, existingValues: cloneDeep(this.props.values) });
    this.scrollToStep();
  }

  editReusableStep = e => {
    e.preventDefault();
    this.props.updateItem({ completed: false, existingValues: cloneDeep(this.props.values) });
    this.scrollToStep();
  }

  cancelItem = e => {
    e.preventDefault();
    this.props.updateItem({ ...(cloneDeep(this.props.values.existingValues)), existingValues: undefined, completed: true });
    this.scrollToStep();
  }

  setCompleted = completed => {
    this.props.updateItem({ completed });
  }

  moveUp = e => {
    e.preventDefault();
    e.stopPropagation();
    this.props.updateReusable(false);
    this.props.moveUp();
  }

  moveDown = e => {
    e.preventDefault();
    e.stopPropagation();
    this.props.updateReusable(false);
    this.props.moveDown();
  }

  isOldStep = previousSteps => {
    let stepIds = [];
    previousSteps.forEach(protocol => {
      protocol.forEach(step => stepIds.push(step.id));
    });
    return stepIds.includes(this.props.values.id);
  }

  componentDidMount() {
    if (this.props.protocolState && !isUndefined(this.props.protocolState.sectionItem)) {
      const activeStep = this.props.protocolState.sectionItem;
      if (activeStep === this.props.values.id) {
        this.props.updateItem({ completed: false });
      }
    }
  }

  render() {
    const {
      index,
      fields,
      values,
      updateItem,
      parentUpdateItem,
      length,
      editable,
      deleted,
      isReviewStep,
      protocol,
      newComments,
      reusableSteps,
      pdf,
      readonly,
      expanded,
      onToggleExpanded,
      number,
      prefix,
      standardProtocolsEnabled
    } = this.props;

    const re = new RegExp(`^(reusable)?S?s?teps.${values.id}\\.`);

    const relevantComments = Object.values(
      pickBy(newComments, (value, key) => key.match(re))
    ).reduce((total, comments) => total + (comments || []).length, 0);

    const completed = !editable || values.completed;
    const protocolMode = getProtocolMode(values, standardProtocolsEnabled);
    const isStandardProtocol = isStandardProtocolMode(values, standardProtocolsEnabled);
    const isEditableProtocol = protocolMode === 'editable';
    const standardProtocolType = protocolMode === 'experimental' ? undefined : values.standardProtocolType;
    const restoreDeletedStepsEnabled = canRestoreDeletedStep(values, standardProtocolsEnabled);
    const useReferenceInStepTitle = isStandardProtocol || isEditableProtocol;
    const editingReusableStep = !completed && values.existingValues && values.reusableStepId && values.saved;
    const stepEditable = editingReusableStep ? (values.existingValues.id === values.id) : !completed;
    const commentPrefix = values.reusableStepId ? `reusableSteps.${values.reusableStepId}.` : undefined;
    const showContext = {
      isStandardProtocol,
      readonly: Boolean(readonly),
      values
    };
    const visibleFields = fields.filter(field => !field.show || field.show(showContext));
    const reusableField = visibleFields.find(f => f.name === 'reusable');

    const stepContent = <>{
      !stepEditable && values.title && (
        <ReviewFields
          fields={[fields.find(f => f.name === 'title')]}
          values={{
            title: values.title,
            reference: values.reference,
            isStandardProtocol,
            standardProtocolType
          }}
          prefix={prefix}
          editLink={`0#${this.props.prefix}`}
          protocolId={protocol.id}
          stepId={values.id}
          readonly={!isReviewStep}
          commentPrefix={commentPrefix}
        />
      )
    }
    {
      stepEditable && !deleted
        ? <Fragment>
          {!editingReusableStep ? <Fieldset
            fields={visibleFields}
            prefix={prefix}
            onFieldChange={(key, value) => updateItem({ [key]: value })}
            commentPrefix={commentPrefix}
            values={values}
          /> : <Fragment>
            <Fieldset
              fields={visibleFields.filter(f => f.name !== 'reusable')}
              prefix={prefix}
              commentPrefix={commentPrefix}
              onFieldChange={(key, value) => updateItem({ [key]: value })}
              values={values}
            />
            {
              reusableField && (
                <Fragment>
                  <Review
                    {...reusableField}
                    value={values.existingValues.reusable}
                    readonly={true}
                    className="reusable"
                    commentKey={commentPrefix ? `${commentPrefix}reusable` : undefined}
                  />
                  <Warning>You cannot change this answer when editing reusable steps.</Warning>
                </Fragment>
              )
            }
          </Fragment>
          }
          <p className="control-panel">
            <Button onClick={this.saveStep}>Save step</Button>
            {
              length > 1 && <Button className="link" onClick={this.removeItem}>{editingReusableStep ? 'Remove this step from this protocol' : 'Remove step'}</Button>
            }
            {
              values.existingValues && <Button className="link" onClick={this.cancelItem}>Cancel</Button>
            }
          </p>
        </Fragment>
        : <div className="review">
          <ReviewFields
            fields={visibleFields.filter(f => f.name !== 'title')}
            values={values}
            prefix={prefix}
            commentPrefix={commentPrefix}
            editLink={`0#${this.props.prefix}`}
            readonly={!isReviewStep}
            protocolId={protocol.id}
            stepId={values.id}
          />
          {
            !isStandardProtocol && !values.reusable && editable && !deleted && <a href="#" onClick={this.editStep}>Edit step</a>
          }
          {
            values.reusable && editable && !deleted && (
              <a href="#" onClick={this.editReusableStep}>Edit every instance of this reusable step</a>
            )
          }
        </div>
    }</>;

    const repeatedFrom = getRepeatedFromProtocolIndex(values, protocol.id);
    const canRemoveStep = length > 1 && (!isStandardProtocol || values.optional === true);
    const showReorderControls = !isStandardProtocol && length > 1 && !isStepEmpty(values);
    const showRemoveLink = editable && completed && !deleted && !values.deleted && canRemoveStep;
    const showRestoreLink = values.deleted && restoreDeletedStepsEnabled;
    const stepTitle = values.reference || getStepTitle(values.title);
    const stepHeading = useReferenceInStepTitle
      ? `${number + 1}: ${stepTitle}`
      : number + 1;
    const step = <>
      {
        values.deleted && <span className="badge deleted">removed</span>
      }
      <section
        className={classnames('step', { completed: !stepEditable, editable })}
        ref={this.step}
      >
        <NewComments comments={relevantComments} />
        {
          !values.deleted && <StepBadge fields={values} changeFieldPrefix={prefix} protocolId={protocol.id} position={restoreDeletedStepsEnabled ? number : index}/>
        }
        <Fragment>
          {
            editable && completed && !deleted && !values.deleted && (
              <div className="float-right">
                {
                  showReorderControls && (
                    <span>Reorder: <a href="#" disabled={index === 0} onClick={this.moveUp}>Up</a> <a href="#" disabled={index + 1 >= length} onClick={this.moveDown}>Down</a></span>
                  )
                }
                {
                  showRemoveLink && <span>{showReorderControls ? ' | ' : ''}<a href="#" onClick={this.removeItem}>Remove</a></span>
                }
              </div>
            )
          }
          <h3>
            Step { stepHeading }
            {
              showRestoreLink && (
                <Fragment>
                  {' '}
                  <a href="#" className={classnames('inline-block', { restore: values.deleted })} onClick={this.props.restoreItem}>Restore</a>
                </Fragment>
              )
            }
            {(pdf || readonly) && values.reference && (<Fragment>: { values.reference }</Fragment>)}
            {
              completed && !isUndefined(values.optional) &&
              <span className="light smaller">{` (${values.optional === true ? 'optional' : 'mandatory'})`}</span>
            }
            {
              !pdf && readonly && repeatedFrom && <div className="light smaller">{`Repeated from protocol ${repeatedFrom}`}</div>
            }
          </h3>
          {
            pdf && repeatedFrom && <span className="review"><p className="grey">{`Repeated from protocol ${repeatedFrom}`}</p></span>
          }
        </Fragment>
        <EditStepWarning editingReusableStep={editingReusableStep} protocol={protocol} step={values} completed={completed}/>
        {!values.deleted && stepContent}
      </section>
    </>;

    if (editable && isNewStep(values) && reusableSteps.length > 0) {
      const onSaveSelection = (selectedSteps) => {
        // Replace current step with selected
        const mappedSteps = flatMap(this.props.protocol.steps || [], step => {
          if (step.id === values.id) {
            return selectedSteps.map(selectedStep => {
              return { id: uuid(), reusableStepId: selectedStep };
            });
          }
          return [step];
        });
        parentUpdateItem({ steps: mappedSteps });
      };

      const fields = [{
        name: 'addExisting',
        label: 'Add step',
        type: 'radio',
        className: 'smaller',
        options: [
          {
            label: 'Create a new step',
            value: false,
            reveal: {
              component: step
            }
          },
          {
            label: 'Select steps used in other protocols',
            value: true,
            reveal: {
              component: <StepSelector reusableSteps={reusableSteps} values={values} onSaveSelection={onSaveSelection} onCancel={this.removeItem} length={length} />
            }
          }
        ],
        inline: false
      }];

      return (<Fragment>
        <Fieldset
          fields={fields}
          prefix={`${values.id}-add-step`}
          onFieldChange={(key, value) => {
            this.props.updateReusable(false);
            updateItem({ [key]: value });
          }}
          values={values}
        />
      </Fragment>);
    }

    if (isReviewStep || readonly) {
      return (
        <section className={'review-step'}>
          <NewComments comments={relevantComments} />
          {
            values.deleted && <span className="badge deleted">removed</span>
          }
          {
            !values.deleted && !pdf && <StepBadge fields={values} changeFieldPrefix={prefix} protocolId={protocol.id} position={restoreDeletedStepsEnabled ? number : index} />
          }
          <Expandable expanded={expanded} onHeaderClick={() => onToggleExpanded(index)}>
            <Fragment>
              <p className={'toggles float-right'}>
                <Button className="link no-wrap" onClick={() => onToggleExpanded(index)}>{expanded ? 'Close' : 'Open'} step</Button>
              </p>
              {values.reference ? <h3 className={'title inline'}>{values.reference}</h3> : <h3 className={'title no-wrap'}>{getStepTitle(values.title)}</h3>}
              <h4
                className="light">{values.deleted ? 'Removed step' : `Step ${number + 1}`} {values.optional === true ? '(optional)' : '(mandatory)'}{repeatedFrom ? ` - repeated from protocol ${repeatedFrom}` : ''}</h4>
            </Fragment>
            {stepContent}
          </Expandable>
        </section>
      );
    }
    return step;
  }
}

const StepSelector = ({reusableSteps, values, onSaveSelection, length, onCancel}) => {
  const DEFAULT_STEP_REFERENCE = 'Unnamed step';
  const MAX_CHARACTERS_FROM_TITLE = 80;
  const [selectedSteps, setSelectedSteps] = useState([]);
  const references = {};
  const options = uniqBy(reusableSteps, 'id')
    .map(reusableStep => {
      const reference = reusableStep.reference || getTruncatedStepTitle(reusableStep, MAX_CHARACTERS_FROM_TITLE) || DEFAULT_STEP_REFERENCE;
      const referenceCount = references[reference] || 0;
      references[reference] = referenceCount + 1;
      return {
        label: reference + (referenceCount > 0 ? ' ' + referenceCount : ''),
        value: reusableStep.id
      };
    })
    .sort((a, b) => (a.label.toLowerCase() > b.label.toLowerCase()) ? 1 : -1);

  const selectStepFields = [{
    name: 'select-steps',
    label: 'Select step',
    type: 'checkbox',
    className: 'smaller',
    options: options
  }];
  const saveSelectionHandler = () => {
    onSaveSelection(selectedSteps);
  };

  return <Fragment>
    <Fieldset
      fields={selectStepFields}
      prefix={`${values.id}-select-steps`}
      onFieldChange={(key, value) => {
        setSelectedSteps(value);
      }}
      values={values}
    />
    <p className="control-panel">
      <Button className={classnames('block', 'save-selection')} onClick={saveSelectionHandler}>Add steps to protocol</Button>
      {
        length > 1 && <Button className="link" onClick={onCancel}>Cancel</Button>
      }
    </p>
  </Fragment>;
};

const EditStepWarning = ({ editingReusableStep, protocol, step, completed }) => {
  const usedInProtocolIndexes = (protocol, step) =>
    (step.usedInProtocols || [])
      .filter(usedInProtocol => usedInProtocol.protocolId !== protocol.id)
      .map(p => p.protocolNumber);

  if (editingReusableStep) {
    const protocolIndexes = usedInProtocolIndexes(protocol, step);
    const usedInProtocolsMessage = protocolIndexes.length > 0 ? ` The changes will also appear in protocols ${(renderUsedInProtocols(protocolIndexes))}.` : '';
    return (<Warning>{`You are editing all instances of this step.${usedInProtocolsMessage}`}</Warning>);
  } else if (!completed && step.existingValues && !step.saved) {
    const protocolIndexes = usedInProtocolIndexes(protocol, step);
    const usedInProtocolsMessage = protocolIndexes.length > 0 ? `  Changes made to this step will not appear where the '${step.existingValues.reference}' step is reused on protocols ${(renderUsedInProtocols(protocolIndexes))}.` : '';
    return (<Warning>{`You are editing only this instance of this step.${usedInProtocolsMessage}`}</Warning>);
  }
  return null;
};

const StepsRepeater = ({ values, prefix, updateItem, editable, project, isReviewStep, steps, reusableSteps, standardProtocolsEnabled, ...props }) => {
  const lastStepIsNew = isNewStep(steps[steps.length - 1]);
  //By default, reusable steps are updated always, but this is not true, hence adding ability to turn off when not needed
  const [updateReusable, setUpdateReusable] = useState(true);

  return (<Repeater
    type="steps"
    singular="step"
    prefix={prefix}
    items={steps}
    softDelete={true}
    onBeforeAdd={() => {
      setUpdateReusable(false);
    }}
    onSave={steps => {
      // Create deep clones of reusable steps to ensure immutability
      const reusableSteps = steps
        .filter(step => step.reusable && (step.completed || step.saved))
        .map(step => ({
          ...cloneDeep(step),
          id: step.reusableStepId || step.id,
          saved: true
        }));

      const mappedSteps = steps.map(step => {
        if (step.reusable && (step.completed || step.saved)) {
          return {
            id: step.id,
            reusableStepId: step.reusableStepId || step.id
          };
        }
        return step;
      });

      if (updateReusable && reusableSteps.length > 0) {
        props.dispatch(saveReusableSteps(reusableSteps));
      }
      updateItem({ steps: mappedSteps });
      setUpdateReusable(true); // Always reset this after save
    }}
    addAnother={!isStandardProtocolMode(values, standardProtocolsEnabled) && !props.pdf && !values.deleted && editable && !lastStepIsNew}
    {...props}
  >
    <Step
      editable={editable}
      deleted={values.deleted}
      isReviewStep={isReviewStep}
      protocol={values}
      reusableSteps={reusableSteps}
      standardProtocolsEnabled={standardProtocolsEnabled}
      updateReusable={setUpdateReusable}
      {...props}
      parentUpdateItem={updateItem}
    />
  </Repeater>);
};

export default function Steps({project, values, ...props}) {
  const isReviewStep = parseInt(useParams().step, 10) === 1;
  const [ allSteps, reusableSteps ] = hydrateSteps(project.protocols, values.steps, project.reusableSteps || {});
  const protocolMode = getProtocolMode(values, props.standardProtocolsEnabled);
  const isStandardProtocol = isStandardProtocolMode(values, props.standardProtocolsEnabled);
  const standardProtocolType = protocolMode === 'experimental' ? '' : values?.standardProtocolType ?? '';
  const resolvedHint = typeof props.hint === 'function'
    ? props.hint({
      isStandardProtocol,
      readonly: Boolean(props.readonly),
      values
    })
    : props.hint;
  const showHint = Boolean(resolvedHint) && !isStandardProtocol;
  const shouldRenderDeletedStep = step => canRestoreDeletedStep({
    ...step,
    isStandardProtocol,
    standardProtocolType
  }, props.standardProtocolsEnabled);
  let steps;
  if (props.pdf) {
    steps = allSteps.filter(step => !step.deleted);
  } else {
    steps = removeNewDeleted(allSteps, props.previousProtocols.steps, false, shouldRenderDeletedStep);
    if (!props.editable && props.previousProtocols.steps.length > props.index) {
      steps = addDeletedReusableSteps(steps, props.previousProtocols.steps[props.index], reusableSteps);
      steps = steps.filter(step => !step.deleted || shouldRenderDeletedStep(step));
    }
  }

  if (props.standardProtocolsEnabled && Array.isArray(steps) && steps.length > 0) {
    steps = steps.map(step => ({ ...step, isStandardProtocol, standardProtocolType }));
  }
  const [expanded, setExpanded] = useState(steps.map(() => false));

  const setAllExpanded = (e) => {
    e.preventDefault();
    if (expanded.every(item => item)) {
      return setExpanded(expanded.map(() => false));
    }
    setExpanded(expanded.map(() => true));
  };
  const openCloseLink = (props.readonly || isReviewStep) && <p className="toggles">
    <a href="#" onClick={setAllExpanded}>
      {
        expanded.every(item => item)
          ? 'Close all steps'
          : 'Open all steps'
      }
    </a>
  </p>;

  const onToggleExpanded = (index) => {
    setExpanded(expanded.map((item, i) => {
      if (i === index) {
        return !item;
      }
      return item;
    }));
  };

  if (isReviewStep) {
    return (
      <div className="accordion">
        {openCloseLink}
        <StepsRepeater {...props}
          project={project}
          values={values}
          steps={steps}
          reusableSteps={reusableSteps}
          isReviewStep={isReviewStep}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
        />
      </div>);
  }

  return (
    <div className="accordion">
      <div className="steps">
        {
          showHint && (
            <Fragment>
              <p className="grey">{resolvedHint}</p>
              <br/>
            </Fragment>
          )
        }
        {openCloseLink}
        <StepsRepeater {...props}
          project={project}
          values={values}
          steps={steps}
          reusableSteps={reusableSteps}
          isReviewStep={isReviewStep}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
        />
      </div>
    </div>
  );
}
