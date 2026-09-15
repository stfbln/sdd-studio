/** Names of the SDD Studio MCP server and its tools, shared by the server and the prompts referring to them. */

export const MCP_SERVER_NAME = 'sdd-studio';

export const MCP_TOOLS = {
  describeSpecKinds: 'describe_spec_kinds',
  listCatalogEntities: 'list_catalog_entities',
  getCatalogEntity: 'get_catalog_entity',
  listSpecFiles: 'list_spec_files',
  checkSpecFile: 'check_spec_file',
  createCatalogFile: 'create_catalog_file',
  createSpecFile: 'create_spec_file',
  linkSpecFile: 'link_spec_file',
} as const;
