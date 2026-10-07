# Builds StreetMate's bundled stop/route data from the GTFS-style export
# (all_stops.csv, all_routes.csv, routes_with_ordered_stops.csv, routes.geojson)
# in place of the old OSM-snapping pipeline (match_routes.py).
#
# Why switch: this export already carries, per direction of travel, an
# explicit ordered stop sequence AND a GTFS trip_headsign — the name a mate
# actually calls out for that direction (e.g. "Achimota", not the more
# specific final node name "Achimota New Station"). That's exactly the
# "which trotro do I take" signal the app needs, with no direction-guessing
# required, which the old OSM pipeline had to approximate.
#
# Run from this folder:  python3 build_gtfs_data.py
# Outputs land directly in assets/data (consumed by data/stops.ts and
# data/routes.ts):
#   bus_stops.json  — every named stop: {id, name, lat, lng}
#   bus_trips.json  — one entry per (route, direction): headsign and ordered
#                      stops.
#
# routes.geojson (also in this folder) has real per-direction LineString
# road geometry and isn't used here — nothing in the app currently reads a
# trotro route's own road-line path (the map only draws Google's
# driving-direction polyline). If that changes, match it in here the same
# way stops/trips are matched: key by (route_id, direction) and add a
# "path" field to each trip dict below before writing OUT_TRIPS.

import csv
import json
import os
from collections import defaultdict

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "data")

STOPS_CSV = "all_stops.csv"
ORDERED_STOPS_CSV = "routes_with_ordered_stops.csv"

OUT_STOPS = os.path.join(OUT_DIR, "bus_stops.json")
OUT_TRIPS = os.path.join(OUT_DIR, "bus_trips.json")


def read_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


# --- Stops -------------------------------------------------------------
stop_rows = read_csv(STOPS_CSV)
stops = []
seen_ids = set()
for r in stop_rows:
    name = (r.get("stop_name") or "").strip()
    if not name:
        continue
    sid = r["stop_id"]
    if sid in seen_ids:
        continue
    seen_ids.add(sid)
    stops.append({
        "id": sid,
        "name": name,
        "lat": float(r["stop_lat"]),
        "lng": float(r["stop_lon"]),
    })

with open(OUT_STOPS, "w") as f:
    json.dump(stops, f)

print(f"Wrote {OUT_STOPS}: {len(stops)} stops (from {len(stop_rows)} rows)")

# --- Trips (one per route+direction) ------------------------------------
ordered_rows = read_csv(ORDERED_STOPS_CSV)
groups = defaultdict(list)
for r in ordered_rows:
    key = (r["route_id"], r["direction_id"])
    groups[key].append(r)

trips = []
skipped_too_short = 0
for (route_id, direction_id), rows in groups.items():
    rows_sorted = sorted(rows, key=lambda r: int(r["stop_sequence"]))
    stop_list = [{"id": r["stop_id"], "name": r["stop_name"].strip()} for r in rows_sorted]
    if len(stop_list) < 2:
        skipped_too_short += 1
        continue

    first = rows_sorted[0]
    headsign = first["trip_headsign"].strip()
    long_name = first["route_long_name"]
    parts = [p.strip() for p in long_name.split("↔")] if long_name else []
    from_name = parts[0] if len(parts) == 2 else None
    to_name = parts[1] if len(parts) == 2 else None

    trips.append({
        "id": f"{route_id}_{direction_id}",
        "routeId": route_id,
        "ref": first["route_short_name"],
        "name": long_name,
        "headsign": headsign,
        "from": from_name,
        "to": to_name,
        "stops": stop_list,
    })

with open(OUT_TRIPS, "w") as f:
    json.dump(trips, f)

print(f"Wrote {OUT_TRIPS}: {len(trips)} trips ({skipped_too_short} skipped for <2 stops)")
