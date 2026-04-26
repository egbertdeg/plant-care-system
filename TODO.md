# Plant Care System — TODO

## Plant Chat

- [ ] **Vision: Claude reads photos taken in chat**
  Send photos captured during a chat turn to Claude as base64 multimodal messages (Haiku 4.5 supports vision). Currently photos upload to R2 but Claude only gets the text "I just took a photo."

- [ ] **Vision: Claude references historical plant photos**
  Add `GET /photos/:r2Key` endpoint to serve photos from R2. Inject recent photo metadata (date, caption, r2_key) into the chat system prompt so Claude can reference specific past photos. Render r2_key references as inline thumbnails in the chat bubble.

## Log Activity

- [ ] **Spray / neem oil activity**
  Add a Spray toggle to the Log Activity screen (alongside Liquid Feed, Rose-Tone, Pruning). Currently goes in the Notes field.

## Garden Knowledge

- [ ] **Garden notes viewer / editor**
  A settings page to browse, edit, and delete `garden_notes` entries. Currently write-only from chat summarize or the seed scripts.

## Plants

- [ ] **O2 replacement**
  O2 (Lemon Burst) is dead. Top candidates: Campfire (Canadian Artist Series, Zone 5) + AC Navy Lady (Zone 3, J&P Cold Hardy Collection). See garden note seeded 2026-04-26.

- [ ] **O6 variety confirmation**
  Unknown Yellow-White rose — confirm this season. Yellow Knock Out if blooms 1.5–2" with yellow stamens, repeat all summer. Golden Wings if 3–4" single blooms with amber stamens.
