import { KEEP_HEADER_RULE, type FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';
import {
  ARTIFACT_TYPE_ANNOTATION,
  BRANCH_ANNOTATION,
  CIDR_ANNOTATION,
  CLASSIFICATION_LABEL,
  CLOUD_PROVIDER_ANNOTATION,
  DEPLOYED_ON_ANNOTATION,
  PRODUCED_BY_ANNOTATION,
  PROVIDER_ANNOTATION,
  PURL_ANNOTATION,
  REGION_ANNOTATION,
  RELATIONSHIPS_ANNOTATION,
  REPOSITORY_ANNOTATION,
  REPOSITORY_PATH_ANNOTATION,
  REPOSITORY_URL_ANNOTATION,
  SITE_ANNOTATION,
  SOURCE_LOCATION_ANNOTATION,
  SPECS_ANNOTATION,
  SUPPLIER_ANNOTATION,
  THREAT_MODELS_ANNOTATION,
  TRUST_ZONE_ANNOTATION,
} from './model';

/** Update instructions of a catalog file: Backstage's format plus the conventions of SDD Studio. */
export function catalogInstructions(): FileInstructions {
  return {
    style: 'hash',
    format: 'a Backstage software catalog file, one entity per YAML document separated by ---',
    docs: 'https://backstage.io/docs/features/software-catalog/descriptor-format',
    schema: 'https://json.schemastore.org/catalog-info.json',
    rules: [
      purposeRule('backstage'),
      'Keep every entity valid against the JSON schema of the first line (apiVersion backstage.io/v1alpha1).',
      'Refer to entities as [kind:][namespace/]name; dependsOn and dependencyOf entries need the kind (e.g. resource:orders-db). Referenced entities may be defined in any *.catalog-info.yaml file of the workspace.',
      [
        'SDD Studio conventions (paths are relative to this file; lists are comma separated):',
        `${SPECS_ANNOTATION} and ${THREAT_MODELS_ANNOTATION} annotations: spec files and Open Threat Model files an entity implements or follows. An API's definition is its spec file: definition: {$text: ./orders.openapi.yaml}.`,
        `Resources of type data-asset (label ${CLASSIFICATION_LABEL}: public, internal, confidential or restricted), network, artifact, repository, platform and infrastructure. Components and resources depend on the data assets they use and the networks they run in.`,
        `Networks: ${TRUST_ZONE_ANNOTATION} (threat model file#trust zone id) and ${CIDR_ANNOTATION}; a network's parent is the first network it depends on.`,
        `Artifacts: ${ARTIFACT_TYPE_ANNOTATION}, ${PURL_ANNOTATION}, ${PRODUCED_BY_ANNOTATION} (entity reference, component, system, team or repository) and ${SUPPLIER_ANNOTATION}.`,
        `Code: ${REPOSITORY_ANNOTATION} (reference of the repository) and ${REPOSITORY_PATH_ANNOTATION} on components, resources, artifacts, platforms and infrastructure; repositories have ${PROVIDER_ANNOTATION}, ${REPOSITORY_URL_ANNOTATION} and ${BRANCH_ANNOTATION}. Keep ${SOURCE_LOCATION_ANNOTATION} in line with them (url:<repository URL>/tree/<branch>/<path>, /-/tree/ on GitLab).`,
        `Relationships: ${RELATIONSHIPS_ANNOTATION} on components and resources says what they do with a dependency when it is not "runs in" (a network) or "uses" (anything else), as the relationship then the dependsOn entry: "uses resource:internet, reads from resource:orders-db". Only the networks an entity runs in place it in their trust zone.`,
        `Deployment: ${DEPLOYED_ON_ANNOTATION} on components and resources (comma-separated entity references) points to Resources of type platform or infrastructure they run on. ${SITE_ANNOTATION} on networks, platforms and infrastructure points to a Resource of type site (a cloud region or physical location, with ${CLOUD_PROVIDER_ANNOTATION} and ${REGION_ANNOTATION}).`,
      ],
      KEEP_HEADER_RULE,
    ],
  };
}
