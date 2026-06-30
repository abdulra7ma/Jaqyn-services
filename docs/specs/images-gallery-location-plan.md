---
title: "Spec: Product images, business gallery, and KG location picker"
service: shared
type: spec
status: active
last_reviewed: 2026-06-30
---
# Spec: Product images, business gallery, and KG location picker

Status: approved (decisions locked 2026-06-25). All images compressed server-side via
`core.images.compress_image`. Editable in onboarding AND business profile. Shown on the
customer-facing business page.

## Locked decisions
- **Map provider:** Google-ready with a **keyless OSM/Leaflet fallback**. Use Google
  Maps JS + Places Autocomplete (country-restricted to `kg`) when
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set; otherwise a Leaflet + OpenStreetMap map with
  Nominatim search (`countrycodes=kg`). Either way, **coordinates update immediately** on
  search-select, marker drag, or map click.
- **Location search surface:** business **onboarding + profile** location step only (NOT
  the customer discovery page). It replaces the current fake CSS-grid map.
- **Images:** (1) one image per **catalog item** (product/service/menu item); (2) a
  multi-photo **business gallery** (cap 8). Logo + cover already shipped — unchanged.

---

## Contracts (every agent must match these exactly)

### Endpoints
- `POST /api/business/catalog-items/{id}/image/` — multipart, field `image`. Returns the
  updated CatalogItem (with `image_url`). Throttle scope `business_image`.
- `GET  /api/business/gallery/` → `{ results: GalleryImage[] }`
- `POST /api/business/gallery/` — multipart, field `image`. Returns the created
  GalleryImage. `409 GALLERY_LIMIT_REACHED` when the business already has 8.
  Throttle scope `business_image`.
- `DELETE /api/business/gallery/{id}/` → success envelope.
- Public detail `GET /api/businesses/{id}/` GAINS: every catalog item carries `image_url`,
  and the business carries `gallery: GalleryImage[]`.

### Types (frontend `packages/api/src/business/types.ts`)
- `CatalogItem` gains `image_url: string | null`.
- New `GalleryImage = { id: string; image_url: string; caption: string; sort_order: number }`.
- Public business detail type gains `gallery: GalleryImage[]`; its catalog-section items
  gain `image_url`.

### Hooks (frontend `packages/api/src/business/hooks.ts`)
- `useUploadCatalogItemImage()` → `mutationFn({ id, file })`; invalidate `bqk.catalog` + `bqk.onboarding`.
- `useGallery(enabled?)` → query `bqk.gallery`.
- `useUploadGalleryImage()` → `mutationFn(file)`; invalidate `bqk.gallery` + `bqk.onboarding` + `bqk.me`.
- `useDeleteGalleryImage()` → `mutationFn(id)`; invalidate `bqk.gallery`.
- Add `gallery: ["business","gallery"]` to the `bqk` key factory.

### LocationPicker component (frontend `app/_components/LocationPicker.tsx`, NEW)
```ts
<LocationPicker
  lat={number | string | null}
  lng={number | string | null}
  onChange={(lat: number, lng: number, address?: string) => void}
/>
```
- `'use client'`. KG-restricted. Default center Bishkek (42.8746, 74.5698).
- Google branch (key present): inject the Maps JS script (mirror `MiniMap.tsx`'s loader
  ~line 732), a Places Autocomplete `<input>` with `componentRestrictions: { country: 'kg' }`,
  a map with a **draggable marker**. On autocomplete-select / marker dragend / map click →
  `onChange(lat, lng, formatted_address)` immediately.
- OSM fallback (no key): inject Leaflet from CDN (`unpkg` js+css), OSM tile layer, a search
  `<input>` that fetches
  `https://nominatim.openstreetmap.org/search?format=json&countrycodes=kg&limit=5&q=…`,
  a draggable marker; same `onChange` on select/drag/click.
- Clean up the map instance + any injected listeners on unmount (no leaked handlers).
- Handle: no key, script load failure, geolocation denied — degrade to the map + manual
  lat/lng without crashing.

### Compression (`backend/core/images.py`)
- Add `PRODUCT_MAX_DIM = 800` (catalog cards) and `GALLERY_MAX_DIM = 1600` (full-width).
- `GALLERY_LIMIT = 8` lives as a constant in the gallery service (business rule, commented).

---

## Backend (Agent BE — owns all `backend/` files)
1. **models.py:** `CatalogItem.image = ImageField(upload_to="business/catalog/", blank=True, null=True)`.
   New `BusinessImage(TimeStampedModel)`: `business FK related_name="gallery_images"`,
   `image ImageField(upload_to="business/gallery/")`, `caption CharField(blank)`,
   `sort_order IntegerField(default=0)`; `Meta.ordering = ("sort_order","created_at")`.
