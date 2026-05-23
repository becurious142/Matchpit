"use client";

import { useState, useRef, useCallback } from "react";
import Map, { Marker, NavigationControl, ViewStateChangeEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useQueryState, parseAsFloat } from "nuqs";
import { Venue } from "@workspace/contracts";

interface MapViewProps {
  venues: Venue[];
  onBoundsChange?: (bounds: string) => void;
}

export function MapView({ venues, onBoundsChange }: MapViewProps) {
  const [lat, setLat] = useQueryState("lat", parseAsFloat.withDefault(26.9124));
  const [lng, setLng] = useQueryState("lng", parseAsFloat.withDefault(75.7873));
  const [zoom, setZoom] = useQueryState("zoom", parseAsFloat.withDefault(12));

  const mapRef = useRef<any>(null);

  const handleMoveEnd = useCallback((e: ViewStateChangeEvent) => {
    setLat(Number(e.viewState.latitude.toFixed(4)));
    setLng(Number(e.viewState.longitude.toFixed(4)));
    setZoom(Number(e.viewState.zoom.toFixed(2)));

    if (mapRef.current) {
      const bounds = mapRef.current.getBounds();
      if (bounds && onBoundsChange) {
        onBoundsChange(
          `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`
        );
      }
    }
  }, [setLat, setLng, setZoom, onBoundsChange]);

  return (
    <div className="h-full w-full relative touch-none">
      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={{
          latitude: lat,
          longitude: lng,
          zoom: zoom,
        }}
        onMoveEnd={handleMoveEnd}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        reuseMaps
      >
        <NavigationControl position="top-right" />
        
        {/* Simple Marker implementation - we'll add clustering later */}
        {venues.map((venue) => (
          <Marker
            key={venue.id}
            latitude={venue.coordinates[0]}
            longitude={venue.coordinates[1]}
          >
            <div className="bg-primary text-primary-foreground px-2 py-1 rounded-md text-xs font-bold shadow-md cursor-pointer hover:scale-110 transition-transform">
              {venue.name}
            </div>
          </Marker>
        ))}
      </Map>
    </div>
  );
}
