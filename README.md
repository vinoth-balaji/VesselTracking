# AIS Polygon Movement Analysis POC

Angular + ArcGIS sample application demonstrating the core business requirements for vessel polygon analysis.

## Included in this POC

- ArcGIS ocean basemap
- Polygon drawing, editing and clearing
- Period A / Period B inputs in UTC
- Entered, Exited and Remained movement filters
- CMA voyage status, commodity, load region and discharge region filters
- Heading-oriented vessel markers
- Commodity color coding
- AIS history tracks controlled by a time slider
- Vessel hover/click popup with AIS and CMA Ship Track fields
- Filtered vessel result table synchronized with the map
- Add Voyage / Edit Voyage proof-of-concept action
- Scenario save and reload using browser local storage
- Mock AIS/voyage dataset; no backend is required

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm start
```

Then open `http://localhost:4200`.

## POC notes

- The project uses `@arcgis/core` and the ArcGIS `SketchViewModel` for polygon drawing.
- ArcGIS-hosted basemaps may require authentication depending on the organization's ArcGIS configuration. For production, configure the Phillips 66 ArcGIS Enterprise portal or approved API key.
- Movement classifications in the mock dataset are precomputed. Production classification should be calculated in Databricks/PostGIS from timestamped AIS observations.
- Browser local storage is only used to demonstrate saved scenarios. Production scenarios belong in the application database.
- The Add Voyage action currently displays the values that would be pre-populated. It should call the existing CMA Ship Track API or route to the voyage editor.

## Suggested production services

- `POST /api/ais/polygon-analysis`
- `GET /api/ais/vessels/{imo}/track?from=&to=`
- `GET /api/scenarios`
- `POST /api/scenarios`
- `POST /api/voyages`
- `PUT /api/voyages/{id}`

## Build

```bash
npm run build
```
