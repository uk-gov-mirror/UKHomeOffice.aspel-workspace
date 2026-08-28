import { Document, Paragraph, TextRun, Table } from 'docx';
import get from 'lodash/get';
import uniq from 'lodash/uniq';
import concat from 'lodash/concat';
import flatten from 'lodash/flatten';
import values from 'lodash/values';
import Mustache from 'mustache';
import { projectSpecies as SPECIES } from '@ukhomeoffice/asl-constants';
import RAContent from '@asl/projects/client/constants/retrospective-assessment';
import schemaVersions from '@asl/projects/client/schema';
import schemaV0 from '@asl/projects/client/schema/v0';
import schemaV1 from '@asl/projects/client/schema/v1';
import schemaV1Purpose from '@asl/projects/client/schema/v1/permissible-purpose';
import { addStyles, renderHorizontalRule, addPageNumbers } from './helpers/docx-style-helper';
import { renderMarkdown as renderMarkdownContent, renderLabel as renderLabelShared, renderText as renderTextShared, renderTextEditor as renderTextEditorShared } from './helpers/docx-content-renderer';
import { descriptions as raReasonsDescriptions } from '@asl/projects/client/components/ra-reasons';
import { formatDate, DATE_FORMAT } from '@ukhomeoffice/asl-components/src/utils';

