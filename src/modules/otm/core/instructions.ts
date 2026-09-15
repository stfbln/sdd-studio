import { KEEP_HEADER_RULE, schemaRule, type FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

/** Update instructions of an Open Threat Model file. */
export function otmInstructions(fileName: string): FileInstructions {
  return {
    style: /\.json$/i.test(fileName) ? 'json' : 'hash',
    format: 'an Open Threat Model (OTM) file',
    docs: 'https://github.com/iriusrisk/OpenThreatModel',
    schema: 'https://raw.githubusercontent.com/iriusrisk/OpenThreatModel/main/otm_schema.json',
    rules: [
      purposeRule('otm'),
      schemaRule('otmVersion'),
      'Every trust zone, component, dataflow, asset, threat and mitigation has an id unique in its list; a component id must not also be a trust zone id.',
      'Items point to each other by id: parent {trustZone: id} or {component: id}, dataflow source and destination (component or trust zone ids), assets, and threats: [{threat: id, state, mitigations: [{mitigation: id, state}]}] on components and dataflows.',
      'Software catalog files place networks in trust zones as <path of this file>#<trust zone id>: when you rename a trust zone id, update those references too.',
      KEEP_HEADER_RULE,
    ],
  };
}
