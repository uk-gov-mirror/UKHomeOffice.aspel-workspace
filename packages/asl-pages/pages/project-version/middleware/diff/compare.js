const { Value } = require('slate');
const { diffWords, diffSentences, diffArrays } = require('diff');
const last = require('lodash/last');

const parseValue = (val) => {
  if (typeof val === 'string') {
    val = JSON.parse(val || '{}');
  }
  return getText(val.document.nodes);
};

const getText = (nodes) => {
  let tempText = '';
  nodes?.forEach((element) => {
    if (element?.object === 'block') {
      tempText += getText(element?.nodes);
    } else if (element?.object === 'text') {
      tempText += element.text + ' ';
    }
  });
  return tempText;
};

// eslint-disable-next-line no-control-regex
const normaliseWhitespace = str => str.replace(/[\u0000-\u0008\u000B-\u0019\u001b\u009b\u00ad\u200b\u2028\u2029\ufeff\ufe00-\ufe0f]/g, '');

const diff = (a, b, { type, granularity = 'word' }) => {

  let diff = [];
  let added = [];
  let removed = [];
  let before;
  let after;
  let diffs;

  switch (type) {
    case 'text':
      diff = diffWords(a || '', b || '');
      break;
    case 'checkbox':
    case 'location-selector':
    case 'objective-selector':
    case 'permissible-purpose':
    case 'species-selector':
      diff = diffArrays((a || []).sort(), (b || []).sort());
      break;
    case 'texteditor':

      try {
        before = parseValue(a);
        after = parseValue(b);
      } catch (e) {
        return { error: e, added: [], removed: [] };
      }

      if (granularity === 'word') {
        diffs = diffWords(normaliseWhitespace(before), normaliseWhitespace(after));
      } else {
        diffs = diffSentences(normaliseWhitespace(before), normaliseWhitespace(after));
      }

      removed = diffs.reduce((arr, d) => {
        // ignore additions
        if (!d.added) {
          const prev = last(arr);
          const start = prev ? prev.start + prev.count : 0;
          return [...arr, { ...d, start, count: d.value.length }];
        }
        return arr;
      }, []).filter(d => d.removed);

      added = diffs.reduce((arr, d) => {
        // ignore removals
        if (!d.removed) {
          const prev = last(arr);
          const start = prev ? prev.start + prev.count : 0;
          return [...arr, { ...d, start, count: d.value.length }];
        }
        return arr;
      }, []).filter(d => d.added);

      return { added, removed, granularity };
  }

  return {
    added: diff.filter(item => !item.removed),
    removed: diff.filter(item => !item.added),
    granularity
  };
};

module.exports = diff;
