# Online shop — deployment

<!-- Diagram of the software catalog, exported by SDD Studio. To change it, open the catalog,
     choose the entities on the Diagram page and export again over this file. -->

```mermaid
%%{init: {"theme": "base", "themeVariables": { "fontFamily": "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", "fontSize": "14px", "lineColor": "#8a94a6", "primaryColor": "#eef2f7", "primaryBorderColor": "#8a94a6", "primaryTextColor": "#0f172a", "clusterBkg": "#f8fafc", "clusterBorder": "#cbd5e1", "edgeLabelBackground": "#ffffff" }, "flowchart": {"nodeSpacing": 55, "rankSpacing": 70, "padding": 12, "curve": "basis", "diagramPadding": 16}} }%%
flowchart LR
  subgraph system_online_shop["Online shop"]
    component_deploy_cli["Deploy CLI"]
    component_shop_api["Shop API"]
    resource_orders_db[("Orders database")]
    platform_prod_eks_cluster[["Prod EKS cluster"]]
    infrastructure_db_host[["Orders DB host"]]
  end
  network_internet{{"Internet"}}
  network_private{{"Private network"}}
  site_aws_us_east_1{{"AWS us-east-1"}}

  component_shop_api -->|reads and writes| resource_orders_db
  component_shop_api -.->|runs in| network_private
  component_shop_api -.->|runs on| platform_prod_eks_cluster
  resource_orders_db -.->|runs in| network_private
  resource_orders_db -.->|runs on| infrastructure_db_host
  platform_prod_eks_cluster -.->|runs in| network_private
  platform_prod_eks_cluster -.->|hosted at| site_aws_us_east_1
  infrastructure_db_host -.->|runs in| network_private
  infrastructure_db_host -.->|hosted at| site_aws_us_east_1

  classDef component fill:#e0f2fe,stroke:#0284c7,stroke-width:1px,color:#0f172a;
  class component_deploy_cli,component_shop_api component;
  classDef resource fill:#fef3c7,stroke:#d97706,stroke-width:1px,color:#0f172a;
  class resource_orders_db resource;
  classDef network fill:#e2e8f0,stroke:#475569,stroke-width:1px,color:#0f172a;
  class network_internet,network_private network;
  classDef platform fill:#cffafe,stroke:#0891b2,stroke-width:1px,color:#0f172a;
  class platform_prod_eks_cluster platform;
  classDef infrastructure fill:#ccfbf1,stroke:#0d9488,stroke-width:1px,color:#0f172a;
  class infrastructure_db_host infrastructure;
  classDef site fill:#f1f5f9,stroke:#64748b,stroke-width:1px,color:#0f172a;
  class site_aws_us_east_1 site;
  style system_online_shop fill:#f5f9ff,stroke:#2563eb,stroke-width:1px,color:#0f172a;
  style component_shop_api fill:#e0f2fe,stroke:#0284c7,stroke-width:2.5px,color:#0f172a;
  style resource_orders_db fill:#fef3c7,stroke:#d97706,stroke-width:2.5px,color:#0f172a;
```
