// Reuse the accepted timber/machine/material/exposure treatment across authored
// venues. Geographic scenery remains selected separately by its own profile.
export const craftedVenue=data=>['tuscany-venue-v3','wachau-venue-v1','jaipur-venue-v1'].includes(data?.info?.sceneryProfile);
