"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";

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

const REGION_VIEWPORTS: Record<string, { center: [number, number]; zoom: number }> = {
  global: { center: [8, 18], zoom: 1.4 },
  "north-america": { center: [-100, 41], zoom: 2.35 },
  "south-america": { center: [-60, -18], zoom: 2.25 },
  europe: { center: [13, 51], zoom: 3.35 },
  africa: { center: [18, 2], zoom: 2.35 },
  "middle-east": { center: [48, 27], zoom: 3.2 },
  "south-asia": { center: [79, 21], zoom: 3.3 },
  "east-asia": { center: [121, 33], zoom: 3.1 },
  "southeast-asia": { center: [112, 7], zoom: 3.4 },
  oceania: { center: [141, -25], zoom: 2.7 },
};

const SOURCE_IDS = {
  flights: "flight-positions",
  selectedFlight: "selected-flight",
  ownedFleet: "owned-fleet",
  ownedMatches: "owned-fleet-matches",
  watchAircraft: "watch-aircraft",
  maintenanceBases: "maintenance-bases",
  hotspots: "hotspots",
  weather: "weather-overlays",
  corridors: "corridor-segments",
  airports: "airport-overlays",
} as const;

const LAYER_IDS = {
  corridors: "corridor-lines",
  airportGlow: "airport-glow",
  airportCore: "airport-core",
  airportLabels: "airport-labels",
  weatherIcons: "weather-icons",
  weatherLabels: "weather-labels",
  hotspotGlow: "hotspot-glow",
  hotspotCore: "hotspot-core",
  hotspotLabels: "hotspot-labels",
  maintenanceBases: "maintenance-bases-icons",
  maintenanceBaseLabels: "maintenance-bases-labels",
  ownedMatchRings: "owned-match-rings",
  ownedMatchLabels: "owned-match-labels",
  watchAircraft: "watch-aircraft-rings",
  ownedFleet: "owned-fleet-icons",
  ownedFleetLabels: "owned-fleet-labels",
  selectedFlightHalo: "selected-flight-halo",
  flightSymbols: "flight-symbols",
  selectedFlightLabel: "selected-flight-label",
  flightLabels: "flight-labels",
} as const;

const ACTIVE_LAYER_MAP: Record<string, string[]> = {
  weather: [LAYER_IDS.weatherIcons, LAYER_IDS.weatherLabels],
  corridors: [LAYER_IDS.corridors],
  airport_congestion: [LAYER_IDS.airportGlow, LAYER_IDS.airportCore, LAYER_IDS.airportLabels],
  hotspots: [LAYER_IDS.hotspotGlow, LAYER_IDS.hotspotCore, LAYER_IDS.hotspotLabels],
  maintenance_bases: [LAYER_IDS.maintenanceBases, LAYER_IDS.maintenanceBaseLabels],
  owned_matches: [LAYER_IDS.ownedMatchRings, LAYER_IDS.ownedMatchLabels],
  watch_aircraft: [LAYER_IDS.watchAircraft],
  owned_fleet: [LAYER_IDS.ownedFleet, LAYER_IDS.ownedFleetLabels],
};

const MIN_ZOOM = 1.15;
const MAX_ZOOM = 8.4;
const DEFAULT_STYLE: StyleSpecification = {
  version: 8,
  name: "AOG Sentinel Natural",
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    openstreetmap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm-base",
      type: "raster",
      source: "openstreetmap",
      paint: {
        "raster-saturation": 0.08,
        "raster-contrast": 0.05,
        "raster-brightness-min": 0.06,
        "raster-brightness-max": 0.98,
      },
    },
  ],
};

const FLIGHT_PLANE_IMAGES = {
  selected: planeSvg("#F6C453", "#0A1118", true),
  cruise: planeSvg("#F6C453", "#0A1118"),
  low: planeSvg("#FFF8E7", "#0A1118"),
  ground: planeSvg("#758296", "#0A1118"),
} as const;

const ICON_IMAGES = {
  weather: cloudSvg(),
  maintenanceBase: maintenanceBaseSvg(),
  ownedFleet: diamondSvg("#7ED7E0", "#08202A"),
  ownedFleetWatch: diamondSvg("#8DE6EF", "#08202A", true),
} as const;

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: [],
} as GeoJSON.FeatureCollection;

