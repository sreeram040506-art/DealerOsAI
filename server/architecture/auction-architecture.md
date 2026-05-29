# Auction Integration Architecture

This design document defines the online auction API integration and offline auction acquisition flow for the DealerOs AI platform.

## High-level flow

1. Auction API
   - External sources: Manheim, Copart, ADESA, IAAI, and future auction providers.
2. Auction Connector Service
   - Receives feed data and normalizes it.
   - Stores raw payload and normalized fields in the inventory database.
3. Vehicle Normalization Engine
   - Standardizes field names across providers.
   - Maps `odometer`, `mileage`, `odo_reading`, etc. into a single `mileage` field.
4. Inventory Database
   - `AuctionVehicle` records are stored with normalized auction metadata.
   - Records include `auctionSource`, `sourceProvider`, `lotNumber`, `vin`, `estimatedValue`, `maxBid`, `condition`, `seller`, `auctionDate`, `bidStatus`, `recommendedMaxBid`, and `sourceRaw`.
5. AI Valuation Engine
   - Uses `estimatedValue`, `marketValue`, `transportEstimate`, and other auction attributes to recommend a bid ceiling.
   - Recommendation formula is implemented in the auction service and can be enhanced with ML later.
6. Dealer Dashboard
   - Displays auction pipeline items.
   - Supports online feed ingestion and offline physical-auction capture.

## Online auction integration

- `POST /api/auctions/import-feed`
  - Accepts a provider name and an array of feed items.
  - Normalizes fields across providers.
  - Creates or updates `AuctionVehicle` records.
- The connector service handles matching records by `vin`, `sourceItemId`, or `lotNumber`.
- A shared `IntegrationConnection` model already exists for API connectivity metadata.

## Normalization layer

The normalization service standardizes common auction fields from different providers:

- `vin`, `vin_number`, `vehicle_vin`
- `mileage`, `odometer`, `odo_reading`, `vehicle_miles`
- `lotNumber`, `lot_id`, `auctionItemId`
- `auctionDate`, `saleDate`, `eventDate`
- `maxBid`, `bid_limit`, `bid_cap`
- `seller`, `consignor`, `vendor`
- `condition`, `damage`, `grade`

It also stores the original payload under `sourceRaw` for debugging or audit.

## Offline / physical auction acquisition flow

- Mobile users create auction watchlist or acquisition records directly from a handheld device.
- Required data:
  - VIN barcode scan
  - lane number
  - seller / consignor
  - condition
  - max bid
  - notes
- System computes a recommended max bid using market value and transport estimate.
- When the buyer wins, the item is updated to `ACQUIRED` and `winningBid` is recorded.

## Repo changes made

- `server/prisma/schema.prisma`
  - Extended `AuctionVehicle` with normalized auction fields and offline auction metadata.
- `server/src/services/auctionNormalizationService.js`
  - Added field mapping and normalization logic.
- `server/src/services/auctionConnectorService.js`
  - Added feed ingestion and record merge/update behavior.
- `server/src/routes/auctionRoutes.js`
  - Added `POST /import-feed`
  - Added `PATCH /:id/bid`
  - Added `POST /:id/acquire`
- `src/pages/EnterpriseModuleCrud.tsx`
  - Expanded auction fields shown in the dashboard.

## Next steps

- Add provider-specific connectors for Manheim, Copart, ADESA, IAAI.
- Add scheduled sync jobs or webhook handlers for live auction feeds.
- Add a dedicated mobile acquisition form with VIN scanning and lane capture.
- Integrate AI valuation with historical auction wins and local demand data.
