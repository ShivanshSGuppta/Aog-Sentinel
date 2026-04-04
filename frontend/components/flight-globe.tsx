"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  HorizontalOrigin,
  Math as CesiumMath,
  Rectangle,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  type Viewer as CesiumViewer,
} from "cesium";
import { Entity, Viewer } from "resium";

import type {
  AirportOverlay,
  CorridorSegment,
  DisruptionHotspot,
  FlightPosition,
  MaintenanceBase,
  OwnedFleetAircraft,
  OwnedFleetMatch,
  WeatherOverlay,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const REGION_RECTANGLES: Record<string, Rectangle> = {
  global: Rectangle.fromDegrees(-178, -58, 178, 78),
  "north-america": Rectangle.fromDegrees(-168, 7, -52, 72),
  "south-america": Rectangle.fromDegrees(-82, -57, -34, 13),
  europe: Rectangle.fromDegrees(-26, 34, 45, 72),
  africa: Rectangle.fromDegrees(-19, -35, 55, 38),
  "middle-east": Rectangle.fromDegrees(28, 12, 65, 42),
  "south-asia": Rectangle.fromDegrees(60, 5, 98, 37),
  "east-asia": Rectangle.fromDegrees(98, 18, 150, 52),
  "southeast-asia": Rectangle.fromDegrees(92, -12, 141, 24),
  oceania: Rectangle.fromDegrees(110, -49, 180, 2),
};

interface FlightGlobeProps {
  flights: FlightPosition[];
  selectedFlightId?: string | null;
  region?: string;
  onSelect?: (flight: FlightPosition) => void;
  className?: string;
  activeLayerIds?: string[];
  ownedFleet?: OwnedFleetAircraft[];
  maintenanceBases?: MaintenanceBase[];
  hotspots?: DisruptionHotspot[];
  weatherLayers?: WeatherOverlay[];
  corridorSegments?: CorridorSegment[];
  airportOverlays?: AirportOverlay[];
  ownedFleetMatches?: OwnedFleetMatch[];
  onAvailabilityChange?: (state: "loading" | "ready" | "unavailable") => void;
}

export interface FlightGlobeHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

function pointHeight(flight: FlightPosition) {
  if (flight.on_ground) return 0;
  return Math.max(flight.baro_altitude || 0, 1800);
}

function makePlaneSvg(fill: string, selected = false) {
  const stroke = selected ? "#7ED7E0" : "rgba(10,17,24,0.88)";
  const glow = selected ? `<circle cx="36" cy="36" r="13" fill="rgba(126,215,224,0.26)" /><circle cx="36" cy="36" r="19" fill="none" stroke="rgba(126,215,224,0.95)" stroke-width="2"/>` : "";
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
    ${glow}
    <path d="M36 8.5 L38.2 8.5 L40.5 24.2 L53 30.6 L53 34.3 L40.6 31.9 L43.5 61.2 L39.4 61.2 L36 44.8 L32.6 61.2 L28.5 61.2 L31.4 31.9 L19 34.3 L19 30.6 L31.5 24.2 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.9" stroke-linejoin="round"/>
  </svg>`;
}

const AIRBORNE_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makePlaneSvg("#F6C453"))}`;
const LOW_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makePlaneSvg("#FFF8E7"))}`;
const GROUND_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makePlaneSvg("#758296"))}`;
const SELECTED_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(makePlaneSvg("#F6C453", true))}`;

function flightBillboard(flight: FlightPosition, selected: boolean) {
  const image = selected ? SELECTED_IMAGE : flight.on_ground ? GROUND_IMAGE : (flight.baro_altitude || 0) >= 9000 ? AIRBORNE_IMAGE : LOW_IMAGE;
  return {
    image,
    scale: selected ? 0.56 : flight.on_ground ? 0.32 : 0.38,
    verticalOrigin: VerticalOrigin.CENTER,
    horizontalOrigin: HorizontalOrigin.CENTER,
    heightReference: flight.on_ground ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE,
    rotation: CesiumMath.toRadians(-(flight.heading || 0)),
    alignedAxis: Cartesian3.UNIT_Z,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function flightLabel(flight: FlightPosition, selected: boolean) {
  return {
    text: selected ? flight.callsign || flight.matched_tail_number || flight.icao24.toUpperCase() : "",
    fillColor: Color.fromCssColorString("#F8F9F7"),
    font: "600 12px IBM Plex Sans",
    showBackground: true,
    backgroundColor: Color.fromCssColorString("#081019").withAlpha(0.82),
    pixelOffset: new Cartesian2(0, -18),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function regionRectangle(region?: string) {
  return REGION_RECTANGLES[region || "global"] || REGION_RECTANGLES.global;
}

function supportsWebgl() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export const FlightGlobe = forwardRef<FlightGlobeHandle, FlightGlobeProps>(function FlightGlobe(
  { flights, selectedFlightId, region = "global", onSelect, className, activeLayerIds = [], ownedFleet = [], maintenanceBases = [], hotspots = [], weatherLayers = [], corridorSegments = [], airportOverlays = [], ownedFleetMatches = [], onAvailabilityChange },
  ref
) {
  const viewerRef = useRef<{ cesiumElement?: CesiumViewer } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [viewerStatus, setViewerStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [viewerMessage, setViewerMessage] = useState<string | null>(null);
  const selectedFlight = useMemo(() => flights.find((item) => item.icao24 === selectedFlightId) || null, [flights, selectedFlightId]);
  const imageryProvider = useMemo(
    () =>
      mounted
        ? new UrlTemplateImageryProvider({
            url: process.env.NEXT_PUBLIC_FLIGHTS_3D_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            credit: "© OpenStreetMap contributors",
          })
        : null,
    [mounted]
  );

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium/";
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!supportsWebgl()) {
      setViewerStatus("unavailable");
      setViewerMessage("3D map is unavailable in this browser session. Use 2D radar or try a different browser/GPU session.");
    }
  }, [mounted]);

  useEffect(() => {
    onAvailabilityChange?.(viewerStatus);
  }, [onAvailabilityChange, viewerStatus]);

  useEffect(() => {
    if (!mounted || viewerStatus !== "loading") return;
    const timer = window.setTimeout(() => {
      setViewerStatus((current) => {
        if (current === "ready") return current;
        setViewerMessage("3D map did not finish initializing. You can continue working in 2D radar.");
        return "unavailable";
      });
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [mounted, viewerStatus]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn() {
        viewerRef.current?.cesiumElement?.camera.zoomIn(900000);
      },
      zoomOut() {
        viewerRef.current?.cesiumElement?.camera.zoomOut(900000);
      },
      resetView() {
        viewerRef.current?.cesiumElement?.camera.flyTo({ destination: regionRectangle(region), duration: 1.1 });
      },
    }),
    [region]
  );

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || !imageryProvider || viewerStatus === "unavailable") return;

    try {
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(imageryProvider);
      viewer.scene.globe.baseColor = Color.fromCssColorString("#8EB7D6");
      viewer.scene.backgroundColor = Color.fromCssColorString("#A7C7DE");
      if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
      if (viewer.scene.moon) viewer.scene.moon.show = false;
      if (viewer.scene.sun) viewer.scene.sun.show = false;
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 750000;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 55000000;
      viewer.camera.flyTo({ destination: regionRectangle(region), duration: 0 });
      setViewerStatus("ready");
      setViewerMessage(null);
    } catch {
      setViewerStatus("unavailable");
      setViewerMessage("3D map could not initialize its rendering pipeline. Keep using 2D radar for this session.");
    }
  }, [imageryProvider, region, viewerStatus]);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || !selectedFlight || viewerStatus !== "ready") return;
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(selectedFlight.longitude, selectedFlight.latitude, selectedFlight.on_ground ? 750000 : Math.max(pointHeight(selectedFlight) * 14, 900000)),
      duration: 1.2,
    });
  }, [selectedFlight, viewerStatus]);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewerStatus !== "ready") return;
    const remove = viewer.selectedEntityChanged.addEventListener((entity) => {
      const id = entity?.id;
      if (typeof id !== "string" || !id.startsWith("flight-")) return;
      const flightId = id.replace("flight-", "");
      const match = flights.find((item) => item.icao24 === flightId);
      if (match) onSelect?.(match);
    });
    return () => {
      remove();
    };
  }, [flights, onSelect, viewerStatus]);

  const showOwnedFleet = activeLayerIds.includes("owned_fleet");
  const showMaintenanceBases = activeLayerIds.includes("maintenance_bases");
  const showHotspots = activeLayerIds.includes("hotspots");
  const showWatchAircraft = activeLayerIds.includes("watch_aircraft");
  const showWeather = activeLayerIds.includes("weather");
  const showCorridors = activeLayerIds.includes("corridors");
  const showAirportCongestion = activeLayerIds.includes("airport_congestion");
  const showOwnedMatches = activeLayerIds.includes("owned_matches");

  return (
    <div className={cn("relative h-full min-h-[520px] overflow-hidden rounded-[32px] border border-white/10 bg-[#0C1620]", className)}>
      {mounted && viewerStatus !== "unavailable" ? (
        <Viewer
          ref={viewerRef}
          full
          baseLayerPicker={false}
          animation={false}
          timeline={false}
          geocoder={false}
          homeButton={false}
          sceneModePicker={false}
          navigationHelpButton={false}
          fullscreenButton={false}
          infoBox={false}
          selectionIndicator={false}
          scene3DOnly
          requestRenderMode
          shouldAnimate
        >
          {showCorridors && corridorSegments.map((segment) => (
            <Entity
              key={segment.segment_id}
              polyline={{
                positions: Cartesian3.fromDegreesArray([segment.start_longitude, segment.start_latitude, segment.end_longitude, segment.end_latitude]),
                width: segment.intensity === "high" ? 3 : segment.intensity === "medium" ? 2 : 1.2,
                material: Color.fromCssColorString(segment.intensity === "high" ? "#F6C453" : segment.intensity === "medium" ? "#7ED7E0" : "#567289").withAlpha(segment.intensity === "high" ? 0.72 : 0.34),
                clampToGround: false,
              }}
            />
          ))}

          {showAirportCongestion && airportOverlays.map((airport) => {
            const color = airport.severity === "Critical" ? "#F87171" : airport.severity === "High" ? "#F6C453" : airport.severity === "Medium" ? "#7ED7E0" : "#7C8798";
            return (
              <Entity
                key={airport.airport_id}
                position={Cartesian3.fromDegrees(airport.longitude, airport.latitude)}
                point={{ pixelSize: 6, color: Color.fromCssColorString(color), disableDepthTestDistance: Number.POSITIVE_INFINITY }}
                ellipse={{
                  semiMinorAxis: 65000 + airport.congestion_score * 760,
                  semiMajorAxis: 65000 + airport.congestion_score * 760,
                  material: Color.fromCssColorString(color).withAlpha(0.08),
                  outline: true,
                  outlineColor: Color.fromCssColorString(color).withAlpha(0.7),
                  height: 0,
                }}
                label={{
                  text: airport.iata_code,
                  font: "600 10px IBM Plex Sans",
                  fillColor: Color.fromCssColorString("#F8F9F7"),
                  showBackground: true,
                  backgroundColor: Color.fromCssColorString("#081019").withAlpha(0.7),
                  pixelOffset: new Cartesian2(0, -13),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }}
              />
            );
          })}

          {showWeather && weatherLayers.map((overlay) => (
            <Entity
              key={overlay.overlay_id}
              position={Cartesian3.fromDegrees(overlay.longitude, overlay.latitude, 120000)}
              point={{ pixelSize: 5, color: Color.fromCssColorString(overlay.source_status === "live" ? "#7ED7E0" : "#90A4B8"), disableDepthTestDistance: Number.POSITIVE_INFINITY }}
              label={{
                text: overlay.label,
                font: "500 10px IBM Plex Sans",
                fillColor: Color.fromCssColorString("#DDF9FC"),
                showBackground: true,
                backgroundColor: Color.fromCssColorString("#081019").withAlpha(0.66),
                pixelOffset: new Cartesian2(0, -16),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }}
            />
          ))}

          {flights.map((flight) => {
            const selected = flight.icao24 === selectedFlightId;
            return (
              <Entity
                key={flight.icao24}
                id={`flight-${flight.icao24}`}
                name={flight.callsign || flight.icao24.toUpperCase()}
                position={Cartesian3.fromDegrees(flight.longitude, flight.latitude, pointHeight(flight))}
                billboard={flightBillboard(flight, selected)}
                label={flightLabel(flight, selected)}
                point={selected ? { pixelSize: 8, color: Color.fromCssColorString("#7ED7E0").withAlpha(0.75), disableDepthTestDistance: Number.POSITIVE_INFINITY } : undefined}
                ellipse={selected ? { semiMinorAxis: 56000, semiMajorAxis: 56000, material: Color.fromCssColorString("#7ED7E0").withAlpha(0.08), outline: true, outlineColor: Color.fromCssColorString("#7ED7E0"), height: 0 } : undefined}
              />
            );
          })}

          {showOwnedFleet && ownedFleet.map((aircraft) => (
            <Entity
              key={aircraft.overlay_id}
              id={`owned-${aircraft.overlay_id}`}
              position={Cartesian3.fromDegrees(aircraft.longitude, aircraft.latitude, 5000)}
              point={{ pixelSize: 4.2, color: Color.fromCssColorString("#7ED7E0"), outlineColor: Color.fromCssColorString("#081019"), outlineWidth: 0.7, disableDepthTestDistance: Number.POSITIVE_INFINITY }}
              label={{
                text: aircraft.tail_number,
                font: "600 10px IBM Plex Sans",
                fillColor: Color.fromCssColorString("#A9F0F6"),
                showBackground: false,
                pixelOffset: new Cartesian2(0, 10),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }}
            />
          ))}

          {showOwnedMatches && ownedFleetMatches.filter((item) => item.latitude !== null && item.longitude !== null).map((match) => {
            const color = match.match_status === "watch" ? "#F6C453" : match.match_status === "matched" ? "#7ED7E0" : "#7C8798";
            return (
              <Entity
                key={`match-${match.match_id}`}
                position={Cartesian3.fromDegrees(match.longitude || 0, match.latitude || 0)}
                ellipse={{
                  semiMinorAxis: match.match_status === "watch" ? 48000 : 34000,
                  semiMajorAxis: match.match_status === "watch" ? 48000 : 34000,
                  material: Color.fromCssColorString(color).withAlpha(0.03),
                  outline: true,
                  outlineColor: Color.fromCssColorString(color).withAlpha(0.58),
                  height: 0,
                }}
              />
            );
          })}

          {showWatchAircraft && ownedFleet.filter((item) => item.risk_score >= 70).map((aircraft) => (
            <Entity
              key={`watch-${aircraft.overlay_id}`}
              position={Cartesian3.fromDegrees(aircraft.longitude, aircraft.latitude)}
              ellipse={{
                semiMinorAxis: 62000,
                semiMajorAxis: 62000,
                material: Color.fromCssColorString("#7ED7E0").withAlpha(0.04),
                outline: true,
                outlineColor: Color.fromCssColorString("#F6C453"),
                height: 0,
              }}
            />
          ))}

          {showMaintenanceBases && maintenanceBases.map((base) => (
            <Entity
              key={base.base_id}
              position={Cartesian3.fromDegrees(base.longitude, base.latitude)}
              point={{ pixelSize: 8, color: Color.fromCssColorString("#0B203D"), outlineColor: Color.fromCssColorString("#7ED7E0"), outlineWidth: 1.4, disableDepthTestDistance: Number.POSITIVE_INFINITY }}
              label={{
                text: base.iata_code,
                font: "700 10px IBM Plex Sans",
                fillColor: Color.fromCssColorString("#F8F9F7"),
                showBackground: true,
                backgroundColor: Color.fromCssColorString("#0B203D").withAlpha(0.82),
                pixelOffset: new Cartesian2(0, 14),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }}
            />
          ))}

          {showHotspots && hotspots.map((hotspot) => (
            <Entity
              key={hotspot.hotspot_id}
              position={Cartesian3.fromDegrees(hotspot.longitude, hotspot.latitude)}
              point={{ pixelSize: 7, color: Color.fromCssColorString(hotspot.severity === "Critical" ? "#F87171" : "#F6C453"), disableDepthTestDistance: Number.POSITIVE_INFINITY }}
              ellipse={{
                semiMinorAxis: hotspot.severity === "Critical" ? 150000 : 110000,
                semiMajorAxis: hotspot.severity === "Critical" ? 150000 : 110000,
                material: Color.fromCssColorString(hotspot.severity === "Critical" ? "#F87171" : "#F6C453").withAlpha(0.1),
                outline: true,
                outlineColor: Color.fromCssColorString(hotspot.severity === "Critical" ? "#F87171" : "#F6C453"),
                height: 0,
              }}
            />
          ))}
        </Viewer>
      ) : null}

      {viewerStatus !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(12,22,32,0.78),rgba(12,22,32,0.64))] px-6 text-center text-sm font-medium text-white/80">
          {viewerMessage || "Initializing 3D map"}
        </div>
      ) : null}
    </div>
  );
});
