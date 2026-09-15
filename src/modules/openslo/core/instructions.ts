import { KEEP_HEADER_RULE, type FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

/** Update instructions of an OpenSLO file. */
export function openSloInstructions(): FileInstructions {
  return {
    style: 'hash',
    format: 'an OpenSLO specification, one object per YAML document separated by ---',
    docs: 'https://github.com/openslo/openslo',
    rules: [
      purposeRule('openslo'),
      'Every document has apiVersion: openslo/v1, a kind (Service, SLO, SLI, DataSource, AlertPolicy, AlertCondition, AlertNotificationTarget) and metadata.name, unique among the documents of the same kind in this file.',
      'Objects reference each other by metadata.name, scoped to this file: SLO.spec.service (a Service), SLO.spec.indicatorRef (an SLI, or use an inline SLO.spec.indicator instead), SLO.spec.alertPolicies, AlertPolicy.spec.conditions and AlertPolicy.spec.notificationTargets.',
      'An SLO needs a budgetingMethod (Occurrences or Timeslices), at least one timeWindow (duration, isRolling) and at least one objective (target between 0 and 1, or timeSliceTarget for Timeslices).',
      'An SLI (inline or standalone) declares a ratioMetric (good and total, or good and bad) or a thresholdMetric, each with a metricSource {type, metricSourceRef, spec}.',
      KEEP_HEADER_RULE,
    ],
  };
}