function planeSvg(fill: string, stroke: string, selected = false) {
  const ring = selected
    ? `<circle cx="36" cy="36" r="15" fill="none" stroke="rgba(126,215,224,0.94)" stroke-width="2.4"/><circle cx="36" cy="36" r="22" fill="rgba(126,215,224,0.15)"/>`
    : "";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
      ${ring}
      <path d="M36 7.5 L38.2 7.5 L40.4 23.4 L52.8 29.5 L52.8 33.4 L40.4 31.1 L43.4 61.2 L39.2 61.2 L36 44.7 L32.8 61.2 L28.6 61.2 L31.6 31.1 L19.2 33.4 L19.2 29.5 L31.6 23.4 L33.8 7.5 Z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M31.5 27.5 L40.5 27.5" stroke="${stroke}" stroke-width="1.35" stroke-linecap="round" opacity="0.52"/>
    </svg>
  `;
}

function diamondSvg(fill: string, stroke: string, watch = false) {
  const accent = watch ? `<circle cx="18" cy="18" r="13" fill="none" stroke="rgba(246,196,83,0.78)" stroke-width="1.7" stroke-dasharray="4 3"/>` : "";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      ${accent}
      <path d="M18 6.6 L28.6 18 L18 29.4 L7.4 18 Z" fill="${fill}" fill-opacity="0.92" stroke="${stroke}" stroke-width="1.35"/>
    </svg>
  `;
}

function maintenanceBaseSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <rect x="8" y="8" width="18" height="18" rx="4" fill="#0B203D" stroke="#7ED7E0" stroke-width="1.8"/>
      <path d="M12 19h10" stroke="#DDF9FC" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M17 12v14" stroke="#DDF9FC" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `;
}

function cloudSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <path d="M11 22.5c-2.9 0-4.8-1.8-4.8-4.5 0-2.5 1.7-4.3 4.1-4.8.8-3.2 3.3-5.3 6.5-5.3 4 0 7.1 2.9 7.4 6.7 2.2.4 3.8 2.2 3.8 4.6 0 2.7-2 4.8-5 4.8H11z" fill="#7ED7E0" stroke="#08303D" stroke-width="1.5"/>
    </svg>
  `;
}

function getViewport(region: string) {
  return REGION_VIEWPORTS[region] || REGION_VIEWPORTS.global;
}

function mapStyle() {
  return process.env.NEXT_PUBLIC_FLIGHTS_MAP_STYLE_URL || DEFAULT_STYLE;
}

function loadSvgImage(svg: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load map symbol."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function ensureMapImage(map: MapLibreMap, imageId: string, svg: string) {
  if (map.hasImage(imageId)) return;
  const image = await loadSvgImage(svg);
  if (!map.hasImage(imageId)) {
    map.addImage(imageId, image, { pixelRatio: 2 });
  }
}

function setSourceData(map: MapLibreMap, sourceId: string, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  }
}

function featureCollection(features: GeoJSON.Feature[]) {
  return {
    type: "FeatureCollection",
    features,
  } as GeoJSON.FeatureCollection;
}

function flightIconName(flight: FlightPosition, selectedFlightId?: string | null) {
  if (flight.icao24 === selectedFlightId) return "flight-selected";
  if (flight.on_ground) return "flight-ground";
  if ((flight.baro_altitude || 0) >= 9000) return "flight-cruise";
  return "flight-low";
}

function buildFlightCollection(flights: FlightPosition[], selectedFlightId?: string | null) {
  return featureCollection(
    flights.map((flight) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [flight.longitude, flight.latitude],
      },
      properties: {
        icao24: flight.icao24,
        callsign: flight.callsign || flight.matched_tail_number || flight.icao24.toUpperCase(),
        matchedTail: flight.matched_tail_number || "",
        origin_country: flight.origin_country,
        airline_company: flight.airline_company || "",
        flight_category: flight.flight_category,
        heading: Number.isFinite(flight.heading) ? flight.heading || 0 : 0,
        icon: flightIconName(flight, selectedFlightId),
        airborne: flight.on_ground ? 0 : 1,
      },
    }))
  );
}

function buildSelectedFlightCollection(selectedFlight: FlightPosition | null) {
  if (!selectedFlight) return EMPTY_COLLECTION;
  return featureCollection([
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [selectedFlight.longitude, selectedFlight.latitude],
      },
      properties: {
        callsign: selectedFlight.callsign || selectedFlight.matched_tail_number || selectedFlight.icao24.toUpperCase(),
      },
    },
  ]);
}

function buildOwnedFleetCollection(ownedFleet: OwnedFleetAircraft[]) {
  return featureCollection(
    ownedFleet.map((aircraft) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [aircraft.longitude, aircraft.latitude],
      },
      properties: {
        overlay_id: aircraft.overlay_id,
        aircraft_id: aircraft.aircraft_id,
        tail_number: aircraft.tail_number,
        station: aircraft.station,
        risk_score: aircraft.risk_score,
        icon: aircraft.risk_score >= 70 ? "owned-fleet-watch" : "owned-fleet",
      },
    }))
  );
}

function buildOwnedFleetMatchCollection(matches: OwnedFleetMatch[]) {
  return featureCollection(
    matches
      .filter((match) => match.latitude !== null && match.longitude !== null)
      .map((match) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [match.longitude as number, match.latitude as number],
        },
        properties: {
          tail_number: match.tail_number,
          match_status: match.match_status,
        },
      }))
  );
}

function buildWatchAircraftCollection(ownedFleet: OwnedFleetAircraft[]) {
  return featureCollection(
    ownedFleet
      .filter((item) => item.risk_score >= 70)
      .map((aircraft) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [aircraft.longitude, aircraft.latitude],
        },
        properties: {
          tail_number: aircraft.tail_number,
        },
      }))
  );
}

function buildMaintenanceBaseCollection(maintenanceBases: MaintenanceBase[]) {
  return featureCollection(
    maintenanceBases.map((base) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [base.longitude, base.latitude],
      },
      properties: {
        iata_code: base.iata_code,
      },
    }))
  );
}

function buildHotspotCollection(hotspots: DisruptionHotspot[]) {
  return featureCollection(
    hotspots.map((hotspot) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [hotspot.longitude, hotspot.latitude],
      },
      properties: {
        label: hotspot.label,
        severity: hotspot.severity,
      },
    }))
  );
}

function buildWeatherCollection(weatherLayers: WeatherOverlay[]) {
  return featureCollection(
    weatherLayers.map((overlay) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [overlay.longitude, overlay.latitude],
      },
      properties: {
        label: overlay.label,
        source_status: overlay.source_status,
      },
    }))
  );
}

function buildAirportCollection(airportOverlays: AirportOverlay[]) {
  return featureCollection(
    airportOverlays.map((airport) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [airport.longitude, airport.latitude],
      },
      properties: {
        iata_code: airport.iata_code,
        severity: airport.severity,
        congestion_score: airport.congestion_score,
      },
    }))
  );
}

function buildCorridorCollection(corridorSegments: CorridorSegment[]) {
  return featureCollection(
    corridorSegments.map((segment) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [segment.start_longitude, segment.start_latitude],
          [segment.end_longitude, segment.end_latitude],
        ],
      },
      properties: {
        intensity: segment.intensity,
        traffic_count: segment.traffic_count,
      },
    }))
  );
}

function setLayerVisibility(map: MapLibreMap, layerId: string, visible: boolean) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function initializeSources(map: MapLibreMap) {
  if (!map.getSource(SOURCE_IDS.flights)) {
    map.addSource(SOURCE_IDS.flights, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.selectedFlight)) {
    map.addSource(SOURCE_IDS.selectedFlight, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.ownedFleet)) {
    map.addSource(SOURCE_IDS.ownedFleet, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.ownedMatches)) {
    map.addSource(SOURCE_IDS.ownedMatches, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.watchAircraft)) {
    map.addSource(SOURCE_IDS.watchAircraft, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.maintenanceBases)) {
    map.addSource(SOURCE_IDS.maintenanceBases, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.hotspots)) {
    map.addSource(SOURCE_IDS.hotspots, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.weather)) {
    map.addSource(SOURCE_IDS.weather, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.corridors)) {
    map.addSource(SOURCE_IDS.corridors, { type: "geojson", data: EMPTY_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.airports)) {
    map.addSource(SOURCE_IDS.airports, { type: "geojson", data: EMPTY_COLLECTION });
  }
}

function initializeLayers(map: MapLibreMap) {
  if (!map.getLayer(LAYER_IDS.corridors)) {
    map.addLayer({
      id: LAYER_IDS.corridors,
      type: "line",
      source: SOURCE_IDS.corridors,
      paint: {
        "line-color": [
          "match",
          ["get", "intensity"],
          "high",
          "#F6C453",
          "medium",
          "#7ED7E0",
          "rgba(9,32,48,0.54)",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1, 3, 1.4, 5, 2.8, 7, 4.2],
        "line-opacity": ["match", ["get", "intensity"], "high", 0.72, "medium", 0.46, 0.24],
        "line-blur": 0.15,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.airportGlow)) {
    map.addLayer({
      id: LAYER_IDS.airportGlow,
      type: "circle",
      source: SOURCE_IDS.airports,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 10, 4, ["+", 10, ["/", ["get", "congestion_score"], 12]], 7, ["+", 16, ["/", ["get", "congestion_score"], 8]]],
        "circle-color": ["match", ["get", "severity"], "Critical", "rgba(248,113,113,0.16)", "High", "rgba(246,196,83,0.14)", "Medium", "rgba(126,215,224,0.16)", "rgba(124,135,152,0.12)"],
        "circle-stroke-width": 0,
      },
    });
    map.addLayer({
      id: LAYER_IDS.airportCore,
      type: "circle",
      source: SOURCE_IDS.airports,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3.1, 5, 4.8, 7, 5.6],
        "circle-color": ["match", ["get", "severity"], "Critical", "#F87171", "High", "#F6C453", "Medium", "#7ED7E0", "#7C8798"],
        "circle-stroke-color": "rgba(8,17,24,0.88)",
        "circle-stroke-width": 1.1,
      },
    });
    map.addLayer({
      id: LAYER_IDS.airportLabels,
      type: "symbol",
      source: SOURCE_IDS.airports,
      minzoom: 4,
      layout: {
        "text-field": ["get", "iata_code"],
        "text-font": ["IBM Plex Sans SemiBold"],
        "text-size": 10,
        "text-offset": [0, -1.35],
        "text-letter-spacing": 0.18,
        "text-transform": "uppercase",
      },
      paint: {
        "text-color": "rgba(9,17,24,0.86)",
        "text-halo-color": "rgba(255,255,255,0.82)",
        "text-halo-width": 1.4,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.weatherIcons)) {
    map.addLayer({
      id: LAYER_IDS.weatherIcons,
      type: "symbol",
      source: SOURCE_IDS.weather,
      layout: {
        "icon-image": "weather-cloud",
        "icon-size": 0.78,
        "icon-allow-overlap": false,
      },
    });
    map.addLayer({
      id: LAYER_IDS.weatherLabels,
      type: "symbol",
      source: SOURCE_IDS.weather,
      minzoom: 5.4,
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["IBM Plex Sans Medium"],
        "text-size": 10,
        "text-offset": [0, 1.45],
      },
      paint: {
        "text-color": "rgba(255,255,255,0.82)",
        "text-halo-color": "rgba(8,17,24,0.88)",
        "text-halo-width": 1,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.hotspotGlow)) {
    map.addLayer({
      id: LAYER_IDS.hotspotGlow,
      type: "circle",
      source: SOURCE_IDS.hotspots,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 9.5, 5, 15.5, 7, 19.5],
        "circle-color": ["match", ["get", "severity"], "Critical", "rgba(248,113,113,0.18)", "rgba(246,196,83,0.12)"],
        "circle-stroke-color": ["match", ["get", "severity"], "Critical", "#F87171", "#F6C453"],
        "circle-stroke-width": 1.3,
      },
    });
    map.addLayer({
      id: LAYER_IDS.hotspotCore,
      type: "circle",
      source: SOURCE_IDS.hotspots,
      paint: {
        "circle-radius": 4.2,
        "circle-color": ["match", ["get", "severity"], "Critical", "#F87171", "#F6C453"],
      },
    });
    map.addLayer({
      id: LAYER_IDS.hotspotLabels,
      type: "symbol",
      source: SOURCE_IDS.hotspots,
      minzoom: 5,
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["IBM Plex Sans SemiBold"],
        "text-size": 10,
        "text-offset": [0, -1.4],
      },
      paint: {
        "text-color": "rgba(255,255,255,0.84)",
        "text-halo-color": "rgba(8,17,24,0.88)",
        "text-halo-width": 1.1,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.maintenanceBases)) {
    map.addLayer({
      id: LAYER_IDS.maintenanceBases,
      type: "symbol",
      source: SOURCE_IDS.maintenanceBases,
      layout: {
        "icon-image": "maintenance-base",
        "icon-size": 0.8,
        "icon-allow-overlap": true,
      },
    });
    map.addLayer({
      id: LAYER_IDS.maintenanceBaseLabels,
      type: "symbol",
      source: SOURCE_IDS.maintenanceBases,
      minzoom: 4.8,
      layout: {
        "text-field": ["get", "iata_code"],
        "text-font": ["IBM Plex Sans SemiBold"],
        "text-size": 10,
        "text-offset": [0, 1.3],
      },
      paint: {
        "text-color": "rgba(8,17,24,0.82)",
        "text-halo-color": "rgba(255,255,255,0.82)",
        "text-halo-width": 1.3,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.ownedMatchRings)) {
    map.addLayer({
      id: LAYER_IDS.ownedMatchRings,
      type: "circle",
      source: SOURCE_IDS.ownedMatches,
      paint: {
        "circle-radius": ["match", ["get", "match_status"], "watch", 9.6, "matched", 7.4, 5.8],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": ["match", ["get", "match_status"], "watch", "#F6C453", "matched", "#7ED7E0", "#7C8798"],
        "circle-stroke-width": ["match", ["get", "match_status"], "watch", 1.2, 0.95],
        "circle-stroke-opacity": 0.74,
      },
    });
    map.addLayer({
      id: LAYER_IDS.ownedMatchLabels,
      type: "symbol",
      source: SOURCE_IDS.ownedMatches,
      minzoom: 6.1,
      layout: {
        "text-field": ["get", "tail_number"],
        "text-font": ["IBM Plex Sans SemiBold"],
        "text-size": 10,
        "text-offset": [0, 1.45],
      },
      paint: {
        "text-color": "rgba(9,53,68,0.92)",
        "text-halo-color": "rgba(244,250,250,0.9)",
        "text-halo-width": 1.4,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.watchAircraft)) {
    map.addLayer({
      id: LAYER_IDS.watchAircraft,
      type: "circle",
      source: SOURCE_IDS.watchAircraft,
      paint: {
        "circle-radius": 11.7,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "rgba(246,196,83,0.78)",
        "circle-stroke-width": 1,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.ownedFleet)) {
    map.addLayer({
      id: LAYER_IDS.ownedFleet,
      type: "symbol",
      source: SOURCE_IDS.ownedFleet,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": 0.69,
        "icon-allow-overlap": true,
      },
    });
    map.addLayer({
      id: LAYER_IDS.ownedFleetLabels,
      type: "symbol",
      source: SOURCE_IDS.ownedFleet,
      minzoom: 6.2,
      layout: {
        "text-field": ["get", "tail_number"],
        "text-font": ["IBM Plex Sans SemiBold"],
        "text-size": 9.5,
        "text-offset": [0, 1.35],
      },
      paint: {
        "text-color": "rgba(9,53,68,0.94)",
        "text-halo-color": "rgba(244,250,250,0.92)",
        "text-halo-width": 1.3,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.selectedFlightHalo)) {
    map.addLayer({
      id: LAYER_IDS.selectedFlightHalo,
      type: "circle",
      source: SOURCE_IDS.selectedFlight,
      paint: {
        "circle-radius": 17.5,
        "circle-color": "rgba(126,215,224,0.14)",
        "circle-stroke-color": "#7ED7E0",
        "circle-stroke-width": 1.5,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.flightSymbols)) {
    map.addLayer({
      id: LAYER_IDS.flightSymbols,
      type: "symbol",
      source: SOURCE_IDS.flights,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-rotate": ["get", "heading"],
        "icon-rotation-alignment": "map",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.48, 4, 0.65, 6, 0.77],
        "icon-allow-overlap": true,
      },
    });
    map.addLayer({
      id: LAYER_IDS.selectedFlightLabel,
      type: "symbol",
      source: SOURCE_IDS.selectedFlight,
      layout: {
        "text-field": ["get", "callsign"],
        "text-font": ["IBM Plex Sans SemiBold"],
        "text-size": 11,
        "text-offset": [0, -2.05],
      },
      paint: {
        "text-color": "rgba(12,19,24,0.95)",
        "text-halo-color": "rgba(255,255,255,0.94)",
        "text-halo-width": 1.55,
      },
    });
    map.addLayer({
      id: LAYER_IDS.flightLabels,
      type: "symbol",
      source: SOURCE_IDS.flights,
      minzoom: 6.7,
      layout: {
        "text-field": ["get", "callsign"],
        "text-font": ["IBM Plex Sans SemiBold"],
        "text-size": 10,
        "text-offset": [0, -1.75],
        "text-max-width": 10,
      },
      paint: {
        "text-color": "rgba(10,17,24,0.82)",
        "text-halo-color": "rgba(255,255,255,0.88)",
        "text-halo-width": 1.2,
      },
    });
  }
}

function applyLayerVisibility(map: MapLibreMap, activeLayerIds: string[]) {
  Object.entries(ACTIVE_LAYER_MAP).forEach(([key, layerIds]) => {
    const visible = activeLayerIds.includes(key);
    layerIds.forEach((layerId) => setLayerVisibility(map, layerId, visible));
  });
}

export interface FlightRadarMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

interface FlightRadarMapProps {
  flights: FlightPosition[];
  selectedFlightId?: string | null;
  region: string;
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
}

export const FlightRadarMap = forwardRef<FlightRadarMapHandle, FlightRadarMapProps>(function FlightRadarMap(
  {
    flights,
    selectedFlightId,
    region,
    onSelect,
    className,
    activeLayerIds = [],
    ownedFleet = [],
    maintenanceBases = [],
    hotspots = [],
    weatherLayers = [],
    corridorSegments = [],
    airportOverlays = [],
    ownedFleetMatches = [],
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const flightLookupRef = useRef(new Map<string, FlightPosition>());
  const lastSelectedRef = useRef<string | null>(null);
  const mapReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const selectedFlight = useMemo(() => flights.find((item) => item.icao24 === selectedFlightId) || null, [flights, selectedFlightId]);

  onSelectRef.current = onSelect;
  flightLookupRef.current = new Map(flights.map((flight) => [flight.icao24, flight]));

  useImperativeHandle(
    ref,
    () => ({
      zoomIn() {
        mapRef.current?.zoomIn({ duration: 240 });
      },
      zoomOut() {
        mapRef.current?.zoomOut({ duration: 240 });
      },
      resetView() {
        const viewport = getViewport(region);
        mapRef.current?.flyTo({ center: viewport.center, zoom: viewport.zoom, duration: 700 });
      },
    }),
    [region]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const viewport = getViewport(region);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle(),
      center: viewport.center,
      zoom: viewport.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
      renderWorldCopies: true,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    const handleFlightClick = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const flightId = feature?.properties?.icao24;
      if (!flightId) return;
      const flight = flightLookupRef.current.get(String(flightId));
      if (flight) {
        onSelectRef.current?.(flight);
      }
    };

    const handleLoad = async () => {
      try {
        await Promise.all([
          ensureMapImage(map, "flight-selected", FLIGHT_PLANE_IMAGES.selected),
          ensureMapImage(map, "flight-cruise", FLIGHT_PLANE_IMAGES.cruise),
          ensureMapImage(map, "flight-low", FLIGHT_PLANE_IMAGES.low),
          ensureMapImage(map, "flight-ground", FLIGHT_PLANE_IMAGES.ground),
          ensureMapImage(map, "weather-cloud", ICON_IMAGES.weather),
          ensureMapImage(map, "maintenance-base", ICON_IMAGES.maintenanceBase),
          ensureMapImage(map, "owned-fleet", ICON_IMAGES.ownedFleet),
          ensureMapImage(map, "owned-fleet-watch", ICON_IMAGES.ownedFleetWatch),
        ]);
        initializeSources(map);
        initializeLayers(map);
        map.on("click", LAYER_IDS.flightSymbols, handleFlightClick);
        map.on("mouseenter", LAYER_IDS.flightSymbols, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", LAYER_IDS.flightSymbols, () => {
          map.getCanvas().style.cursor = "";
        });
        mapReadyRef.current = true;
        setMapReady(true);
        setMapError(null);
      } catch {
        setMapError("Unable to initialize the 2D flight map assets.");
      }
    };

    const loadTimeout = window.setTimeout(() => {
      if (!mapReadyRef.current) {
        setMapError("The 2D radar map did not finish loading. Refresh the page or check the basemap configuration.");
      }
    }, 6000);

    map.on("load", handleLoad);

    return () => {
      window.clearTimeout(loadTimeout);
      if (map.getLayer(LAYER_IDS.flightSymbols)) {
        map.off("click", LAYER_IDS.flightSymbols, handleFlightClick);
      }
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, [region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const viewport = getViewport(region);
    map.flyTo({ center: viewport.center, zoom: viewport.zoom, duration: 700 });
  }, [mapReady, region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    setSourceData(map, SOURCE_IDS.flights, buildFlightCollection(flights, selectedFlightId));
    setSourceData(map, SOURCE_IDS.selectedFlight, buildSelectedFlightCollection(selectedFlight));
    setSourceData(map, SOURCE_IDS.ownedFleet, buildOwnedFleetCollection(ownedFleet));
    setSourceData(map, SOURCE_IDS.ownedMatches, buildOwnedFleetMatchCollection(ownedFleetMatches));
    setSourceData(map, SOURCE_IDS.watchAircraft, buildWatchAircraftCollection(ownedFleet));
    setSourceData(map, SOURCE_IDS.maintenanceBases, buildMaintenanceBaseCollection(maintenanceBases));
    setSourceData(map, SOURCE_IDS.hotspots, buildHotspotCollection(hotspots));
    setSourceData(map, SOURCE_IDS.weather, buildWeatherCollection(weatherLayers));
    setSourceData(map, SOURCE_IDS.airports, buildAirportCollection(airportOverlays));
    setSourceData(map, SOURCE_IDS.corridors, buildCorridorCollection(corridorSegments));
    applyLayerVisibility(map, activeLayerIds);
  }, [activeLayerIds, airportOverlays, corridorSegments, flights, hotspots, maintenanceBases, mapReady, ownedFleet, ownedFleetMatches, selectedFlight, selectedFlightId, weatherLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedFlight) {
      lastSelectedRef.current = selectedFlightId || null;
      return;
    }
    if (lastSelectedRef.current !== selectedFlight.icao24) {
      map.easeTo({
        center: [selectedFlight.longitude, selectedFlight.latitude],
        zoom: Math.max(map.getZoom(), 4.7),
        duration: 650,
      });
    }
    lastSelectedRef.current = selectedFlight.icao24;
  }, [mapReady, selectedFlight, selectedFlightId]);

  return (
    <div className={cn("relative h-full min-h-[520px] overflow-hidden rounded-[32px] border border-white/10 bg-[#DDE8EF]", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!mapReady && !mapError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(222,234,241,0.72),rgba(208,223,233,0.58))] text-sm font-medium text-[#153246]">
          Loading 2D radar map
        </div>
      ) : null}
      {mapError ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(222,234,241,0.78),rgba(208,223,233,0.68))] px-6 text-center text-sm font-medium text-[#153246]">
          {mapError}
        </div>
      ) : null}
    </div>
  );
});