2. **Migrations:** two SEPARATE schema migrations (add catalog image; create BusinessImage).
   Additive/nullable — non-locking. No data migration.
3. **core/images.py:** add the two `*_MAX_DIM` constants (commented with why, like the others).
4. **services.py:**
   - `set_catalog_item_image(item, image) -> CatalogItem` — compress at `PRODUCT_MAX_DIM`, save, return item.
   - `add_gallery_image(business, image) -> BusinessImage` — enforce `GALLERY_LIMIT` (raise
     `JaqynAPIException("GALLERY_LIMIT_REACHED", status=409)` when full), compress at
     `GALLERY_MAX_DIM`, create with next `sort_order`.
   - `remove_gallery_image(business, image_id) -> None`.
   Docstrings state the rules; back the cap with a test.
5. **serializers.py:** `CatalogItemSerializer` gains read-only `image_url` (SerializerMethodField).
   New `BusinessImageSerializer` (`id, image_url, caption, sort_order`). A `GalleryUploadSerializer`
   with a single `image = ImageField()` (shape validation).
6. **views/urls:** `CatalogItemImageUploadView` (`POST …/catalog-items/<id>/image/`),
   `GalleryListCreateView` (`GET/POST …/gallery/`), `GalleryDetailView` (`DELETE …/gallery/<id>/`).
   All `IsBusinessOwner` + `ScopedRateThrottle` scope `business_image`. Wire in `urls.py`.
7. **Public detail:** wherever `catalog_sections` is built for `PublicBusinessDetailView`,
   add `image_url` per item and a top-level `gallery` array. Verify the customer page gets them.
8. **Tests:** catalog image upload (200 + image_url set + compressed); gallery add → list,
   cap at 8 → 409, delete; public payload includes item image_url + gallery. Run
   `docker compose exec -T web python -m pytest apps/businesses/ -q` (stack is up).

## Frontend data layer (Agent API — owns `packages/api/src/business/{api.ts,hooks.ts,types.ts}`)
Implement the api methods, hooks, types, and `bqk.gallery` exactly as the Contracts section
specifies. Reuse the existing `uploadBusinessImage` multipart helper pattern in api.ts for
the new multipart calls. Run `pnpm --filter web exec tsc --noEmit` from `frontend/`.

## Location picker (Agent LP — owns NEW `app/_components/LocationPicker.tsx` + `.env.example` note)
Build the component per the Contracts section. Read `MiniMap.tsx` for the Google script-loader
pattern. Keep it self-contained and SSR-safe. Add a one-line note to
`frontend/apps/web/.env.example` that an unset key falls back to OSM. Run web `tsc`.

---

## Wave 2 (consumers — run after Wave 1 verified)

## Onboarding (Agent OB — owns `app/business/onboarding/OnboardingFlow.tsx`)
- **Location:** in `StageIdentity`'s Location card, replace the fake CSS-grid map with
  `<LocationPicker lat={f.lat} lng={f.lng} onChange={(lat,lng,address)=>set({lat:String(lat),lng:String(lng), ...(address?{address}:{})})} />`.
  Keep the lat/lng inputs (now reflect the picker; still editable). Autosave already fires on `set`.
- **Catalog images:** each item row in `StageSetup` gets an image thumb + an upload control
  (`useUploadCatalogItemImage`, real `<input type=file accept=image/*>`); preview from
  `item.image_url`. (Create the item first via the existing add form, then attach its image.)
- **Gallery:** add a Gallery card in `StageSetup` — `useGallery` + `useUploadGalleryImage`
  (multiple file input, upload each) + `useDeleteGalleryImage`; preview grid; show "8 max"
  and disable upload at the cap; surface upload errors via the existing `showToast`.
- Run web `tsc`.

## Profile (Agent PR — owns `app/business/profile/page.tsx`)
- Mirror onboarding: the `LocationPicker` bound to the profile's lat/lng; per-catalog-item
  image editing; a gallery manager (list/upload/delete). Reuse the same hooks. Match the
  page's existing section/style. Run web `tsc`.

## Customer detail (Agent CD — owns `app/nearby/[id]/page.tsx`)
- Render each catalog item's `image_url` (thumbnail, with the existing `onError` fallback
  pattern in this file) and a **Gallery** section (responsive photo grid from `b.gallery`).
  "All the details appear correctly." Run web `tsc`.

---

## Live retest (me, after both waves)
Fresh owner → onboarding: upload a product image + 2 gallery photos (real File via
DataTransfer), use the location picker (search a KG place → assert lat/lng update live),
submit; then the customer business page shows logo/cover/product-images/gallery; then edit
in profile. Verify backend stores compressed files + the public payload carries everything.
