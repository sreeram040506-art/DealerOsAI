export function normalizeAuctionFeedItem(rawItem = {}, provider = 'UNKNOWN') {
  const normalizedRaw = Object.entries(rawItem).reduce((acc, [key, value]) => {
    const normalizedKey = key.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    acc[normalizedKey] = value;
    return acc;
  }, {});

  const lookup = (keys) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(normalizedRaw, key)) {
        return normalizedRaw[key];
      }
    }
    return undefined;
  };

  const parseNumber = (value) => {
    if (value == null || value === '') return null;
    const num = Number(String(value).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(num) ? num : null;
  };

  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const vin = lookup(['vin', 'vinnumber', 'vehiclevin', 'vincode']);
  const year = parseNumber(lookup(['year', 'vehicleyear', 'modelyear']));
  const make = lookup(['make', 'vehiclemake', 'manufacturer']);
  const model = lookup(['model', 'vehiclemodel']);
  const mileage = parseNumber(lookup(['mileage', 'odometer', 'odoreading', 'odometerreading', 'vehiclemiles', 'miles']));
  const estimatedValue = parseNumber(lookup(['estimatedvalue', 'estimatedprice', 'currentvalue', 'marketvalue', 'value']));
  const maxBid = parseNumber(lookup(['maxbid', 'max_bid', 'bidlimit', 'bidcap']));
  const transportEstimate = parseNumber(lookup(['transportestimate', 'transport', 'transportcost', 'shippingestimate']));
  const winningBid = parseNumber(lookup(['winningbid', 'winning_bid', 'finalbid', 'purchaseprice', 'paid']));
  const auctionDate = parseDate(lookup(['auctiondate', 'date', 'saleDate', 'closingdate', 'scheduledate', 'eventdate']));

  const auctionSource = lookup(['auctionsource', 'provider', 'source', 'auction']) || provider;
  const sourceItemId = lookup(['sourceitemid', 'itemid', 'lotid', 'lotnumber', 'lot_num', 'auctionid', 'auctionitemid']);
  const laneNumber = String(lookup(['lanenumber', 'lane', 'lane_num', 'laneid', 'stall'])) || null;
  const lotNumber = String(lookup(['lotnumber', 'lot', 'lot_num', 'lotid', 'itemnumber'])) || null;
  const seller = lookup(['seller', 'consignor', 'supplier', 'vendor', 'sellername', 'salefrom']) || null;
  const condition = lookup(['condition', 'vehiclecondition', 'damage', 'grade']) || null;
  const status = lookup(['status', 'state', 'stage']) || null;
  const notes = lookup(['notes', 'remarks', 'comments']) || null;

  return {
    auctionSource: String(auctionSource || provider || 'Auction'),
    sourceProvider: String(provider || auctionSource || 'Auction'),
    sourceItemId: sourceItemId ? String(sourceItemId) : null,
    lotNumber: lotNumber || null,
    laneNumber: laneNumber || null,
    vin: vin ? String(vin).trim().toUpperCase() : null,
    year: year ?? null,
    make: make ? String(make) : null,
    model: model ? String(model) : null,
    mileage,
    condition: condition ? String(condition) : null,
    seller: seller ? String(seller) : null,
    estimatedValue,
    maxBid,
    transportEstimate,
    winningBid,
    auctionDate,
    status: status ? String(status).toUpperCase() : null,
    notes: notes ? String(notes) : null,
    sourceRaw: rawItem,
  };
}
