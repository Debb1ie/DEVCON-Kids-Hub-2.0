export const isKnownLocationId = (locationId, locations) =>
  typeof locationId === 'string'
  && locations.some((location) => location.location_id === locationId && location.is_active);

export function validateLocationSelection(role, locationId, locations, chapterRequiredRoles) {
  if (chapterRequiredRoles.includes(role) && !isKnownLocationId(locationId, locations)) {
    throw new Error('Select a valid location from the directory.');
  }
}
