import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import Graphic from "@arcgis/core/Graphic.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol.js";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine.js";
import { MockAisService } from "./services/mock-ais.service";
import { MovementType, Vessel } from "./models/vessel";

interface SavedScenario {
  id: string;
  name: string;
  description: string;
  periodA: string;
  periodB: string;
  movementFilters: MovementType[];
  commodity: string;
  voyageStatus: string;
  polygonJson?: string;
}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild("mapViewNode", { static: true })
  private mapViewNode!: ElementRef<HTMLDivElement>;

  readonly allVessels = signal<Vessel[]>([]);
  readonly displayedVessels = signal<Vessel[]>([]);
  readonly scenarioMessage = signal(
    "Select a scenario or draw a polygon to start.",
  );
  readonly voyageMessage = signal("");
  readonly selectedVessel = signal<Vessel | null>(null);
  readonly selectedScenarioId = signal<string>("gulf-watch");

  periodA = "2026-07-20T00:00";
  periodB = "2026-07-21T00:00";
  commodity = "All";
  voyageStatus = "All";
  movementFilters: Record<MovementType, boolean> = {
    Entered: true,
    Exited: true,
    Remained: true,
  };

  readonly commodities = computed(() => [
    "All",
    ...new Set(this.allVessels().map((v) => v.commodity)),
  ]);
  readonly statuses = computed(() => [
    "All",
    ...new Set(this.allVessels().map((v) => v.voyageStatus)),
  ]);

  // Pre-saved scenarios
  readonly scenarios: SavedScenario[] = [
    {
      id: "gulf-watch",
      name: "Gulf Watch Area",
      description: "Monitor vessels across entire Gulf of Mexico",
      periodA: "2026-07-20T00:00",
      periodB: "2026-07-21T00:00",
      movementFilters: ["Entered", "Exited", "Remained"],
      commodity: "All",
      voyageStatus: "All",
      polygonJson: JSON.stringify({
        rings: [
          [
            [-97, 26],
            [-97.2, 27],
            [-97, 28.5],
            [-96, 29.8],
            [-95, 30],
            [-93, 29.5],
            [-91, 29],
            [-90, 27.5],
            [-91, 26],
            [-93, 25.5],
            [-95.5, 25.8],
            [-97, 26],
          ],
        ],
      }),
    },
    {
      id: "crude-corridor",
      name: "Crude Corridor",
      description: "Track crude oil movements through export zone",
      periodA: "2026-07-20T00:00",
      periodB: "2026-07-21T00:00",
      movementFilters: ["Entered", "Exited"],
      commodity: "Crude",
      voyageStatus: "All",
      polygonJson: JSON.stringify({
        rings: [
          [
            [-95.5, 27.5],
            [-95.8, 28],
            [-95.5, 29],
            [-94.8, 29.2],
            [-94, 28.8],
            [-93.8, 28],
            [-94.2, 27.5],
            [-95, 27],
            [-95.5, 27.5],
          ],
        ],
      }),
    },
    {
      id: "discharge-zone",
      name: "Discharge Zone",
      description: "Monitor product discharge operations",
      periodA: "2026-07-20T00:00",
      periodB: "2026-07-21T00:00",
      movementFilters: ["Remained"],
      commodity: "Clean Products",
      voyageStatus: "Watch",
      polygonJson: JSON.stringify({
        rings: [
          [
            [-92, 28],
            [-92.3, 28.3],
            [-92, 28.8],
            [-91.5, 28.9],
            [-91, 28.5],
            [-91.2, 28],
            [-91.5, 27.8],
            [-92, 28],
          ],
        ],
      }),
    },
    {
      id: "entry-point",
      name: "Entry Point",
      description: "Monitor inbound vessel traffic",
      periodA: "2026-07-20T00:00",
      periodB: "2026-07-21T00:00",
      movementFilters: ["Entered"],
      commodity: "All",
      voyageStatus: "In Transit",
      polygonJson: JSON.stringify({
        rings: [
          [
            [-96.5, 26.5],
            [-96.8, 26.8],
            [-96.5, 27.5],
            [-95.8, 27.4],
            [-95.5, 26.8],
            [-95.8, 26.2],
            [-96.5, 26.5],
          ],
        ],
      }),
    },
  ];

  private view?: MapView;
  private sketchViewModel?: SketchViewModel;
  private currentPolygon?: Polygon;
  private polygonLayer = new GraphicsLayer({ title: "Analysis polygon" });
  private vesselLayer = new GraphicsLayer({ title: "Filtered vessels" });
  private trackLayer = new GraphicsLayer({ title: "Vessel tracks" });
  private hoverHandle?: { remove(): void };

  constructor(private readonly aisService: MockAisService) {
    const vessels = this.aisService.getVessels();
    this.allVessels.set(vessels);
    this.displayedVessels.set(vessels);
  }

  async ngAfterViewInit(): Promise<void> {
    const map = new Map({ basemap: "oceans" });
    map.addMany([this.polygonLayer, this.trackLayer, this.vesselLayer]);

    this.view = new MapView({
      container: this.mapViewNode.nativeElement,
      map,
      center: [-93.7, 28.7],
      zoom: 6,
      popup: { dockEnabled: false, defaultPopupTemplateEnabled: false },
    });

    await this.view.when();
    this.configureSketch();
    this.renderMap();
    this.configureHover();
    this.loadScenario("gulf-watch");
  }

  ngOnDestroy(): void {
    this.hoverHandle?.remove();
    this.view?.destroy();
  }

  drawPolygon(): void {
    this.scenarioMessage.set(
      "Click on the map to draw polygon corners. Double-click to finish.",
    );
    this.sketchViewModel?.create("polygon");
  }

  clearPolygon(): void {
    this.currentPolygon = undefined;
    this.polygonLayer.removeAll();
    this.scenarioMessage.set("Polygon cleared.");
    this.runAnalysis();
  }

  runAnalysis(): void {
    const chosenMovements = (
      Object.keys(this.movementFilters) as MovementType[]
    ).filter((value) => this.movementFilters[value]);

    const results = this.allVessels().filter((vessel) => {
      const matchesAttributes =
        chosenMovements.includes(vessel.movement) &&
        (this.commodity === "All" || vessel.commodity === this.commodity) &&
        (this.voyageStatus === "All" ||
          vessel.voyageStatus === this.voyageStatus);

      if (!matchesAttributes || !this.currentPolygon) return matchesAttributes;
      const point = new Point({
        longitude: vessel.longitude,
        latitude: vessel.latitude,
        spatialReference: { wkid: 4326 },
      });
      return geometryEngine.intersects(this.currentPolygon, point);
    });

    this.displayedVessels.set(results);
    this.scenarioMessage.set(`${results.length} vessel(s) found in polygon.`);
    this.renderMap();
  }

  resetFilters(): void {
    this.commodity = "All";
    this.voyageStatus = "All";
    this.movementFilters = { Entered: true, Exited: true, Remained: true };
    this.runAnalysis();
  }

  loadScenario(scenarioId: string): void {
    const scenario = this.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;

    this.selectedScenarioId.set(scenarioId);
    this.periodA = scenario.periodA;
    this.periodB = scenario.periodB;
    this.commodity = scenario.commodity;
    this.voyageStatus = scenario.voyageStatus;
    this.movementFilters = { Entered: false, Exited: false, Remained: false };
    scenario.movementFilters.forEach(
      (value) => (this.movementFilters[value] = true),
    );

    if (scenario.polygonJson) {
      try {
        this.currentPolygon = Polygon.fromJSON(
          JSON.parse(scenario.polygonJson),
        );
        this.polygonLayer.removeAll();
        this.polygonLayer.add(
          new Graphic({
            geometry: this.currentPolygon,
            symbol: this.polygonSymbol(),
          }),
        );
        this.scenarioMessage.set(`Loaded: ${scenario.name}`);
      } catch (e) {
        this.scenarioMessage.set(`Error loading scenario: ${e}`);
      }
    }
    this.runAnalysis();
  }

  focusVessel(vessel: Vessel): void {
    this.selectedVessel.set(vessel);
    this.view?.goTo({ center: [vessel.longitude, vessel.latitude], zoom: 9 });
  }

  addVoyage(vessel: Vessel): void {
    this.selectedVessel.set(vessel);
    const loadDate = this.periodB.substring(0, 10);
    this.voyageMessage.set(
      `Voyage: ${vessel.name} (${vessel.imo}) - Load Date: ${loadDate}`,
    );
  }

  movementClass(movement: MovementType): string {
    return movement.toLowerCase();
  }

  private configureSketch(): void {
    if (!this.view) return;
    this.sketchViewModel = new SketchViewModel({
      view: this.view,
      layer: this.polygonLayer,
      polygonSymbol: this.polygonSymbol(),
      updateOnGraphicClick: true,
      defaultCreateOptions: { mode: "click" },
      defaultUpdateOptions: { enableRotation: false, enableScaling: true },
    });

    this.sketchViewModel.on("create", (event) => {
      if (event.state === "complete" && event.graphic) {
        this.currentPolygon = event.graphic.geometry as Polygon;
        this.polygonLayer.removeAll();
        this.polygonLayer.add(
          new Graphic({
            geometry: this.currentPolygon,
            symbol: this.polygonSymbol(),
          }),
        );
        this.runAnalysis();
      }
    });

    this.sketchViewModel.on("update", (event) => {
      if (event.state === "complete" && event.graphics.length) {
        this.currentPolygon = event.graphics[0].geometry as Polygon;
        this.runAnalysis();
      }
    });
  }

  private configureHover(): void {
    if (!this.view) return;
    let pending = false;
    this.hoverHandle = this.view.on("pointer-move", (event) => {
      if (pending || !this.view) return;
      pending = true;
      this.view
        .hitTest(event, { include: this.vesselLayer })
        .then((response) => {
          const graphic = response.results.find(
            (result) => result.type === "graphic",
          )?.graphic;
          this.mapViewNode.nativeElement.style.cursor = graphic
            ? "pointer"
            : "default";
          if (graphic) {
            this.view?.openPopup({
              features: [graphic],
              location: graphic.geometry as Point,
              updateLocationEnabled: false,
            });
          }
        })
        .finally(() => (pending = false));
    });
  }

  private renderMap(): void {
    this.vesselLayer.removeAll();
    this.trackLayer.removeAll();

    for (const vessel of this.displayedVessels()) {
      // Draw AIS history track (solid line - where it's been)
      if (vessel.track && vessel.track.length > 1) {
        const trackCoords = vessel.track.map((tp) => [
          tp.longitude,
          tp.latitude,
        ]);
        const polyline = new Polyline({
          paths: [trackCoords],
          spatialReference: { wkid: 4326 },
        });
        const color = this.commodityColor(vessel.commodity);
        const lineSymbol = new SimpleLineSymbol({
          color: [...color.slice(0, 3), 0.8] as number[],
          width: 4,
          style: "solid",
        });
        this.trackLayer.add(
          new Graphic({
            geometry: polyline,
            symbol: lineSymbol,
            attributes: { type: "AIS History Track", vessel: vessel.name },
          }),
        );

        // Add waypoint dots at each track position
        for (let i = 0; i < vessel.track.length; i++) {
          const tp = vessel.track[i];
          const point = new Point({
            longitude: tp.longitude,
            latitude: tp.latitude,
          });
          const color = this.commodityColor(vessel.commodity);

          // Different size for start and end
          let size = 4;
          let opacity = 0.6;
          if (i === 0) {
            size = 7;
            opacity = 1;
          } // Start (larger, full opacity)
          if (i === vessel.track.length - 1) {
            size = 6;
            opacity = 0.9;
          } // Current (medium, high opacity)

          const waypoint = new SimpleMarkerSymbol({
            style: "circle",
            color: [...color.slice(0, 3), opacity] as number[],
            size,
            outline: { color: [255, 255, 255, 0.8], width: 1 },
          });

          this.trackLayer.add(
            new Graphic({
              geometry: point,
              symbol: waypoint,
              attributes: {
                type: "Track Waypoint",
                vessel: vessel.name,
                step: i + 1,
                total: vessel.track.length,
                timestamp: tp.timestamp,
                speed: tp.speed,
              },
            }),
          );
        }
      }

      // Draw complete voyage itinerary (all ports and legs) - REMOVED, not in requirements
      // Doc specifies only AIS history track, not planned voyage legs

      // Draw vessel marker
      const color = this.commodityColor(vessel.commodity);
      const point = new Point({
        longitude: vessel.longitude,
        latitude: vessel.latitude,
      });
      const marker = new SimpleMarkerSymbol({
        style: "triangle",
        color,
        size: 15,
        angle: vessel.heading,
        outline: { color: [255, 255, 255, 0.95], width: 1.5 },
      });
      this.vesselLayer.add(
        new Graphic({
          geometry: point,
          symbol: marker,
          attributes: { ...vessel },
          popupTemplate: {
            title: "{name} · {imo}",
            content: [
              {
                type: "fields",
                fieldInfos: [
                  { fieldName: "movement", label: "Movement" },
                  { fieldName: "voyageStatus", label: "Status" },
                  { fieldName: "commodity", label: "Commodity" },
                  { fieldName: "speed", label: "Speed (kn)" },
                  { fieldName: "heading", label: "Heading" },
                  { fieldName: "disport", label: "Discharge Port" },
                  { fieldName: "eta", label: "ETA" },
                ],
              },
            ],
          },
        }),
      );
    }
  }

  private commodityColor(commodity: Vessel["commodity"]): number[] {
    const colors: Record<Vessel["commodity"], number[]> = {
      Crude: [179, 60, 46, 1],
      "Clean Products": [35, 123, 160, 1],
      "Dirty Products": [107, 77, 140, 1],
      LPG: [33, 145, 92, 1],
    };
    return colors[commodity];
  }

  private polygonSymbol(): SimpleFillSymbol {
    return new SimpleFillSymbol({
      color: [15, 108, 189, 0.25],
      outline: { color: [15, 108, 189, 1], width: 3 },
    });
  }
}
