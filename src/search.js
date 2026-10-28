// UI-1 Car Search: returns active cars at a location that are free for the whole date range.
//
// Two bookings overlap when one starts before the other ends:
//   existing.pickup_date < requested.return  AND  existing.return_date > requested.pickup
// A car returned on the morning of day X can be picked up again on day X.
function searchAvailableCars(db, { location_id, pickup, ret, categories = [] }) {
  const catFilter = categories.length
    ? `AND c.category IN (${categories.map(() => '?').join(',')})`
    : '';
  const sql = `
    SELECT c.*, l.name AS location
    FROM cars c
    JOIN locations l ON l.id = c.location_id
    WHERE c.status = 'active'
      AND c.location_id = ?
      ${catFilter}
      AND NOT EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.car_id = c.id
          AND r.status IN ('confirmed', 'picked_up')
          AND r.pickup_date < ?
          AND r.return_date > ?
      )
    ORDER BY c.daily_rate ASC, c.make, c.model`;
  return db.prepare(sql).all(location_id, ...categories, ret, pickup);
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

module.exports = { searchAvailableCars, daysBetween };
