# Online shop — containers

<!-- Diagram of the software catalog, exported by SDD Studio. To change it, open the catalog,
     choose the entities on the Diagram page and export again over this file. -->

```mermaid
%%{init: {"theme": "base", "themeVariables": { "fontFamily": "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", "fontSize": "14px", "lineColor": "#8a94a6", "primaryColor": "#eef2f7", "primaryBorderColor": "#8a94a6", "primaryTextColor": "#0f172a", "clusterBkg": "#f8fafc", "clusterBorder": "#cbd5e1", "edgeLabelBackground": "#ffffff" }, "flowchart": {"nodeSpacing": 55, "rankSpacing": 70, "padding": 12, "curve": "basis", "diagramPadding": 16}} }%%
flowchart LR
  subgraph system_online_shop["Online shop"]
    component_deploy_cli["Deploy CLI"]
    component_shop_api["Shop API"]
    api_order_events(["Order events"])
    api_petstore_api(["Petstore API"])
    resource_orders_db[("Orders database")]
    dataasset_card_data[/"Card data"/]
  end

  component_shop_api -->|provides| api_petstore_api
  component_shop_api -->|provides| api_order_events
  component_shop_api -->|uses| resource_orders_db
  component_shop_api -->|uses| dataasset_card_data
  dataasset_card_data -->|uses| resource_orders_db

  classDef component fill:#e0f2fe,stroke:#0284c7,stroke-width:1px,color:#0f172a;
  class component_deploy_cli,component_shop_api component;
  classDef api fill:#dcfce7,stroke:#16a34a,stroke-width:1px,color:#0f172a;
  class api_order_events,api_petstore_api api;
  classDef resource fill:#fef3c7,stroke:#d97706,stroke-width:1px,color:#0f172a;
  class resource_orders_db resource;
  classDef dataAsset fill:#ffe4e6,stroke:#e11d48,stroke-width:1px,color:#0f172a;
  class dataasset_card_data dataAsset;
  style system_online_shop fill:#f5f9ff,stroke:#2563eb,stroke-width:2.5px,color:#0f172a;
```