export default async function ntsDocxRenderer(opts) {
  const {
    application,
    version,
    ntsSections,
    includeDraftRa,
    ra,
    raReasons,
    isTrainingLicence,
    isBulk,
    mergedDocument
  } = opts;

  let document;
  if (mergedDocument) {
    document = mergedDocument;
  } else {
    document = new Document();
  }

  const renderMarkdown = (markdown, style = 'body') => {
    renderMarkdownContent(document, markdown, style);
  };


  const renderTextEditor = (value) => {
    return renderTextEditorShared(document, value, {
      onStringFallback: (doc, val) => renderText(val),
      onError: (doc) => doc.createParagraph('There was a problem rendering this content').style('aside'),
      separator: doc => renderHorizontalRule(doc)
    });
  };

  const renderTitleBlock = () => {
    if (!isBulk) {
      document.createParagraph('Non-technical Summary').heading1();
    }
    document.createParagraph(application.title || version.title || 'Untitled project').heading1();
    document.createParagraph('\n').style('body');
  };

  const renderLabel = (text) => renderLabelShared(document, text);

  const renderText = (value) => {
    return renderTextShared(document, value, { separator: doc => renderHorizontalRule(doc) });
  };

  const renderDuration = () => {
    const value = version['duration'] || {};
    let months = get(value, 'months');
    let years = get(value, 'years');
    months = Number.isInteger(months) ? months : 0;
    years = Number.isInteger(years) ? years : 5;
    if (months > 12) { months = 0; }
    if (years >= 5 || (!months && !years)) { years = 5; months = 0; }
    document.createParagraph(`${years} years ${months} months`).style('body');
    renderHorizontalRule(document);
  };

  const renderKeywords = () => {
    const list = version.keywords || [];
    if (!list.length) {
      const p = new Paragraph();
      p.style('body');
      p.addRun(new TextRun('No answer provided').italics());
      document.addParagraph(p);
    } else {
      document.createParagraph(list.join(', ')).style('body');
    }
    renderHorizontalRule(document);
  };

  const renderPurpose = (schemaVersion) => {
    if (version['training-licence']) {
      const p = new Paragraph();
      p.style('body').bullet();
      p.addRun(new TextRun('(f) Higher education and training'));
      document.addParagraph(p);
      renderHorizontalRule(document);
      return;
    }
    const purposeOptions = schemaVersion === 0
      ? schemaV0().programmeOfWork.subsections.purpose.fields.find(f => f.name === 'purpose').options
      : schemaV1Purpose.options;
    const valuesSelected = schemaVersion === 0 ? version.purpose : version['permissible-purpose'];
    const selected = [].concat(valuesSelected || []);
    if (!selected.length) { return renderText(null); }
    selected.forEach(val => {
      const opt = purposeOptions.find(o => o.value === val);
      const p = new Paragraph();
      p.style('body').bullet();
      p.addRun(new TextRun(opt ? opt.label : String(val)));
      document.addParagraph(p);
    });
    renderHorizontalRule(document);
  };

  const speciesLabels = flatten(values(SPECIES));
  const getSpeciesLabel = speciesKey => {
    const species = speciesLabels.find(s => s.value === speciesKey);
    return species ? species.label : speciesKey;
  };
  const getSpeciesCount = (speciesKey) => version[`reduction-quantities-${speciesKey}`] || 'No answer provided';

  const renderSpeciesCount = () => {
    const speciesUsed = concat([], version.species, version['species-other']).filter(Boolean);
    if (!speciesUsed.length) { return renderText(null); }
    const renderItem = (speciesKey, depth = 0) => {
      if (speciesKey.startsWith('other-')) {
        const sub = version[`species-${speciesKey}`] || [];
        if (!sub.length) { return; }
        const p = new Paragraph(); p.style('body'); p.bullet(depth);
        p.addRun(new TextRun(getSpeciesLabel(speciesKey)));
        document.addParagraph(p);
        sub.forEach(s => renderItem(s, depth + 1));
      } else {
        const p = new Paragraph(); p.style('body'); p.bullet(depth);
        p.addRun(new TextRun(`${getSpeciesLabel(speciesKey)}: ${getSpeciesCount(speciesKey)}`));
        document.addParagraph(p);
      }
    };
    speciesUsed.forEach(s => renderItem(s));
    renderHorizontalRule(document);
  };

  const lifeStageOptions = schemaV1().protocols.subsections.protocols.sections.animals.fields.find(f => f.name === 'life-stages').options;
  const groupSpeciesDetails = () => {
    return (version.protocols || []).reduce((species, protocol) => {
      const activeDetails = (protocol?.species ?? [])
        .map(speciesKey => protocol?.speciesDetails?.find(d => (d.value ?? d.name) === speciesKey))
        .filter(Boolean)
        .map(details => ({ ...details, value: details.value ?? details.name }))
        .filter(Boolean);
      activeDetails.forEach(details => {
        const existing = species.find(s => s.value === details.value);
        const max = parseInt(details['maximum-animals'], 10);
        const stages = details['life-stages'] || [];
        if (existing) {
          existing.maximumAnimals += max;
          existing.lifeStages = uniq(concat(existing.lifeStages, stages));
        } else {
          species.push({ value: details.value, name: details.name, lifeStages: stages, maximumAnimals: max });
        }
      });
      return species;
    }, []).map(({ lifeStages, ...rest }) => ({
      ...rest,
      lifeStages: lifeStageOptions.filter(({ value }) => lifeStages.includes(value)).map(({ label }) => label)
    }));
  };

  const renderSpeciesTable = () => {
    const speciesDetails = groupSpeciesDetails();
    if (!speciesDetails.length) { return renderText(null); }
    const table = new Table({ rows: speciesDetails.length + 1, columns: 2, columnWidths: ['8000', '8000'] });
    // headers
    table.getCell(0, 0).addParagraph(new Paragraph('Animal types'));
    table.getCell(0, 1).addParagraph(new Paragraph('Life stages'));
    speciesDetails.forEach((s, i) => {
      table.getCell(i + 1, 0).addParagraph(new Paragraph(s.name));
      table.getCell(i + 1, 1).addParagraph(new Paragraph((s.lifeStages || []).join(', ')));
    });
    document.addTable(table);
    renderHorizontalRule(document);
  };

  const renderRetrospectiveDecision = () => {
    const raCompulsory = version.raCompulsory;
    const raRequired = !!version.retrospectiveAssessment;
    const isRequired = raCompulsory || raRequired || application.raDate;
    const text = isRequired ? RAContent.required : RAContent.notRequired;
    document.createParagraph(text).style('body');

    // Extract keys set to true and map to their description strings
    const activeReasons = raReasons
      ? Object.keys(raReasons)
        .filter(key => raReasons[key] && raReasonsDescriptions[key])
        .map(key => raReasonsDescriptions[key])
      : [];

    if (isRequired && raReasons && activeReasons.length) {
      document.createParagraph('Reason for retrospective assessment').heading4();
      document.createParagraph('This may include reasons from previous versions of this licence.').style('aside');
      activeReasons.forEach(reason => {
        const p = new Paragraph();
        p.style('body').bullet();
        p.addRun(new TextRun(reason));
        document.addParagraph(p);
      });
    }
    renderHorizontalRule(document);
  };

  const renderRetrospectivePlaceholder = (field) => {
    const raCompulsory = version.raCompulsory;
    const raRequired = !!version.retrospectiveAssessment;
    const isRequired = raCompulsory || raRequired || application.raDate;
    if (!isRequired) { return; }
    const hasRaDate = !!application.raDate;

    // Format ISO string to '21 January 2031' format
    const raDate = hasRaDate
      ? formatDate(application.raDate, DATE_FORMAT.long): null;

    const content = Mustache.render(field.content, { raDate, hasRaDate });
    renderMarkdown(content, 'aside');
    renderHorizontalRule(document);
  };

  const renderRaSummary = (fieldNames) => {
    if (!ra) { return; }
    document.createParagraph('Retrospective assessment').heading2();
    if (application.raGrantedDate) {
      document.createParagraph(`Published: ${application.raGrantedDate}`).style('body');
    }
    const raSchema = schemaVersions['RA']();
    const allFields = flatten(Object.values(raSchema.introduction.subsections).map(s => s.fields));
    fieldNames.forEach(name => {
      const field = allFields.find(f => f.name === name);
      if (!field) { return; }
      document.createParagraph(field.label).heading3();
      const val = get(ra, ['data', field.name]);
      renderText(val);
    });
  };

  const renderField = (field, schemaVersion) => {
    if (field.heading) {
      if (field.heading === 'Retrospective assessment') {
        document.createParagraph(field.heading).heading2();
      } else {
        document.createParagraph(field.heading).heading3();
      }
    }
    if (field.label && field.name !== 'species') {
      renderLabel(field.label);
    }
    // Conditionally render components matching PDF NTS
    switch (field.type) {
      case 'Duration':
        return renderDuration();
      case 'SpeciesTable':
        return renderSpeciesTable();
      case 'SpeciesCount':
        return renderSpeciesCount();
      case 'FateOfAnimals':
        return renderText(get(version, 'fate-of-animals'));
      case 'Purpose':
        return renderPurpose(schemaVersion);
      case 'Keywords':
        return renderKeywords();
      case 'RetrospectiveDecision':
        return renderRetrospectiveDecision();
      case 'RetrospectivePlaceholder':
        // only show placeholder text when RA is required
        return renderRetrospectivePlaceholder(field);
      case 'radio': {
        const value = version[field.name];
        if (value == null) { return renderText(null); }
        const opt = (field.options || []).find(o => o.value === value);
        return renderText(opt ? opt.label : value);
      }
      default: {
        const value = version[field.name];
        return renderTextEditor(value);
      }
    }
  };

  const renderSection = (section, sectionIndex, schemaVersion) => {
    if (sectionIndex !== 0) {
      document.createParagraph(section.title).heading2();
    }
    if (section.subtitle) {
      document.createParagraph(section.subtitle).heading3();
    }
    const fields = (section.fields || []).filter(f => isTrainingLicence ? f.training !== false : f.training !== true);
    fields.forEach(field => renderField(field, schemaVersion));
  };

  const renderDocument = () => {
    renderTitleBlock();
    const schemaVersion = application.schemaVersion;
    Object.keys(ntsSections).forEach((sectionName, sectionIndex) => {
      renderSection(ntsSections[sectionName], sectionIndex, schemaVersion);
      const fields = ntsSections[sectionName].fields || [];
      fields.filter(f => f.raSummary).forEach(f => renderRaSummary(f.raSummary));
    });
  };

  addStyles(document);
  renderDocument();
  if (!isBulk) {
    addPageNumbers(document);
  }
  return document;
}
