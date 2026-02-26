# Plant Care — Mobile App

Flutter app for managing plants, viewing sensor data, and tracking watering history.

## Status

✅ **v1 live** — Plants tab, Sensors tab, photo gallery all functional. Running on web (Chrome) and ready for iOS/Android build.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Flutter | iOS + Android from one codebase |
| State management | Riverpod | Typed, testable, no boilerplate |
| HTTP client | `http` package | Lightweight, sufficient for REST |
| Image picker | `image_picker` | Camera + photo library access |
| Notifications | `flutter_local_notifications` | Overdue watering reminders (planned) |

## Screens

### Plants tab

```
┌─────────────────────────────┐
│  My Plants              [+] │  ← FAB to add plant (slot 1-20)
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 🌿 Monstera        🔴   │ │  ← needs water
│ │ Monstera deliciosa      │ │
│ │ Last watered 8 days ago │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 🌱 Pothos          🟢   │ │  ← ok
│ │ Epipremnum aureum       │ │
│ │ Last watered 2 days ago │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

```
┌─────────────────────────────┐
│ ← Monstera           [Edit] │
├─────────────────────────────┤
│  [    photo    ]  [  + 2  ] │  ← hero photo, tap for gallery
├─────────────────────────────┤
│  💧 62%  🌡 21°C  💧 55%  ☀ 3k lux  │  ← live from sensor pod
├─────────────────────────────┤
│  Last watered  8 days ago   │
│  Schedule      every 7 days │
│  Next due      OVERDUE      │
│  Target vol    250 ml       │
│      [ Log watering ]       │
├─────────────────────────────┤
│  History                    │
│  Feb 17  250 ml  (device)   │
│  Feb 10  —       (manual)   │
├─────────────────────────────┤
│  Monstera deliciosa         │
│  Living room · 45 cm · 5 L │
├─────────────────────────────┤
│  Notes                  [✎] │
│  Had aphids in Jan.         │
│  Treated with neem oil.     │
└─────────────────────────────┘
```

```
┌─────────────────────────────┐
│ ← Edit Plant                │
├─────────────────────────────┤
│  Name          [Monstera  ] │
│  Species       [Monstera d] │
│  Location      [Living rm ] │
│  Size (cm)     [45        ] │
│  Pot size (L)  [5.0       ] │
│  Soil sensor   [Channel 2▾] │  ← none / 1 / 2 / 3
│  ─────────────────────────  │
│  Interval (days) [7       ] │
│  Target vol (ml) [250     ] │
│  ─────────────────────────  │
│  Notes                      │
│  [Had aphids in Jan...    ] │
│  ─────────────────────────  │
│         [ Save ]            │
└─────────────────────────────┘
```

### Sensors tab

```
┌─────────────────────────────┐
│  Room — sensor_pod_001      │
│  Updated 2 min ago          │
├─────────────────────────────┤
│  🌡 21.3°C    💧 54% RH     │
│  ☀ 3,240 lux  PAR 60 µmol  │
├─────────────────────────────┤
│  Soil moisture              │
│  ─────────────────────────  │
│  Ch 1 · Monstera            │
│  ████████████░░░░  72%      │
│  ─────────────────────────  │
│  Ch 2 · Pothos              │
│  ██████░░░░░░░░░░  41%      │
│  ─────────────────────────  │
│  Ch 3 · (unassigned)        │
│  ████████████████  89%      │
└─────────────────────────────┘
```

## Folder Structure

```
mobile/plant_care/
├── pubspec.yaml                   # dependencies
├── lib/
│   ├── main.dart                  # entry point, ProviderScope
│   ├── app.dart                   # MaterialApp, theme, tab navigation
│   ├── theme/
│   │   └── app_theme.dart         # Material 3, green seed colour
│   ├── models/
│   │   ├── plant.dart             # Plant.fromJson, displayName
│   │   ├── watering_event.dart    # WateringEvent.fromJson, effectiveTime
│   │   ├── sensor_reading.dart    # SensorReading.fromJson, soilPercent()
│   │   └── plant_photo.dart       # PlantPhotoMeta (no image bytes in client)
│   ├── services/
│   │   └── api_service.dart       # all HTTP calls to Railway backend
│   ├── providers/
│   │   ├── plants_provider.dart   # AsyncNotifier — plant list + detail + waterings
│   │   └── sensors_provider.dart  # AsyncNotifier — 60 s auto-poll
│   ├── screens/
│   │   ├── plants/
│   │   │   ├── plant_list_screen.dart   # pull-to-refresh, FAB to add plant
│   │   │   ├── plant_detail_screen.dart # conditions, schedule, history, photos
│   │   │   └── edit_plant_screen.dart   # full profile form, PUT on save
│   │   └── sensors/
│   │       └── sensors_screen.dart      # room card + soil bars
│   └── widgets/
│       ├── plant_card.dart        # red/green water indicator
│       ├── soil_bar.dart          # colour-coded moisture bar
│       └── photo_gallery.dart     # horizontal scroll, upload, delete
└── test/
    └── widget_test.dart
```

## Implementation Roadmap

### Phase 1 — Backend additions ✅
- [x] Add `soil_sensor` (1/2/3 or null) field to `Plant` model
- [x] Add `source` field to `WateringEvent` (`"device"` or `"manual"`)
- [x] Add `POST /plants/{id}/waterings` endpoint (manual watering log)
- [x] CORS middleware (required for Flutter web)

### Phase 2 — Flutter project init + skeleton ✅
- [x] `flutter create plant_care` in `mobile/`
- [x] Dependencies: flutter_riverpod, http, image_picker, intl
- [x] `main.dart` → `app.dart` with ProviderScope + tab navigation
- [x] `ApiService` (all endpoints)
- [x] Model classes with `fromJson`

### Phase 3 — Plants tab ✅
- [x] `PlantsProvider` — fetch + cache plant list
- [x] `PlantListScreen` — cards with needs_water indicator, pull-to-refresh
- [x] `PlantDetailScreen` — conditions row, schedule card, history list
- [x] `EditPlantScreen` — full profile form, PUT on save
- [x] Log watering bottom sheet → POST /plants/{id}/waterings

### Phase 4 — Photos ✅
- [x] `PhotoGallery` widget — horizontal scroll in plant detail
- [x] Upload from camera / photo library via `image_picker`
- [ ] Full-screen viewer on tap

### Phase 5 — Sensors tab ✅
- [x] `SensorsProvider` — poll /readings/latest every 60 s
- [x] `SensorsScreen` — room card + soil channel list with plant name lookup

### Phase 6 — Polish (next)
- [ ] Local notifications for overdue plants
- [ ] Full-screen photo viewer
- [ ] iOS TestFlight build

## Setup

```bash
cd mobile/plant_care
flutter pub get
flutter run -d chrome          # web (works on Windows)
flutter run                    # iOS/Android (requires Xcode / Android SDK)
```

## API

Backend: `https://plant-api-production-7c02.up.railway.app`

See [backend/README.md](../backend/README.md) for full endpoint reference.
The `ApiService` class wraps all calls; the base URL is a single constant.
