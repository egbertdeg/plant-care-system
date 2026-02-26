# Plant Care — Mobile App

Flutter app for managing plants, viewing sensor data, and tracking watering history.

## Status

⏳ **In development** — project structure ready, implementation starting.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Flutter | iOS + Android from one codebase |
| State management | Riverpod | Typed, testable, no boilerplate |
| HTTP client | `http` package | Lightweight, sufficient for REST |
| Image picker | `image_picker` | Camera + photo library access |
| Notifications | `flutter_local_notifications` | Overdue watering reminders |
| Image caching | `cached_network_image` | Smooth photo loading |

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
mobile/
├── README.md
├── pubspec.yaml                   # dependencies
├── assets/
│   └── images/                    # app icons, placeholder plant image
├── lib/
│   ├── main.dart                  # entry point, ProviderScope
│   ├── app.dart                   # MaterialApp, theme, routing
│   ├── theme/
│   │   └── app_theme.dart         # colours, text styles, card styles
│   ├── models/
│   │   ├── plant.dart             # Plant, fromJson/toJson
│   │   ├── watering_event.dart    # WateringEvent, fromJson
│   │   ├── sensor_reading.dart    # SensorReading, fromJson
│   │   └── plant_photo.dart       # PlantPhotoMeta (no image bytes)
│   ├── services/
│   │   └── api_service.dart       # all HTTP calls to Railway backend
│   ├── providers/
│   │   ├── plants_provider.dart   # AsyncNotifier — plant list + detail
│   │   └── sensors_provider.dart  # AsyncNotifier — latest sensor reading
│   ├── screens/
│   │   ├── plants/
│   │   │   ├── plant_list_screen.dart
│   │   │   ├── plant_detail_screen.dart
│   │   │   └── edit_plant_screen.dart
│   │   └── sensors/
│   │       └── sensors_screen.dart
│   └── widgets/
│       ├── plant_card.dart        # card used in list
│       ├── watering_status.dart   # "last watered X days ago" + button
│       ├── soil_bar.dart          # progress bar for soil moisture
│       └── photo_gallery.dart     # horizontal scroll + upload button
└── test/
    └── widget_test.dart
```

## Implementation Roadmap

### Phase 1 — Backend additions (prerequisite)
- [ ] Add `soil_sensor` (1/2/3 or null) field to `Plant` model
- [ ] Add `source` field to `WateringEvent` (`"device"` or `"manual"`)
- [ ] Add `POST /plants/{id}/waterings` endpoint (manual watering log)

### Phase 2 — Flutter project init + skeleton
- [ ] Run `flutter create plant_care --org com.egbert` in `mobile/`
- [ ] Add dependencies to `pubspec.yaml`
- [ ] Wire up `main.dart` → `app.dart` with ProviderScope + tab navigation
- [ ] Implement `ApiService` (all endpoints)
- [ ] Define all model classes with `fromJson`

### Phase 3 — Plants tab
- [ ] `PlantsProvider` — fetch + cache plant list
- [ ] `PlantListScreen` — cards with needs_water indicator, pull-to-refresh
- [ ] `PlantDetailScreen` — conditions row, schedule card, history list
- [ ] `EditPlantScreen` — full profile form, PUT on save
- [ ] Log watering bottom sheet → POST /plants/{id}/waterings

### Phase 4 — Photos
- [ ] `PhotoGallery` widget — horizontal scroll in plant detail
- [ ] Upload from camera / photo library via `image_picker`
- [ ] Full-screen viewer on tap, delete swipe

### Phase 5 — Sensors tab
- [ ] `SensorsProvider` — poll /readings/latest every 60 s
- [ ] `SensorsScreen` — room card + soil channel list with plant name lookup

### Phase 6 — Polish
- [ ] App theme (colours, typography)
- [ ] Empty states and loading skeletons
- [ ] Error handling + retry
- [ ] Local notifications for overdue plants

## Setup

```bash
cd mobile
flutter create plant_care --org com.egbert --platforms ios,android
# then move generated files up or work inside plant_care/
flutter pub get
flutter run
```

## API

Backend: `https://plant-api-production-7c02.up.railway.app`

See [backend/README.md](../backend/README.md) for full endpoint reference.
The `ApiService` class wraps all calls; the base URL is a single constant.
